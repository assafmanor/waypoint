# Session 99 — Slice 4c: the zone chip reaches booking forms, per endpoint

**Date:** 2026-07-24
**Kind:** Implementation slice (fills the gap slice 4b left), with a schema migration.
**ADRs:** [0107](../decisions/0107-per-place-timezones-and-multi-zone-time.md) §6-7 + the **session-99 amendment**, [0048](../decisions/0048-index-build-data-model-refinements.md) (the place-authority rule these columns mirror).

## The gap

Slice 4b put the zone chip on `EventForm`, but editing anything with a booking routes to `BookingSheet` (`DayView.tsx:134`), which had **no** zone control — it derived `startZone`/`endZone` from the picked places and only _stated_ the result in the read-only `ZoneNote`.

For a place with coordinates that's correct by §3: the zone follows the place, so the place is the honest edit. The hole is the **unknown** zone — a coordless Place-lite, which `usePlaceSearch` mints when you're offline or Google matched nothing, carries no `timezone`. The form then fell back to the trip primary silently, with no way to correct it, and a flight between two such places read entirely in the wrong clock.

## Why `Event.displayTimezone` couldn't be reused

It is **one zone for the whole event** — `eventDisplayZones` returns `{start: override, end: override}`. Pinning a flight through it would erase its arrival's zone and with it the crossing that partitions the itinerary. A crossing needs one override _per end_.

## What shipped

**1. Two nullable `Booking` columns** — `startDisplayTimezone`, `endDisplayTimezone` — mirroring the authority rule its place columns already follow (ADR-0048): transport pins its origin on `start` and its destination on `end`; a single-place booking uses only `start`, which drives both ends. Migration `20260724220000_booking_display_timezones_adr0107`. `Event.displayTimezone` keeps its documented job (the placeless standalone event).

**2. `bookingEndZones(booking, places)`** — the single answer to "what zone is each end in, **as far as we know**": the pin, else the endpoint place's cached zone, else **undefined** (never a fallback — the caller needs to tell "known" from "fell back"). Both `tripZoneCrossings` and `eventDisplayZones` read it, which is what makes a pinned pair a _real_ crossing: pin an origin and destination on a flight between two coordless places and the itinerary partitions on it exactly as it would for two real airports. A test asserts precisely that (no crossing before the pins, a crossing after).

Resolution priority is now per-end: **event override > booking per-end override > endpoint place > itinerary segment > trip primary**. So a flight can take its origin from a pin and its destination from a real place.

**3. A chip per time field.** `WhenField`'s span variant gained `zones: {start?, end?}` (one `ZoneChip` under each leg — the day variant's single `zone` slot from 4b unchanged), and `BookingSheet` feeds them. **Editable only when no place answers the zone**; a placed endpoint keeps a read-only statement. Same three wire states as 4b: picked sends the zone, the reset sends `null`, untouched sends nothing.

**4. The clearable-field coercion earned its generalization again.** `updateBooking`'s optimistic merge routes through `coerceClearedFields<Booking>` (built in 4b for exactly this shape of bug), so a reset can't leave a `null` in local state.

## Verification

- `ui/BookingSheet.test.tsx` (+6): each leg states its zone and **only the unknowable end is correctable**; both correctable when neither endpoint resolves; pinning one end writes only that end (`endDisplayTimezone` set, no `startDisplayTimezone` key); a stored pin reads back pinned and its reset patches `null`; a single-place booking shows one chip and writes `start` only; an untouched form sends no zone keys.
- `lib/places.test.ts` (+6): a pin beats the segment fallback per end; a real place still wins when nothing is pinned; a single-place pin drives both ends; the **event** override still outranks a booking pin; pinned zones produce a crossing where coordless places produced none; `bookingEndZones` reports `undefined` rather than guessing.
- `backend/src/bookings/bookings.service.spec.ts` (+1): both columns persist on create; an absent key leaves a pin; `null` clears one end and leaves the other.
- Frontend suite **811** passes (82 files); `typecheck` + `lint` (0 errors) + `build` green; `pnpm format` clean. Backend specs + the migration run in CI (no local Postgres).

## Not in this slice

The type selector only renders on **create**, so an existing booking can't flip transport→single-place; the save still resolves a single-place booking's end to `null`, which covers the one path (a flip before the first save) that could otherwise leave a stale end pinned.
