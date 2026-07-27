# Session 138 — the tab says what is happening now, and locating you is not sorting you

**Date:** 2026-07-27
**Branch:** `claude/map-now-and-distance-sort`
**Build session, ADR written at its head.** Two reports from the running app, plus one
question answered without code.

## The reports

1. **`משק לגזיאל` is happening now and the Map calls it `מה שלפנינו`.** Screenshotted
   side by side with Home, which called the same event `עכשיו · עד 14:00` at 13:54.
2. **Opening the tab locates you (good) but also re-sorts the list by distance (not
   good).** The default should stay the day's schedule.
3. **Why are the lines between stops Plan-mode only?** — a question, answered below.

## 1. The Map had no "now"

`lib/time.ts` owns the app's clock phase — `eventPhase` → `upcoming | now | passed` —
and its docstring is explicit that it "mirrors `deriveNow`'s start ≤ at < end window,
**so the now-line and the board agree on 'now'**". Home and the Day view read it.

The Map didn't. `placeBlock` (`lib/place-usage.ts:489`) is two-state:

```ts
return isDayUsagePast(day, nowMs, today) ? PLACE_BLOCK.behind : PLACE_BLOCK.ahead;
```

With `until = endsAt = 14:00` and now 13:54, the lunch is not past — so it falls to
`ahead`. There is no third state anywhere in the Map's vocabulary. `place-usage.ts:115`
even notes it uses "the same boundary `eventPhase` uses": it borrowed the boundary and
dropped the middle. That is ADR-0107 session-102's precedent verbatim — a screen
deriving its own answer rather than reading the shared one — and it is listed as an
anti-pattern in `frontend/CLAUDE.md`.

**The fix reads the shared resolver rather than adding a third state beside it.**
`currentDestination` (`lib/places.ts`, sibling of `nextDestination`) calls **`deriveNow`
itself** and resolves that event's place through the same authority rule. It does not
decide what "now" means; it asks the function the board asks. The two surfaces cannot
diverge again unless the resolver is wrong for both.

One thing that was already right and stayed: the row carried **no** amber `הבא` tag,
because `nextDestination` skips anything whose phase isn't `upcoming` (`places.ts:725`).
The Map was correct that the lunch wasn't next — it just had no way to say it was now.
Ordering needed nothing either: an in-progress 13:00 event already sorts first.

### The cue, on both halves

The owner asked for a row tag **and** a pin indication ("maybe a heartbeat animation"),
with next still marked. That turned out to be a transplant rather than an invention:
**`wp-board-pulse` (`board.css:73`) already is the app's "live right now" idiom** — the
amber dot beside `עכשיו` on Home's board, in the very screenshot that reported the bug.

- **Row:** an amber `עכשיו` tag (the board's word), with a pulsing dot as a
  pseudo-element, plus the same ring the next-stop row already wears.
- **Pin:** an amber ring that pulses, reusing the blip's alpha and 2s period.
- **Next is untouched.** It keeps the solid amber outline and the `הבא` tag it already
  had. The two cues are told apart by **motion, not hue** — which is the meaning, not a
  decoration: the live one moves, the pending one waits.

**Why two amber cues is in budget.** ADR-0028 reserves amber for time and commitment;
now and next are both time. What changes is ADR-0121 §6's "exactly one pin ever carries
it" → **exactly one of each**, amended there. It is safe because they are mutually
exclusive per pin: `eventPhase` reads `now` or `upcoming`, never both.

**The accessibility hole this had to be designed around.** `App.css:1744` kills every
animation under `prefers-reduced-motion` with `!important`. A pulse-only treatment would
have left "now" with **no** cue at all for exactly the people least able to catch a
subtle one. So the resting state carries the full cue — a static amber ring on the pin,
a solid amber dot on the row — and the animation only layers on top. Motion off means
still marked, just still.

**Stays never say `עכשיו`** (the owner's call, and the right one): a stay's span runs to
check-out, so an unfiltered window would mark the hotel for three days and drown
whatever you are actually doing. Ambient events are filtered before the question is
asked, exactly as Home filters them.

**Trip mode only**, for the same reason `nextStop` is.

## 2. Locating you is not asking to be sorted by distance

The session-134 amendment made the tab offer to locate you on open. Right call, wrong
landing: it set a flag that already meant three things — `nearActive` drove the distance
chips, the me-dot **and** the list order. While near-me was reachable only by tapping
the chip, that was honest, because re-ordering was the point of tapping. Once the tab
started asking for a fix by itself, the day silently left schedule order the moment
coordinates arrived.

**Split along the line between a fact and an intent:**

|                  | What it is                             | What follows from it                       |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| `located`        | We hold a usable fix                   | Distance chips, the me-dot                 |
| `sortByDistance` | An intent, stated **only** by the chip | The list's order, the near-me group header |

The chip's job is now exactly one thing. Tapping it off restores the day's own sequence
and **keeps** the distances — we still know where you are, and forgetting a fix to undo
a sort would be a lie.

This is the same correction as this week's `useSelectDay` amendment, one layer down: an
intent has to be stated, not inferred from a value that happens to correlate with it.
Third time that shape has come up on this tab (#10, near-me, and arguably the ambient
fade), which is worth noticing.

## 3. The Plan-only connector — intentional

`dayShapeVisible = !allDays && mode === 'plan'`, per **ADR-0121 §10**: with the order
now carried by the pins as numbers, the line's one remaining job is revealing the day's
_shape_, which is a planning question; in Trip mode you are living the day and need
"where is next", so the canvas stays quieter. The free whole-day `נווט` deep-link rides
along with it for the same reason.

So it is a decision, not an oversight. Reopening it is a §10 amendment, and it belongs
with Phase 3's canvas work rather than bolted on here. **No code written for it.**

## Tests

Clock pinned throughout; the `now` cue asserted in **both day scopes**, since being in
progress is a property of the event and not of the scope.

| Where                   | What                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `Map.test.tsx`          | An in-progress event is tagged `עכשיו`; the later one is the next stop; neither carries the other's tag |
| `Map.test.tsx`          | All-days says it too                                                                                    |
| `Map.test.tsx`          | Before it starts it is `הבא`, not `עכשיו`; after it ends it is neither                                  |
| `Map.test.tsx`          | A stay never says `עכשיו`, while the thing that IS happening still does                                 |
| `Map.test.tsx`          | Plan mode says nothing                                                                                  |
| `Map.test.tsx`          | **A fix obtained on OPEN shows distances but never re-orders the day** — the regression guard           |
| `Map.test.tsx`          | Toggling the chip off restores the order and **keeps** the distances                                    |
| `Map.embedded.test.tsx` | The in-progress pin is `nowStop`, the next stop is a different pin, neither is both                     |
| `Map.embedded.test.tsx` | Standing permission on open: me-dot arrives, near-me grouping does **not**, schedule headers stay       |

**Two shipped tests encoded the old conflated contract** and were rewritten rather than
deleted: "toggling off … drops the distances" became "… **keeps** the distances", and
the session-134 on-open test's `groupHeader` assertion became its opposite — that the
list is left alone. Both now assert the new contract at exactly the point the old one
was wrong.

**One new test was rewritten before it landed.** A combined before/after case called
`cleanup()` and then read `tagsOn('lunch')`, which returns `[]` for a missing row — so
its `not.toContain` would have passed on an empty DOM. Split into two cases, each with
its own clock and an explicit `expect(row('lunch')).toBeTruthy()` first.

The pulse itself is CSS: **a human pass** (ADR-0121 §13). What the suite owns is which
pin and row are told to carry the cue.

## Not verified

Three visual things are now stacked up unseen on a real phone, all from today:

- #13's number stamp on the list row (session 136).
- The un-faded ambient pin and row (session 137).
- **The pulse** — its rhythm, and whether two amber cues on one canvas read as two
distinct things or as noise. This is the one most likely to need tuning.
</content>
