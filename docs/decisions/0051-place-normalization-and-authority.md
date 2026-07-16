# 0051 — Full Place normalization: one location model, and the linked-event place authority rule

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0048](0048-index-build-data-model-refinements.md) (revises §2's free-text fallbacks and §3's "Event.placeId points to origin"), [0047](0047-booking-event-linkage-and-notes.md) (the 1:1 it now enforces in the schema), [0038](0038-icons-and-canonical-category.md) (category derivation direction), [0003](0003-one-way-calendar-sync.md) (a deferred consequence)

## Context

ADR-0048 introduced `Place` and made every `placeId` an FK, but kept two things that, once the migration was actually built, reintroduced the "one field, one owner" drift ADR-0047 §2 set out to remove:

1. **Two ways to say _where_.** ADR-0048 §2 kept `Event.location` / `Booking.address` (free text) _alongside_ the new `placeId` FK "for places with no Google pick." An entity with both a free-text location and a `placeId` has no single source of truth for its place.
2. **A duplicated place on a linked event.** ADR-0048 §3 said a transport Event's `placeId` "points to the origin" — but the origin also lives on `Booking.fromPlaceId`. More broadly, once an Event is linked to a Booking, both could carry a place, and they could diverge.

Building the Index backend forced a resolution. This ADR records it.

## Decision

**1. Full Place normalization — location is expressed only via `Place`.** `Event.location` and `Booking.address` are **dropped**. Every location anywhere is a `Place` row. Free text becomes a **name-only** `Place` ("Place-lite": `name` set, `googlePlaceId`/`lat`/`lng` null) that the Google Places picker enriches later. One representation, no free-text/FK ambiguity. This revises ADR-0048 §2 (which kept the free-text fallbacks).

**2. Place authority: the booking owns the place when an event is linked; otherwise the event does.** A booking-backed Event carries **no** `placeId` of its own — its place is resolved from the booking (single-place types → `Booking.placeId`; transport → `Booking.fromPlaceId`/`toPlaceId`, with the map-pin / navigate-to-next target derived as the **origin**). An **unlinked** Event owns `Event.placeId`. This revises ADR-0048 §3: the linked Event does not _store_ the origin, it _derives_ it — so there is never a second copy to drift.

**3. The invariant is enforced, not just documented.** Whenever an Event's `bookingId` is set, its `placeId` is forced null (in `EventsService` create/update and in the auto-create-from-booking path). Attaching a booking to an already-placed event moves that place onto the booking before nulling it, so nothing is lost (link reconciliation).

**4. The 1:1 is enforced in the schema.** ADR-0047 §1 mandated Booking↔Event strict 1:1, but the schema modelled it one-to-many. `Event.bookingId` gets a **`@unique`** constraint (nullable, so any number of _unlinked_ events is fine; at most one event per booking).

**5. Category derivation follows the icon, not the type.** Per ADR-0038, an auto-created event's `category` comes from the form's chosen icon; `BOOKING_TYPE_TO_CATEGORY` is only a last-resort default when no icon/category was supplied — not the primary source.

## Consequences

- **Schema (built this cycle, migration `index_data_model_adr0048`):** drop `Event.location`, `Booking.address`; `@unique` on `Event.bookingId`; everything else as ADR-0048 stated. `data-model.md` flips from "Planned (ADR-0048)" to current-state.
- **Reads join to resolve a place.** "Where is this event?" is `event.bookingId ? placeFrom(booking) : event.placeId` — a small resolver (backend + `frontend/src/lib/places.ts`) rather than a bare column read. Acceptable at this scale; the snapshot already ships bookings + places so the client resolves locally.
- **Google Calendar one-way sync (ADR-0003, not yet built) must resolve place via booking/Place** when it pushes a linked event — there is no `Event.location` to copy. Captured in the backlog so it isn't a surprise when that feature lands.
- **The manual EventForm's free-text location input is removed** for now: authoring a place needs the Places picker (deferred with the Maps work) or the Index/booking-form slice. Existing events still display their place; a new manual event gets a place once the picker ships. Deliberately not building a throwaway name-only-Place authoring flow the picker will replace.

## Accepted limitations

- **No Place dedup pre-picker.** Without `googlePlaceId`, the same typed name creates a new `Place` each time; name-only dedup is too fuzzy to do safely (two different "Bar"s would merge). Real dedup by `googlePlaceId` arrives with the picker.
- **Orphaned Places are left** (edited-away / delete-both). No GC yet — cheap at 5-user scale, and the Map may reuse them.

## Alternatives considered

- **Keep `location`/`address` as a denormalized display cache of `Place.name`.** Rejected: reintroduces the drift (a stale cached name), the exact thing normalization removes.
- **Transport-only Place now, defer event/maybe-item normalization to Maps.** Considered and rejected in favour of normalizing everything this cycle (the user's call): one coherent model now, no second migration, at the cost of pulling minimal frontend place-resolution into this slice.
- **Event is the place authority even when linked (booking stores only the second transport endpoint).** Rejected: asymmetric ("booking holds destination but not origin") and less intuitive than "a reservation owns its place(s)."
