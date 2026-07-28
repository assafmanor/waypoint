# 0127 — The camera answers the tap: one readable zoom, a stateless step-in, and an arrival that owns its frame

**Status:** Accepted — authored and built 2026-07-28 (session 151). The three zoom values are **derived defaults and the device pass owns them**, exactly as ADR-0122 handed over the snap stops. The rendered canvas has still not been seen (ADR-0121 §13) and nothing below claims otherwise.
**Date:** 2026-07-28
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§7** — "focus pans, it does not zoom" is reversed **in one direction only** (§1), and the opening framing gains a rule about which intent owns it (§3). §7's re-fit guard, its containment/fill test, and "a manual pan wins until the next scope change" are untouched.
Relates [0122](0122-map-split-controls-over-the-canvas.md) §9 (no state that has to be kept in sync with a tap — which is why §2 is stateless), [0126](0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) §6 (the locate control this zooms), [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (the other half of the same tuning cluster, still open).

## Context

Phase 3 of the map's second pass is "the camera answers the tap", and four reports land on it. Three are the same question asked from different directions, which is the whole reason they are decided together:

- **Selection pans but never zooms**, so tapping a row while the day is framed at country level tells you the place is _somewhere in Japan_.
- **The single-pin zoom lands too close** (`MAP_ZOOM.SINGLE_PIN` = 15), and a tight cluster clamps at `MAX_FIT` = 16, closer still.
- **Locate does not zoom at all** — it `panTo`s at whatever zoom you happened to be at.
- **#20: a repeat tap on locate should step in**, the way Google's own control does.

The fourth is a defect rather than a preference: **arriving from `מפה` lands on the day's frame, not on the place.** Phase 5 gave every event and booking a way to the map, and the way in does not deliver you to what you tapped.

**One thing is decided before this ADR starts.** ADR-0126 already split `recentre` into two controls, so locate is locate-only and there is somewhere for a zoom to belong. This ADR is about how far it goes.

## Decision

### 1. One number answers "how close is close enough to read a place in context"

`MAP_ZOOM.PLACE` replaces `SINGLE_PIN`, and **three paths read it**: a lone pin centring, a selection zooming in, and locate. They previously answered the same question separately or not at all, so the tab landed at a different zoom depending on how you got there — which is the thing the backlog line asked to be fixed by naming one constant.

**Focus now zooms — in one direction.** ADR-0121 §7 said "focus pans, it does not zoom", to protect the context you were reading. That protection is entirely about not pulling **back**: being dropped on a country-level view and told the place is somewhere in it protects nothing, and is the same "silently did something else" the tab was reported for. So the rule is **zoom-to-at-least** — always pan, zoom **in** only below `PLACE`, and never out. §7's argument is kept, not reversed; only the half that was doing no work is dropped.

**A zoom change jumps rather than animating.** If the zoom had to change, the view was too far out to read the place at all, so there is no journey worth watching. When no zoom change is needed the pan keeps its animation, which is the case where it is legible. Reduced motion is unchanged: the camera still moves, only the easing goes (ADR-0098 §4).

**`MAX_FIT` stays a separate number, one step tighter, and is deliberately not folded in.** It caps a _fit_, which has real extent behind it, where `PLACE` is what to use when there is no extent to read. A tight cluster earning one step closer than a guess is a distinction, not an inconsistency.

**The values are derived defaults: `PLACE` 14, `MAX_FIT` 15, both one step out from what shipped.** Each step halves the span, the report was that 15 and 16 both landed too close, and the minimal honest response to "too close" is one step — so both moved one step and the relationship between them was preserved rather than re-invented. **The device pass owns them**, and they join `MAP_PIN` and `MAP_REFIT_FILL_SHARE` in one cluster. This is ADR-0122's posture verbatim: ship the derivation, name the calibration, and do not pretend a desktop viewport settled a legibility question.

### 2. Locate's repeat tap steps in, statelessly

The first tap gets you to `PLACE`; a repeat tap steps **one level in from wherever the map actually is**, stopping at `STEP_IN_MAX` (17, street level).

**Stateless is the design, not the implementation.** Counting taps would mean state that a pinch between taps silently invalidates — and a tap count living in a prop is exactly what ADR-0122 §9 refuses. Reading the map's current zoom means there is nothing to desynchronise, because there is no second copy of the truth. `zoomStepIn(current, floor, ceiling)` is a pure function, tested as one.

One consequence, accepted: pinching to 16 yourself and then tapping locate once takes you to 17 rather than back to 14. That is "step in from where the map is" behaving exactly as described, and it is what Google's own control does.

### 3. An arrival focus OWNS the framing — the fit does not run

The defect was never that the pan was too slow. **Two things both ran**, and the fit won: arriving constructs a new map, so the opening framing is unconditional; on first mount the div usually has no bounds, so the fit defers to `idle`; the selection effect pans meanwhile; then `idle` fires and the fit overwrites it. And when the place is not in the day it landed on, the screen's own `setAllDays(true)` changes `cameraSignal` and fires a second re-frame after the pan too.

**So the fix is a rule about which intent owns the frame, not another guard bolted onto `apply`.** This is the third instance of one family — the fit running when something else should have won (ADR-0121's session-134 entry, session 139's re-fit guard) — and each previous fix added a guard. An arrival focus **is** the frame: the camera holds it, spends it on the next framing that runs, and the fit does not run for it. Two properties matter and both are tested:

- **It is claimed on the render that brings it and held until spent.** The screen consumes `focusPlaceId` in a single pass while the map may not be sized for several more, so reading the live prop would drop the focus on exactly the slow arrivals this exists to fix.
- **It wins from either side of the race.** An arrival landing _before_ the map is sized wins; an arrival landing _after_ the fit already claimed the opening frame also wins. The ordering is therefore irrelevant rather than out-timed — which matters, because the backlog line correctly warned that the ordering is a runtime race and told whoever picked this up not to trust the description of it.

It is spent **once**: a later control change is an ordinary re-frame, not a second centring on an arrival nobody made again.

### 4. What this does not touch

- **§7's re-fit guard is unchanged** — contained _and_ filling `MAP_REFIT_FILL_SHARE` on at least one axis (session 139). Its share still needs the device.
- **"A manual pan wins until the next scope change" is unchanged**, and still falls out of the camera answering signals only.
- **No new `MapPane` prop changes on a tap.** `arrivalFocus` changes on an **arrival**, which is a mount-time event, and it is a memoized object held in screen state — not a per-tap flip. The step-in is stateless precisely so #20 needs no prop at all.
- **`MAP_CONTROLS_H`, the fit's padding and the pin sizes are untouched.** The bottom camera inset ADR-0122 §7 deferred, ADR-0121 §6's `dot` tier and `MAP_PIN`'s dials are the rest of Phase 3 and are **not** in this change.

## Alternatives considered

- **Fold `MAX_FIT` into `PLACE`.** Rejected in §1: a fit knows the set's extent and a centre is a guess, so the two are answering different questions with the same units.
- **Zoom on selection unconditionally** (always go to `PLACE`). Rejected: it throws away a deliberate close-in view every time you tap a row, which is precisely what §7 was protecting.
- **Count locate taps.** Rejected in §2: state a pinch invalidates, and the kind of state ADR-0122 §9 exists to keep out.
- **Animate the zoom-and-pan together.** Rejected: two animations across an unreadable distance, and Google's `panTo` does not carry a zoom. The jump says "you were nowhere near this" honestly.
- **Fix the arrival race by ordering** — delay the fit, or re-pan after it. Rejected as the fourth guard on a mechanism that already has three; the backlog line asked for a rule about ownership instead, and the two tests that pin it are exactly the two orderings a timing fix would have had to guess between.
- **Give the camera the arrival via `setSignal`.** Rejected: the signal means "a control changed the set", and an arrival changes what you are looking at rather than what is on the canvas. Overloading it would have made every later signal change re-centre.

## Consequences

- **`MAP_ZOOM.SINGLE_PIN` is gone**, replaced by `PLACE`. Small sweep: `useMapCamera`, `MapPane`'s `defaultZoom`, and two tests.
- **`useMapCamera` gains a third verb** (`locate`) and a fourth opt (`arrivalFocus`). The two zoom decisions are pure functions in `map-camera.ts` (`zoomToAtLeast`, `zoomStepIn`), tested with no Google in the process — the layer split ADR-0121 §13 asks for.
- **The fake map earns its keep again.** All four of this ADR's behaviours are exercised against it, including both orderings of the arrival race. The canvas is still not testable; the camera is, and this is the third time saying so has paid.
- **The device pass now owns five numbers in one cluster**: `PLACE`, `MAX_FIT`, `STEP_IN_MAX`, `MAP_REFIT_FILL_SHARE`, and `MAP_PIN`'s floor/cap/share. They are one legibility question asked in five places, and they should be tuned in one sitting on a phone.
- **Phase 3 is not finished by this ADR.** The `dot` tier, `MAP_PIN`'s dials and ADR-0122 §7's bottom camera inset remain.
