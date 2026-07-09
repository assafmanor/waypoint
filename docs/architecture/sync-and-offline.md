# Realtime, Optimistic Sync & Offline

**Status:** PROPOSED (for review). This is the riskiest area to improvise, so it's specified up front. Scope: ~5 members per trip; simplicity over cleverness (ADR-0012).

## Three problems, one design

1. **Realtime:** when one member changes something, the others see it quickly.
2. **Optimistic + undo:** edits feel instant and are reversible.
3. **Offline:** the index/documents/today read with no connectivity; writes made offline sync later.

The unifying primitive is the **`Change`** record. Every shared-state mutation produces one; it drives realtime fan-out, the change-feed UI, undo, and offline catch-up.

## Realtime channel

- Transport: **WebSocket** at `WS /trips/:tripId/stream`, authenticated with the session JWT; server verifies membership before subscribing.
- On the server, an in-process **per-trip channel manager** keeps the set of connected sockets for each `tripId` and broadcasts to them. Fine for this scale; swap for Postgres `LISTEN/NOTIFY` or a bus only if we ever run multiple API instances.

### Message shapes (server → client)
```jsonc
{ "type": "change", "change": { /* Change record */ } }
{ "type": "presence", "members": [{ "userId": "...", "connected": true }] }
{ "type": "hello", "serverTime": "2026-07-09T18:00:00Z" }
```

### Client → server
```jsonc
{ "type": "subscribe", "tripId": "..." }   // implicit from the URL; explicit re-subscribe after reconnect
{ "type": "ping" }
```
Writes go over **REST**, not the socket. The socket is for receiving. (Simpler auth, retries, and offline queueing than command-over-socket.)

## Optimistic updates + undo

1. User acts (e.g. move a soft event).
2. Client applies the change **locally immediately** and shows it.
3. Client sends the REST mutation.
4. On success, server returns the canonical entity + emits a `Change`; the client reconciles (usually a no-op) and other members receive the broadcast.
5. On failure, the client rolls back the local change and toasts.

**Undo:** the client keeps the last `Change` (and the server stores it). Undo = apply the inverse: for `move`/`update`, PATCH back to `before`; for `create`, delete; for `delete`, re-create. Because hard events are guarded, undo never silently resurrects a conflicting commitment.

## Conflict resolution (ADR-0012)

- **Soft events:** field-level **last-writer-wins** by `updatedAt`. Two people moving the same block → later write wins; both actions appear in the change-feed; either is undoable.
- **Hard events:** protected — mutations require `confirm` and are never auto-moved or rippled, so the churny conflict surface is only soft events.
- No CRDT/OT in v1. The `Change` log (`before`/`after`, `updatedBy`, `updatedAt`) is enough to upgrade a specific entity to CRDT-backed later if LWW ever hurts.

## Ripple (suggestion only)

When a soft event moves, the server may return a `rippleSuggestion` describing subsequent **soft** events it *could* push, with new times. The client shows the amber ripple bar; nothing moves until the user says yes. Ripple computation stops at the first hard anchor.

## Offline

### Read (must work with zero connectivity)
- The client mirrors the trip's **bookings, documents metadata, and today's events** into **IndexedDB (Dexie)** on every successful fetch/broadcast.
- The service worker (Workbox) caches the app shell and document blobs marked `offlineAvailable`.
- Opening the app offline renders straight from IndexedDB.

### Write offline
- Mutations made offline are appended to a local **outbox** (IndexedDB) with a client-generated temp id and the optimistic local state.
- On reconnect, the client flushes the outbox in order via REST. Server assigns real ids; the client swaps temp→real.
- Conflicts on flush resolve by the same LWW rule; the change-feed reflects the final state; anything surprising is undoable.

### Catch-up after reconnect
- Client calls `GET /trips/:tripId/changes?since=<lastSeenTs>` to replay anything missed while disconnected, then re-subscribes to the socket.

## What we explicitly do NOT build in v1

Peer-to-peer sync, CRDTs, background sync push, and multi-instance realtime fan-out. All deferred; the design leaves the door open for each.
