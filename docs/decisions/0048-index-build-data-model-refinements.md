# 0048 — Index-build data-model refinements: Event owns time, a Place entity, transport origin/destination, TripNote retired, kind on booked events

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0047](0047-booking-event-linkage-and-notes.md) (the booking↔event model this builds on), [0018](0018-timeline-data-model-shape.md) (Booking/Event/MaybeItem shapes; the `endDate` span), [0038](0038-icons-and-canonical-category.md) (the `placeId` this promotes to a real entity; category axis), [0037](0037-overnight-events.md) (the transport primitive it deferred), [0011](0011-hard-soft-event-model.md) (hard/soft as a free axis), [0004](0004-integrations-are-pipes.md) (the index/map an entity feeds)

## Context

Designing the Index tab in mockup form (`mockups/trip-index-v1.html`, `mockups/plan-mode-v1.html`, promoted from the approved spec `docs/superpowers/specs/2026-07-16-index-bookings-documents-design.md`) surfaced five data-model questions that ADR-0047 either left implicit or that only became visible once the screen was concrete. None change ADR-0047's linkage/delete/notes decisions; they refine the shapes underneath.

## Decision

**1. The Event is the sole time authority; `Booking.startsAt`/`endsAt` are dropped.** ADR-0047 §1 already routes a booking's time through its auto-created Event (a hotel's check-in/out uses `Event.startsAt` + `Event.endDate`; ADR-0018's ambient span). That makes `Booking`'s own `startsAt`/`endsAt` redundant: a timed booking has an Event that owns the time, and an untimed booking has no time at all. Keeping both invited the exact drift ADR-0047 §2's "one field, one owner" set out to avoid. So the two columns leave `Booking`; the linked Event is the only place a booking's time lives. (ADR-0018's "a hotel is one Booking with a range" is preserved — the range now lives on the hotel's Event, not the Booking.)

**2. A minimal `Place` entity; every `placeId` becomes a foreign key to it.** Today `placeId` is a raw Google-ID string with a denormalized name/address copied onto each entity (`Event.location`/`placeId`, `Booking.address`/`placeId`, `MaybeItem.placeId`), so the same airport is duplicated across bookings and nothing can enumerate "every place on this trip." A trip-scoped `Place` fixes both and is the registry the planned Map/Places work needs:

```
Place { id, tripId, googlePlaceId?, name, address?, lat?, lng?, createdAt, updatedAt, updatedBy }
```

`name` is required (display); `googlePlaceId?` is null for manually-typed places; `lat`/`lng` and later enrichment (hours, rating, photos) fill in when the Maps work lands. `Event.placeId`, `Booking.placeId`, and `MaybeItem.placeId` become **FK → Place**. Free-text fallbacks (`Event.location`, `Booking.address`) stay for places with no Google pick. `Place` is shared trip state → data plane → created/updated through `ChangeService.mutate()` like any entity (ADR-0019/0022), keyed by `tripId` (the row-level-auth invariant, ADR-0018).

**3. Transport bookings carry origin + destination as two Place FKs.** A flight/train has two endpoints, not one; today the mockups fake it in the title ("TLV → NRT"), which the Map/navigate features can't use. `Booking` gains `fromPlaceId?` and `toPlaceId?` (FK → Place), meaningful for transport types and null otherwise. The linked **Event's `placeId` points to the origin** (the departure airport/station is where "navigate to next" routes you when the flight is next). Terminals/gates/seats stay free-form in `Booking.details`. This is the minimal, additive slice of ADR-0037 §3's deferred "transport primitive" — timezone changes and multi-segment remain deferred; this only gives transport its two place-linked endpoints.

**4. `TripNote` is retired entirely.** ADR-0047 §6 moved WiFi off `TripNote` onto the hotel `Booking`, which was `TripNote`'s only reader. Narrowing `TripNoteCategory` to `note`-only (as 0047 said) would leave an entity with no reader and no writer — no screen shows trip-level notes. So `TripNote` and `TripNoteCategory` are dropped, not narrowed. If a trip-level "practical info" surface is ever wanted, it returns as its own entity with a real consumer.

**5. `kind` (hard/soft) stays user-selectable on a booking-backed Event.** ADR-0011 names "reservation code" as the _exemplar_ of hard, not a rule that everything with a code is hard. A dinner reservation has a confirmation number yet is genuinely skippable. A new booking-backed Event **defaults to `hard`** (the common case — a flight, a hotel), but the merged edit surface keeps the hard/soft toggle, so a soft-with-a-code booking is expressible. Linkage-to-a-booking is orthogonal to the commitment axis, the same way ADR-0038 kept `category` orthogonal to `kind`.

## Consequences

- **Migrations (greenfield — the Index/Booking UI is unbuilt, no production data):** drop `Booking.startsAt`/`endsAt`; add `Place` table; change `Event.placeId`/`Booking.placeId`/`MaybeItem.placeId` to FK → `Place`; add `Booking.fromPlaceId`/`toPlaceId`; drop `TripNote` + `TripNoteCategory`. `@waypoint/shared` mirrors all of it (non-negotiable rule 3) — `placeSchema`, FK fields on the create/update schemas, `notes`/`wifi` in `Booking.details` (from ADR-0047).
- **The Map/Places work is unblocked at the data layer.** It can enumerate/pin every trip place with one `Place` query, and cache Google enrichment on the `Place` row rather than re-fetching per reference. `navigate-to-next` has a real origin place to route to.
- **`ChangeService`/sync/undo need no special casing** — `Place` is a plain data-plane entity; the new FK fields flow through the existing write path (ADR-0019).
- **`Booking.details` stays the free-form bag** for the genuinely unstructured per-type bits (seat, gate, terminal, room, party size) plus ADR-0047's `notes`/`wifi`. Only cross-surface, queryable facts (times → Event, places → Place) get promoted to columns.
- **ADR-0038 is refined, not contradicted:** its `placeId` "kept separable for future enrichment" is exactly what `Place` realizes. Its `category` axis is untouched (Place carries no category for now — pin colour can derive from the referencing Event's category; revisit with Maps).
- `docs/architecture/data-model.md` gets **"Planned (ADR-0048)"** annotations (not a current-state rewrite) — the schema changes are decided but unbuilt, matching how that doc already carries ADR-0047's and ADR-0038's not-yet-implemented additions. It flips to current-state when the migration lands.

## Alternatives considered

- **Keep `Booking.startsAt`/`endsAt` as a read-only mirror of the Event.** Rejected: two copies of the same fact is the drift risk we're removing; a mirror needs sync logic for no gain.
- **Transport origin/destination in `Booking.details` JSON.** Rejected: place IDs in an unindexed blob can't be enumerated/joined, which defeats the Map feature that motivated capturing them.
- **Defer `Place` to the Maps work; use denormalized `fromName`/`fromPlaceId`/`toName`/`toPlaceId` columns now.** Rejected (the coupling call): we're adding place-bearing columns _this cycle_, so normalizing now avoids a guaranteed later migration of every `placeId` reference; a minimal `Place` is cheap and the denormalized pairs would be thrown away.
- **Global (cross-trip) `Place` dedup.** Rejected for now: trip-scoped keeps the "everything keyed by `tripId`" auth invariant and is enough at 5-user scale; cross-trip dedup is a later optimization, not a v1 need.
- **Narrow `TripNote` to `note`-only (ADR-0047 §6's wording).** Rejected: leaves a reader-less, writer-less entity; dropping it is the honest end state, re-introducible when a consumer exists.
- **Force booking-backed Events to `hard`.** Rejected: contradicts skippable-but-coded cases (a dinner reservation) and overloads the primitive; default-hard with an override covers both.
