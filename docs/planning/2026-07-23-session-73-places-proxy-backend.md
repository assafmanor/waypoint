# Session 73 — Places picker, Phase 1 backend slice (implementation)

**Date:** 2026-07-23
**Kind:** Implementation (first code of the Maps & Places epic — the server side of the picker keystone)
**ADRs:** implements [0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md) §1/§3/§5 + [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md)'s `Place.timezone`; serves the [0110](../decisions/0110-maps-and-places-frontend-architecture.md) FE contract; new [0111](../decisions/0111-places-field-mask-tier-and-rating-deferral.md) (field-mask tier + rating deferral).

## What shipped

The backend half of the Places picker — proxy routes on the existing `places` module, no new module (ADR-0096 reuse).

- **Schema (migration `20260723200000_places_google_enrichment_adr0108`):** `Place.timezone String?`, `Place.rating Float?`, `Place.userRatingsTotal Int?`, and `@@unique([tripId, googlePlaceId])` (NULLs distinct, so many name-only rows coexist). Mirrored in `@waypoint/shared` `placeSchema`; the mapper (`toPlaceDto`) carries the new fields.
- **Shared contracts:** `placePredictionSchema` (`{ googlePlaceId, primaryText, secondaryText? }`), `searchPlacesSchema`, `resolvePlaceSchema` — the wire shapes both layers need, per `packages/shared/CLAUDE.md`.
- **`google-places.client.ts`** (the one net-new file): the outbound `fetch` wrapper, the only holder of `GOOGLE_MAPS_SERVER_KEY` (read via `requireEnv`). Autocomplete (New) `POST places:autocomplete` + Place Details (New) `GET places/{id}` with the session token threaded through both. A network/DNS fault or a non-2xx from Google maps to a `503` (never leaks Google's body) so the FE degrades softly.
- **Proxy routes on `PlacesController`** (behind `MembershipGuard`): `POST …/places/search` (Autocomplete relay) and `POST …/places/resolve` (enrich-on-pick create-or-link, `enrichPlaceId?` to enrich a Place-lite in place). `resolve` does **dedup-before-spend** — a `(tripId, googlePlaceId)` hit returns the cached row with zero Google spend; a miss spends one Place Details call, resolves the zone once via `geo-tz`, and persists through `ChangeService.mutate`. P2002 on the unique constraint (a concurrent pick of the same place) recovers to the winning row.
- **`PlacesThrottlerGuard`** — a `ThrottlerGuard` subclass with a `${userId}:${tripId}` tracker and its own two windows (per-minute + per-day), applied only to the two paid routes so the global per-IP throttler stays as the outer backstop. Limits are env-tunable (`PLACES_SEARCH_LIMIT_PER_MIN` etc.) with the ADR-0108 §5 defaults.
- **`geo-tz@7`** added (CommonJS, matches the backend's NodeNext/CommonJS; v8 is ESM-only). Accurate OSM-polygon lookup, offline, server-only.
- **Boot guard:** `GOOGLE_MAPS_SERVER_KEY` is prod-required in `validate-config.ts` (dev/test may omit it — the picker routes 500 if hit, everything else runs).

## The one real decision: rating fields are Enterprise-tier → deferred (ADR-0111)

ADR-0108 §3 deferred the field→tier confirmation to implementation. Confirmed against Google's **live** docs (2026-07-23): `rating`/`userRatingCount` are **Enterprise**-tier — the only Enterprise fields in the set ADR-0109 §9 wanted. Including them bills every pick at Enterprise (~$20/1k, 1,000/mo free) vs Pro (~$17/1k, 5,000/mo free) — a 5× headroom cut — for a ★ nothing renders until Phase 2/3. The user flagged the cost mid-build and chose to skip ratings for now. So the Phase-1 field mask is `id,displayName,formattedAddress,location` (**Pro**); the `rating`/`userRatingsTotal` columns still ship (nullable, unpopulated) so opting in later is a one-line mask edit, no migration. Recorded as ADR-0111.

## Verification

`pnpm format` + `pnpm typecheck` + `pnpm build` green; backend suite 155/155 (6 new `places.service.spec` cases incl. dedup-before-spend and the geo-tz zone). Live smoke test under `DEV_AUTH=1`: `search` 400 on invalid body / reaches Google on a valid one, `resolve` returns the cached row with zero spend on a dedup hit, `MembershipGuard` 404s a non-member trip.

## Not in this slice (next)

The **frontend** of the picker (ADR-0110): `lib/usePlaceSearch.ts`, `PlacePicker`, the two `lib/api.ts` calls, EventForm place authoring + category selector, wiring into every place field. The proxy endpoints it consumes are live.
