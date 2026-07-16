# Realtime, Optimistic Sync & Offline

**Status:** ACCEPTED (T-025; mechanism in ADR-0019). This is the riskiest area to improvise, so it's specified up front. Scope: ~5 members per trip; simplicity over cleverness (ADR-0012).

## Three problems, one design

1. **Realtime:** when one member changes something, the others see it quickly.
2. **Optimistic + undo:** edits feel instant and are reversible.
3. **Offline:** the index/documents/today read with no connectivity; writes made offline sync later.

The unifying primitive is the **`Change`** record. Every **data-plane** mutation produces one; it drives realtime fan-out, the change-feed UI, undo, and offline catch-up. (Scope: the data plane is the collaborative timeline — events, bookings, maybe-shelf, notes, documents. The **control plane** — users, trips, memberships — is plain authenticated CRUD and does **not** produce `Change` records; ADR-0022. It's still in the snapshot, just refreshed rather than streamed.)

**Two invariants underpin everything below (ADR-0019):**

1. **Atomic write.** The entity write and its `Change` insert commit in **one transaction** (`prisma.$transaction`), through a single shared `ChangeService.mutate()`; the WS broadcast happens **only after commit**. A mutation is never logged separately or half-applied.
2. **Monotonic cursor.** `Change.seq` is a strictly-increasing `BigInt`. All catch-up and gap-detection cursor on `seq`, never on timestamps.

## Realtime channel

- Transport: **WebSocket** at `WS /trips/:tripId/stream`, authenticated with the session JWT; server verifies membership before subscribing.
- On the server, an in-process **per-trip channel manager** keeps the set of connected sockets for each `tripId` and broadcasts to them. Fine for this scale; swap for Postgres `LISTEN/NOTIFY` or a bus only if we ever run multiple API instances.

### Message shapes (server → client)

```jsonc
{ "type": "change", "seq": 412, "change": { /* Change record, incl. its seq */ } }
{ "type": "presence", "members": [{ "userId": "...", "connected": true }] }
{ "type": "hello", "serverTime": "2026-07-09T18:00:00Z", "latestSeq": 412 }
```

The client tracks `lastSeq`. If an arriving `change.seq > lastSeq + 1` (a gap), or `hello.latestSeq > lastSeq` after reconnect, it runs catch-up (below). This gap-detection is what makes "WS receives, REST writes" safe against a dropped frame.

### Client → server

```jsonc
{ "type": "subscribe", "tripId": "..." }   // implicit from the URL; explicit re-subscribe after reconnect
{ "type": "ping" }
```

Writes go over **REST**, not the socket. The socket is for receiving. (Simpler auth, retries, and offline queueing than command-over-socket.) The WS upgrade authenticates via the session cookie (ADR-0020).

## Optimistic updates + undo

1. User acts (e.g. move a soft event).
2. Client applies the change **locally immediately** and shows it.
3. Client sends the REST mutation.
4. On success, server returns the canonical entity + emits a `Change`; the client reconciles (usually a no-op) and other members receive the broadcast.
5. On failure, the client rolls back the local change and toasts.

**Undo (ADR-0019):** scoped to **your own last action** (client-local, via the toast) — no shared/global undo stack, no redo. Undo **appends a new inverse `Change`** (it never rewrites history, keeping `seq` monotonic): for `move`/`update`, PATCH back to `before`; for `create`, delete; for `delete`, re-create from the `before` snapshot (client ids keep the same id, so references survive). Because hard events are guarded, undo never silently resurrects a conflicting commitment.

## Conflict resolution (ADR-0012 / ADR-0019)

- **Soft events:** **row-level, server-authoritative last-writer-wins** — the server stamps `updatedAt = now()`; whichever write commits last wins the whole row. (Not field-level: that needs a per-field clock, i.e. a CRDT, which we don't build.) Two people editing the same block → later commit wins; both actions appear in the change-feed; either is undoable. Concurrent edits to _different_ fields can clobber — accepted at this scale; upgrade path is an optimistic-concurrency `version` column.
- **Hard events:** protected — mutations require `confirm` and are never auto-moved or rippled, so the churny conflict surface is only soft events.
- No CRDT/OT in v1. The `Change` log (`before`/`after`, `updatedBy`, `updatedAt`) is enough to upgrade a specific entity to CRDT-backed later if LWW ever hurts.

## Ripple (suggestion only)

When a soft event moves — earlier or later — the server may return a `rippleSuggestion` describing contiguous/overlapping **soft** events it _could_ shift the same way, with new times. The client shows the amber ripple bar; nothing moves until the user says yes. The walk stops at the first hard anchor in that direction, at the first event that isn't actually overlapping (nothing to resolve), or — backward only — at the first event that's already started (pulling it earlier would rewrite something that's already happened).

Ripple is a suggestion mechanism for soft events, not a conflict-detection mechanism. Whether a nudge (rippled or not) leaves a soft event overlapping a hard anchor is tracked separately: any soft event whose current span overlaps a hard event's span is flagged wherever it renders (Day view row, Home's now-card), independent of the ripple bar and of how the overlap arose — this keeps the guard on hard events (ADR-0011) visible without ever blocking or requiring confirmation on the soft side.

A quick nudge (the `+`/`−` stepper, as opposed to an explicit `date` change) is also guarded against two invariants: it can't move an event to start in the past, and it can't cross out of the event's assigned day — reassigning an event to a different day is a Plan-mode concern (an explicit `date`), not something a ±30-minute tap should do silently. Both reject with a distinct error code (`MOVE_INTO_PAST`, `MOVE_CROSSES_DAY`) surfaced as a toast.

## Offline

### Read (must work with zero connectivity)

- The client mirrors the **whole trip** (events, bookings, documents metadata, maybe-shelf, members, practical) into **IndexedDB (Dexie)** on every successful snapshot/fetch/broadcast. A trip is a few hundred small rows — no per-row caching flags (ADR-0018).
- The **trip list** (`GET /trips`) is mirrored too. It has no per-trip snapshot to fall back on, so without this an offline `GET /trips` failure collapses the all-trips view to empty and — on a cold reopen — bounces the boot trip-resolution to ZeroState (a "lost trip"). `loadTripList()` fetches when online (mirroring the result) and reads the cached copy when the fetch fails.
- **Identity** (the last successful `GET /me`) is cached in `localStorage` so a cold reopen with no connectivity renders signed-in instead of bouncing to `/login` (the boot `refresh` + `/me` both fail offline). This is **identity, not a credential** — the access token stays in memory only (ADR-0020); a genuine auth rejection (a 401 while online) still drops to anon and clears the cached identity.
- The service worker (Workbox) caches the app shell and the document blobs.
- Opening the app offline renders straight from IndexedDB.

### Write offline

- Mutations made offline are appended to an ordered local **outbox** (IndexedDB) with the entity's **client-generated id** (ADR-0018) and the optimistic local state.
- A queued mutation is also **written through to the Dexie read cache** at enqueue time, so a cold reopen while still offline shows what you just did (an event you added, a trip you renamed, a shelf idea) rather than the pre-edit snapshot. Online writes don't need this — the server's own WS echo runs the cache-apply for them.
- All **shared** state routes through the outbox — the timeline, the **maybe-shelf**, and trip settings/roster (ADR-0039/0042). Server-only actions that have no local entity to reconcile — **joining** a trip, **creating** one, generating an invite — are the exception: they can't be queued and instead disable their controls offline with a note (ADR-0042).
- On reconnect, the client flushes the outbox **sequentially (FIFO)**, halting and retrying on the first hard error. Because the client owns the id, there is **no temp-id→real-id swap**, retries are idempotent (re-POST → unique violation → already-applied), and an offline-created entity can reference another offline-created one immediately.
- The flush is **device-wide** (`flushAllOutbox`, ADR-0042): on `online` (and once on mount, to drain a queue left from a prior session) it flushes **every** trip's queue, not just whichever trip is mounted — so a write made offline syncs the moment connectivity returns, even from the all-trips list or zero-state. Concurrent flushes of the same trip are coalesced so the mounted trip's own reconnect (flush + catch-up + resubscribe) never double-POSTs. (This is flush-while-open; waking a _closed_ app — "background sync push" — is still deferred, below.)
- Conflicts on flush resolve by the same LWW rule; the change-feed reflects the final state; anything surprising is undoable.

### Bootstrap & catch-up

- **Initial load / deep desync:** `GET /trips/:tripId/snapshot` returns the full current trip state **plus `latestSeq`**, read in one transaction (a coherent baseline with one cursor). Sets `lastSeq`.
- **Reconnect within the log:** `GET /trips/:tripId/changes?sinceSeq=<lastSeq>` replays anything missed, then re-subscribe to the socket. (Timestamp cursors are lossy on ms collisions — always cursor on `seq`.)

## What we explicitly do NOT build in v1

Peer-to-peer sync, CRDTs, background sync push, and multi-instance realtime fan-out. All deferred; the design leaves the door open for each.
