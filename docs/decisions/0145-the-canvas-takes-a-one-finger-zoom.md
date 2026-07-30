# 0145 — The canvas takes a one-finger zoom: a double-tap that keeps its finger

**Status:** Accepted — designed 2026-07-30 (session 192). Phase 9 of the map panel's third pass (#17).
**Date:** 2026-07-30
**Amends** [0121](0121-embedded-map-phase-6-design.md) §7 — "only an explicit control changes zoom" gains a gesture, and "a manual pan or zoom wins" gains its first case that this app writes itself rather than letting Google write.
**Relates** [0122](0122-map-split-controls-over-the-canvas.md) §4 (the sheet's drag region — the gesture this one was expected to fight, and does not), [0129](0129-map-camera-moves-like-a-camera.md) §3/§4 (one camera driver; the ease standing down for a finger), [0128](0128-map-dot-tier-and-the-cards-camera-reserve.md) §1 (the dot tier keyed on zoom), [0123](0123-map-pin-size-is-a-share-of-the-canvas.md) (a canvas share as the unit of a tunable), [0098](0098-index-motion-and-reveal.md) §4 (reduced motion).
**Mockup:** [`mockups/map-onefinger-zoom-v1.html`](../../mockups/map-onefinger-zoom-v1.html)

## Context

Zoom on this canvas is the pinch. `gestureHandling="greedy"` (ADR-0121 §12) already buys one-finger **pan**, so a thumb can move the map but cannot scale it — and one-handed is how this tab gets used, because it is the on-the-ground surface.

### The reconfirmation, because the phase was triaged on a search result

Session 145 triaged this from search snippets rather than a read of the page, and said so. Three independent sources now agree, and they were worth gathering before designing anything:

1. **The API's own typings** (`@types/google.maps@3.65.3`, generated from the reference). The entire `MapOptions` surface is 45 fields. The only ones touching input are `gestureHandling`, `disableDoubleClickZoom`, `scrollwheel`, `keyboardShortcuts`, and `headingInteractionEnabled`/`tiltInteractionEnabled` — heading and tilt, not zoom. **There is no flag.**
2. **The live reference page**, read by the owner on a phone (`developers.google.com` is blocked by this sandbox's egress policy, so this could not be read from here). `gestureHandling`'s four values are byte-identical to the typings' text, and `"greedy"` is the whole of it: _"All touch gestures and scroll events pan or zoom the map."_ No gesture beyond pinch and double-tap is named. The mobile-gestures announcement lists the same four.
3. **The device.** The owner tried tap-then-press-and-drag on the shipped tab. Nothing happens.

Source 1 cannot by itself settle this — a gesture Google already shipped would need no option to exist, so the absence of a flag is not the absence of a gesture. Source 3 is what closes it. **The tap-then-press-and-drag zoom is documented for the Maps SDK for Android/iOS and is absent from the web API**, which is why MapLibre and MapTiler ship it as their own handler. So this is a build.

### What the phase brief expected to be the hard part, and what actually is

The brief expected the central problem to be arbitration against the sheet's vertical drag (ADR-0122 §4). **Measured, those two never compete.** `.map-pane` is `bottom: var(--sheet-h)` and the sheet begins exactly there, so the drag region is never a canvas pixel. They contend only for the **finger after it leaves its origin**, and both already take pointer capture at drag start, which is precisely the mechanism that resolves that. There is nothing to design between them.

The real competitors are both Google's, both on the same pixel, and one of them is not a gesture the brief mentioned:

| Competitor                     | State                                              |
| ------------------------------ | -------------------------------------------------- |
| One-finger **pan** (`greedy`)  | Writes the camera on the first move.               |
| **Double-click zoom**          | `disableDoubleClickZoom` is unset, so **enabled**. |
| Our canvas tap (`onCanvasTap`) | Clears the selection; POI taps carry a `place_id`. |

**The second one is the collision.** The first two taps of "double-tap then drag" _are_ a double-tap, and Google zooms and re-centres on it. Any design that lets Google see the second tap gets a step-zoom bolted onto the front of every drag zoom.

## Decision

### 1. The entry condition is a double-tap whose second finger stays down, and it is recognised in three phases

**Phase A — the first tap.** A complete down/up inside `ZOOM_TAP_SLOP_PX` of its origin. **Nothing is armed and nothing is intercepted:** Google gets the tap, POI taps still carry their `place_id`, `onCanvasTap` still clears the selection. What survives the tap is a timestamp and a point, nothing more. Arming on the first tap would make every tap on the canvas pay for a gesture almost nobody is making, and it would be the eager recognition that steals the pan.

**Phase B — a second `pointerdown` inside `ZOOM_TAP_GAP_MS` and `ZOOM_TAP_SLOP_PX` of the first.** This is the only moment anything is taken from Google, and the gesture is **provisional**: a release here is a legitimate double-tap and must still zoom (§2).

**Phase C — the finger passes `ZOOM_DRAG_SLOP_PX` vertically.** Committed. Every move now drives zoom, and the release suppresses the click that follows.

The slop threshold at Phase C is the same load-bearing mechanism as ADR-0122 §4's, for the same reason stated one layer along: a finger emits `pointermove` on a tap, so a gesture that commits on the first move cannot tell a double-tap from a drag at all.

### 2. The arbitration is a capture-phase guard, and it is ours because the competitor is a WRITER, not a tracker

ADR-0122 §4 established "both listen and the loser bails" in this repo, with capture taken at drag start. **That precedent does not transfer here, and the reason is worth stating because it looks like it should.** The sheet's drag is safe to run and abandon: below the slop it is tracking a number and rendering nothing, so a loser leaves no trace. **Google's pan writes the camera on the first move.** Letting it see Phase B's moves and then taking over means the map has already panned — and ADR-0129 §4's `sameCamera` check would then read that pan as "a finger did it", which is _correct_ and therefore worse: the stray pan becomes the camera's truth.

So the events must never reach Google once Phase B begins. **A capture-phase `pointerdown`/`pointermove` guard on `.map-pane`** does exactly that: Google's listeners are on descendants of `.map-canvas`, and capture on an ancestor runs first, so `stopPropagation` there means Google never sees the event. It is decided per event, which matters — `touch-action` cannot be used for this, because **`touch-action` is read when the touch starts and a mid-gesture change does nothing** (session 116, recorded in `tokens.css`).

**Blocking Google's double-tap means we owe it.** Suppressing Phase B's events kills Google's `dblclick` zoom, which is shipped behaviour. So the handler implements the step-zoom itself, through `useMapCamera`'s existing eased path and the existing `zoomStepIn`.

**That repayment is a small win, not a cost.** Google's double-click zoom is Google's own move, and by ADR-0129 §3's table there is no way to ask it to ease — so it is the one camera move left on this surface that does not go through our driver. Taking it over finishes a job ADR-0129 did not know was unfinished.

### 3. The zoom is anchored at the canvas centre, and that is the cheaper AND the more consistent choice

Google's SDK anchors at the tapped point. **This anchors at the centre**, and the argument is not only that point-anchoring is more work:

- **The tapped point is under the thumb.** The gesture's origin is where the finger is resting for the whole drag, so a point-anchored zoom converges on the one spot the user cannot see.
- **It needs Google's projection, per frame.** Holding a pixel fixed means converting container pixels to lat/lng every frame through `getProjection()`. ADR-0129 §3 already recorded what that costs in judgement: re-deriving Google's projection maths is "a thing to get subtly wrong for no gain."
- **And the deciding one: ADR-0129 §1 already made this call on this surface.** Selection _pans and never zooms_, because being moved for a zoom you asked for is what the owner reported as "inconvenient" on a real map. A point-anchored zoom is exactly a lateral move bundled into a zoom. Centre-anchoring keeps a zoom a pure zoom — one axis of change — which is the same instinct one gesture along.

**Reversal is additive if the device pass wants it:** point-anchoring is one extra term in the same per-frame write, not a different design.

### 4. Sensitivity is a share of the canvas, and up means in

**`SPAN_SHARE` (0.5): dragging this share of the pane's height is one zoom level.** A share rather than a px count, because ADR-0123 settled that argument for this surface already — the pane's height moves by more than 2× between the `half` and `map` stops, so a flat px sensitivity would be twice as sensitive at one stop as the other. On the ~501px canvas session 143 measured, 0.5 is ~250px per level — about half the canvas per zoom level.

**Down zooms in, and the sensitivity is looser than designed. Both are the owner's calls off the mockup, and both reversed a derivation** — which is the whole reason this phase drew a decision surface before building.

- **Direction.** The design reasoned its way to _up = in_ from a genuinely good argument: this screen already says up means more, because dragging up grows the sheet (ADR-0122 §4). A finger overruled it. **Pulling the map toward you brings it closer**, and it is what Google's own Android gesture does. Recorded rather than quietly flipped, because the sheet-consistency argument is sound enough that someone will make it again.
- **Sensitivity.** 0.18 was derived (~1/6 of the canvas, roughly Google's Android feel), reported too sensitive, and settled at **0.5** over two rounds. **Do not "restore" the tighter number** — it was arithmetic; 0.5 is a report. One confound is recorded in the mockup and matters for the next re-tune: the mockup's canvases are 260px and 214px against a real 501px, and because the sensitivity is a _share_, the same constant is twitchier there than in the app (0.18 was 47px/level in the mockup versus 90px shipped). So the real canvas may want a value between the two, and the mockup's own table is the number to calibrate against rather than the feel of that file.

**The accumulator is clamped in distance, not in zoom.** Target zoom is `startZoom + distance / perLevel`, clamped to the map's own `minZoom`/`maxZoom` when set and to a named world range when not (they are deliberately unset here — ADR-0128 §1 notes `MAX_FIT` is clamped after the fit rather than as the map's `maxZoom`, so the pinch stays unbounded, and this gesture is bounded identically to the pinch by construction). Clamping the **distance** is what avoids the dead travel that clamping the target would produce: drag ten levels past the ceiling, reverse by one, and a target-clamped gesture does nothing for nine levels.

### 5. It is a manual camera act, and it says so by going THROUGH the camera

ADR-0129 §3's invariant is that **every** camera move goes through one driver. A gesture calling `moveCamera` itself would be the second writer of the camera on this surface, which is the thing that ADR forbids. So the drag zoom is **a new caller of `useMapCamera`**, not a new camera: one method, `zoomBy`, which cancels any ease in flight and writes instantly.

Cancelling matters and inferring is not enough. ADR-0129 §4's `sameCamera` check makes an ease **notice** a finger and stand down, which is the right behaviour for a pinch we cannot intercept — but we _can_ intercept this one, and within a single frame an ease could still write after us. The gesture tells the camera; the camera does not guess.

**ADR-0121 §7's "a manual pan or zoom wins until the next scope change" then holds with nothing added**, and it is worth recording _why_ rather than leaving it to be rediscovered: that rule is implemented as an **absence** — the framing effect is keyed on `setSignal`, so nothing re-fits until a control changes the set. A drag zoom does not change `setSignal`, so no fit fights the finger. The rule is satisfied structurally, not by a flag.

### 6. The dot tier crosses live for free, and the existing mechanism is the reason

`MAP_ZOOM.DOT_BELOW` degrades pins to dots, so a continuous zoom crosses that boundary mid-gesture and possibly repeatedly. **Nothing re-renders and nothing is billed**, because ADR-0128 §1 already chose the mechanism for exactly this shape: `PinDensity` listens on `zoom_changed`, writes a data attribute on the pane, and CSS does the whole degradation. `moveCamera` fires `zoom_changed`, so a drag zoom drives it at the same rate a pinch already does. No marker re-diff (the cheap failure), no re-instantiation (the billed one — ADR-0121 §4/§6).

One adjustment, because a drag zoom makes the load **sustained** where a pinch's is momentary: the write becomes conditional on the tier actually changing, instead of re-asserting `'dot'` on every event. Idempotent attribute writes still invalidate style.

### 7. The gesture is exempt from reduced motion; the step-zoom it inherits is not

`prefers-reduced-motion` is about motion the user did not ask for. **A drag zoom is one-to-one with the finger — the motion IS the input**, so a map that refused to follow would be a broken control, not an accommodation. It tracks the finger identically either way. This is ADR-0129 §3/ADR-0098 §4's rule read exactly as written ("the camera still MOVES, only the easing goes"): there is no easing here to drop.

**The double-tap step-zoom of §2 is the opposite case** — a discrete move the user asked for once — so it goes through `easeTo` and collapses to a single `moveCamera` under reduced motion, for free.

## Alternatives considered

- **Wait for Google to ship it.** The reconfirmation above is three sources deep and the gesture is Android/iOS-only; there is no signal it is coming to the web API.
- **A zoom control on the canvas.** Rejected in ADR-0121 §12 (Google's controls are Google-chromed, unlabelled, RTL-unaware) and it would spend from the scarce axis ADR-0126 measured to 49px of clear canvas at `half`. The point of this phase is that a thumb never leaves the canvas.
- **"Both listen and the loser bails."** §2 — the competitor writes the camera, so the loser leaves a pan behind.
- **Flip `touch-action` when the gesture is recognised.** Dead on arrival: `touch-action` is read when the touch starts (session 116, and it cost two CSS guards that did nothing).
- **`gestureHandling="none"` and own every gesture.** Buys the arbitration by giving up Google's pinch and inertial pan, both of which are good and neither of which we would rebuild well.
- **Point-anchored zoom.** §3 — more work, converges under the thumb, needs the projection per frame, and contradicts ADR-0129 §1's instinct. Left additive rather than closed.
- **A flat px-per-level sensitivity.** §4 — the pane's height moves by more than 2× between stops (ADR-0123).

## Consequences

- **Touched:** `constants.ts` (`ZOOM_TAP_GAP_MS`, `ZOOM_TAP_SLOP_PX`, `ZOOM_DRAG_SLOP_PX`, `ZOOM_DRAG_SPAN_SHARE`, the world-range clamp), a new pure `lib/drag-zoom.ts` + its test, `lib/useMapCamera.ts` (`zoomBy`), a new `lib/useDragZoom.ts` + its test, `ui/domain/MapPane.tsx` (the capture guard and the wiring), `ui/domain/map-pane.css` if the guard needs a hit layer.
- **Most of this is testable with no Google in the process**, which is the standard this surface is held to (ADR-0121 §13). The recogniser is a pure state machine over `(type, x, y, t)` — every branch of §1 is a table. The imperative half calls **three** `google.maps.Map` methods (`getZoom`, `moveCamera`, and `get` for the zoom bounds), so the existing ~60-line fake map in `lib/useMapCamera.test.tsx` covers it; reading "it talks to Google" as "it cannot be tested" is what shipped a camera on the whole world (ADR-0121's session-134 entry).
- **A second-gesture test is mandatory, not optional.** Session 122's class of miss was that every e2e booted cold and touched its target exactly once, and a real session never does — so the suite covers a double-tap-drag **after** a previous drag, a pan, and a tap on the same pane.
- **The device pass gains three items and they join Phase 3's existing line** rather than opening a new one: `SPAN_SHARE` **on a real canvas** (§4 — settled once on the mockup, whose canvas is half the size, so the number is reported rather than calibrated), `TAP_GAP_MS`, and whether centre-anchoring reads correctly on a phone (§3 — the one that could reverse a decision rather than move a number). **The direction is NOT among them:** it was a device-pass item and the owner spent it on the mockup, which is the point of drawing one.
- **One shipped behaviour changes hands:** the double-tap step-zoom becomes ours, so it eases like every other camera move instead of using Google's own animation.
