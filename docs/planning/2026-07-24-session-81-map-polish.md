# Session 81 — Map tab polish: DayStrip all-scope + coordless enrich-from-map

**Date:** 2026-07-24
**Kind:** Small follow-up on Phase 3 (session 80), two of the deferred items.
**ADRs:** completes two ADR-0110 §4 / ADR-0109 §1 loose ends from the Map tab v1 build.

## What shipped

Two of the four session-80 "map polish" follow-ups (the other two are gated on later phases and stay deferred).

- **(a) `DayStrip` all-scope suppression (ADR-0110 §4).** When the Map's "כל הימים" (all-days) scope is on, no single day is "the active one", so the header day-strip should not show a filled selection. The strip is rendered by the persistent `AppShell` header while `allDays` was Map-screen-local — so the fix lifts that one boolean into a tiny **`MapScopeProvider`** context (`state/map-scope-state.tsx`) mounted just above the trip `Shell`. `Shell` passes `allScope={tab === 'map' && allDays}` to the `Header`, which threads it to `DayStrip`; a new `DayStrip allScope` prop withholds the `on`/`sel-*` selection classes (and `aria-pressed`) and skips the auto-scroll, while keeping the today-anchor (Trip) and empty-day markers (Plan). `MapView` now reads `allDays`/`setAllDays` from the context instead of local state; its mode-default and day-tap-exit effects are unchanged. The app still tracks exactly one active date — this is view state only, not synced, not in the URL.
- **(b) Coordless `＋ מיקום` enrich-from-map (ADR-0109 §1).** A coordless Place-lite row showed a dead `ללא מיקום` note; it now offers a dashed `＋ מיקום` button that opens the shared picker sheet on that place. `PlacePickerSheet` was **exported** from `PlacePicker.tsx` (it already computes `enrichPlaceId` when the current place is coordless), so the map drives the exact same enrich-in-place flow the forms use — a pick updates the row through the existing `resolvePlace` verb, and the list refreshes from the `places` context (no bespoke handling in `MapView`). Copy: `t.map.listedOnly` → `t.map.addLocation`.

## Still deferred (unchanged)

- **(c) richer `<time> · <what>` row meta** — the row still shows address/category; the per-day event time + plain description overlaps the timezone display track (ADR-0107), so it's done there, not here.
- **(d) `מפה`/view → in-app map focus** — the Phase-2 `TODO(phase-3)` on `mapsPlaceUrl`; only meaningful once the rendered map exists (Phase 6).

## Verification

`pnpm format` + `typecheck` + `build` green; frontend suite **694/694** (added a `DayStrip` all-scope case + a `MapView` "＋ מיקום opens the picker" case; updated the coordless-row assertion + the Map test wrap to include `MapScopeProvider`). Lint clean. Backend unaffected.
