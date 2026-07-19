# 0068 — Sync cursor (`Change.seq`) is a commit-consistent watermark

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Refines:** [0019](0019-sync-protocol.md) (monotonic change log, atomic write path, snapshot + catch-up) — promotes the "per-trip advisory lock, deferred" consequence to the implemented mechanism.
**Relates:** [0042](0042-shared-state-is-offline-syncable.md) (read-cache + outbox + catch-up), [0065](0065-app-scope-many-trips-small-groups.md) (multi-writer collaboration is a real case).

## Context

ADR-0019 made `Change.seq` (`BigInt @default(autoincrement())`, i.e. `BIGSERIAL`) the sync cursor: clients track `lastSeq`, gap-detect on `seq > lastSeq + 1`, and catch up with `GET /changes?sinceSeq`. It already flagged the hole in its own Consequences: **`seq` is allocated at row INSERT, not at COMMIT**, and all reads run at READ COMMITTED, so under concurrency a higher `seq` can become visible before a lower one commits. It judged this "near-impossible at ~5 writers/trip" and deferred the fix ("a per-trip advisory lock around the write").

The backend architecture review (2026-07-18, `docs/reviews/backend-architecture-review.md`, **B-01**, High / **CONFIRMED**) reproduced it and reframed the severity: this is the core collaboration loop, and a client can advance its cursor **past a change it never received and never self-heal** — no gap _below_ the cursor is ever re-examined. Two concrete losses:

1. **Snapshot skip (reproduced by the review):** `getSnapshot` read entity lists _first_ and `latestSeq` _last_ in one sequential transaction. A change committing between those reads makes `latestSeq` count a change whose entity row is absent from the same snapshot. The client sets `lastSeq` past it and never catches up.
2. **Catch-up skip:** a client that gap-detects on `seq=N+2` and runs `/changes` while `N+1` is still uncommitted receives only `N+2`, advances its cursor, and later discards the `N+1` broadcast as stale.

ADR-0065 removed the "~5 writers so it's near-impossible" comfort: Waypoint is a many-trip, many-user app and genuine simultaneous editing within a trip is a normal case, so "everyone converges to the same trip state" has to actually hold.

## Decision

Two independent, cheap fixes — both keep the existing `BIGSERIAL` cursor and need no schema change.

1. **Serialize writes per trip so `seq` order == commit order.** `ChangeService.mutate()` / `mutateMany()` take a per-trip Postgres **transaction advisory lock** (`pg_advisory_xact_lock(hashtext(tripId))`) as the first statement inside the write transaction, held until commit/rollback (`lockTrip` in `sync/change.service.ts`). Concurrent mutations of the same trip now queue instead of interleaving, so a lower `seq` is always committed before a higher `seq` is even allocated. Every app write already funnels through `ChangeService` (ADR-0019's choke point), so application-level serialization is sufficient — the lock is not a DB-level constraint on raw writes. Cross-trip key collisions (from `hashtext`) only ever serialize two unrelated trips briefly; different trips do not contend. The lock call is wrapped in a scanned subselect because the Prisma driver adapter cannot map the `void` return type directly.

2. **Snapshot reads `latestSeq` first, at RepeatableRead.** `getSnapshot` now reads `latestSeq` _before_ the entity lists and runs the whole read at `RepeatableRead` isolation, so all lists reflect one consistent instant and the cursor can only ever be stale-_low_ relative to the entities. A stale-low cursor is harmless — the client re-applies the extra change via `/changes` (idempotent). Combined with (1), a visible `latestSeq` guarantees every lower `seq` has already committed, so no entity the cursor counts is ever missing.

## Consequences

- The system can now be described as **eventually consistent** under concurrency (ADR-0019's Classification table can drop the B-01 caveat): a client reaches a state that is a contiguous committed prefix, never one permanently missing a change.
- Per-trip write throughput is now serial. At the documented scale (small groups per trip) this is a non-issue; different trips are unaffected.
- The advisory lock is **process-local to the database session**, so it survives a future move to multiple app instances (the lock lives in Postgres, not in app memory) — unlike the in-process WS channel manager. If `seq` allocation ever moves off `BIGSERIAL` (e.g. a per-trip counter), this lock is where that change would live.
- Regression test (`sync/change.service.spec.ts`): a slow writer holds the per-trip lock while a fast writer fires; the fast writer must commit _second_ and get the higher `seq`. Fails on the lock-less path (fast commits first with a lower `seq`), passes with the lock.

## Alternatives considered

- **Per-trip counter row (`UPDATE … RETURNING`) to allocate `seq` inside the txn:** also gives commit-order == seq-order, but changes `seq` semantics and requires a schema change + migration and a renumber. The advisory lock achieves the same ordering guarantee with no schema change. Kept as the noted upgrade path.
- **Snapshot at Serializable only, without serializing writes:** insufficient — a committed-later gap _below_ the max `seq` (the exact B-01 interleaving) is invisible to isolation level alone, because the gap is under the cursor, not a torn read. Ordering the writes is what closes it.
- **A commit-visibility lag / stable-high-water-mark computed from in-flight xids:** more moving parts than warranted; the advisory lock is simpler and exact.
