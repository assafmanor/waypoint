# 0019 — Sync protocol: monotonic change log, atomic write path, snapshot + catch-up

**Status:** Accepted
**Date:** 2026-07-10
**Refines:** ADR-0012 (LWW + undo) — same stance, now with a correct mechanism.

## Context

`sync-and-offline.md` (from planning) specified realtime + optimistic + offline around the `Change` record, but had two correctness holes and one impossible claim: it cursored catch-up on **timestamps** (ms collisions drop/duplicate changes), it did not require the entity write and `Change` insert to be **atomic** (a crash between them permanently desyncs every client), and it described **"field-level" LWW with a single `updatedAt`** — which cannot be implemented (field-level needs a timestamp per field, i.e. a CRDT, which ADR-0012 rejects). Reviewed in T-025 CP2.

## Decision

1. **`Change.seq BigInt @default(autoincrement())`** — a strictly-increasing sequence. Catch-up is `GET /trips/:id/changes?sinceSeq=<n>`, not `?since=<timestamp>`. Every realtime `change` message carries its `seq`; the client tracks `lastSeq` and, on a gap (`seq > lastSeq + 1`), triggers catch-up. This gap-detection is what makes "WS receives, REST writes" actually safe against a dropped frame.

2. **Atomic mutation + change, via one choke point.** Every shared-state mutation runs `prisma.$transaction([ applyEntityWrite, insertChange ])` — the `Change` (and its `seq`) commit in the same transaction as the entity. The WS **broadcast happens only after commit**, never inside the transaction. This is enforced by a single shared `ChangeService.mutate({ tripId, actorUserId, entityType, entityId, action, before, after, apply })`; domain services never write `Change` or touch the gateway directly.

3. **Snapshot bootstrap.** `GET /trips/:id/snapshot` returns the full current trip state **plus `latestSeq`, read in one transaction** — a coherent baseline with one unambiguous cursor. It is both the initial-load path and the "offline past the log" recovery path. (Separate per-collection GETs give a torn snapshot with no coherent seq.)

4. **Row-level, server-authoritative last-commit-wins.** The server stamps `updatedAt = now()`; whichever mutation commits last wins the whole row. No client timestamps (no clock-skew surface), no per-field metadata. Concurrent edits to _different_ fields of the same row can clobber — the change-feed shows both and either is undoable, exactly ADR-0012's "awareness over locking". Upgrade path if it ever hurts: a `version Int` for optimistic concurrency — deferred.

5. **Undo = a new inverse `Change`.** Undo appends a new `Change` (keeps the log append-only and `seq` monotonic); it never rewrites history. `create`→delete, `delete`→re-create from the `before` snapshot (client ids keep the same id so references survive), `update`/`move`→restore `before`. **Scope: your own last action only** — client-local, via the toast. No shared/global undo stack, no redo.

6. **Echo dedup & physical deletes.** A writer receiving its own broadcast applies it only if `seq > lastSeq`, reconciling by entity id (a no-op confirmation). Deletes are physical; the `Change.before` snapshot is the recovery substrate — no `deletedAt` flag polluting queries.

7. **Offline outbox = ordered FIFO**, flushed sequentially, halt-and-retry on the first hard error. Client ids (ADR-0018) make retries idempotent and let an offline-created entity reference another offline-created one immediately.

## Consequences

- `ChangeService` + the WS gateway live in a core **SyncModule** that every mutating module depends on — so it is built **before** the first CRUD module, not after.
- Known bounded wrinkle: under concurrent transactions, commit order can differ from `seq` assignment order, so a cursor could theoretically skip a not-yet-committed smaller `seq`. Near-impossible at ~5 writers/trip; fix is a per-trip advisory lock around the write — noted, deferred.
- No CRDT/OT in v1; the `Change` log keeps that upgrade open per-entity.

## Alternatives considered

- **Timestamp cursor:** rejected — ms collisions make it lossy.
- **Field-level LWW:** rejected — needs per-field clocks (a CRDT); out of scope per ADR-0012.
- **Broadcast inside the transaction / write Change in a separate step:** rejected — both break the "logged exactly once, atomically" guarantee.
