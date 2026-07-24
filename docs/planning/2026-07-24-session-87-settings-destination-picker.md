# Session 87 — Settings destination picker

**Date:** 2026-07-24
**Kind:** Frontend + small backend follow-up — trip settings' free-text destination becomes the shared destination picker (ADR-0113's third-ish call site).
**ADRs:** amends [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md) (settings destination picker + nullable structured fields on update).

## Why

Trip creation already picks a real destination place (ADR-0113 slice 3), setting
the structured fields + derived primary timezone. Editing the destination later,
in settings, still dropped back to a free-text input — so a corrected
destination lost the structured fields (and couldn't re-derive the zone). This
closes that gap: settings edits the destination through the same
`DestinationPicker`.

## Change

**Frontend (`TripSettings` `DetailsEditor`):**

- The free-text `יעד` input becomes `<DestinationPicker value={destination} onPick={…} />`.
- A pick sets the display name + structured fields; a **resolved** pick also sets
  the derived primary timezone (mirrors creation). A multi-zone country surfaces
  the same soft "spans several zones" note and seeds the `ZonePicker` suggestions
  with `candidateZones`.
- `destPlace` is seeded from the stored trip, so a name-only edit re-sends the
  current structured fields unchanged.
- **Deliberate divergence from creation:** a "use as typed" pick keeps the
  trip's existing timezone rather than resetting to the device default — an
  established trip already has a meaningful zone the editor shouldn't discard.

**Shared / backend:**

- `updateTripSchema` gains the four destination structured fields, **nullable**
  (unlike `createTripSchema`) so a "use as typed" edit can clear the now-stale
  coordinates by sending `null`, rather than leaving the old place's point
  behind. `TripsService.updateTrip` persists them (the existing conditional
  spread already treats `null` as "write it", `undefined` as "leave it").

**Null-to-clear coercion:** the wire carries `null` to clear a field, but the
local `Trip` entity uses `undefined` for absent. A shared `coerceTripPatch`
(`lib/cache.ts`) normalizes a trip change's `after` (present keys only, so an
untouched field isn't wiped) and is used at **both** merge points — the Dexie
cache mirror and the in-memory `applyControlChangeToTrip` — so no stray `null`
ever lands on a cached/in-memory trip (matters for the future ADR-0107 map
reader; there is no reader of these fields yet).

## Verification

- Backend `trips.service.spec`: a resolved pick persists the structured fields;
  a `null` "use as typed" edit clears them (CI-only, needs Postgres).
- Frontend `cache.test`: a `null` destination field coerces to `undefined` on
  the cached trip.
- `typecheck` + `lint` (0 errors) + `build` green across shared/backend/frontend;
  full frontend suite (706) passes; `pnpm format` clean.
