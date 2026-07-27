# Session 140 — the split earns its screen: Phase 2, designed

**Date:** 2026-07-27
**Branch:** `claude/map-panel-phase-2-design-bt42he`
**Paper only** — no feature code. Reads against ADR-0121 §5 (+ §4/§7/§8/§12 where they bite), ADR-0109 §6 and its session-105 amendment, ADR-0017, ADR-0100. Four ADRs, as the phasing note said the phase needs; the Maps epic's other eleven were deliberately not opened.

**Output:** [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md) + [`mockups/map-split-v2.html`](../../mockups/map-split-v2.html), the ADR-0121 §5 amendment note, the `design/mockups.md` entry, and the backlog lines. The **build** is a separate session and needs a phone.

## What this session actually did differently: it measured

Phase 2 is the phase session 135's note warned about by name. Session 131's Phase-6 mockup read the app's real stylesheets and still designed something unbuildable — it silently supplied a flex column `.map-screen` did not have — and Phase 2 **is** a layout-tree change. So the first hour went into a measurement harness rather than a design: the real `.app` flex column, the real header with the real day strip, the real `<main class="body is-fullbleed">`, `.map-screen.is-split`, `.map-split`, the pane, the sheet, **and the `.nav`**, rendered in Chromium at three phone sizes with the shipped stylesheets inlined by the repo's own generator.

That harness became the mockup, which now **prints its own measurements**. Every number in ADR-0122 is a `getBoundingClientRect` reading visible on screen, not an assertion.

**Three things the measurement found that the design would otherwise have gotten wrong:**

1. **`half: 0.56` is innocent.** It splits what is left almost exactly in half. What is small is _what is left_: 474 of 844 px. The phasing note listed "re-tune the stops" as a candidate move; the tuning would have been a fix aimed at the wrong number.
2. **`peek: 116` shows 65px of list — 0.8 of an 82px row.** The stop whose stated job is "handle + a row or two" (ADR-0121 §5) shows neither. That is a derivation error, not a taste one, and it is fixable on paper.
3. **Merging the two header rows — the phasing note's headline candidate, and this session's first draft — buys 28px.** Measured, not estimated: 94 → 66. Split by the stop, that is +13px of map and +16px of list at `half`, about 6% each. The report is not "6% too small". A design session that had not measured would have shipped the merge and called Phase 2 done.

The Phase-6 mockup had neither the `.body` element nor the `.nav`, which is precisely why nobody had noticed that **370 of 844 phone pixels are spent before either half of the split gets one.** The trap session 135 named was real, and the same file was still carrying it.

## The owner's mid-session steer, and what it changed

Two things came in while the merge-only draft was being written:

1. the whole filter apparatus (categories, `אולי`, `מה נשאר`, search, `כל הימים`, `קרוב עכשיו`) **is cluttered and takes too much space**;
2. the controls **can render over the map**, as long as they do not cover pins, because that gives more of the map.

Both were adopted, and together they turn a 6% change into a real one. Floating the controls makes the split the whole body — the pane goes 208 → 250 at `half` and 358 → 420 at `peek`, the list 2.6 → 3.3 rows, **and every stop gains** rather than one. The decluttering is where the design work went: three controls at rest instead of seven, with the facets one tap away in ADR-0100's cover-the-row-in-place idiom, and the category chips reduced to **glyph + count** — which is not a compression trick but a duplication removed, since the glyph is already the category's whole vocabulary (ADR-0038) and the row badge and the pin both carry it. Measured payoff: all six categories now fit one 390px row, where the shipped worded pills fit two and a half.

"Does not cover pins" turned out to have an existing mechanism waiting for it: ADR-0121 §7's fit already insets by a pin's own height because the teardrop's tip is the anchor. The row joins that inset, derived from the same constant that writes `--map-controls-h` so they cannot drift. Two limits are stated rather than glossed — a manual pan can still put a pin under the row (nothing can prevent that), and `fitPaddingFor` drops padding that claims half an axis, so at `half` on a small phone the inset _will_ sometimes be dropped.

## The two bugs the mockup found by being interactive

The drag is the part of this phase that cannot be judged from a static picture, so the mockup implements it. It got two things wrong first, and both are now the ADR's sharpest build notes — neither is visible from reading `useSnapDrag`:

- **A region-bound `pointermove` listener stops hearing the gesture.** The sheet's top is ~51px tall and the drag travels hundreds; two frames in, the pointer is outside the element and the events bubble from whatever is under the finger instead. The listeners have to sit on the `window`. (A partial convergence with the shelf's `useHoldToDrag`, and still not an extraction — the reasons that hook listens on the window remain different ones.)
- **Pointer capture taken at `pointerdown` silently kills every tap inside the region.** With capture active the following `click` is retargeted to the _capturing_ element, so the `רשימה · מפה` toggle — which lives in the widened target — never receives it. Harmless while the target was a bare handle with nothing to click; fatal now. Capture has to start with the drag, and it is still needed (it keeps the greedy canvas from stealing the gesture).

Both were found by driving the mockup with Playwright and asserting on the outcome: a short fast flick landed on the next stop in its direction, and a tap on the toggle still moved the sheet. That is the whole argument for a mockup that runs rather than one that renders.

## The second steer: what is the sliver of list even for?

Asked of the design once the controls were floating: **when the map is maxed, what does the small part of the list add?** And: **tapping a pin should surface the place, but not by raising the list — it must not interrupt the interactive map.**

The two questions answer each other, and the answer needed the `peek` change to exist first:

- **The peek row is where a tapped pin speaks.** A pin tap selects, scrolls that row to the top of the one-row viewport, and **moves nothing** — the map keeps every pixel and the camera stays put. Without the row, a pin tap would need either an info window (a new surface, over the pins it describes) or a raise (the interruption). So the sliver's value is not "a teaser for the list"; it is the place's own statement, on demand.
- **This revises the raise session 136 shipped** for report #4. That fix was right that both directions must show what you selected, and at `peek: 116` — a 65px viewport — raising was the only mechanism that could show anything. Once a row fits, the raise becomes the interruption being reported. Its scroll survives; the raise does not.
- **One rule replaces the symmetry:** the sheet moves only when what you just asked about is not on screen. A pin is on screen, so nothing moves; a **row** tap normalises to `half` — from `full` because the map it focuses is invisible there, and from `peek` because the row's own way-in block does not fit one row. First tap identifies, one tap on the surfaced row opens the door.
- **It closes ADR-0121 §8's open question, away from the thing that question feared.** §8 left "info window vs. only via its row" to be judged on a real map. Judged: no info window — the peek row is one, without a second way of stating a place. Two routes, one destination: §8 worried about the surface, the owner worried about the interruption, and both land on the same design.
- **`peek` was NOT re-sized to fit the way-in entries.** Measured, a selected row with one entry is 141px against a 97px viewport; fitting it needs ~198px and costs the map 50px at the stop whose entire point is the map. The entries sit one short scroll (which never resizes the map) or one row tap away, and the ADR states that trade instead of hiding it.

## Decisions worth restating, because they are reversals or new rules

- **The header does not collapse or move per stop** — the phasing note's second candidate, rejected with numbers. At `full` (the only stop where hiding the filters is defensible, since the pane is hidden) it buys the list one row out of six, and it pays by relayouting the canvas on a gesture ADR-0121 §5 deliberately made relayout-free. Once the controls float, the arithmetic disappears.
- **Scope belongs to the tab, filters belong to the split, sort belongs to the list.** That is what moves `קרוב עכשיו` out of the canvas row and into the sheet's own top row: it re-orders the list and adds distance chips, which is the distinction session 138 already made in state when it split `located` from `sortByDistance`.
- **`full` becomes a third `SnapStop` variant** (container minus the controls row), so the sheet cannot cover the controls of the list it is showing. One variant on an existing type, read through the two helpers that already exist.
- **The pre-prompt moves; the refusal notice does not.** One is about the map, the other explains the list's order, and the split is exactly what each is about. The mover becomes canvas furniture — absolutely positioned, so it costs the split no height and the camera does not move for it; a sibling of `.map-pane` and never a wrapper, because wrapping `<MapPane>` remounts it and a remount is billed.
- **`half` keeps 0.56, on purpose.** Picking a new fraction here would be picking a number that looks right in a desktop viewport, which is how 0.56 came to be blamed for a problem it did not cause.

## The elephant, named and left standing

The app chrome is **276px of a 390×844 phone** (207 header + 69 nav) — 33% before this tab's own controls, 43% on a 360×640 one. It is the largest single consumer of the split's budget and it is not the Map tab's to change: the header day strip is _why_ the Map is a day-scoped surface (ADR-0109 §1), and the mode bar is mode identity. Fixing it quietly inside a Map-tab ADR would be exactly the drift the ADRs exist to prevent, so it is a new backlog line and its own design session.

## Not done here, deliberately

No feature code. No new numbers presented as tuned: `half`'s fraction, `peek`'s sliver and the flick threshold are legibility and feel, and the ADR hands them to the device pass that Phase 2's build shares with Phase 3. Phase 3's camera work was not touched even where it is adjacent (the fit padding change is stated as a derivation, not as a new zoom decision).

## For whoever picks up the build

1. Read [ADR-0122](../decisions/0122-map-split-controls-over-the-canvas.md) and open `mockups/map-split-v2.html` — the drag in it is the spec for the gesture, and the budget panel is the spec for the geometry. Re-run the CSS inliner if you touch any of the sheets in its `APP-CSS:` manifest.
2. The pure parts are testable with no Google in the process, and are where the risk is: `stopHeightPx`/`stopHeightCss` with the `inset` variant, `nearestStop` with velocity (a table of release height × velocity → stop), the fit padding's derivation. The gesture's slop/capture behaviour goes through the existing jsdom `PointerEvent` shim (`src/test/pointer-events.ts`).
3. Keep `Map.test.tsx`'s no-build-config path green: the list-only tab renders the same controls row in ordinary flow, and it is the one place `קרוב עכשיו` cannot live in the sheet.
4. Pin the clock and assert across both day scopes, as this tab always requires.
