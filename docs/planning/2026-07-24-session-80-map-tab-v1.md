# Session 80 — Map tab v1: the list-first pinned-place surface (Phase 3)

**Date:** 2026-07-24
**Kind:** Feature slice — Phase 3 of the Maps & Places epic (the Map tab's first real content).
**ADRs:** implements [0109](../decisions/0109-map-tab-design.md) (surface/pins/row anatomy) + [0110](0110-maps-and-places-frontend-architecture.md) §2 (the place-usage derivation) and §4 (context-aware day select); upholds [0106](0106-maps-and-places-epic-scope-and-phasing.md) (list before rendered map; deep-link, don't rebuild nav).

## What shipped

The `map` tab was a `Placeholder`; it's now the list-first pinned-place surface.

- **`lib/place-usage.ts`** (foundation, committed first) — `buildPlaceUsageIndex(events, bookings, maybeItems, places)` → `Map<placeId, PlaceUsage>`: per place its `days` (edge/ambient prominence), category union, `isMaybe`/`isScheduled`, `coordless`, and a colour-by-most-committed `pin` (hard event > soft event > idea). Built on the existing `eventPlaceId` resolver; transport contributes both endpoints; unlinked bookings have no day facet; consumed maybes drop out. Facet helpers `matchesPlaceFilter` / `countPlacesByCategory` in the `index-bookings.ts` idiom (type single-select + independent maybes toggle) — deliberately not a generalization of the booking helpers (ADR-0110 §2).
- **`CATEGORY_PIN_HUE`** (`constants.ts`) — the 9 `EventCategory` → 5 `PinHue` fold, a `Record` (compile error on a new category). The 5 `--cat-*` hue tokens live in `tokens.css` (light ported from the mockup; dark readiness variants).
- **`screens/Map.tsx` + `map.css`** — mode chrome + the header `DayStrip` (both already global) → filter chip row (`ChoiceGrid` pills for type + an independent `אולי` toggle + search) → the map-local `כל הימים` scope chip → the pinned-place list. Rows follow ADR-0109 §1 anatomy: category badge (`--cat-*` hue), name + 🔒 for a hard commitment, meta (address/category · `על המדף` · `★ rating`), and **one labelled trailing `ניווט`** (directions, Google deep-link); **viewing the place is the row tap** (opens the Google place view). Soft ideas read dashed/hatched, ambient mid-stay bases quiet, coordless a dashed badge + `ללא מיקום` note. Reuses the Index grammar verbatim (`ChoiceGrid` pills, `SearchOverlay`, the `--idx-accent` mode tint, `ui/feedback` empty/offline).
- **Context-aware day select** (ADR-0110 §4) — `nav-state.tsx` gains `DAY_SCOPED_TABS = {days, map}`; `daySelectTarget(date, today, currentTab)` preserves a day-scoped tab (so tapping a strip day focuses that day **on the map, in place**) and routes anywhere else to the Day view. `trip-state.tsx`'s `setActiveDate` passes the current tab. `resolveBack` untouched (forward-only change).
- **Day scope / all-days** is map-local state (the global model has one active date): Trip defaults to today, Plan to all; it re-defaults on a mode switch and exits when a strip day-tap changes `activeDate`.

## Deliberately deferred (noted, not silent)

- **Near-me / distance chips + geolocation** — that's **Phase 4** (ADR-0109 §6-7), not this slice; the scope strip has room for the `קרוב עכשיו` chip.
- **`DayStrip` all-scope visual suppression** — when all-days is active the global strip still shows the selected day highlighted (ADR-0110 §4 wanted no filled selection). The strip is rendered by the persistent `AppShell` header, so honouring this needs the map-local `allDays` lifted to a shared place; deferred as a small follow-up (backlog).
- **Coordless `＋ מיקום` enrich-from-map** — a coordless row shows `ללא מיקום` for now; wiring the `PlacePicker` (with `enrichPlaceId`) from the map row is a follow-up.
- **Richer `<time> · <what>` row meta** — the row shows address/category; resolving the specific referencing event's time + plain description per day overlaps the timezone track (ADR-0107 display layer), so it's left to that work.
- **`מפה`/view → in-app map** — the Phase-2 `TODO(phase-3)` on `mapsPlaceUrl`. The list surface doesn't yet accept a "focus this place" deep-link (focusing a place is only meaningful once the rendered map lands in Phase 6), so the view action still opens Google. The list row-tap **is** the list's view affordance (ADR-0109 §1). Kept as a TODO.

## Verification

`pnpm format` + `typecheck` + `build` green; frontend suite **679/679** (place-usage: 10 cases; MapView: 6; nav-state `daySelectTarget` tab-aware cases). Lint clean (only pre-existing unrelated warnings). Backend unaffected. Not yet driven live in a browser — the component tests cover the derivation + filter/scope behaviour.
