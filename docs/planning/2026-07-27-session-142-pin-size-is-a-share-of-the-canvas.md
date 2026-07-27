# Session 142 — the pin is a share of the canvas (2026-07-27)

**ADR:** [0123](../decisions/0123-map-pin-size-is-a-share-of-the-canvas.md) — designed and built in one session.
**Branch:** `claude/map-pin-sizing-misafk`.

## The report

One screenshot of the map extreme, and one sentence with two halves:

> The map pins are much smaller than they could've been given the size of the pane. On a case like this they should've been much larger, though when the map is sharing the screen with the list perhaps it's a different story. We should think of a way to determine the size of the pins based on different parameters.

Both halves are right, and the second is what makes a flat bump wrong. Followed by, on seeing the shape:

> And do they auto resize smoothly? So that when you switch from full to half map the transition will be smooth?

## What it actually was

Not a grammar problem. `.map-pin` shipped at a fixed **28×34px** (ADR-0121 §6, ported from `mockups/map-embedded-v1.html`), and ADR-0122 then made the sheet's stops move the canvas by more than 2×. Measured on the 390×844 baseline: **~545px of pane at `map`, ~263px at `half`** — so 34px is 6.2% of one canvas and 12.9% of the other, and it was tuned for the smaller. The mockup the number came from had no three-stop axis, so "how big is a pin" was never asked against the canvas a stop leaves.

## The rule

```
--pin-u: clamp(34px, 0.08 * 100cqh, 46px)
```

Floor = the shipped size, so **`half` is byte-for-byte unchanged** and the reporter's second sentence is true by construction rather than by tuning. Cap = where a marker stops reading as a point. The parameter is the **pane's height**, read by the browser via `container-type: size` on `.map-pane` — which also answers tablet and desktop with no breakpoint, and would answer a fourth stop for free.

| Canvas | Where              | Pin                       | Ghost  | Clearance          |
| ------ | ------------------ | ------------------------- | ------ | ------------------ |
| 263px  | `half`             | 34.0px (unchanged)        | 24.5px | 54px (was flat 64) |
| 425px  | growth begins      | 34.0px                    | 24.5px | 54px               |
| 545px  | `map` — the report | **43.6px** (+28%)         | 31.4px | 69px               |
| 575px+ | tablet / desktop   | **46.0px** (+35%, capped) | 33.1px | 72px               |

Rejected as parameters, both for the same reason (they resize pins **under a moving finger**, the churn ADR-0121 §9 keeps out of the `באזור` readout): **zoom** and **on-canvas density**. Also rejected: growing the selected pin or the next stop, which would make size a second prominence channel beside the rings and z-order that already carry it.

**So a pinch does not resize a pin** — asked during the session, and the answer is by construction: pinching changes the map's zoom, never the pane's box, so `cqh` is unchanged and the pin holds its pixel size while the world scales underneath. OS-map convention, and Google's own marker behaviour. Its one honest cost is the thing every fixed-size marker gets wrong — a pin covers more ground the further you zoom out, so at country zoom a 46px teardrop spans a city — and that is precisely what ADR-0121 §6's **dot tier** was decided for and never built. It stays out of this ADR because it is a change of _tier_ at a threshold, not of _size_ continuously: a discrete swap is legitimate under a pinch in a way that smooth scaling is not.

## The three consequences worth naming

- **One unit, so the pin scales as one object.** Every dimension in `map-pane.css` is a fraction of `--pin-u` — badge, glyph, number, rings, selection outline, tag. The fractions **are** the shipped geometry as ratios, so at the floor it draws the pin that shipped to within a pixel. Scaling the badge while the number stayed 9px would have produced a badge with a sticker on it.
- **The ghost tier's "smaller" becomes a ratio** (0.72), and this is the sharpest argument for the unit: a fixed 25px would have gone on getting relatively smaller as the canvas grew the others, until the ladder's bottom rung read as dirt rather than as a place you are standing next to. The me-dot scales too (0.41) — same canvas, same question, and a 14px dot beside grown pins reads as the least important thing on screen.
- **The camera's clearance is derived, not constant.** `MAP_FIT_PADDING` → `mapFitPadding(canvasHeightPx)`; its top is the controls row plus `pinHeightFor × (1 + TAG_RISE)` — the pin plus the amber tag above it. A flat 64 could only be right for one stop: at the map extreme the pin now needs 69, and at `half` it was asking for 10px it no longer needs on the one axis where `fitPaddingFor` already drops the padding. `useMapCamera` already measures the div; it now uses that one measurement for both questions.

## The smoothness question, answered by measurement

`--pin-u` is registered with `@property` as a `<length>`, which makes it interpolable, so **one** `transition` line eases the whole pin over the sheet's own 280ms curve — the pins finish growing exactly as the sheet finishes sliding. Transitioning the derived properties individually was the alternative: a dozen declarations that can fall out of step, plus `box-shadow` interpolation for the amber rings.

**Nothing here was reasoned about; a Playwright harness against the preinstalled Chromium measured all of it**, because three of the four load-bearing claims are browser behaviour no unit test in this repo can reach.

1. **`cqh` reaches an advanced marker.** The whole design rests on it, and the shipped pin CSS was no evidence either way — every token it reads is on `:root`, so it would resolve identically whether or not the marker sits inside `.map-pane`. Read the binding's source (children are portalled into a div handed to Google as `marker.content`, which Google inserts into the map div's overlay layer), then measured: 43.6px at `map`, 34px at `half`.
2. **A `cqh`-derived value survives `@property` registration.** The one thing that could have forced the verbose per-property transitions.
3. **It interpolates:** 36.05 → 40.80 → 42.52 → 43.33 → 43.55 → 43.59px across ~280ms. A curve, not a step.
4. **A freshly inserted pin does not pop in** from `initial-value` — 43.59 on each of its first three frames. Would have been a real regression: markers are added on every filter change, so a pop-in bounces the canvas on each chip tap.
5. **Reduced motion snaps** (43.59px one frame after the change) via `App.css`'s global reset. The first run of this check was a **false negative** — the harness had not copied the global reset, so it measured the transition it was meant to be suppressing. A probe that omits the app's own resets is testing a different page.

## Smaller things the build turned up

- **`--pin-u` needs `inherits: true`.** Registration defaults to non-inheriting, and the pin's parts are children reading the same unit.
- **`box-sizing: border-box` is global** (`tokens.css`'s `*` rule), so `.pin-b`'s `0.74u` includes its border exactly as the shipped 25px did. Checked, not assumed — under `content-box` every badge would have grown by its border.
- **`lightningcss` reports a doubly-closed comment as "invalid dangling combinator"**, pointing at prose. Twice, from appending new comment text after an existing block's `*/` and leaving the second `*/` behind.
- **ADR-0122 was never added to `INDEX.md`'s router table.** Added with 0123.

## Deliverable for the human pass

A **1:1 preview** was built and shared, because the three numbers are a legibility call and a description of a legibility call is worth nothing: the shipped 34px and the derived size side by side at the map extreme, every tier at each rung of the ladder (floor · map extreme · cap), the output table, and a **live stop toggle** so the transition can be watched rather than read about. True scale throughout — no transform anywhere, since a preview of a legibility judgement that is not life-size is worthless. Both themes, from the app's own tokens.

**It is deliberately _not_ in `mockups/`, and the reason is the catalog's own standard.** A mockup there inlines the shipped stylesheets via `mockups/tools/inline-app-css.mjs` (ADR-0097); this page **hand-ports** the pin CSS, which is exactly the class of divergence ADR-0121's revision 5 warns about — a mockup that reads the app's CSS still does not inherit its layout tree, and one that copies it does not even inherit its CSS. Committing it as a catalog entry would put a second-class mockup beside files that meet a higher bar. **If the device pass wants it in-repo, the follow-up is real and small:** give it an `APP-CSS:` manifest naming `styles/tokens.css` + `ui/domain/map-pane.css`, run the inliner, add it to `.prettierignore` and write the catalog entry — at which point it stops being a hand-port and starts being the branch's actual CSS at 1:1, which is strictly better for the judgement it exists to serve. Backlogged with the numbers.

## What is left

- **The three numbers want a phone.** `MIN_H` / `MAX_H` / `CANVAS_SHARE` join `MAP_ZOOM`, `MAP_REFIT_FILL_SHARE` and `half`'s fraction in Phase 3's tuning cluster: is 46px a confident marker or an overbearing one over real cloud-styled tiles? They are all one question — how close is close enough to read a place in context.
- **ADR-0121 §6's dot tier is still unbuilt**, and now tracked. It was decided in the Phase-6 design and nothing carried it; it is zoom-keyed, so it belongs with Phase 3.
