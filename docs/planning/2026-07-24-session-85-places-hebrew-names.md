# Session 85 — Hebrew place names from Google (languageCode/regionCode)

**Date:** 2026-07-24
**Kind:** Small backend enhancement — from user feedback that picked place names came back in English.
**ADRs:** upholds [0009](../decisions/0009-docs-english-ui-hebrew.md) (docs English / UI Hebrew); touches the Google relay in [0108](../decisions/0108-maps-and-places-backend-architecture-key-model-and-cost.md)/[0113](../decisions/0113-trip-destination-place-and-primary-timezone.md).

## Change

The Places relay sent no `languageCode`, so Google returned English (or the place's local script). The app is Hebrew-first (ADR-0009), so `google-places.client.ts` now sends **`languageCode: 'he'` + `regionCode: 'IL'`** on all three Google calls:

- `autocomplete` — added to the request body (covers both the trip-scoped place search and the destination search).
- `placeDetails` + `geocode` — added as query params (covers trip-scoped resolve and destination resolve).

Google returns the Hebrew name where it has one and falls back to the local/English name otherwise; `regionCode` biases ranking toward Israel. Neither param changes the SKU tier (ADR-0111 unaffected).

## Scope / caveats

- **New picks only.** The name is cached on the `Place` row at pick time, so already-saved places keep their stored (English) name until re-resolved — a backfill would be a separate re-resolve pass, not done here (low value).
- **Timezones unchanged.** IANA zone IDs are technical keys, not display text; the `ZonePicker` label localization was discussed and left as an optional future follow-up (the `GMT±N` offset is already language-neutral).

## Verification

New `google-places.client.spec.ts` (pure unit, stubs `fetch`): autocomplete body carries `languageCode`/`regionCode` + passes through `includedPrimaryTypes`; `placeDetails`/`geocode` carry the query params; `geocode` reads the ISO country code + Hebrew name (3 cases). Backend `typecheck` + `lint` + `build` green; `pnpm format` clean.
