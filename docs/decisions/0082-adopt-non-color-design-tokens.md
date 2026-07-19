# 0082 — Adopt non-color design tokens (spacing, type, radius, elevation, breakpoints)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0028](0028-plan-violet-color-budget-dark-ready.md) (the design language + color/motion tokens this extends), [0017](0017-mobile-first-device-targets.md) (breakpoints + safe-area serve the phone-primary, tablet-secondary posture), [0065](0065-app-scope-many-trips-small-groups.md) (consistency-at-scale is why the ramps must be enforceable now). Implements finding **U-08** of the UI/UX review (`docs/reviews/ui-ux-review.md`).

## Context

`design-language.md` documents four non-color ramps — a 4px spacing grid with a `{8,12,16,20,24}` padding set, an 8-step type ramp (`display…micro`), a radius ramp (`8/12/16/22/999`), and three elevation levels (`flat/raised/floating`) — and instructs: "New screens must pick from these ramps instead of inventing values." But `tokens.css` carried only color, motion, and font-family tokens. The ramps lived **only in prose**, so ~6.5k lines of `App.css`/`screens.css` hard-coded raw px, and the values drifted: a structural grep found font-sizes at `11.5/12.5/13.5/15/16/19px` sitting alongside the documented `11/13/14.5/17/21/26px` steps, and radii at `6/9/10/11/13/14/15px` beside the documented `8/12/16/22`. The "pick from the ramp" discipline was unenforceable because the ramp wasn't in the CSS.

This also blocks dark mode. Color is already token-wired and the dark remap is inert-until-`data-theme="dark"`, but the design-language's own "dark mode remaining work" list is a hardcoded-hex sweep — and the same sweep needs a token target for the non-color values it touches. Tokens are the prerequisite (U-08 → U-10 dark-mode tail).

## Decision

Add the non-color foundation tokens to `frontend/src/styles/tokens.css`, matching the documented ramps 1:1:

- **Spacing** `--space-1..6` = `4 · 8 · 12 · 16 · 20 · 24px` (the 4px grid, covering the padding set).
- **Type** `--text-display/h1/h2/h3/body/secondary/caption/micro` = `34/26/21/17/14.5/13/11/10.5px`, plus a `--leading-tight/snug/normal/relaxed` line-height ramp (unitless). Where the doc gives a range, the token takes the value already most common in the CSS (h3 `17`, secondary `13`).
- **Radius** `--radius-8/12/16/22/999`.
- **Elevation** `--elevation-flat` (`none`), `--elevation-raised` (soft), `--elevation-floating` (= the existing `--shadow`).
- **Breakpoints** `--bp-tablet: 768px`, `--bp-desktop: 1024px`.
- **Safe-area** `--safe-top/bottom/left/right` = `env(safe-area-inset-*, 0px)`, for the app-shell/sticky primitives.
- **Sync/status** `--sync-synced/pending/failed` mapping onto `--ok`/`--muted`/`--miss`, for `SyncBadge` (U-04) and `StatusBanner` (U-10).

**Dark-remap parity:** spacing, type, radius, leading, breakpoints, and safe-area are theme-independent and inherit unchanged; only `--elevation-raised` gets a darker dark-theme value (`--elevation-floating` already tracks the remapped `--shadow`, and the sync tokens track already-remapped `--ok/--miss/--muted`). The dark block states this explicitly so the parity is reviewable, not accidental.

**No mass migration in this change.** The tokens are defined only. New primitives (the Wave 1 layout/modal/feedback set) are born on them; existing screen CSS converts opportunistically as each screen is touched (the U-03 extractions, the U-10 feedback family, and the U-08 Phase-4 dark-mode sweep). This keeps the diff reviewable and every step independently shippable.

## Consequences

- The ramps are now enforceable in code: a component references `var(--space-4)` / `var(--text-h3)` instead of a magic number, and drift becomes visible in review.
- Dark mode is unblocked at the token layer — the Phase-4 hex-and-px sweep now has a token target for non-color values.
- Breakpoint tokens document one source of truth but **cannot** be read by `@media` (CSS custom properties are invalid in media conditions); media queries mirror them as literals, and JS/container-query call sites can read the vars. Noted so a future reader doesn't try `@media (min-width: var(--bp-tablet))`.
- A CI lint budget discouraging raw px in `ui/` component CSS (review §15) is a cheap follow-on guard that makes this stick; deferred to the Phase-4 polish pass, tracked in the backlog.
- Because migration is opportunistic, old raw-px and new token-based values coexist during the transition. This is bounded (each touched screen converts fully, no indefinite parallel patterns per component) and ends when the Phase-4 sweep closes.

## Alternatives considered

- **rem-based type/spacing** (respecting user font scaling, WCAG 1.4.4). Rejected for now: the app disables zoom app-wide (ADR-0062) and every existing value is px, so px tokens make migration a literal find-and-replace with no behavior change. Revisiting rem is coupled to the ADR-0062 zoom question (review open Q6), not to this token adoption.
- **Migrate all CSS to tokens in this change.** Rejected: a 6.5k-line sweep is unreviewable and would collide with every Wave 1–3 screen agent. Define-then-adopt keeps each step shippable and lets extractions be born token-based.
- **Semantic spacing names** (`--space-inset`, `--space-stack`). Rejected: the design-language speaks in the numeric grid; numeric tokens map to it 1:1 and read unambiguously at the call site. Semantic aliases can layer on later if a pattern demands them.
