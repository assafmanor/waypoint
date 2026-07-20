# CLAUDE.md — Backend (NestJS)

Supplements the root `CLAUDE.md` (read that first, plus the ADR(s) for your
domain via `docs/INDEX.md`'s router before an architectural change). This file
is about **which existing mechanism to reach for** before adding a new one.

## Look here before adding elsewhere

- **Any data-plane mutation** (creating/updating/deleting a `TripEvent`,
  `Booking`, `MaybeItem`, document, or place) → `ChangeService.mutate()` /
  `mutateMany()` (`src/sync/change.service.ts`). This is the single choke point:
  entity write + `Change` insert commit in one transaction, broadcast fires
  only after commit (ADR-0019). **Never** insert a `Change` row or call
  `SyncGateway.broadcast` from a domain service directly — that's the one hard
  boundary in this codebase, not a style preference. A new mutation that
  touches several entities at once (e.g. auto-creating an `Event` alongside its
  `Booking`) uses `mutateMany`'s ops array, in dependency order — don't hand-roll
  a second transaction wrapper for it.
- **A cross-service ownership/scope check** (does this `placeId`/`bookingId`
  actually belong to this trip?) → `src/common/trip-scope.util.ts`
  (`assertPlacesInTrip`, `assertBookingInTrip`). This exists because a
  service once trusted a client-supplied foreign-trip id unchecked (the bug
  backend-review B-06 fixed). A new service that accepts a same-shaped
  reference extends or calls this util — it does not re-implement its own
  inline `findFirst` + throw. If the new reference doesn't fit the existing
  shape, add a sibling function here, in the same file, not a copy buried in
  the service.
- **An env var read by more than one place** → name it once in
  `src/common/env.ts` and read it through that constant (or `requireEnv`),
  never `process.env['SOME_STRING']` inlined at the call site — a bracket typo
  there silently reads `undefined`. Boot-time requireds are enforced in
  `validate-config.ts`.
- **A server-side cache** → `src/documents/blob-cache.ts` is the template: a
  bounded in-memory LRU (evict-oldest-on-overflow) plus an optional slower
  persistent tier, both env-gated with a kill switch, invalidated by explicit
  eviction only (never a TTL guess) because the cached bytes are keyed by an
  immutable id. A second cache for a different resource follows this same
  two-tier/evict-on-invalidate shape rather than inventing a new caching
  strategy.
- **Request validation** → the shared zod schemas from `@waypoint/shared`
  through `ZodValidationPipe` (`src/common/zod-validation.pipe.ts`). **Not**
  class-validator/DTOs — that would be a second, divergent copy of the shapes
  `packages/shared` already owns.
- **Trip authorization** → `MembershipGuard`, per request, against
  `Membership` (404 on no membership) — apply it, don't re-check membership by
  hand inside a service.
- **A string a service throws or compares that means something specific**
  (an error code, an entity type, a change action, a WS message type) →
  the named constants in `@waypoint/shared/constants.ts`
  (`ERROR_CODE`/`ENTITY_TYPE`/`CHANGE_ACTION`/`WS_MESSAGE_TYPE`, ADR-0094/0095).
  Throw `ERROR_CODE.MOVE_INTO_PAST`, not `'MOVE_INTO_PAST'` — the frontend
  matches on the same symbol, and a typo in a bare string is a silent runtime
  mismatch instead of a compile error.

## Module shape

One module per domain (`auth`, `trips`, `events`, `bookings`, `documents`,
`maybe-items`, `places`) plus infra modules (`prisma` global, `sync`). A new
domain gets its own module — controller (validates via `ZodValidationPipe`) +
service (logic; `PrismaService` is the only DB access) + `*.module.ts` wiring
— rather than growing an existing unrelated module.

## Anti-patterns already found and fixed once (don't reintroduce)

- Writing a `Change` row or broadcasting over the gateway from inside a domain
  service instead of through `ChangeService` — breaks the atomic-write +
  broadcast-after-commit guarantee (ADR-0019).
- A service-local re-implementation of "does this id belong to this trip"
  instead of extending `trip-scope.util.ts` — this exact class of bug already
  shipped once (B-06) and was fixed once; a second copy can drift out of sync
  with the fix.
- A bare string literal standing in for an `ERROR_CODE`/`ENTITY_TYPE`/
  `CHANGE_ACTION`/`WS_MESSAGE_TYPE` member (ADR-0095) — always the constant.
- A raw `process.env.FOO` scattered across files instead of one name in
  `env.ts` — the fragility ADR intent behind `env.ts`'s existence.
- class-validator DTOs alongside the zod schemas — two sources of truth for
  the same shape is exactly what `packages/shared` exists to prevent.
- A manual DB edit instead of a Prisma migration.
- `"type": "module"` in `backend/package.json` — flips emit to ESM and breaks
  the Nest runtime (`NodeNext`/CommonJS is deliberate).

## Testing

Vitest. Unit-test services; the hard-event guard, ripple, LWW reconciliation,
`ChangeService` atomicity, and mode-derivation are must-test (root
`CLAUDE.md`/`conventions.md`). A new shared guard util (`trip-scope.util.ts`-
style) gets its own spec, not only indirect coverage through the services that
call it.
