# 0129 — The camera moves like a camera: selection pans, framing is an intent, and nothing portals

**Status:** Accepted — authored and built 2026-07-28 (session 153), from the owner's report off a **real map**. That is the first Phase-3 feedback taken from a rendered canvas rather than derived, and it reverses part of ADR-0127 the same day.
**Date:** 2026-07-28
**Amends** [0127](0127-map-camera-answers-the-tap.md) **§1** — "focus zooms in when the view is too far out" is withdrawn **for selection** (§1), and "a zoom change jumps rather than animating" is withdrawn outright (§3) — and **§2**'s single `PLACE` constant, which becomes the fallback rather than the rule (§2). ADR-0127 §2's stateless step-in and §3's arrival-owns-the-frame both stand.
Relates [0121](0121-embedded-map-phase-6-design.md) §7 (whose "focus pans, it does not zoom" is restored for the two cases it was right about), [0121](0121-embedded-map-phase-6-design.md)'s session-148 amendment (the badge as the way to the pin, reused here), [0098](0098-index-motion-and-reveal.md) §4 (reduced motion).

## Context

ADR-0127 shipped the zoom ladder this morning, reasoned from the code and from measurements. The owner then used it on a real map and reported three things — the first feedback in this phase from a rendered canvas:

1. **Zooming on a pin tap is "a little inconvenient."** Selecting a pin you can already see and being taken somewhere for it is not what you asked for. Suggested instead: a way to focus deliberately, from the place card.
2. **How far to zoom should be dynamic** — "depend on several stuff such as if there are lots of close pins, it would want to have them appear but not too close."
3. **Reframing should be smooth movement, not "portaling"** to the new state.

And, on the first point, a refinement: tapping a pin should still **pan** to it, the way Google's own map does.

**Two of the three are corrections to ADR-0127, and one is a correction to something older than it.** Recording that plainly matters more than the fixes: the ladder was derived carefully and was still wrong about the case that gets used most, because "how close is close enough" was answered without anyone looking at a map.

## Decision

### 1. Selection pans. Framing is a separate intent, and the card's badge carries it

**A pin tap and a row tap pan, at whatever zoom you are on, and never zoom.** This restores ADR-0121 §7's rule for exactly the two cases it was always right about, and it is Google's own behaviour for a POI tap: centre it, do not zoom it. ADR-0127's mistake was not the zoom-to-at-least rule itself — it was applying it to _selection_, where the answer to "which one is it" is a pan and nothing more.

**So `PLACE` stops being reachable by accident and zooming becomes an intent with two callers**, both of which mean "take me to this one":

- an **arrival** from `מפה` on an event or a booking (ADR-0127 §3, unchanged in mechanism);
- the **place card's own badge**, which is new.

**The badge is the control, and it is not a new one.** ADR-0121's session-148 amendment already made a row's category badge _the way to the pin_ on every place-bearing surface — day cards, builder rows, booking details — with a teal ring and a corner marker, chosen over a trailing-slot control because that one was **measured** and broke row layouts at 360px. On the place card the same badge means the same verb one step further in: you are already looking at the map, so it frames the place rather than taking you to the map. It reuses the shipped `PlaceBadge` primitive (one new optional label, one new optional order), so this adds no icon, no row slot and no second affordance.

One detail worth stating because it is a deliberate subtraction: on this badge the corner already carries the **order number** (ADR-0121 §6), so the way-in's corner _marker_ stands down and only the **ring** signals the control. Two stamps in one corner is neither.

### 2. How far to zoom is derived from what is nearby, not from a constant

A fixed zoom cannot tell a dense district from an empty valley, which is the owner's second point exactly. So framing a place builds **bounds around it whose span comes from how far its nearest neighbours are** — a place with neighbours 200m away shows a few hundred metres, an isolated one shows the default — and feeds them through the fit path that already exists, inheriting the controls-row padding, the card reserve and the `MAX_FIT` cap rather than needing its own copies of all three.

`MAP_FOCUS` names five numbers, and two of them are clamps that each prevent a real failure: without the **ceiling**, one distant neighbour frames a region and the place you came to see is a speck; without the **floor**, near-coincident pins fit a near-zero box and snap to building level, which is ADR-0121 §7's degenerate row. The reach is the furthest of the _near_ ones, so a cluster is framed as a cluster rather than around its closest member. A pin at the _same_ coordinates is not a neighbour at all — it says nothing about surroundings — so it falls through to the standalone default.

**`MAP_ZOOM.PLACE` survives as the fallback**, which is the honest reading of what it always was: the answer when there is nothing around to measure.

### 3. Nothing portals, because the smoothness is ours

**The cause is not that the app asked for a jump. It is that nothing could ask for anything else.** From the Maps JS API's own typings:

| Method       | What it does                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `fitBounds`  | _"may cause a smooth animation… whether or not this method animates depends on an internal heuristic"_ |
| `panTo`      | animates _"if the change is less than both the width and height of the map"_                           |
| `moveCamera` | _"immediately… without animation"_                                                                     |

So a re-fit animates when Google feels like it, a pan animates only within one viewport, and there is no documented way to request a transition. That is the whole of the reported portaling, and ADR-0127 §1's "a zoom change jumps rather than animating" made it worse by choosing the jump deliberately.

**So every camera move now goes through one eased driver of ours:** read the current camera, interpolate to the target with `moveCamera` once per frame, stop. One duration for every move, so a day change, a chip, an arrival and the locate ladder all read as the same object moving. Under `prefers-reduced-motion` it collapses to a single `moveCamera` — the camera still **moves**, only the easing goes (ADR-0098 §4), which is the rule the sheet and the pins already follow.

Three things fell out of building it, all recorded because none was obvious on paper:

- **`fitBounds` is now used to _learn_ the destination, not to travel to it.** It is the only thing that knows Google's own projection maths, so it is called, the resulting camera is read back, the camera is put back where it was, and the ease runs. Both calls are synchronous within one frame, so nothing paints the destination first. The alternative was re-deriving a zoom-for-bounds formula, which is a thing to get subtly wrong for no gain.
- **The FIRST framing of a map lands; every later one eases.** A map is constructed with `defaultCenter`, so it always has a camera to interpolate _from_ — but that camera is one nobody chose, and easing out of it would animate a long sweep from a placeholder on every single tab open. Easing a fact is not movement. (My first attempt guarded on "is there a centre to ease from", which would never have been false.)
- **Longitude is interpolated the short way round.** `boundsOfPoints` deliberately does not care about the antimeridian — ADR-0121 §14's spirit, a case that takes a ±180° trip to notice. A _visible sweep the long way across the world_ is a different matter, and it is the one thing this function exists to avoid.

### 4. The ease makes the camera a moving target, and two decisions read it

Found by walking scenarios after the fact rather than by testing the happy path, and both are §3 breaking something older:

- **The step-in ladder read an interpolated zoom.** ADR-0127 §2 made locate's repeat tap stateless on the grounds that "reading the map's current zoom means there is nothing to desynchronise, because there is no second copy of the truth". An eased move makes that untrue for 480ms: a second tap inside the window steps in from wherever the animation happens to be. So the ladder reads **where the ease is going** when one is in flight, and the map only when none is. The truth is still single — it just moved from the map to the move.

- **The ease fought the user's finger.** ADR-0121 §7's "a manual pan or zoom wins" held because nothing else moved the camera; a per-frame `moveCamera` loop breaks it for the length of the animation, overwriting a pan or a pinch mid-gesture. The loop now **compares the camera against the last frame it wrote**, and stands down if they differ: Google's own gesture handling writes the camera too, so a mismatch means a finger did it. That is one check rather than a list of gesture events to subscribe to, and it catches pinch — which has no clean "the user zoomed" event — for free.

Both are the same shape, and worth naming as such: **introducing an animation turns every read of "where is the camera now" into a question about time.** Anything else that starts reading the live camera has to decide which answer it wants.

## Alternatives considered

- **Keep zoom-on-selection and tune the amount.** Rejected: the report is not that the zoom was wrong, it is that being moved at all was unwanted. No amount is right for an unasked-for move.
- **A dedicated "zoom here" button on the place card.** Rejected in §1: session 148 already measured a trailing-slot control on a dense row and killed it, and ADR-0122 spent a whole session decluttering this surface. The badge is the affordance that already means this.
- **Make the card's whole body tappable** to frame (ADR-0122 §7 left it inert for want of a destination). Rejected: it competes with the way-in entries inside the card, and a large invisible target is worse discovery than a ringed badge.
- **A second tap on the same pin zooms.** Rejected: it needs tap-count state, which is exactly what ADR-0127 §2 avoided for the locate ladder and ADR-0122 §9 refuses generally.
- **Derive the zoom from a count of nearby pins** rather than their distance. Rejected: "eight places in one district" and "eight places across a country" want opposite frames, which is ADR-0121 §7's own "density, not count" argument.
- **Accept Google's `fitBounds` animation and only ease where we control the camera.** Rejected: the reported case _is_ reframing, and "animates depending on an internal heuristic" is not something to build a feel on.
- **Re-derive zoom-for-bounds ourselves** so the ease never needs the probe. Rejected in §3 as a projection-maths reimplementation with no upside.
- **Ease the opening framing too**, for consistency. Rejected in §3: it animates away from a placeholder camera on every tab open.

## Consequences

- **`zoomToAtLeast` is deleted, not orphaned.** Selection was its only caller, and an exported, tested function nobody calls is drift. `zoomStepIn` (ADR-0127 §2's ladder) stands.
- **`MapCamera` has four verbs now** — `focus` (pan), `frameOn` (frame a place with its surroundings), `reframe` (the set changed), `locate` (the step-in ladder) — and all four go through one eased driver.
- **`arrivalFocus` is renamed `framePlace`**, because it now has two callers and the name described only the first. Same mechanism, same spend-once semantics.
- **`PlaceBadge` gains two optional props** (`label`, `order`) rather than the Map growing a second badge control — the extend-the-primitive rule (ADR-0096).
- **The two new decisions are pure functions** (`focusBoundsFor`, `cameraFrame`) tested with no Google present, and the animated path is tested against the fake map: it steps, it lands, a new move cancels the one in flight, and the opening frame does not ease.
- **The suite's camera assertions moved to the reduced-motion path** for questions about _where_ the camera ends up. That is a real shipped path rather than a test shortcut, and it keeps those tests about the decision instead of about frame timing.
- **The ease's own interactions were the finding, not the ease** (§4). Two decisions older than it read the live camera, and both needed an answer once the camera stopped being still.
- **`MAP_FOCUS`'s five numbers and `MAP_CAMERA_EASE.DURATION_MS` join the device-pass cluster**, which is now thirteen numbers. Its argument is getting stronger, not weaker: this ADR exists because one of them was wrong in a way only a phone could show.
- **What this cannot verify is the thing it is about.** Whether the ease _feels_ right — duration, curve, whether a long reframe should take longer than a short one — needs the device more than any number in the cluster does. It is derived, and it is stated as derived.
