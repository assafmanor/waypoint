# ADR-0095: Named constants for string discriminants (cross-layer in shared, local co-located)

**Status:** Accepted
**Date:** 2026-07-20
**Relates:** ADR-0094 (`ENTITY_TYPE`/`CHANGE_ACTION`, the pattern this generalizes), the api-contract error envelope (§14), sync-and-offline.md (the realtime channel).

## Context

Several string sets were discriminants — a value branched on across many call
sites — yet spelled as bare literals rather than named constants. A typo
(`'setStstus'`, `'PSOT'`) compiled clean and failed silently at runtime, and a
rename had to be chased by hand across files (and, for two of them, across the
FE/BE boundary). ADR-0094 had already done this for `ENTITY_TYPE`/`CHANGE_ACTION`;
this ADR states the general rule and applies it to the rest.

The outbox verbs were the first to be converted (a preceding change added
`OUTBOX_VERB`). Auditing for siblings surfaced: API **error codes** (backend
threw raw strings; the frontend re-declared a subset as loose consts — same wire
contract, two hand-synced copies), **WebSocket message types** (`hello`/`change`/
`presence`/`ping`/`pong` declared independently on both ends of the socket), the
reducer **action types** (~17 discriminants, ~94 uses), the per-entity **sync
state**, and the api client's **HTTP methods**.

## Decision

String discriminants are declared once as a `{ NAME: 'value' } as const` object
with a derived union type, and referenced by symbol everywhere (union arms via
`typeof X.MEMBER`, `switch`/`===` via the value). Placement follows the consumer:

- **Cross-layer → `@waypoint/shared/constants.ts`.** A vocabulary both the
  backend and frontend key off is a shared contract:
  - `ERROR_CODE` — the exception filter's status/Prisma mapping + every service
    throw reference it; the frontend `ApiError` predicates (`isMoveIntoPastError`
    …) and the outbox `QUIET_DROP_CODES` match on it. The bare `export const
MOVE_INTO_PAST = '…'` aliases in `lib/api.ts` are gone.
  - `WS_MESSAGE_TYPE` — the two `ServerMessage` unions stay separate (their
    payload shapes genuinely differ: the server's `hello` carries `serverTime`),
    but both discriminate on the one shared vocabulary, so a rename can't drift
    the ends of the wire apart.
- **Frontend-only → co-located with the type it feeds**, not lifted into shared:
  - `OUTBOX_VERB` (with `OutboxOp`) — the outbox is the client's offline queue;
    the server never sees a verb (each maps to a REST call in `runOp`).
  - `TRIP_ACTION` (with the reducer `Action` union in `state/trip-state.tsx`).
  - `SYNC_STATE` (with `SyncState` in `lib/outbox.ts`).
  - `HTTP_METHOD` (with the request helpers in `lib/api.ts`).

## Consequences

- One source of truth per discriminant; a typo is now a compile error, and the
  exhaustive `switch`es the compiler already enforces stay the safety net (the
  repetition of members across union arms + case labels is the discriminated-union
  pattern, identical to how `ENTITY_TYPE` is used — not string duplication).
- The FE/BE error and realtime contracts are enforced from one place; the backend
  already depended on `@waypoint/shared`, so no new coupling.
- **Not** moved to shared: the frontend-only sets, deliberately — shared is the
  source of truth for entity **shapes**, not client queue/reducer internals.
- Test mocks that stand in for the server's wire bytes (`code: 'MOVE_INTO_PAST'`
  in a stubbed `Response`) keep literals — they assert the contract under test,
  independent of the app's constant. Client-constructed values use the constant.
- Doc-only follow-up possible: `t.sync.verb` stays keyed by the wire strings
  (translation keys, `Record<string, string>`), unaffected.
