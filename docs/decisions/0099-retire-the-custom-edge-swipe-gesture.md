# 0099 — Retire the custom edge-swipe return gesture; no custom gesture surfaces

**Status:** Accepted
**Date:** 2026-07-21
**Retires §5 of:** [0035](0035-in-app-back-and-return-gesture.md) — its other behavior (the §2 layer-peeling precedence, the two-tap trip-exit confirm, the single-source day model §4) is unaffected; only the return-gesture trigger goes. §5's refinements (2026-07-15, -15b) are historical record for the removed mechanism.
**Touches:** [0090](0090-back-is-computed-from-nav-state.md) (one fewer back trigger; the resolution mechanism itself is unchanged)

## Context

`ui/EdgeSwipeBack.tsx` was a trailing-edge horizontal-pull gesture (the right edge in this RTL app) that triggered the same `resolveBack` action every other back trigger uses. It existed because an installed, `display: standalone` iOS PWA has no browser chrome and no system back gesture at all (ADR-0035's original motivation) — without it, iOS users had no gesture-based way back.

Building ADR-0098's Index landing surfaced a real defect in it: the gesture relaxes its edge-only restriction to "start anywhere" whenever an overlay is open, on the assumption that an open overlay is always a true full-bleed sheet/portal with nothing to scroll under it. `IndexBookingsView`/`IndexDocumentsView` broke that assumption — they register via `useOverlay` for back-priority (ADR-0098 §5) but are ordinary scrollable page content, not modals. The result: a horizontal swipe across the category filter chips got hijacked as "back" instead of scrolling the chip row.

That bug was fixable narrowly (tag an overlay registration as edge-only vs. anywhere-swipe-eligible). But raised with Assaf, the decision was broader: **no custom gesture surfaces in this app at all** — not scoped to Index, not patched, removed.

## Decision

**Delete the custom edge-swipe gesture entirely.** `ui/EdgeSwipeBack.tsx` is gone, along with its mount in `App.tsx` and the `#app-shift` parallax wrapper/CSS that existed only to support it.

**Every other back trigger is untouched and keeps working exactly as ADR-0090 describes:** the Android/desktop system-back Navigation-API interceptor, the nav-bar Home tab, and every shell/dedicated-screen back button. This is explicitly **not** a reversal of "not the Android one" — Assaf kept that: system-back on Chromium Android/desktop still resolves through the same `resolveBack`/`runBack` as before, unaffected by this ADR.

**Consequence audited before removing:** nothing else in the app depended on the gesture exclusively.

- Tab navigation is already direct (bottom-nav taps go straight to a `?tab=` URL, ADR-0090 §3) — doesn't need "back" to reach Home.
- Every sheet/dialog already closes on backdrop tap (`Modal`'s `onClick={onClose}`), independent of any gesture.
- Leaving a trip already has an explicit affordance — the header's trip-name/switcher button navigates straight to `/trips`.
- Shell routes (`TripSettings`, `AllTrips`) and the Index's dedicated screens (ADR-0098) already carry an explicit icon-only back button.

**The one real loss: on iOS there is now no gesture-based back at all** (no custom one, and iOS has no OS-level one either) — iOS users rely entirely on the explicit taps above. Accepted as the intended tradeoff, not a gap to patch around.

## Consequences

- `useOverlay`'s `hasOverlay` stack (`state/nav-state.tsx`) keeps its one remaining real job: `resolveBack`'s rule 1 (an open overlay closes before a tab/route change). The now-dead `useHasOverlay` hook (its only consumer was the gesture's "start anywhere over a sheet" relaxation) is deleted with it.
- ADR-0098's `useOverlay(onClose, { swipeAnywhere: false })` groundwork for this exact bug (drafted, then reverted mid-implementation once the broader retirement was decided) is not needed — there's no gesture left to scope.
- No further "does this overlay allow anywhere-swipe" classification is needed anywhere in the codebase — a simpler invariant than the one it replaces.
- A future dedicated screen or sheet needs zero gesture-related wiring; `useOverlay(onClose)` alone is enough for back-priority (ADR-0098 §5's shape stands, just minus a caveat that no longer applies).

## Alternatives considered

- **Scope the fix to Index only** (tag `IndexBookingsView`/`IndexDocumentsView`'s overlay registration as edge-only, leave the gesture running everywhere else). Rejected — Assaf's ask was explicit and broader than the one bug: no custom gesture surfaces in the app, not a scoped patch.
- **Keep the gesture, restrict it to a true edge-only zone always** (drop the "anywhere over a sheet" relaxation instead of removing the whole feature). Rejected on the same grounds — it's still a custom gesture surface, which is exactly what's unwanted.
