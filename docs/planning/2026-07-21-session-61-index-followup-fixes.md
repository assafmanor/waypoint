# Session 61 — Index follow-up fixes: edge-swipe retirement + bookings header/search redesign

**Date:** 2026-07-21
**Branch:** `claude/index-screens-followups-fixes`
**ADRs:** [0099](../decisions/0099-retire-the-custom-edge-swipe-gesture.md), [0100](../decisions/0100-index-bookings-header-search-redesign.md)

## What prompted it

Post-merge feedback on the ADR-0098 Index landing/dedicated-screens build (session 60), from Assaf directly: three issues, taken one at a time in separate commits on one PR.

1. A swipe left/right inside the bookings/documents screen was firing "back" unintentionally.
2. The search area "looks really awkward, we need to redesign."
3. Whether `t.index.pastHead` ("כבר מאחוריכם") is still needed now that the past-bookings toggle already communicates the same thing.

## Fix 1 — retire the custom edge-swipe gesture (ADR-0099)

Investigating the swipe-back bug found the real cause: `EdgeSwipeBack.tsx`'s "start anywhere" relaxation over an open overlay assumed every overlay is a full-bleed modal with nothing scrollable under it — an assumption `IndexBookingsView`/`IndexDocumentsView` broke (they register via `useOverlay` for back-priority but are ordinary scrollable pages, so a horizontal swipe across the chip row got hijacked as back). Raised with Assaf, the fix scope widened: **no custom gesture surfaces in the app at all**, not a patch scoped to Index.

- `ui/EdgeSwipeBack.tsx` deleted; its mount + the `#app-shift` parallax wrapper/CSS removed from `App.tsx`/`App.css`.
- `useHasOverlay` (its only consumer) removed from `state/nav-state.tsx`; comments across `nav-state.tsx`/`nav-state.test.ts`/`Modal.tsx` updated to drop "edge gesture"/"return gesture" references.
- ADR-0035 §5 and ADR-0090 got status-line/inline pointers to the retirement; ADR-0099 written with a consequence audit (tabs already navigate directly, sheets close on backdrop-tap, the trip-switcher has its own button, every shell/dedicated screen already has an explicit back button) — the one real loss is iOS now has no gesture-based back at all, accepted as the tradeoff.
- Android/desktop system-back (the Navigation-API interceptor) is untouched and confirmed still working via a driven test (`window.history.back()` against a trip-shell fuel entry, closes the overlay to the landing, not Home).

## Fix 2 — bookings header/search redesign (ADR-0100)

Feedback iterated in several rounds before converging (full detail in ADR-0100's Context); the shape of the work also shifted mid-session from "fix it in the real component" to "mock a v2 first, port later," once Assaf sent a Plan-mode reference screenshot he liked and asked for a mockup pass:

- **Early iterations landed directly in the real app** (still current on this branch): the search bar now replaces the `.sec-title` row instead of opening a second row below it, gained a "ביטול" cancel button, and the search/clear controls became real `Icon.tsx` SVGs (`search`/`close`) instead of raw 🔍/✕ emoji — the emoji were a real `design-language.md` violation ("emoji are content, icons are UI"), surfaced by Assaf's "hobby project" feedback. Also fixed along the way: a `.sec-count` layout bug (the shared `.sec-title`'s `justify-content: space-between` was built for exactly two children, not three — grouped title+count into one `.sec-title-main` wrapper) and an oversized gap after the back row (`.sec-title`'s 22px top margin, scoped down to 4px after a back row specifically).
- **Later iterations moved to `mockups/index-bookings-compact-v2.html`**, a from-scratch v2 exploration, once Assaf sent a reference screenshot: compact merged back+title+count header row (arrow repositioned beside "אינדקס", pointing right — it had been on the wrong side/direction), a denser chip+search row (search icon fixed at the row's end, chips carrying label+icon+count), a cover-in-place search-open animation, a Plan-vs-Trip mode-tinted accent, and — the last open item — a partially-cut edge chip on the scrollable row, resolved with `scroll-snap-type: x mandatory` (fixes the leading edge, including on first load) plus a `mask-image` gradient fade (handles the trailing-edge peek `scroll-snap` structurally can't reach).
- Each round was screenshotted (Playwright + the pinned Chromium build) and sent to Assaf before moving on; several corrections came back fast (search icon side flipped left, then confirmed; icon shape corrected from a rounded emoji-circle to a minimal non-rounded SVG).
- **ADR-0100 written once the design converged** — it documents the final decided shape (the mockup), explicitly flags that it supersedes the interim shipped-to-branch React implementation above, and extends ADR-0028's existing per-mode selected-accent rule (already used for the day-strip) to the Index's own chip/search accent rather than inventing new color policy.

## Fix 3 — drop the redundant "כבר מאחוריכם" heading

Checked the precedent this collapse was modeled after (ADR-0098 §2: "mirroring ADR-0061's Plan Home 'completed checks' toggle exactly") — `PlanHome.tsx`'s completed-checklist `Collapsible` has **no** heading inside the revealed content, just the `CollapseToggle` button (itself already labelled "הצג/הסתר ...") directly followed by the list. `IndexBookingsView`'s extra `t.index.pastHead` ("כבר מאחוריכם") div sitting between the toggle and `.listcard.past` was the one place that didn't actually match that mirror — a real inconsistency, not a deliberate variation, so no scope question here.

- Removed the `<div className="past-head">` from `IndexBookingsView.tsx`, the `pastHead` key from `i18n/he.ts`, and the now-unused `.index .past-head` rule from `screens.css`. The `.sec-title` row's own existing bottom margin (11px) already provides the same visual separation before the revealed list, so no replacement spacing was needed.
- Two source comments (`lib/time.ts`, `lib/index-bookings.ts`) that used the Hebrew phrase "כבר מאחוריכם" as a mnemonic for "the past-bookings list" were reworded to the plain English description, since the phrase no longer names anything on screen.

## Verification

- Fix 1: `pnpm --filter @waypoint/frontend typecheck` + `test` + `build` green after the removal; the real Navigation-API back path re-verified by direct drive (not just the deleted gesture's absence).
- Fix 2: mockup-only iteration, verified visually via Playwright screenshots at each round (no test suite — static HTML, not app code yet).
- Fix 3: full `pnpm --filter @waypoint/frontend test` (599 tests, 63 files), `typecheck`, `lint`, `build`, and `format` all green; no test referenced the removed heading directly (`IndexBookingsView.test.tsx`'s past-collapse coverage asserts on the toggle button and row contents, not the now-gone label).

## Scope / not touched

- Fix 2's design is **not yet ported** to `IndexBookingsView.tsx`/`screens.css`/`Icon.tsx` — tracked in `docs/backlog.md`. The documents screen's header is expected to adopt the same merged-row shape once that port happens (ADR-0100 Consequences) but wasn't touched this session.
- `docs/design/mockups.md` updated in the same change to point `index-bookings-compact-v2.html` at ADR-0100 (Accepted) instead of "in-progress exploration."
