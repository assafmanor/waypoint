# 0093 — A booking's linked event is coherent offline

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Relates:** [0047](0047-booking-event-linkage-and-notes.md) (the booking + auto-created linked event), [0048](0048-index-build-data-model-refinements.md) (a linked event's place comes from the booking), [0042](0042-shared-state-is-offline-syncable.md) (the outbox + read-cache mirror this completes), [0018](0018-timeline-data-model-shape.md) (client-generated ids that make the flush idempotent), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (a linked event's title mirrors the booking).

## Context

Saving a timed booking auto-creates a linked itinerary event (ADR-0047 §1): the client sends an `event` seed, the **server** derives the event (title from the booking, category from its type, `bookingId` link) and returns it via the WS echo. That round-trip is fine online, but **offline it left the booking incoherent**: the optimistic booking appeared with no schedule and nothing landed on the timeline, because

- the optimistic write path (`trip-state.createBooking`) only added the booking, never the seeded event; and
- the read-cache mirror (`applyOutboxOpToCache`) **explicitly discarded** the `event` seed (a `// deferred` note), so even a cold reopen while offline showed a scheduleless booking.

The time and the timeline entry only appeared after reconnect flushed the outbox and the server's echo delivered the event — exactly the "did my change save?" doubt the offline-first model exists to remove (principle 5). The bug reproduced on any timed booking created offline (restaurant, and every other type).

The blocker was identity: the event's id was server-assigned, so the client couldn't mirror an event that would reconcile with the server's on flush without duplicating it.

## Decision

**The client owns the linked event's id, derives it from one shared rule, and mirrors it offline through the same change-appliers a live WS echo uses — one sync path, no parallel handler.**

1. **Stable seed id (client-generated).** `BookingSheet.save` stamps the `event` seed with an id: the existing linked event's on edit, a fresh `crypto.randomUUID()` otherwise. The seed id was already an optional field the backend honors (`input.event.id ?? randomUUID()`), so no contract change — the client just always supplies it now (ADR-0018 idempotency: the flush POST upserts that id, and the WS echo carries the same one).

2. **One derivation, in `@waypoint/shared`.** `bookingEventFields(booking, seed)` (`packages/shared/src/booking-event.ts`) is the single source of the booking→event mapping — title from the booking, category defaulting to the type's, `kind` defaulting to hard, `bookingId` set (a linked event's place comes from the booking, ADR-0048, so it carries none). **Both** the server's `eventDataFromBooking` and the client's `eventFromBookingSeed` call it, so they **cannot diverge** (representation-agnostic: the server adapts to Prisma `Date`s, the client to a `TripEvent`).

3. **One offline sync applier — the same as the WS echo.** An offline write's derived entity is emitted as the **same `Change` the server would broadcast** (`bookingLinkedEventChange` in `lib/outbox-effects.ts`, the single place a write's derived entities are declared) and run through the **existing** appliers: `applyChangeToCache` (cache, already all entity types) and a hoisted in-memory `applyEntityChange` (extracted from the WS `applyRemoteChange` — event reducer + trip/roster/bookings/places/documents fan-out). So offline optimism and online sync share **one** path; there is no bespoke reducer action or cache helper for the linked event. On `create` the change carries the full event; on `update` only the seed's schedule fields, so a merge **preserves an existing event's status + sortOrder** (matching the server's `eventUpdateFromSeed`). Only the queued path emits it (online, the echo delivers it); same id → the echo reconciles it in place on flush, no duplicate.

## Consequences

- A timed booking created or edited offline shows its schedule and appears on the timeline **immediately**, survives a cold reopen, and reconciles cleanly on reconnect — no phantom, no duplicate.
- **The booking→event derivation lives once, in shared** — the client mirror can't drift from what the server persists.
- **Offline optimism reuses the online change-appliers.** The bespoke `UPSERT_BOOKING_EVENT` reducer action and `putBookingSeedEvent` cache helper are gone; a future server-derived entity (a booking's document, say) is one entry in `bookingLinkedEventChange`'s module, applied through the appliers everything else already uses — not a fifth parallel handler.

## Alternatives considered

- **Keep deferring to the WS echo (status quo).** Rejected: it's the reported bug — offline, there is no echo until reconnect, so the booking reads as unsaved.
- **A client-only placeholder event with a temp id, swapped on echo.** Rejected: the echo arrives with a _different_ (server) id, leaving a duplicate to reconcile by matching on `bookingId` — fragile. Client-owned ids make the flush idempotent and the reconcile a no-op.
- **A bespoke reducer action + cache helper for the linked event** (the first cut). Rejected on review: it added a parallel offline handler alongside the reducer / control-list / cache / WS paths. Emitting a synthetic `Change` through the shared appliers folds it into the one path.
- **Mirror optimistically online too (instant, before the echo).** Deferred: online the echo is near-instant and the current path works; always-mirroring would add an error-rollback path for no real gain. The queued-only mirror needs none — a queued write can't fail synchronously.
