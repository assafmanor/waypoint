# 0123 — A map pin is a share of the canvas it sits on

**Status:** Accepted — built 2026-07-27 (session 142), **recalibrated on a real phone the same day (session 143)**: the shape held, `CANVAS_SHARE` went 0.08 → 0.11 and `MAX_H` 46 → 56, because the original baseline was a canvas size no device actually has. See [the amendment](#amended-2026-07-27-session-143--the-pass-happened-and-the-shape-survived-while-both-numbers-moved). `MIN_H` is unchanged and `half` is untouched. What is still open is a **dense all-days day**, not a number.
**Date:** 2026-07-27
**Amends** [0121](0121-embedded-map-phase-6-design.md) **§6** (the pin's geometry becomes a rule rather than a fixed size; the ghost tier's "smaller" becomes a ratio) and **§7** (the fit's pin clearance is derived from the size the pin will actually be, not a flat constant). Relates [0122](0122-map-split-controls-over-the-canvas.md) §1/§9, [0017](0017-mobile-first-device-targets.md), [0028](0028-plan-violet-color-budget-dark-ready.md), [0098](0098-motion-and-transitions.md).

## Context

Reported from the shipped tab, on a screenshot of the map extreme: **"the map pins are much smaller than they could've been given the size of the pane. On a case like this they should've been much larger, though when the map is sharing the screen with the list perhaps it's a different story."**

Both halves of that are right, and the second half is why a flat bump is the wrong fix.

`.map-pin` shipped at a fixed **28×34px** (ADR-0121 §6, ported from `mockups/map-embedded-v1.html`). ADR-0122 then made the sheet's stops move the canvas by more than a factor of two — measured on the 390×844 baseline, against the real layout tree:

| Stop   | Pane (the canvas)                 | A 34px pin is |
| ------ | --------------------------------- | ------------- |
| `map`  | ~545px                            | 6.2% of it    |
| `half` | ~263px                            | 12.9% of it   |
| `full` | full height, `visibility: hidden` | not on screen |

So one number was serving two canvases that differ by 2×, and it was tuned for the smaller one. That is the whole defect: the mockup the size came from had no three-stop axis, so "how big is a pin" was never asked against the canvas the stop leaves.

Note what is **not** the problem. The pins are not too small for the map's zoom, or for their number, or relative to each other — the grammar of ADR-0121 §6 (four tiers, numbers, the two amber cues) is intact and is not being reopened. What is wrong is one scalar.

## Decision

### 1. The canvas sizes the pin, and it is the only parameter

**A pin is a share of the visible canvas's height, floored and capped.** One rule, `MAP_PIN` in `constants.ts`:

```
pin height = clamp(MIN_H 34px, CANVAS_SHARE 8% × canvas height, MAX_H 46px)
```

- **The floor is the size that shipped.** It is the size the design pass approved, it is where a 13px category glyph stops being legible, and it is the touch-target floor ADR-0017 cares about. It is also what makes the reporter's second sentence true by construction: **at `half` nothing changes at all**, because the clamp bottoms out at exactly the shipped geometry. No re-review of the shared-screen case is owed.
- **The cap is where a marker stops reading as a _point_** and starts reading as a label — and where coincident pins start colliding for no gain (§6's z-order handles overlap; making the overlap worse is not free).
- **The share is of the _height_**, because height is the axis the stop moves.

Outputs, on the measured baseline:

| Canvas | Where                           | Pin                       | Ghost  | Camera clearance     |
| ------ | ------------------------------- | ------------------------- | ------ | -------------------- |
| 263px  | `half`                          | **34.0px** (unchanged)    | 24.5px | 54px (was a flat 64) |
| 425px  | where growth begins             | 34.0px                    | 24.5px | 54px                 |
| 545px  | `map` extreme — **the report**  | **43.6px** (+28%)         | 31.4px | 69px                 |
| 575px+ | tablet, desktop, a taller phone | **46.0px** (+35%, capped) | 33.1px | 72px                 |

**Two axes for the price of one.** Keying on the canvas rather than on the stop means a tablet's `half` and a phone's `map` are answered by the same rule, and a fourth stop would be too. A `data-view`-keyed size table would have needed a second mechanism for device size; this needs none.

### 2. Rejected as parameters, with reasons

- **Zoom level — so a pinch does _not_ resize a pin, and that is the decision, not an oversight.** A pinch changes the map's zoom, never the pane's box, so `cqh` is unchanged and the pin holds its pixel size at every zoom: the world scales underneath a marker that stays put. That is the OS-map convention and Google's own marker behaviour, and the alternative is a pin resizing **continuously under a moving finger** — the churn ADR-0121 §9 deliberately keeps out of the `באזור` readout, except louder, because a growing pin also moves what is under your thumb mid-gesture.

  It has one honest cost, and it is worth stating because it is the thing a fixed-size marker gets wrong: **a pin covers more ground the further you zoom out**, so at country zoom a 46px teardrop spans a city. That is exactly the legibility problem ADR-0121 §6 answered with a **dot tier** ("below a legibility threshold a pin degrades to a dot — hue kept, number and glyph dropped"), which §7's table already cites for a multi-city all-days fit and which **was never built**. It stays out of scope here for a reason that is not laziness: it is keyed on **zoom**, and it is a change of _tier_, not of size — a discrete swap at a threshold, which is legitimate under a pinch in a way that continuous scaling is not. It is now on the backlog against Phase 3, which owns zoom.

- **Pin count / on-canvas density.** Same defect, worse: density changes on every pan, so pins would resize while you drag the map. `areaCount` is idle-gated precisely because a number churning under a finger is noise; a resizing pin is louder than a churning number.
- **Selection or the amber cues.** Growing the tapped pin or the next stop would make size a second prominence channel next to the rings and the z-order that already carry it, and would put two cues on one pin. Prominence stays where §6 put it.

### 3. One unit, so the pin scales as one object

`--pin-u` is the teardrop's full height, and **every** dimension in `map-pane.css` is a fraction of it: the badge (0.74), the glyph (0.38), the number badge and its ring (0.44 / 0.26 / 0.045), the amber rings (0.074 / 0.162 / 0.206 / 0.324), selection's outline and its offsets, and the tag (0.28 / 0.06 / 0.21 / −`TAG_RISE`). The fractions **are** the shipped 34px geometry expressed as ratios, so at the floor this draws the pin that shipped, to within a pixel.

That is not tidiness. Scaling the badge while the number stayed 9px would have produced a pin that reads as a badge with a sticker on it, and a 2.5px amber ring on a 46px pin reads as a hairline someone forgot to scale — the ring **is** the cue (§6).

**The ghost tier's "smaller" becomes a ratio** (`GHOST_SCALE 0.72`) rather than a fixed 25px box. This is the sharpest argument for one unit: a fixed ghost would have gone on getting relatively smaller as the canvas grew the others, until the ladder's bottom rung read as dirt on the screen rather than as a place you are standing next to. Subordinate is a _ratio_, not a size.

**The "you are here" dot scales too** (0.41 of the base), though it is not a pin. It is a marker on the same canvas answering the same "how big is a point on a map this size" question, and a dot that stayed 14px while the pins grew would read as the least important thing on screen — the opposite of what it is when you are standing somewhere.

### 4. It is CSS, resolved against the pane, and no React knows about it

`.map-pane` becomes a **size query container**, and `--pin-u` is a `clamp()` in `cqh`. The screen writes the rule — not a number — into `--pin-base` from `MAP_PIN` via `pinSizeCss()`, exactly as it already writes `--map-controls-h`.

Three constraints made this the only shape worth building, and each of them rules out the obvious alternative:

- **`screens/Map.tsx` re-renders every second.** Measuring the pane into state is a layout read on the clock — the anti-pattern `frontend/CLAUDE.md` names by name.
- **A `MapPane` prop that changes on a gesture is forbidden** (ADR-0122 §9). Passing a pin size down would re-diff every marker on a stop change, for a value the browser already knows.
- **`--sheet-h` is written from the _snapped_ stop** (ADR-0121 §5), so the pane's box changes on snap and never per drag frame. The browser therefore re-resolves `cqh` once per stop change — the drag stays relayout-free.

An `AdvancedMarker`'s content is a real DOM descendant of the canvas div, so `cqh` inside a pin resolves against the pane. That was **verified in Chromium**, not assumed — see the build log.

### 5. The resize is animated, by one registered length

`--pin-u` is registered with `@property` as a `<length>`, which makes it **interpolable** — so a single `transition: --pin-u var(--t-base) var(--ease-standard)` eases the badge, glyph, number, tag and rings together. It borrows the sheet's own duration and curve, so **the pins finish growing exactly as the sheet finishes sliding** instead of stepping the instant it starts.

Transitioning the derived properties one at a time was the alternative: a dozen declarations that can fall out of step, plus `box-shadow` interpolation for the amber rings. One registered length is the mechanism that already exists for this.

Three behaviours were measured rather than reasoned about (build log): it interpolates as a real curve; a pin **added by a filter change does not pop in** from the registered initial value, because CSS transitions do not run on insertion; and reduced motion **snaps**, via `App.css`'s global reset — "it still moves, only the easing goes" (ADR-0098 §4), the same posture the sheet and the camera already take.

Where `@property` is unsupported, `--pin-u` degrades to an ordinary custom property: pins still size correctly, they just snap. The failure mode is the absence of an animation, never a wrong size.

### 6. The camera's clearance is derived from the pin, not from a constant

ADR-0121 §7 insets a fit by "a pin's own height" because the teardrop's **tip** is the anchor, so its body and any tag extend _above_ the coordinate. That was a hand-tuned `MAP_PIN_FIT_CLEARANCE = 64`. Once the pin's size depends on the canvas, a flat constant can only be right for one stop.

So `MAP_FIT_PADDING` becomes **`mapFitPadding(canvasHeightPx)`** (`lib/map-camera.ts`), whose top is `MAP_CONTROLS_H + MAP_FLOAT_GAP + pinClearanceFor(canvasHeightPx)`, and `pinClearanceFor` is `pinHeightFor × (1 + TAG_RISE)` — the pin plus the amber tag that rises above it, which is the topmost ink there is. `useMapCamera` already measures the div to decide whether the padding is affordable; it now uses that same one measurement for both questions.

`TAG_RISE` is named in `MAP_PIN` and written into CSS as `--pin-tag-rise` **because both sides need it**: it positions the tag and it reserves room for the tag, and those must be one number. Same arrangement, same reason, as `--map-controls-h` (ADR-0122 §1).

**ADR-0122 §1's two honest limits are unchanged and still stated:** this governs a **fit** (a manual pan can still put a pin under the controls row, and no map larger than its frame can promise otherwise), and `fitPaddingFor` still drops padding claiming half an axis — so at `half` the inset **is still dropped** and a fitted pin can land under the row. Deriving the clearance makes that case _cheaper_ (54px asked instead of 64), not solved.

## The device pass owns three numbers

**`MIN_H`, `MAX_H` and `CANVAS_SHARE` are legibility judgements, and this ADR does not pretend a sandbox settled them.** What is decided here is the **shape**: that the canvas is the parameter, that the floor is the shipped size, that one unit scales the system, and that the clearance is derived. The numbers are that shape's output on a measured baseline.

Specifically: is **46px** a confident marker or an overbearing one over real cloud-styled tiles? Does **8%** hold on a 360×640 phone, where the map extreme is ~400px and the pin lands at the floor anyway? These belong with `MAP_ZOOM`, `MAP_REFIT_FILL_SHARE` and `half`'s fraction — Phase 3's cluster — because they are all the same question: **how close is close enough to read a place in context.**

A 1:1 preview of every rung, with the stop toggle live, was produced for the human pass rather than described: it renders the branch's own CSS at true scale in both themes.

### Amended 2026-07-27 (session 143) — the pass happened, and the shape survived while both numbers moved

The owner looked at it on the phone and reported it **still too small**. The shape needed no reversal; the calibration did, and the reason is worth more than the numbers.

**The baseline was a size no device has.** `CANVAS_SHARE = 0.08` and `MAX_H = 46` were set against ADR-0122's measured 390×844 budget, where the map-stop canvas is 545px. The owner's phone has a shorter usable viewport — the canvas measures **~501px** — so the pin came out at ~40px rather than 43.6, a **+18% change where the arithmetic advertised +28%**, and the cap (which needs a 575px canvas) was never in reach. So the tab landed mid-ramp on the one device anybody had looked at it on.

**Measured, not eyeballed**, from the two reported screenshots of the same device: the lodging pin's badge went **67 → 79 device px** (1,543 → 2,148 pixels), a ratio of **1.18**. Running that back through the rule gives the ~40px pin and the ~501px canvas — which is how a screenshot became a calibration input rather than an impression.

**The new numbers: `CANVAS_SHARE = 0.11`, `MAX_H = 56`**, floor unchanged at 34. ~55px on that phone, 1.6× the original teardrop.

**The consequence, stated here rather than left to be rediscovered:** the growth band is `MIN_H/SHARE` → `MAX_H/SHARE` = **309px → 509px** of canvas, so a phone at the map extreme now sits **at the cap**, and `MAX_H` is what sets the size there — the share's remaining job on a phone is to hold `half` at the floor. Two things follow. **`MAX_H` is the knob** if the map extreme wants re-tuning again, not the share. And `half` is protected with room to spare: its canvas is 44% of the body (~243px on that device) against a floor that holds under 309px, so even 0.14 would leave the shared-screen stop byte-for-byte as it shipped — which is what makes raising the share safe for the stop the owner said already reads correctly.

**What is still unsettled**, and named so a third pass starts ahead: past roughly 56px a teardrop's tip gets vaguer about which building it marks, and coincident pins overlap sooner. The case that would show it is a **dense day in all-days scope**, not another single-day screenshot — so that, not a number, is the next thing to look at before `MAX_H` moves again.

**Two baselines are now kept in the tests** (`AT_MAP_STOP` = 545, `ON_DEVICE` = 501), because calibrating against the mockup budget alone is precisely what produced the undershoot.

## Consequences

- **Touches** `constants.ts` (`MAP_PIN`, `MAP_FIT_INSET`, `MAP_FLOAT_GAP` exported, `MAP_PIN_FIT_CLEARANCE`/`MAP_FIT_PADDING` retired), `lib/map-pins.ts` (`pinHeightFor` / `pinSizeCss` / `pinClearanceFor`), `lib/map-camera.ts` (`mapFitPadding`), `lib/useMapCamera.ts` (one call site), `screens/Map.tsx` (three CSS vars), `ui/domain/map-pane.css` (the container + the whole pin geometry). No component, no prop, no state, no schema.
- **The pin grammar is untouched.** Four tiers, the numbers, the two amber cues, the z-order, the colour budget: unchanged. This is one scalar and its consequences.
- **Testable in the suite, which is the point of where it lives.** `pinHeightFor` / `pinClearanceFor` / `pinSizeCss` are pure and unit-tested with no Google in the process (ADR-0121 §13), including the two regimes, the clamp's bounds, monotonicity, and the degenerate 0×0 pane that opened the map on the whole world in session 134. `map-camera.test.ts` asserts the coupling — that a bigger canvas both grows the pin and reserves more for it — the same way it already asserts `--map-controls-h`. **What the canvas looks like is still a human pass**, and saying so is the point.
- **`pinSizeCss` returns a CSS string from TS**, which is the trade `stopHeightCss` already makes for `--sheet-h`: the browser owns the resolution, so nothing is measured on the clock. The tests assert the string against the same constants, so the two evaluations of the rule cannot drift.
- **`@property` is new to this codebase.** It is document-global by nature (registration is not scoped), so `--pin-u` is now a reserved name app-wide. Worth knowing before a second surface wants an animated length.
- **`container-type: size` is also new.** Safe on `.map-pane` specifically because that box is sized by its own insets, never by what Google draws inside it — which is the one precondition size containment has. A future full-bleed pane wanting the same trick needs the same check.
- **The dot tier is still unbuilt**, and is now tracked. ADR-0121 §6 decided it and nothing carried it; it is zoom-keyed, so it belongs with Phase 3.

## Alternatives considered

- **Just make the pin bigger.** Rejected on the reporter's own second sentence: a size good for a 545px canvas is overbearing on a 263px one, and `half` is the default stop.
- **A size per sheet stop, keyed on `data-view`.** The obvious shape, and it is what the tab's CSS vocabulary already speaks. Rejected because it answers the stop and not the canvas: a tablet's `half` is bigger than a phone's `map` extreme, so it needs a second, breakpoint-based mechanism bolted beside it — and a future fourth stop needs a fourth entry. The container query is one rule for both axes and for any stop.
- **Measure the pane with a `ResizeObserver` and put the size in state.** Rejected twice over: a layout read on a screen that re-renders every second, and a `MapPane` prop that changes on a gesture (ADR-0122 §9) — re-diffing every marker for a value CSS resolves for free.
- **`transform: scale()` on the pin instead of scaling its parts.** Genuinely attractive: one compositor-cheap property, trivially transitionable, and no ratios at all. Rejected because `scale()` needs a **unitless** factor, and CSS cannot divide a `cqh` length by a px length to get one — the only route is the `tan(atan2(a, b))` trick, which is exactly the kind of cleverness that reads as a bug to the next person. Scaling would also blur the glyph and the number rather than re-laying them out.
- **Animate the pane's own `bottom` so the container height eases** (which would make `cqh` re-resolve per frame and scale the pins for free). Rejected: it resizes a live `google.maps.Map` every frame for 280ms and shifts the camera centre continuously — the relayout ADR-0121 §5 removed from the gesture, reintroduced on the stop change. Transitioning the pin's own unit gets the same smoothness while the pane relayouts exactly once.
- **Scale with zoom, or with density.** See §2 — both resize pins under a moving finger.
- **Leave `MAP_PIN_FIT_CLEARANCE` flat at 64 and only change the pin.** Rejected: at the map extreme the pin plus its tag now needs 69px, so a fitted pin's tag would clip at the top of the view — the exact failure §7's inset exists to prevent — and at `half` the flat 64 asks for 10px it no longer needs, on the one axis where `fitPaddingFor` is already dropping the padding.

## Build log (2026-07-27, session 142)

Designed and built in one session; the report is one scalar, and the shape above is what shipped. What the build had to **verify rather than assume** is the whole content of this log, because three of the four load-bearing claims were about browser behaviour that no unit test in this repo can reach. A ~60-line Playwright harness against the preinstalled Chromium answered all of them — the same posture `frontend/CLAUDE.md` takes about `useMapCamera`: before declaring something untestable, count what it actually depends on.

1. **Does `cqh` reach an advanced marker at all?** The whole design rests on it, and nothing in the shipped pin CSS was evidence either way: every token it reads (`--cat-*`, `--card`, `--ink`) is defined on `:root`, so it would resolve identically whether or not the marker is inside `.map-pane`. Read the binding's source first — `AdvancedMarker` portals its children into a div it hands to Google as `marker.content`, and Google inserts that into the map's own overlay layer inside the map div — then measured: **43.6px at the `map` stop, 34px at `half`**, i.e. `545 × 0.08` and `263 × 0.08` floored. It reaches.
2. **Does a `cqh`-derived value survive `@property` registration as `<length>`?** The one thing that could have forced the verbose per-property transitions, since registered custom properties compute early and container units depend on layout. Measured: it does, and the computed value reads back as `43.6px`.
3. **Does it actually interpolate?** Sampled across a `half → map` change: **36.05 → 40.80 → 42.52 → 43.33 → 43.55 → 43.59px** over ~280ms. A real curve, not a step — which is what §5 promises and what the reporter asked about.
4. **Does a newly inserted pin pop in from `initial-value: 34px`?** This would have been a real regression: markers are added and removed on every filter change, so a pop-in would make each chip tap bounce the canvas. Measured over the first three frames after insertion: **43.59 / 43.59 / 43.59**. CSS transitions do not run on insertion, so there is nothing to suppress.
5. **Does reduced motion snap?** Confirmed with `App.css`'s global reset present, emulating `prefers-reduced-motion: reduce`: **43.59px one frame after the stop change**. The first run of this check was a false negative — the harness had not yet copied the global reset, so it measured the transition it was meant to be suppressing. Worth recording: a probe that omits the app's own resets is testing a different page.
6. **`--pin-u` had to be registered `inherits: true`.** The pin's parts (`.pin-b`, `.pin-g`, `.pin-n`, `.pin-tag`) are children reading the same unit, and registration defaults to non-inheriting.
7. **The ratios are faithful because `box-sizing: border-box` is global** (`tokens.css`'s `*` rule), so `.pin-b`'s `0.74u` includes its border exactly as the shipped `25px` did. Checked rather than assumed — under `content-box` every badge would have grown by its border.
8. **Two CSS comments were closed twice**, which `lightningcss` reported as "invalid dangling combinator" pointing at prose. Mundane, but the error message names neither the file's real problem nor the line that caused it, so it is worth knowing the shape: new prose appended after an existing block comment's `*/`, with its own `*/` left behind.
