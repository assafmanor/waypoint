# 2026-07-14 · Session 13 — In-app back & the PWA return gesture

**Outcome:** [ADR-0035](../decisions/0035-in-app-back-and-return-gesture.md); `architecture/app-shell.md` gains a "Back & the return gesture" section. Implemented on `claude/pwa-return-gesture-zdxaji`.

## Problem

On the installed `display: standalone` PWA (esp. **iOS, which has no system back gesture at all**), a user who drills into a trip has no way back. And where a system back _does_ exist (Android/desktop), it does the wrong thing, because only full-page routes were real history — the in-trip **tab** and **overlays** were React `useState`, invisible to history — so back jumped straight out to `/trips`, discarding in-trip state and any open sheet.

## Decisions (see ADR-0035)

- **React-router stays the single history owner**; we make in-app navigation _be_ history rather than build a parallel gesture stack or suppress the native back.
- **One `goBack()`**, guarded, with the precedence: overlay → non-Home tab → Home base → shell parent → no-op at root.
- **Home-anchor tabs** ("Home, then exit"): Home→tab pushes, tab→tab replaces; tab in `?tab=`.
- **Overlays are shallow history entries** (marker in `location.state`), wired once in the `Sheet` + confirm primitives, so back closes the topmost sheet.
- **Return gesture** = one trigger of `goBack()`: RTL-correct trailing-**right**-edge leftward pull, edge-zoned to avoid the day-strip/Plan-builder pointer gestures, peek+threshold commit.

## Implementation notes

- `frontend/src/state/nav-state.tsx` — `NavProvider` + `useOverlay` (overlay stack mirrored to router history) + `useAppBack`/`goBack` + `useTripTab` (Home-anchor).
- `frontend/src/ui/EdgeSwipeBack.tsx` (+ CSS) — the gesture, mounted app-wide.
- `App.tsx` — tab derived from `?tab=`; account sheet, `Sheet`, and the confirm dialog register as overlays.

## Deferred (recorded)

Header back-chevron mirroring the gesture on shell routes; forward gesture; per-day history; intercepting Android system-back for the rare _nested_ transient sheet (iOS-standalone — the motivating case — has no system back to reconcile, and the gesture already handles nesting).
