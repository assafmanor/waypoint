# Session 86 — Transport endpoints become picked places

**Date:** 2026-07-24
**Kind:** Frontend migration — transport bookings (flight/train) now carry real picked places on both endpoints instead of free-text origin/destination.
**ADRs:** amends [0059](../decisions/0059-booking-presentation-on-home-and-index.md) §3 (the transport route row reshapes); last data prerequisite for the multi-zone model ([0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md), [0113](../decisions/0113-trip-destination-place-and-primary-timezone.md)).

## Why

Every other booking detail already resolves to a real `Place` (a picked Google
place with lat/lng), which is what feeds the map and — next — the per-endpoint
timezone. Transport was the last holdout: its origin/destination lived as
free-text strings, so a flight's arrival city couldn't drive an arrival-zone
chip or a map pin. This slice closes that gap.

## Change

`BookingSheet` transport editing migrates from two free-text inputs to two
`PlacePicker`s bound to `fromPlaceId` / `toPlaceId`:

- **Route field.** A single `מסלול` Field stacks the origin and destination
  `PlacePicker`s; picking each resolves a real place (the picker persists it),
  so the booking references `fromPlaceId`/`toPlaceId` state directly at save —
  no more resolve-on-save string round-trip.
- **Title row is now a read-only preview.** ADR-0059 §3's editable inline
  title for transport is reversed: the title row shows a `RouteLabel`
  (`from → to`) once either endpoint is picked, and a ghost prompt
  (`בחרו מוצא ויעד`) until then. The stored title is still
  `origin → destination` (derived from the picked place names via
  `routeTitle`), so nothing downstream that reads `booking.title` changes.
- **PlanHome seed prefill** stays free-text-tolerant: an incoming
  `seed.origin`/`seed.dest` prefills the picker **only** when a matching
  existing place is found (synchronous find-only via `findPlaceByName`) — it
  never creates an orphan place just because the sheet was opened. If no match
  exists the endpoint starts empty, which also keeps the dirty baseline correct.

## Scope / caveats

- **Single-place bookings unchanged** — they already used one `PlacePicker`.
- **Existing transport bookings** keep their stored `fromPlaceId`/`toPlaceId`
  (already on the `Booking` shape); ones saved before places existed simply
  open with empty pickers and the title preview from their stored title.

## Verification

New `BookingSheet.test.tsx` (2 tests): a transport booking renders both
endpoints as labelled place-picker buttons plus a `RouteLabel` preview (no
free-text route input); a fresh transport booking shows the route-preview
ghost. Frontend `typecheck` + `lint` (0 errors) + `build` green; full frontend
suite (705) + the 2 new tests pass; `pnpm format` clean.
