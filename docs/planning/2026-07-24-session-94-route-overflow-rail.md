# Session 94 — Long routes fall back to a stacked origin/destination rail

**Date:** 2026-07-24
**Kind:** Frontend layout fix on both day timelines, from user feedback.
**ADRs:** amends [0059](../decisions/0059-booking-presentation-on-home-and-index.md) §3 (session-94 amendment); interacts with the session-93 title clamp.

## The bug

Real Google place names make a route too long for one line (`נמל התעופה בן גוריון ← נמל התעופה הבינלאומי קפלאוויק`), and each mode failed differently:

- **Plan mode** — the combined route wrapped into a large multi-line block.
- **Trip mode** — the session-93 title clamp truncated it, which can **hide the destination** (it's at the end of the string) — the half that matters most.

Root cause: both day surfaces rendered the **stored title string** (`event.title`), not the route. The board hero already used `EventTitle`/`RouteLabel`; the timelines didn't.

## Change

- **Route as separate values in both day surfaces.** `DayView` (`EventCard title`) and `PlanDay` (`BuilderRow title`) now pass `<EventTitle … stack />`, so a transport row resolves through `eventRoute` → `RouteLabel` with origin and destination as distinct values. `titleText` stays the plain stored title (menu header, accessible names).
- **Inline while it fits, stacked rail when it doesn't.** `RouteLabel` gains an opt-in `stack` prop. Short routes render exactly as before — no already-fitting surface changes. On overflow:

  ```
  ●  origin
  │
  ▼  destination
  ```

- **Independent two-line clamps.** Each endpoint is its own grid row with its own `-webkit-line-clamp: 2`, so a long origin can never truncate or push out the destination (structural, not a tuned length). The session-93 whole-title clamp stands down for a stacked rail via `:has(.route-stack)` — otherwise it would cut the rail at two lines and re-introduce the bug.
- **SVG rail.** Three new `Icon` members — `route-origin` (filled dot), `route-line` (connector), `route-dest` (arrowhead) — no text glyphs, emoji, or CSS-drawn shapes. The connector shares the marker column's width so both SVGs' centred 24-wide viewBoxes line up.
- **Bidi.** The rail is RTL (like the inline row) with each name in a `<bdi>`, so Hebrew, Latin, and mixed names keep their own direction. Nothing is airport-specific — any two `Place` names.

## The shared mechanism

`lib/useStackOnOverflow.ts` — neither a media nor a container query can ask "does this text fit on one line", so:

- **inline** → compare the row's natural (nowrap) `scrollWidth` against the space it has (`clientWidth`); overflowing latches the natural width and flips to stacked.
- **stacked** → the inline row is gone, so compare the latched width against the **container's** width, flipping back when there's room (rotation, tablet, a card opening).

That keeps the switch **bidirectional without a hidden duplicate of the text as a ruler** — each place name appears in the DOM exactly once (screen readers, tests). `containerRef` must be a stable ancestor whose width doesn't depend on the content (`min-width: 0` added to `.bld-ttl` for exactly this). It's the sibling of `useShrinkToFit` (measure-and-observe to shrink a font, not switch a layout) — flagged in the ADR: generalize the pair if a third case appears, rather than adding a fourth.

## Verification

`ui/RouteLabel.test.tsx` (6 cases, widths stubbed since jsdom reports 0): inline by default; inline with `stack` while it fits; switches to the rail on overflow with origin/destination as separate `<bdi>` values in order; the rail is three `<svg>` with no arrow/bullet characters in its text; re-measures on a content change so a shorter route returns to inline; the unpicked-endpoint dash. `typecheck` + `lint` (0 errors) + `build` green; full frontend suite **756** passes; `pnpm format` clean.
