# Session 26 — Index tab: data-model migration + backend + frontend place-resolution

**Date:** 2026-07-16
**Outcome:** ADR-0048's data model built (migration `index_data_model_adr0048`); a new **ADR-0051** for the two decisions the build forced; `Place` module, `mutateMany`, booking auto-create/delete-unlink shipped backend; the frontend kept building via place-resolution. Branch `feat/index-data-model-adr0048`. The Index tab UI itself is still deferred.

## Why this session happened

The Index tab was the last unbuilt core tab, gated on ADR-0048's schema. This session implemented the **backend foundation** (the plan: schema → shared → backend → frontend keep-green), deliberately leaving the Index UI + booking-entry form for a follow-up. Discussed backend deep, frontend light, in plan mode, sign-off before locking the schema (Assaf's stated preference).

## What was decided (the build forced two refinements → ADR-0051)

ADR-0048 as written kept two things that reintroduced the "one field, one owner" drift:

1. **Free-text `Event.location`/`Booking.address` alongside the `placeId` FK.** Resolved by **full Place normalization** (Assaf's call over the staged alternative): those columns are dropped; location is expressed only via `Place` (name-only "Place-lite" for free text).
2. **A linked event duplicating the booking's place.** Resolved by the **authority rule**: a linked event's place lives on its booking (its own `placeId` is forced null); an unlinked event owns `placeId`. Enforced in `EventsService` + the auto-create path.

Also folded into ADR-0051: **`Event.bookingId` made `@unique`** (the schema allowed 1:many, contradicting ADR-0047's 1:1); category derives from the icon, not the booking type (ADR-0038), with `BOOKING_TYPE_TO_CATEGORY` only a fallback.

## What shipped

- **Migration** (destructive, dev + prod fine — no users): `Place`; `placeId` FKs on Event/Booking/MaybeItem; `Booking.fromPlaceId`/`toPlaceId`; dropped `Booking.startsAt/endsAt/address`, `Event.location`, `TripNote`/`TripNoteCategory`; `@unique(Event.bookingId)`. Generated via `migrate diff` + `migrate deploy` (Prisma 7 refuses `migrate dev` non-interactively on any warning).
- **`@waypoint/shared`** mirrored; `BOOKING_TYPE_TO_CATEGORY`; snapshot carries `places`.
- **`ChangeService.mutateMany()`** — N `Change` rows in one transaction, ordered post-commit broadcast.
- **Places module**; **Bookings**: auto-create-event (2 changes/one tx, retry-idempotent), delete/unlink (`?deleteEvents`) emitting the event change, place-in-trip + transport/single-place guards.
- **Frontend keep-green** (forced by the schema): `lib/places.ts` resolver wired into DayView/PlanDay; `cache`/`trip-state` carry `places` + a `place` change branch; Home WiFi from the hotel booking; fixtures updated; the manual `EventForm` free-text location input **removed** (place authoring deferred to the picker/Index slice — Assaf approved).

## Verification

Backend: bookings/places/sync/trips/events **61/61** + OpenAPI contract; frontend **244/244**; `pnpm typecheck` 4/4 + `pnpm build` 3/3. One pre-existing, unrelated failure: `documents.service.spec.ts` (encrypted-blob storage roundtrip, gitignored `storage/` dir) — confirmed failing identically with these changes stashed.

## Deferred / follow-up

- **Index tab UI, booking-entry form, Home quick-access deep-links** — the whole frontend of the feature (backend is ready).
- **Places picker** (Google Places) — gated on Google Cloud setup; until then place authoring is free-text → name-only `Place`, and the EventForm location input stays removed.
- **Calendar one-way sync** must resolve a linked event's location via booking/`Place` when built (no `Event.location`).
- Accepted limitations: no `Place` dedup pre-picker; orphaned Places left (no GC).
