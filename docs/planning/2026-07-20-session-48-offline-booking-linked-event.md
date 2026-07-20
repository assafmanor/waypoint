# Session 48 — Offline booking → linked event coherence

**Date:** 2026-07-20
**Branch:** `claude/sync-badge-cloud-glyphs-uc5d32`
**ADR:** [0093](../decisions/0093-offline-booking-linked-event-coherence.md)

## What prompted it

Reported after the ADR-0092 sync work: creating a **restaurant booking offline with a time** didn't connect to an event and the booking showed no time; both appeared only after coming back online. The maintainer flagged it likely affects other cases too.

## Root cause

A timed booking's linked itinerary event is **server-derived** from the `event` seed and delivered via the WS echo (ADR-0047 §1). Offline there is no echo, and neither optimistic path filled the gap:

- `trip-state.createBooking`/`updateBooking` added only the booking, never the seeded event.
- `applyOutboxOpToCache` (createBooking/updateBooking) **explicitly discarded** the seed (`const { event: _seed, ...fields }` with a `// deferred` note), so even a cold reopen while offline showed a scheduleless booking.

The event's id was server-assigned, so the client couldn't safely mirror one that would reconcile on flush.

## What changed

The first cut used a bespoke `UPSERT_BOOKING_EVENT` reducer action + a `putBookingSeedEvent` cache helper. On review (see below) that was reworked into one generic sync path.

- **`packages/shared/src/booking-event.ts`** (new) — `bookingEventFields(booking, seed)`: the booking→event mapping (title from booking, category default from type, kind default hard, schedule pass-through, `bookingId`), representation-agnostic. Called by **both** the server's `eventDataFromBooking` and the client's `eventFromBookingSeed`, so they can't diverge. (`backend/src/bookings/bookings.service.ts` now consumes it.)
- **`lib/booking-edit.ts`** — `eventFromBookingSeed` builds the client `TripEvent` around `bookingEventFields` (adds id/status/sortOrder/source/timestamps).
- **`ui/BookingSheet.tsx`** — `save` stamps the `event` seed with a stable id: `linkedEvent?.id` on edit, a fresh `crypto.randomUUID()` otherwise. The backend already honors `input.event.id`, so the flush upserts under it (idempotent, ADR-0018).
- **`lib/outbox-effects.ts`** (new) — `bookingLinkedEventChange(booking, seed, ctx, mode)`: emits the SAME `Change` the server would broadcast for the linked event (`create` = full event, `update` = schedule fields only). The one place a write's derived entities are declared.
- **`state/trip-state.tsx`** — hoisted `applyEntityChange(change)` (extracted from the WS `applyRemoteChange`): the ONE in-memory + cache applier. `createBooking`/`updateBooking` feed the synthetic `Change` through it on the **queued** path. Removed `UPSERT_BOOKING_EVENT`.
- **`lib/cache.ts`** — dropped `putBookingSeedEvent`; the linked event's cache write now rides `applyChangeToCache` via `applyEntityChange` (same as a WS echo).

Online is unchanged: the WS echo delivers the event a beat later, and on reconnect the flush + echo reconcile the optimistic event in place (same id → no duplicate).

## Why one generic path (the review correction)

The bespoke first cut added a **fifth** parallel offline handler alongside the event reducer, the control-list, the cache mirror, and the WS echo. The maintainer asked for one mechanism. The insight: the online WS echo already funnels every change through generic appliers (`applyChangeToCache` for the cache; `applyRemoteChange`'s per-type fan-out for memory). So the offline optimistic path emits the same `Change` and reuses those exact appliers — no parallel handler, and a future server-derived entity is just one more entry in `bookingLinkedEventChange`. Status preservation falls out for free: an `update` change omits `status`, so the appliers' merge keeps a settled event settled.

## Why client-owned ids

The clean reconcile hinges on the client and server using the **same** event id. A temp client id swapped on echo would leave a duplicate to match by `bookingId` — fragile. `bookingEventSeedSchema.id` was already optional and honored server-side, so the client just always supplies it now.

## Verification

- `pnpm --filter @waypoint/frontend test` — 562 pass (new: `bookingEventFields` + `eventFromBookingSeed` derivation parity; `bookingLinkedEventChange` create/update shape; `REMOTE_EVENT_CHANGE` partial-update status-preservation).
- `typecheck` + `build` + `format` clean; frontend `lint` 0 errors. Backend `typecheck` clean (after `prisma generate`); backend unit tests need a DB (CI).
- Reasoned through the reconcile: queued create/edit → synthetic `Change` through the shared appliers (cache + memory) → reconnect flush upserts the same id → WS echo patches in place. No duplicate; status preserved on edit.

## Scope / not touched

Frontend + shared + a backend refactor (consume the shared derivation; no contract/schema change — the seed id field already existed and was honored). Online behavior unchanged. The done-✓ and sync-marker work from ADR-0091/0092 untouched.

## Follow-ups

- `eventFromBookingSeed` duplicates the server's `eventDataFromBooking` derivation on the client; if that server rule changes, move both together (divergence risk).
- Instant online optimism (mirror before the echo) is deferred — needs an error-rollback path for a failed create, no real gain while the echo is near-instant.
