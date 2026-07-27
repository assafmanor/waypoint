# Session 141 — the split earns its screen: Phase 2, built

**Date:** 2026-07-27
**Branch:** `claude/map-split-phase-2-build-gwdqgf`
**Reading list, as scoped:** [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md) whole, `frontend/CLAUDE.md`, [`mockups/map-split-v2.html`](../../mockups/map-split-v2.html), and ADR-0121 §4/§5/§7/§8/§12 only where they bite. The Maps epic's other twelve ADRs were deliberately not opened.

**Output:** the build of ADR-0122 §1–§9, its [build log](../decisions/0122-map-split-controls-over-the-canvas.md#build-log-2026-07-27-session-141), this note, and the backlog's Phase-2 line pruned.

## What shipped

| Where                          | What                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `constants.ts`                 | `peek` → **`map`**; `MAP_CONTROLS_H` / `MAP_SHEET_STRIP_H` / `MAP_ATTRIBUTION_H`; `full` becomes `{ inset }`; `SNAP_DRAG_SLOP_PX`, `SNAP_FLICK_PX_PER_MS`; `MAP_FIT_PADDING.top` **derived** from `MAP_CONTROLS_H` |
| `lib/snap-sheet.ts`            | the `inset` variant across `stopHeightPx`/`stopHeightCss` (so the clamp gets it free) + `nearestStop`'s velocity term                                                                                              |
| `lib/useSnapDrag.ts`           | region target, slop threshold, window-bound listeners, capture at drag start, two-sample velocity, click swallow                                                                                                   |
| `ui/primitives/SnapSheet.tsx`  | the whole top region is the drag target; the grab line becomes a real ARIA splitter with arrows + Home/End; the header becomes a row                                                                               |
| `ui/primitives/ChoiceGrid.tsx` | a `compact` pills flag — glyph + count, label kept as the accessible name                                                                                                                                          |
| `screens/Map.tsx`              | the floating controls row (one component, two positionings), the facet disclosure, the place card, the pre-prompt's new home, near-me's new home, the two selection paths, the canvas tap                          |
| `ui/domain/MapPane.tsx`        | one stable `onCanvasTap` — the file the ADR's Consequences list missed                                                                                                                                             |
| CSS                            | `screens/map.css`, `ui/primitives/snap-sheet.css`, `ui/domain/map-pane.css`                                                                                                                                        |

`pnpm typecheck`, `pnpm --filter @waypoint/frontend lint` and `pnpm --filter @waypoint/frontend build` are green; **1322 tests in 106 files pass.** (The repo-wide `pnpm typecheck` also runs the backend, which fails in this sandbox for an unrelated reason: no generated Prisma client. Untouched by this change.)

## The rendered canvas was not seen, and that is not a hedge

No phone, no browser key, no rendered map in this session. Everything below is either a pure function, a DOM assertion, or a CSS rule read against the mockup that measured it. **Four things therefore remain unverified by construction**, and they are exactly the four the ADR's device pass already owns: whether the controls read as light over real cloud-styled tiles, whether the place card reads as floating, whether `half: 0.56` is the right split of a _rendered_ map, and whether `SNAP_FLICK_PX_PER_MS` matches a finger rather than a mouse. The derived defaults shipped, as scoped.

## Where the risk went, deliberately

The ADR said three pure functions absorb most of it, so that is where the tests went:

- **`stopHeightPx` / `stopHeightCss` with the third variant** — including `calc(100% - 46px)` as the CSS form (the screen must never measure its own layout) and the "container shorter than the inset" case, which would otherwise resolve to a negative height and clamp the drag to nonsense.
- **`nearestStop` as a table of release height × velocity → stop.** The same height lands differently depending on how the finger was moving, which is the whole decision; and the same height with velocity 0 lands exactly where the shipped function put it, which is what let the old table stay verbatim as the regression net.
- **The fit padding's derivation**, asserted against `MAP_CONTROLS_H` rather than against `118` — a test that reads both is what makes "they cannot drift apart" true rather than aspirational. It also pins §1's honest limit: affordable at the `map` stop (517px pane), dropped at `half` (250px), stated in the test rather than promised in prose.

The gesture went through the existing jsdom `PointerEvent` shim (`src/test/pointer-events.ts`), and two of the traps are now regression-guarded directly: **capture is asserted not to happen on `pointerdown`** and to happen once at drag start, and a sub-slop press is asserted to leave a control inside the region tappable while a real drag is asserted to swallow the click that follows. Both directions of the flick are testable deterministically in jsdom, in opposite ways: two moves fired back to back are unambiguously above the threshold (the hook floors `dt` at 1ms), and a move with a real `setTimeout` in front of it is unambiguously below it — a slower machine can only push the velocity **lower**, so neither is timing-flaky. Every Map-tab assertion pins the clock and the day-scoped/all-days pair is asserted on both sides, per `frontend/CLAUDE.md`.

## Two judgements the build had to make

**§7's bottom camera inset was not built, on purpose.** §7 asks the fit's bottom inset to carry the place card "derived from the same constant, exactly as the top inset carries the controls row". The top inset is a constant because the row is always there; the card comes and goes **on a tap**, so carrying it means a `MapPane` prop that flips on a tap — the one thing §9 lists as a constraint that must survive, and the reason §6 suppresses `באזור`/re-centre in CSS instead. The narrow case it leaves open (a chip tapped _while_ a card is open re-fits with the card's space unreserved) belongs to Phase 3, which owns the camera and is already revising `recentre`. Logged in the ADR and on the backlog rather than done quietly either way.

**The strip height reaches CSS under the primitive's own name.** §3 wants one constant behind both the `map` stop and the sheet-top `min-height`. That `min-height` is in `snap-sheet.css`, which is generic, so the screen writes `--snap-top-h` from `MAP_SHEET_STRIP_H` rather than letting a primitive read a `--map-*` variable. Same single source of truth, knowledge flowing the right way.

## The handoff Phase 3 must not lose

**With `קרוב עכשיו` absent at the map extreme, the canvas has no way to ask for the location permission there.** ADR-0121 §12 keeps re-centre re-framing and never locating, and §2 removes the only control on that stop that could prompt. Nothing is lost about the _fact_ — the "me" dot comes from `located`, not from the sort intent — and the way in is one tap on the view toggle, which brings the chip back at `half`. But it is a real gap until **Phase 3's `recentre` revision** lands (report #5: centre **and** zoom, and route to the same reason-first card when there is no permission). That is the very next phase, and its line on the backlog already carries this.

## What was left alone, as scoped

Phase 3 itself (its ADR gets written at the head of its own session), the app-chrome condensing pass (its own design session, already on the backlog with what it must decide), and every number in the device-pass cluster. The mockup is unchanged — it is the spec, and it still measures itself.
