# Session 78 — Maps & Places Phase 2: places on existing surfaces + real ניווט deep-links

**Date:** 2026-07-24
**Kind:** Feature slice — Phase 2 of the Maps & Places epic.
**ADRs:** implements [0106](../decisions/0106-maps-and-places-epic-scope-and-phasing.md) §Phase 2 (+ §B "navigate-to-next is a Google Maps deep-link") and [0109](0109-map-tab-design.md); place-resolution home is `lib/places.ts` per [0110](0110-maps-and-places-frontend-architecture.md).

## Goal

Phase 2: "enriched places show properly on booking/event detail with a working 'open in Maps' deep-link; every surface that shows a place gets the deep-link" (ADR-0106 §73). Plus the explicit ask: **find every preexisting `ניווט` button, wire it to a real deep-link, and remove it when there is no location.**

## What shipped

- **Deep-link builders in `lib/places.ts`** (no API key, no Google spend — Universal Maps URLs, ADR-0106 §5). `mapsDirectionsUrl(place)` → `/maps/dir/?api=1&destination=lat,lng[&destination_place_id]`; `mapsPlaceUrl(place)` → `/maps/search/?api=1&query=…`; `eventDirectionsUrl(event, bookings, places)` and `bookingDirectionsUrl(booking, places)` resolve the place via the authority rule (transport → origin) and defer to `mapsDirectionsUrl`. Every builder returns **`null` when the place has no coordinates** — a name-only Place-lite has no usable location. Refactored `eventPlaceId` to share a new `bookingPlaceId`.
- **`ניווט` is now real everywhere it appeared, and conditional.** It was a stub (`verbs.navigate` → `toast('פותח ניווט')`) that opened nothing and always showed. Now:
  - `EventCard` (day timeline): `onNavigate` made **optional**; all three navigate buttons render only when a handler is supplied. `DayView` supplies one via `navigateHandler(event, ctx)` = `eventDirectionsUrl(...)` → `openMaps(url)`, or `undefined` when there's no mappable place. Navigate still shows on a read-only past day (ADR-0029 "Done/Skip/Navigate stay"); it's gated on **location, not read-only**.
  - `TransitionRow` (bracketed-booking edges): `onNavigate` signature simplified to `() => void`; `DayView` gates it on `!readOnly && navigable`.
  - Removed the dead `verbs.navigate` stub and the now-unused `t.toast.openingNav`. `ICONS.navigate` stays (Trip-mode label + leave-trip hint).
- **`BookingDetail` gains "open in Maps"** — a teal `ניווט` link (location affordance, design-language §semantic color budget) beside the plan-violet edit, shown only when `bookingDirectionsUrl` is non-null. Widened `.bk-head` padding to clear two actions.

## Deliberately NOT here

- **Navigate-to-next Home tile** is **Phase 4** (ADR-0106 §B / §Phase 4), not Phase 2 — not added.
- **Index / board rows** (`EventTitle`/`BookingTitle`) show place names but reach the deep-link by opening `BookingDetail`; inline per-row map links would be noise, so the row stays a label. PlanDay's card has no navigate (Plan mode isn't live).
- **Whole-day waypoints deep-link** is a Phase-6 idea (ADR-0106 §E), not this slice.

## Verification

`pnpm format` + `pnpm --filter @waypoint/frontend typecheck` + `build` green; frontend suite **659/659** (added deep-link cases to `lib/places.test.ts` incl. coordless → null, and an `EventCard` "no location → no button" test). Lint clean (only pre-existing unrelated `_`-prefixed warnings). Backend unaffected.
