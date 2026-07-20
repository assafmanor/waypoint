# Session 50 — Sync badge on booking-seeded events

**Date:** 2026-07-20
**Relates:** [0093](../decisions/0093-offline-booking-linked-event-coherence.md) (the booking→event mirror), [0080](../decisions/0080-per-entity-sync-status.md) (the `SyncStatus` model this reads).

## Bug

An event created offline **from a booking seed** (not directly from the events page) showed no sync badge while its write was queued — it looked synced on the timeline.

## Cause

`useSyncStatus(id)` keys off the outbox **pending index**, which counted one id per op (`outboxOpEntityId`). A directly-created event has its own `create` op; a booking-seeded event has **no op of its own** — it rides the `createBooking` op's `event` seed, so its id was never in the index. (Places are _not_ affected: each is a first-class `createPlace` op with its own id — op-less side effects are the distinction.)

## Fix (`lib/outbox.ts`)

- `outboxOpSideEffectIds(op)` — the one generic declaration of entities an op materializes _without their own op_ (today: a timed booking's linked event, id on `input.event.id`). A future op with side effects adds one case here and needs no call-site change.
- `outboxOpEntityIds(op)` = primary + side effects. The pending index and the failed lookup key off this, so a booking-seeded event shows **pending** while queued and **failed** if the booking write is rejected.
- `bumpPendingForOp(op, delta)` — extracted the repeated "bump the index for every id an op touches" loop; used by enqueue / flush / prime.

## Verification

- `pnpm --filter @waypoint/frontend test` — 571 pass (added: `outboxOpEntityIds` includes the linked event; a booking-seeded event reports pending + survives a re-prime; a failed booking write marks its event failed).
- `typecheck` + `build` + `format` clean; `lint` 0 errors.

## Scope / not touched

Frontend `lib/outbox.ts` + tests. No model/backend/schema change; the registries and appliers (ADR-0094) are untouched — this only widens which ids the pending/failed lookup covers.
