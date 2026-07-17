# Session 30 — Arrows to SVG: NavArrow + a shared Icon primitive

**Date:** 2026-07-17
**Type:** implementation (frontend only, no data-model change)
**Outcome:** replaced the remaining Unicode arrow/caret/triangle glyphs used as UI controls with inline SVGs, realizing the design-language rule _"UI controls use a consistent icon set … Emoji remain as content"_ (`design-language.md` §"Emoji are content, icons are UI"). No new ADR — this executes an existing decision.

## Why this session happened

Assaf noticed the boxed nav arrow in the all-trips hero rendered low and off-centre, then that the same was true app-wide: the body font (**Assistant**) has no glyphs for symbol characters like `→ ← › ↩ ↺ ⬇ ▾ ▲ ▼`, so the browser substitutes a fallback whose baseline sits low. The glyphs drifted down inside their boxes on every screen. He asked for an app-wide replacement of the arrow-family glyphs with SVGs.

This followed two earlier merged fixes in the same session thread: the current-trip arrow **direction** (PR #135) and the first `NavArrow` component for the boxed nav buttons (PR #136).

## What changed

### `ui/NavArrow.tsx` (already shipped) — the line nav arrows

Forward/back line arrow, RTL-drawn and mirrored for LTR via `[dir='ltr']` CSS. Now also used inline (display changed to `inline-block` with a baseline `vertical-align`). Adopted for:

- all-trips hero (forward) and the three header back buttons (CreateTrip / TripSettings / all-trips) — from the prior PR;
- the day-context "back to today" arrow (`App.tsx`, inline, back);
- the transport **route connector** in `RouteLabel` (forward — points at the destination);
- the resolve-sheet "back a step" control (was a `‹` chevron, now the back arrow — one fewer shape).

### `ui/Icon.tsx` (new) — the non-arrow symbols

A single SVG primitive keyed by `name` (`caret`, `undo`, `reset`, `download`) with an optional `dir` (rotation). Size rides on the parent's `font-size` (`1em`), colour on `currentColor`, so a call site styles the icon by styling its container — exactly like the glyph it replaced. Paths are hand-authored in the lucide/feather idiom rather than pulling the lucide dependency: keeps the bundle small and the offline-first PWA free of an icon-font/registry fetch. Adopted for:

- **caret** — the header trip-switcher chevron, the "ועוד N עכשיו" toggle (up/down by open state), the Plan-builder overlap chevrons, the DayView row chevron (was a CSS `::after` `content:'▾'`, now an `Icon` inside the existing `.chev` span so the open-state `rotate(180deg)` still applies), and the Plan-builder reorder up/down controls;
- **undo** — the settle "restore" affordance in PlanDay and DayView (the `✓`→undo morph on hover; `.undo` span scaling/reveal CSS is unchanged, it now scales/reveals the SVG);
- **reset** — the booking-form icon "איפוס";
- **download** — the Index "עובד אופליין" badge (the `⬇` moved out of the `he.ts` copy string into the badge markup).

### Copy / constants

- `t.arrows` trimmed to just `route` (`←`) — kept **only** because it builds the screen-reader `ariaLabel` for a transport route; it is never rendered visually, so an SVG would add nothing. `back`, `forward`, and `chevronBack` keys removed.
- `t.index.offlineBadge` lost its leading `⬇` (now an `Icon` in the markup).
- `ICONS.fxUp`/`fxDown` (`▲`/`▼`) left untouched — dead since the FX glance row was removed (ADR-0045); not rendered, so no baseline issue.

## Deferred (intentional)

- The TimePicker list markers are CSS `::after` `content` on `.tp-list-on` (`✓`) and `.tp-list-suggest` (`↩`). The `✓` is a checkmark, not an arrow; the `↩` is a 12px muted "nearest round" hint. Converting them needs both markers reworked from pseudo-content into markup for consistency — disproportionate for a low-visibility hint. Left as glyphs; revisit if the hint reads poorly.

## Verification

`pnpm typecheck` + `pnpm build` green. Icon shapes and centring checked in isolated headless-Chromium renders (the app screens sit behind auth). The `.undo`/`.chev` open-state and hover CSS operate on the wrapping span, so the existing rotate/scale/reveal transitions carry over to the SVG children unchanged.
