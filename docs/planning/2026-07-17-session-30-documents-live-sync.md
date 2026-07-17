# 2026-07-17 · Session 30 — Documents join the live sync path + offline cache

**Trigger:** after ADR-0055/0056 shipped, a review question — _"why don't you instantly see a document after it's uploaded; isn't it broadcast over WS through ChangeService?"_ — surfaced a real gap.

## What was actually wrong

The broadcast was never the problem. `documents.service.create/update/remove` route through `ChangeService.mutate`, which broadcasts a `Change` for every entity type post-commit, `document` included (no filter). The break was on the client, in two halves:

1. `applyChangeToCache` (`frontend/src/lib/cache.ts`) had no `document` case — a document Change hit `default: return` and was dropped. `trip-state`'s WS handler also didn't fan document changes anywhere (documents aren't in the snapshot, ADR-0049).
2. `DocumentsSection` fetched its list once on mount and held it locally ("a peer's shows on the next load"). The declared `db.documents` Dexie table was unused, so the list didn't work offline either.

Net: the uploader saw their doc via optimistic state, but peers were stale and the list was offline-blind — the one shared entity left off ADR-0042's live + offline path.

## Decision & fix (ADR-0057)

Documents stay section-owned (not moved into the snapshot), but join the live data-plane and the offline read cache:

- `frontend/src/lib/doc-live.ts` (new) — a per-trip emitter (outbox-listener pattern). `trip-state` calls `emitDocChange` for `document` changes; `DocumentsSection` subscribes and patches its list via `applyControlChangeToList`.
- `applyChangeToCache` gets a `document` case → mirrors into `db.documents` (summary only, never `fileRef`). `DocumentsSection` seeds from `readCachedDocuments`, refreshes from the network, and mirrors the loaded list back (`cacheDocuments`). List now reads offline.
- **Blob-cache coherence on a peer replace** (the subtle one): the ADR-0055 client blob cache keys on `/content?v=<updatedAt>`, but the WS `document/update` payload carries no fresh `updatedAt`, so a live-patched row would keep the old version and a reopen would hit the **stale** blob. Fix: on a remote `update`/`delete`, `DocumentsSection` evicts that doc's blob cache (`evictDocumentBlob` → the previously-unused `evictCachedDocument`) so the next open refetches fresh. Server side was already safe (a replace mints a new immutable `fileRef` and evicts the old). The not-mounted case self-heals via the mount refetch.

## Verification

Frontend `typecheck` clean, `291` tests pass (+2 for the `document` cache case + `cacheDocuments`/`readCachedDocuments`), `format:check` and lint green (lint warnings are all pre-existing `_seed`/`_old*`). Backend untouched.

## Not done (deliberately)

- Documents in the `TripSnapshot` (full symmetry with bookings) — heavier, overturns ADR-0049; deferred unless documents need to drive other tabs. Recorded in ADR-0057's alternatives.
- Putting `updatedAt` into the document `Change.after` so the blob cache re-keys instead of evicting — would need a `ChangeService` change affecting all entities; the targeted eviction is simpler and bulletproof.
