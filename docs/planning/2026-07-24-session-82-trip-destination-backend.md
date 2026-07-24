# Session 82 — Trip destination as a picked place: backend + data model (ADR-0113 slice 1)

**Date:** 2026-07-24
**Kind:** Feature slice — the first of three implementing ADR-0113 (the foundational slice of the multi-zone timezone workstream).
**ADRs:** implements [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) §1/§2/§4 (backend + schema); reuses [0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) (the Places client/key/throttle).

## Why this first

ADR-0113 is the foundation the rest of the timezone track sits on: a real `Trip.timezone` primary + structured destination are prerequisites for the per-event zone chip (ADR-0110 §3) and the multi-zone display layer (ADR-0107) — which in turn unlocks the richer `<time> · <what>` map-row meta deferred in the Map tab. Slice 1 is the backend + data model; the shared `ZonePicker` (slice 2) and the creation-flow picker (slice 3) build on it.

## What shipped

- **Data model.** `Trip` gains nullable structured destination fields — `destinationGooglePlaceId`, `destinationLat`, `destinationLng`, `destinationCountryCode` — via a hand-authored migration (`20260724120000_trip_destination_place_adr0113`); `destination` stays the display string. Mirrored in `@waypoint/shared` (`tripSchema` + `createTripSchema`), mapped in `toTripDto`, and persisted in `TripsService.createTrip`. `timezone` is unchanged in shape (still defaults to `UTC` at the API) — the creation UI will send the derived zone (slice 3).
- **Trip-agnostic destination endpoints** (ADR-0113 §4), a new `DestinationsController` + `DestinationsService` in the places module (there's no trip yet at creation, so these are distinct from the trip-scoped `trips/:tripId/places` proxy):
  - `POST /destinations/search` — geo-type-restricted autocomplete (`DESTINATION_PRIMARY_TYPES` = locality / administrative-area levels / country), so cities, regions, and whole countries resolve, never a POI.
  - `POST /destinations/resolve` — geocodes the pick into `{ googlePlaceId, name, countryCode?, lat?, lng?, timezone?, candidateZones? }`. `timezone` is the `geo-tz` derived default; `candidateZones` is populated only for a **known multi-zone country** (a small curated `MULTI_ZONE_COUNTRIES` map — US/AU/RU/CA/BR/MX/ID/KZ/CL/CD), the signal for the creation UI's "spans several zones" note + picker pre-filter.
  - Authed by the global `JwtAuthGuard`; **per-user** throttled — the existing `PlacesThrottlerGuard` tracker now keys on the actor alone when there's no `tripId` (was IP-fallback). No persistence.
- **Google client extension.** `google-places.client.ts` gains an optional `includedPrimaryTypes` on `autocomplete` and a `geocode(googlePlaceId, sessionToken?)` that reads the ISO country code off the `country` address component. The geocode field mask (`id,displayName,location,addressComponents`) stays **Pro-tier** (addressComponents is Essentials, so no tier bump).

## Verification

`pnpm --filter @waypoint/shared build` + `prisma:generate` + backend `typecheck` green. New `destinations.service.spec.ts` (pure unit — no DB): geo-type search, single-zone vs multi-zone resolve, no-coords → no zone (4/4 pass). The existing place/trip specs are live-Postgres integration tests (run in CI, not headless here); the migration + shared mirror follow the ADR-0108 precedent. `pnpm format` clean.

## Next

Slice 2 (shared `ZonePicker` + settings swap), then slice 3 (creation-flow destination picker).
