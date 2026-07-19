# 0077 — Adopt non-color design tokens (spacing, type, radius, elevation, breakpoints)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0028](0028-design-language-and-color-tokens.md) (color + motion tokens; the design language this completes), [0017](0017-mobile-first-responsive.md) (the breakpoint strategy these encode), [0062](0062-disable-app-zoom.md) (why px, not rem, matches the shipped ramp). Implements UI/UX review **U-08** (`docs/reviews/ui-ux-review.md` §9, §11).

## Context

`design-language.md` defines a spacing 4px grid, an 8-step type ramp, a radius ramp, and three elevation levels — but only in prose. `styles/tokens.css` carried **color, motion, and font-family tokens only**; the spacing/type/radius/elevation values were hard-coded as raw px across ~6.5k lines of `App.css` + `screens.css`.

Two consequences the review (U-08) calls out:

- The "pick from the ramp, don't invent values" discipline is **unenforceable** when the ramp isn't in CSS — spacing and type drift silently, screen by screen.
- **Dark mode can't ship.** Color is already token-wired and dark-remapped, but the non-color values aren't tokens, so the dark-mode sweep (replacing remaining hard-coded hexes) has no ramp to lean on and the layout values stay locked to light-mode px.

This is the first item on the review's dependency map (migration order **1**): it gates the layout primitives, the feedback family, and the domain-component extractions, all of which must be born reading tokens rather than inventing px.

## Decision

Add the non-color ramps to `styles/tokens.css` as CSS custom properties, faithfully porting the values `design-language.md` already specifies. **Define now; migrate opportunistically** — this change does _not_ mass-rewrite the legacy screen CSS. New and extracted components read these tokens; the raw-px sweep of the old screens happens as each screen is touched (and completes in the Phase-4 dark-mode sweep).

Tokens added (all in `:root`, with dark parity where a literal color is involved):

- **Spacing** — `--space-1..6` = `4 · 8 · 12 · 16 · 20 · 24` px (the 4px base grid; the `{8,12,16,20,24}` component-padding set plus the `4` base unit).
- **Type** — `--text-display|h1|h2|h3|body|secondary|caption|micro` (`34 · 26 · 21 · 18 · 14.5 · 13 · 11 · 10.5` px) + `--leading-tight|snug|normal` (`1.15 · 1.3 · 1.5`). **px, not rem**, to match the shipped ramp values exactly and the app's px-based CSS (the app disables zoom per ADR-0062; a WCAG-1.4.4 revisit is a separate open question, not this token port).
- **Radius** — `--radius-8|12|16|22|999` (chips · inner elements · cards · hero surfaces · pills).
- **Elevation** — `--elevation-flat|raised|floating`. `flat` is `none` (border-only list cards); `floating` **reuses the existing `--shadow`** so board/toasts/sheets stay pixel-identical and inherit its dark remap; `raised` is a new soft shadow, dark-remapped alongside `--shadow`.
- **Status** — `--status-synced|pending|failed` = `var(--ok)` · `var(--muted)` (neutral) · `var(--miss)`. One home for sync/feedback status color, consumed by `SyncBadge` / `StatusBanner` / the feedback family. Never amber (time) or teal (place) — the semantic budget is preserved (ADR-0028).
- **Breakpoints** — `--bp-tablet: 768px`, `--bp-desktop: 1024px` (from ADR-0017's phone ~360–430 / tablet ~768–1024 / desktop >1024). CSS `@media` conditions can't read a `var()`, so these are the **single source of truth for the values** (and for any JS / container-query use); `@media` rules mirror these px literally.
- **Safe-area** — `--safe-top|right|bottom|left` = `env(safe-area-inset-*, 0px)`, consumed by the app-shell + sticky action bars so chrome clears the notch / home indicator on an installed PWA.

`tokens.css` is owned only by this token work and the later dark-mode sweep — feedback/sync components consume the status tokens rather than adding their own, keeping status color in one place.

## Consequences

- The design language's ramps are now **enforceable in code**, not just documented. A follow-on CI lint budget discouraging raw px in `ui/` component CSS (review §11 / Quick wins) makes the discipline stick; it is a cheap guard added separately.
- **Dark mode is unblocked**: the Phase-4 sweep can replace hard-coded values with these tokens and the dark remap has a complete ramp to target.
- No user-visible change ships with this ADR — it is additive; existing screens are unchanged until migrated. There is a transitional period where new components are token-based and old screens are still px; that is the intended, incremental migration, not indefinite duplication (each screen sheds its px when it is next touched).
- px type tokens (vs. rem) is a deliberate parity choice with the shipped ramp and ADR-0062; if the zoom/WCAG-1.4.4 open question (review §17 Q6) is later resolved toward rem, it is a single-file remap here, not a screen-by-screen change.
