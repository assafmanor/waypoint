# 0057 — Documents join the live sync path and the offline read cache

**Status:** Superseded by [0058](0058-documents-in-the-trip-snapshot.md)
**Date:** 2026-07-17
**Refines:** [0042](0042-shared-state-is-offline-syncable.md) (everything shared is offline-syncable), [0049](0049-index-tab-mode-and-lifecycle.md) (documents are section-owned, not in the snapshot); relates to [0019](0019-sync-protocol.md) (change log + WS), [0055](0055-document-blob-read-caching.md)/[0056](0056-faster-document-uploads.md)

> **Superseded by [ADR-0058](0058-documents-in-the-trip-snapshot.md)** (2026-07-17): documents moved into the `TripSnapshot` and became a first-class reactive list, so the `doc-live.ts` emitter and the section's bespoke fetch/mirror this ADR introduced were removed. The blob-cache eviction on a peer replace (below) was kept and relocated into `trip-state`. The problem analysis here remains the accurate account of _why_ documents needed to join the live path.

## Context

A document upload **is** already broadcast over WebSocket: `documents.service.create/update/remove` route through `ChangeService.mutate`, which writes the `Change` and calls `gateway.broadcast(tripId, change)` post-commit for every entity type, `document` included — no filter (`backend/src/sync/change.service.ts`). Yet a peer never sees a newly uploaded document until they reload the Index.

The break is entirely client-side, and there are two halves:

1. **The live consumer ignores documents.** `applyChangeToCache` (`frontend/src/lib/cache.ts`) switches on `change.entityType` with cases for event / booking / maybeItem / place / trip / membership and a `default: return`. There is no `document` case, so an incoming document Change is silently dropped. Nor does `trip-state`'s WS handler fan document changes to any reactive list (documents aren't in the trip snapshot, ADR-0049, so they were never wired into that path).
2. **The list is section-owned and one-shot.** `DocumentsSection` fetches its own list via `listDocuments` on mount and holds it in local state; its own writes are optimistic, "a peer's shows on the next load." The `db.documents` Dexie table exists but is unused, so the document _list_ also doesn't work offline (only the blobs do, after ADR-0055).

The result: the uploader sees their document instantly (optimistic local state / ADR-0056 outbox rows), but every other member is stale, and the list is offline-blind. That contradicts ADR-0042 ("everything shared between people is offline-syncable"): documents are the one shared entity left off the live + offline path.

## Decision

Bring documents onto the live data-plane and the offline read cache, **without** moving them into the trip snapshot — they stay section-owned (ADR-0049):

- **Live:** a thin per-trip emitter (`frontend/src/lib/doc-live.ts`, mirroring the `outbox.ts` listener pattern) carries remote `document` changes. `trip-state`'s WS handler calls `emitDocChange(tripId, change)` for `entityType === 'document'`, and the mounted `DocumentsSection` subscribes and patches its list (upsert on create/update, remove on delete) via the existing `applyControlChangeToList`. A peer's upload / rename / delete now appears live.
- **Blob-cache coherence on a peer replace.** The ADR-0055 client blob cache is keyed by `/content?v=<updatedAt>`, and the WS `document/update` payload carries no fresh `updatedAt` (the server builds `after` from the input, not the persisted row) — so a live-patched row keeps its old version and a reopen would hit the **stale** cached blob. On a remote `update`/`delete`, `DocumentsSection` therefore evicts that document's blob cache (`evictDocumentBlob` → the previously-unused `evictCachedDocument`), forcing a fresh fetch on next open. The server side is already safe: a replace mints a new immutable `fileRef` and evicts the old blob (ADR-0055). The not-mounted case self-heals — mounting refetches the list with a fresh `updatedAt`, re-keying the cache and cleaning the orphaned version.
- **Offline cache:** `applyChangeToCache` gets a `document` case that mirrors the change into the `db.documents` table (already declared), keyed by id — so the cache stays coherent even when the section isn't mounted. `DocumentsSection` seeds from `readCachedDocuments` for an instant/offline first paint, refreshes from the network, and mirrors the loaded list back into `db.documents`. The list now works offline like every other read.
- `db.documents` stores `DocumentSummary` (never `fileRef` — the blob reference stays server-only, reachable only through the guarded `/content` route, ADR-0015/0034). Blob bytes remain out of this path; they load lazily on open through the ADR-0055 cache.

Peer-created rows arrive without server-only fields (`createdAt`/`updatedBy`) until the next full fetch — the list renders on type/title/size/id, so this is invisible, the same trade `applyControlChangeToList` already makes for bookings.

## Consequences

- Documents now satisfy ADR-0042: a peer's change is live, and the list reads offline. The one shared-entity gap is closed.
- `DocumentsSection`'s "a peer's shows on the next load" caveat is gone; its header comment is updated.
- One new tiny module (`doc-live.ts`) and a `document` case in `applyChangeToCache`; no snapshot/contract change, no new dependency.
- The emitter is trip-scoped and unmount-safe; when no section is mounted, the offline cache still updates via `applyChangeToCache`, so re-opening the Index shows the peer's change even if it landed while elsewhere in the app.

## Alternatives considered

- **Put documents in the `TripSnapshot`** and treat them exactly like bookings (reactive list in `trip-state`, cached via `cacheSnapshot`). The most uniform end-state, but it overturns ADR-0049's deliberate section-owned model, grows the snapshot + its zod/OpenAPI contract, and spreads document logic across `trip-state` and the section. Deferred: heavier for no user-visible gain over this fix; revisit if documents ever need to drive Home/other tabs.
- **Refetch `listDocuments` on any remote document change.** Simpler, but a network round-trip per change, nothing offline, and it ignores the existing `db.documents` table. Rejected — the emitter + cache mirror is both live and offline for less cost.
- **Dexie `useLiveQuery` as the single reactive source.** Clean, but adds `dexie-react-hooks` and a new pattern the codebase doesn't use (its live state is React state fed by the WS handler). Not worth the dependency here.
