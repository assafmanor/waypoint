# Session 194 — the one-finger zoom, recalibrated on a phone

**Date:** 2026-07-30
**Branch:** `claude/canvas-one-finger-zoom-f7kdfl` (restarted from `main` after #378 merged)
**ADR:** [0145](../decisions/0145-the-canvas-takes-a-one-finger-zoom.md), §2 and §4 amended in place.

Session 193 shipped Phase 9 with three numbers on Phase 3's device-pass line. The owner used it on a phone the same day and returned **two defects and one tuning report**. Both defects were things the suite had agreed were fine, and one of them had a test that asserted the bug.

## 1. The sensitivity model was backwards

> _"the more space the map takes of the screen, the more the drag feels slow. It feels the least sensitive on map search mode, and the most sensitive on half. It felt best on half, so this should be the baseline."_

Sensitivity was a **share** of the pane's height (`SPAN_SHARE` 0.5). The arithmetic nobody ran:

| Stop   | Pane   | px per zoom level |
| ------ | ------ | ----------------- |
| `map`  | ~501px | **250px**         |
| `half` | ~243px | **122px**         |

So the taller canvas demanded twice the finger travel. The report is the model, read back.

**The reasoning error is the part worth keeping**, because it will be tempting again. This was derived by analogy from ADR-0123 — everything on this surface is a share of the canvas — and the analogy does not hold:

- **A pin's _size_ is a share of the canvas** because a pin is a **visual** element competing for canvas area.
- **A drag's _sensitivity_ belongs to the finger**, and a finger does not scale with the canvas. A comfortable thumb stroke is the same distance at 243px as at 501px.

The intuition that misleads is "a taller canvas has more room to drag, so scale the drag to it". More _room_ is real; more _effort per level_ is not wanted.

**Now:** `PX_PER_LEVEL` (120), a **calibrated** absolute distance anchored on `half` — the stop the owner named — applied unchanged at every larger canvas, making the map extreme **2× more sensitive than it shipped**. `MAX_SHARE` (0.5) survives only as a **cap for short canvases**: at 360×640's 160px `half` pane a flat 120 would demand 75% of the canvas per level and be _worse_ than before, so there the cap binds. It binds below ~240px and nowhere above.

**Tested as a property, not a value**, since the value is a preference and the property is the bug: no canvas at any size may demand more travel per level than the calibrated stop.

## 2. The double-tap jumped to city zoom from anywhere

> _"a double zoom just zooms in to the center of the map, and it really doesn't matter how zoomed out you are it zooms in really a lot (~city size, even when you're zoomed out to the whole globe)"_ … _"is this a regression?"_

**Yes, and mine.** Before Phase 9, Google's own double-click zoom handled this: one level in, anchored at the tapped point. Phase 9 suppresses Google's gesture and owed a replacement — and paid the debt with **locate's ladder**:

```ts
zoomStepIn(current, MAP_ZOOM.PLACE, MAP_ZOOM.STEP_IN_MAX);
// if (current == null || current < floor) return floor;
```

That floor is locate's whole point — "take me to me" must land somewhere readable — and it is meaningless for a double-tap. From a globe view `2 < 14`, so the gesture returned **14** outright rather than stepping. The ceiling was wrong the same way, capping at 17 a gesture that should go as deep as a pinch.

**Now its own one-liner:** `min(current + 1, MAX)`. No floor, the gesture's own ceiling.

**Two things about how this was missed, both worth more than the fix:**

- **The test asserted the bug.** `'stepZoomIn stops at the ladder's ceiling'` expected `STEP_IN_MAX` and passed — written from the implementation rather than from the behaviour. That is session 122's class of miss one layer along, and it is now two regression cases that fail against the old code.
- **The reuse looked like rule 8.** Extending the mechanism that already does this job is the repo's standing instruction — but the two callers only _appeared_ to share a job. **"Step the zoom in" and "take me somewhere readable" are different intents that both happen to move the zoom.** Reusing across that seam is how a floor meant for one arrived in the other. Rule 8 asks whether a mechanism exists; it does not excuse skipping the question of whether the _intent_ is the same.

## 3. Recognition sometimes failed and Google panned instead

> _"in some cases I was expecting double tap drag to do zoom, but it didn't identify it and instead just moved the map"_

Tuning, not structure: `TAP_GAP_MS` 300 → **500** and `TAP_SLOP_PX` 24 → **44**. A double-tap that _keeps its finger down_ is slower and sloppier than a double-click, because the second press is deliberate — it lands later and further away. **44 is ADR-0017's touch floor**, which makes it principled rather than guessed: two presses inside one touch target's width are, by the app's own definition of a finger, in the same place.

Erring generous is right here. A false positive costs one unasked-for step zoom; a false negative costs the whole gesture, and Google pans instead.

## 4. The count that should shape how this surface is treated

This is the **fourth** time in this epic that a real device corrected something derived and unit-tested — after ADR-0129 (the whole camera), session 139's re-fit guard, and ADR-0121's session-134 camera-on-the-whole-world. On this canvas, _"reasoned and covered by tests"_ has now been wrong four times in a way only a phone caught, twice in the same 24 hours.

The pattern in all four is the same: **the tests asserted what the code did, and the thing that was wrong was the model**. A property test catches this where a value test cannot, which is why §1's fix is tested as a property.

## 4b. Point anchoring, taken in the same session (ADR-0145 §3 amended)

The owner's answer to whether the double-tap should anchor at the tapped point: _"yes if we can use things that are given to us by Google, I would prefer them."_ So it does — and the decision **splits by gesture** rather than going one way:

- **The drag keeps the centre**, for the reason §3 gave and the device did not contradict: the finger rests on the anchor for the whole gesture, so a point-anchored drag converges on the one spot you cannot see.
- **The double-tap takes the point**, because by then you have lifted — the point is visible and a discrete "go there" is what you meant. And decisively, **Google's double-click zoom anchored there**, so centring it was never a design choice: it was an unnoticed downgrade that arrived with the §2 takeover.

**On "things given to us by Google", which is the preference worth honouring precisely.** ADR-0129 §3 warns against _re-deriving_ Google's projection maths, and it would be easy to read that as "don't touch projections". The distinction: `zoomAboutPoint` works in **world coordinates**, where world-to-screen is a pure power of two, so the only arithmetic is a scale change — **there is no Mercator in our code at all.** Every nonlinear part lives inside `fromLatLngToPoint`/`fromPointToLatLng`. And nothing constructs a `google.maps.Point`: `fromLatLngToPoint` returns one, so it is mutated and handed back, which keeps the path clear of the `google.maps` global and makes it trivially fakeable.

**The test is the behaviour, not the arithmetic.** The fake map gained Google's own documented Web Mercator, and the assertion is that _the geography under the finger does not move_. A linear stand-in would have passed while the shipped code was wrong about latitude — which is this feature's whole risk. The sign is asserted separately, since an invariant that holds symmetrically cannot catch a flipped axis. It also degrades: a map has no projection until it has rendered, and a double-tap before then still zooms, centred.

## 4c. And the drag's anchor was affirmed, which closes the last open question

Raised at the end of 4b and answered immediately (owner: _"drag zoom should be anchored to the center as it was"_). **No code changed** — the drag was already centre-anchored, and `zoomTo` writing the zoom and nothing else is what guarantees it (the test is called _"a drag zoom is not a pan"_, and it fails the moment anyone adds an anchor term).

What changed is the **status** of that anchor: it was a reasoned default that a device had not contradicted, and it is now a call made with both behaviours in hand. Worth recording precisely because the file is otherwise a list of reasoned defaults that a phone overturned — **this is the one that survived contact**, and the reason it survived is that its argument was about the finger rather than about cost or elegance. §3's two anchors are now both settled, in opposite directions, for stated reasons.

1852 unit tests / 130 files green; `format` / `lint` / `typecheck` / `build` too.
