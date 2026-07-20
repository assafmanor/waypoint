# Session 52 — String discriminants → named constants (FE + BE)

**Date:** 2026-07-20
**Decision:** [ADR-0095](../decisions/0095-named-constants-for-string-discriminants.md).
**Follows:** session 51 (the `OUTBOX_VERB` conversion that prompted the audit).

## What

After converting the outbox verbs, audited FE + BE for the same smell —
discriminants spelled as bare literals across call sites — and converted the
survivors. Four sets, placed by consumer (ADR-0095):

**Cross-layer → `@waypoint/shared/constants.ts`:**

- `ERROR_CODE` — backend exception filter (`all-exceptions.filter.ts` status +
  Prisma maps) and every service throw (`events`/`bookings`/`trips`/`documents`/
  `health`/`zod-validation.pipe`) reference it; frontend `ApiError` predicates in
  `lib/api.ts` and `QUIET_DROP_CODES` in `lib/outbox.ts` match on it. Deleted the
  hand-synced `export const MOVE_INTO_PAST = '…'` aliases.
- `WS_MESSAGE_TYPE` — `sync.gateway.ts` (BE) and `lib/ws.ts` (FE) both
  discriminate on it; the two `ServerMessage` unions stay separate (server `hello`
  carries `serverTime`, client's doesn't).

**Frontend-only → co-located:**

- `TRIP_ACTION` (in `state/trip-state.tsx`, with the `Action` union) — 17
  discriminants, ~94 uses across the reducer + `verbs.ts` dispatches.
- `SYNC_STATE` (in `lib/outbox.ts`, with `SyncState`) — consumed by
  `EntitySyncBadge`; `SyncBadge` already keyed by value, untouched.
- `HTTP_METHOD` (in `lib/api.ts`, with the request helpers).

## Deliberately left as literals

- Test mocks that stand in for the server's wire bytes (`code: 'MOVE_INTO_PAST'`
  in a stubbed `Response`) — they assert the contract under test.
- `t.sync.verb` i18n keys — translation keys, not logic discriminants.
- `CreateTrip`'s local `InviteState` `'pending'`/`'ready'`/`'failed'` — unrelated
  to `SyncState`, not conflated.

## Verification

- Shared: `build` + 33 tests. Backend: `nest build` clean, `lint` 0 errors,
  DB-free unit specs (exception filter, health) pass — the DB-backed specs need
  Postgres (no Docker daemon in this sandbox) and were not run; changes are
  value-preserving so wire assertions are unaffected.
- Frontend: `typecheck` clean, `test` 571 pass, `lint` 0 errors. `format` clean.

## Scope / not touched

`packages/shared` (2 new consts), backend throw sites + filter + gateway,
frontend `api.ts`/`outbox.ts`/`ws.ts`/`trip-state.tsx`/`EntitySyncBadge.tsx` +
the state/api/outbox/sync-review tests. No schema, migration, or runtime-behaviour
change — every substituted value equals the literal it replaced.
