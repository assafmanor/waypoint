# Session 150 — the canvas's own chrome, built (Phase 8)

**Date:** 2026-07-28
**Kind:** build session. Consumes session 149's design.
**Output:** [ADR-0126](../decisions/0126-map-canvas-chrome-two-camera-controls-and-an-area-sort.md) is built — see its **build log** for the six things the build had to decide; §1–§8 needed no reversal. Backlog Phase 8 pruned to done; Phase 3's line notes it inherits two controls that already exist.

## What shipped

`ui/Icon.tsx` gains `frame`. `ui/domain/MapPane.tsx` grows the `.map-camctl` cluster (locate + frame, 44×44), makes locate locate-only, and turns the `באזור` readout into a live region **wrapping** a button. `screens/Map.tsx` gains the area intent (a third `listOrder` value, exclusive with `sortByDistance`), the two group headers, the ghost shortfall banner, and the locate ladder with its outcome-keyed sheet lift. CSS in `map-pane.css` + `map.css`; copy in `i18n/he.ts`.

Tests: `MapPane.test.tsx` +9 (the pair, the cluster, framing's absence, both locate branches, and four on the region-wraps-button contract); `Map.embedded.test.tsx` +12 (the order, the two headers, the shortfall, the snapshot, the two exits, both exclusions, the lift, and the three locate outcomes). 1419 frontend tests green.

## The thing worth reading, if you read one

**`areaSorted` is a `MapPane` prop that changes on a tap, which ADR-0122 §9 appears to forbid outright.** It is allowed, and the reasoning matters more than the outcome: §9's subject is re-instantiating the map. The case it actually rejected was §7's bottom camera inset — a prop that would have changed what the **camera** does. `areaSorted` is a boolean that reaches `aria-pressed` and a class, never the map instance, and it leaves `pins` and every handler identity-stable so no marker re-diffs.

It is also not avoidable the way the last one was. `:has()` answered §7 because that was a pure presentation question; here a `data-` attribute on `.map-screen` could paint the pressed state but **cannot express `aria-pressed`**, and a control that looks pressed without saying so is the half-fix. What was kept is the discipline, not the letter: `onAreaSort` and `onLocate` are `useCallback(…, [])` over latest-refs, like every other pane handler.

## Two smaller ones

**Where each number comes from is deliberate.** `placesInArea` (which orders the rows) reads place **coordinates**; `ghostsInArea` (which writes the banner) filters the very `pins` array `areaCount` is counted from. The first is a fact about a row, the second has to be the same number as the pill or the two halves drift — which is the defect this whole phase exists to close.

**A test harness hid a real state.** `MapPane.test.tsx` defaulted `areaCount` with `??`, which swallows an explicit `null` — and `null` ("no idle yet") renders differently from `0` ("nothing in view"). The assertion that neither renders a button had been passing against `1`. `??` is wrong in any harness whose prop is nullable.

## What was verified, and what still was not

`mockups/map-chrome-v1.html` was re-rendered against the **shipped** stylesheets (the inliner re-run, as the convention requires once the sheets change) and measures the same 44×44 band, the same 68×44 pill and the same clear canvas per stop as it did against the design's own delta. That is a real cross-check — it says the built CSS is the designed CSS, not a plausible neighbour.

It is not a canvas. **The rendered map still has not been seen** (ADR-0121 §13): no phone, no browser key, and the tab falls to its list-only path without one. ADR-0126's three device-pass questions are all still open, and they now join Phase 3's tuning cluster: whether the two glyphs read as distinct over real tiles, whether 44px is heavy at `half` on a 360×640 phone, and whether a pill among two circles reads as tappable at all.
