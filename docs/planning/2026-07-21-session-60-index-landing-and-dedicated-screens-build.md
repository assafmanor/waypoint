# Session 60 — Index landing + dedicated screens: build (ADR-0098)

**Date:** 2026-07-21
**Branch:** `claude/index-landing-dedicated-screens-jl0s5w`
**ADR:** [0098](../decisions/0098-index-landing-and-dedicated-screens.md)

## What prompted it

The implementation checkpoint for ADR-0098, handed off from session 59's
design pass (`planning/2026-07-20-session-59-index-landing-and-dedicated-screens.md`).
Scope: bookings + documents only, per the ADR — the disabled "בקרוב"
notes/research/media tiles in the mockup are a scale check, not a spec.

## What changed

- **`ui/primitives/Collapsible.tsx`** (+ `Collapsible.test.tsx`) — new
  `CollapseToggle` (count-in-label button) + `Collapsible` (animated
  max-height/opacity container, children always mounted). Generalized out of
  `PlanHome.tsx`'s `showCompleted`/`.chk-toggle` pattern (reuse audit): the
  bookings screen's past-collapse and PlanHome's completed-checklist collapse
  now both call it. PlanHome gains the animated open/shut motion as a side
  effect, exactly as the ADR anticipated; its collapsed-state pill teaser
  (`.chk-done-sum`) stays a plain conditional render alongside the animated
  container, not itself animated — the ADR only asked for the list toggle to
  animate.
- **`ui/primitives/ChoiceGrid.tsx`** — added a `layout: 'grid' | 'pills'` prop.
  `pills` renders a horizontally-scrollable row (`choice-pill` buttons) instead
  of the fixed grid; same controlled `Choice<T>` radiogroup, same neutral
  ink-fill selected state either way. Turned out to be exactly the "small
  addition" the ADR's reuse audit predicted — no need to stop and ask.
- **`ui/domain/IndexTile.tsx`** (+ css, test) — the landing's tappable tile:
  icon, title, count pill, one-line preview (`ReactNode`, so a transport
  preview can carry a real `RouteLabel`), a `NavArrow` chevron.
- **`lib/index-bookings.ts`** — `CATEGORY_ALL`/`CategoryFilter`,
  `matchesCategory`/`matchesQuery` (title/confirmation-code, case-insensitive),
  and `visibleRows` (per-row visibility + a staggered reveal `delayMs`,
  chainable across upcoming → past via `startIndex` so both lists share one
  continuous stagger). `constants.ts` gained `FILTER_STAGGER_MS`/`_MAX_MS`.
- **`ui/BookingTitle.tsx`** — the transport-route-aware title extracted out of
  `Index.tsx` so both the bookings-screen row and the landing tile's "next"
  preview render a flight/train the same way (a real `RouteLabel`, never a
  plain string with an arrow character baked in).
- **`ui/IndexBackRow.tsx`** — the icon-button-back + label header, shared by
  both dedicated screens (not itself mentioned in the ADR, but the same
  three-line markup would otherwise exist twice — small extraction, root
  `CLAUDE.md` rule 8).
- **`ui/IndexBookingsView.tsx`** / **`ui/IndexDocumentsView.tsx`** (+ tests) —
  the two dedicated screens. Each calls `useOverlay(onClose)` directly (ADR-0098
  §5) — not through `Modal`, since neither is a portal/scrim overlay, just a
  registration so back/gesture/system-back peels it before the tab→Home rule.
  `IndexDocumentsView` wraps the existing `DocumentsSection` unchanged, per the
  ADR. `IndexBookingsView` carries the category chips, search box, past
  Collapsible, the shared `EmptyState` for "no results," and an
  `initialBookingId` prop (opened once on mount) for the `?booking=` deep link.
- **`screens/Index.tsx`** — rewritten to local view-state
  (`'landing' | 'bookings' | 'documents'`) rendering the two `IndexTile`s or
  the corresponding sub-view. The offline badge moved here (page-level fact,
  shown once on the landing, per the mockup's own note) and off the bookings
  screen. The `?booking=<id>`/`?focus=docs` deep-links now set `view` instead
  of opening the detail sheet / scrolling to a section that no longer exists;
  a `pendingBookingId` piece of state is cleared on every _manual_ tile tap so
  re-entering the bookings screen later doesn't replay a stale deep link (only
  a fresh remount with a live `initialBookingId` opens a detail).
- **`screens/PlanHome.tsx`** — checklist collapse now built on
  `CollapseToggle`/`Collapsible` instead of its own `useState` + a two-way JSX
  swap.
- **CSS** — `ui/primitives/collapsible.css`, `ui/domain/index-tile.css`, and a
  new block in `screens.css` under `.index` for the back-row, search,
  `.sec-count`, the neutral (non-violet) `.past-toggle`, and `.idx-row`'s
  reveal/stagger motion (`max-height`/`opacity`/`transform`, driven by
  `visibleRows`' `delayMs` as an inline `transitionDelay`). All motion is
  plain CSS `transition`, so the existing global `prefers-reduced-motion`
  wildcard (`App.css`) zeroes it out with no extra code.
- **`i18n/he.ts`** — new copy under `t.index`: `back`/`backAria`, `tile.*`,
  `filter.*`, `search.*`, `pastToggle.*`.

## Verification

- `pnpm --filter @waypoint/frontend test` → 598 pass (63 files), including new
  suites for `Collapsible`, the `ChoiceGrid` pills layout, `IndexTile`,
  `IndexBookingsView`, `IndexDocumentsView`, the rewritten `Index.tsx`, and the
  new `lib/index-bookings.ts` filter/stagger helpers.
- `pnpm --filter @waypoint/shared build` then `pnpm --filter @waypoint/frontend
typecheck` + `build` — green. `pnpm lint` — clean (pre-existing unrelated
  warnings only). `pnpm format` — no changes needed.
- Drove the real app (`DEV_AUTH=1`, seeded trip, headless Chromium): landing
  tiles render with live counts/previews; tapping a tile opens its screen;
  **a real Navigation-API system-back (not just the visible back button)
  closes to the landing, not Home** — the load-bearing case ADR-0098 §5 exists
  for; both Home quick-access deep-links (`?booking=`, `?focus=docs`) land
  correctly and clear their params; the URL stays on `?tab=index` through the
  whole open/close cycle (confirming no route was pushed); a
  `prefers-reduced-motion` context reports `0s` transitions on the landing
  tile.

## Scope / not touched

Frontend-only, exactly as ADR-0098's Consequences section predicted — no
backend or `@waypoint/shared` change. The disabled placeholder tiles
(notes/research/media) from the mockup were not built. `resolveBack`
(`state/nav-state.tsx`) was not touched — zero new precedence rules, as
designed. Backlog entry pruned in this change (ADR-0046 convention); ADR-0098
itself needed no amendment — the implementation matched the decision as
written.
