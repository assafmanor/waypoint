# 2026-07-17 · Session 31 — Documents move into the trip snapshot (ADR-0058)

**Trigger:** a design question on the ADR-0057 fix — _"is the snapshot the better architecture?"_ It is: ADR-0049 never made a principled call to exclude documents (it calls bookings and documents "peers"); the exclusion was incremental. So documents were the one shared entity on a bespoke path.

## Decision (ADR-0058, supersedes ADR-0057)

Carry document **metadata** in the `TripSnapshot` and treat documents as a first-class reactive list, exactly like bookings — one load path, one cache path, one live path. This deletes the ADR-0057 emitter and the section's bespoke fetch/mirror.

Key enabling fact confirmed in the code: the WS gateway broadcasts every committed change to **all** channel clients including the sender (`sync.gateway.ts`), and `ChangeService.mutate` broadcasts _before_ the HTTP response returns — so a client's **own** create/update/delete reconciles via its own echo (idempotent `applyControlChangeToList`), no optimistic setter or post-write refetch needed.

## Changes

- **Backend:** `tripSnapshotSchema` gains `documents: DocumentSummary[]`; `getSnapshot` adds `document.findMany` to its `$transaction` and maps with a new `toDocumentSummaryDto` in `trips.mapper.ts`.
- **Frontend:** `trip-state` holds a `documents` reactive list (seeded from the snapshot, re-seeded on resync, updated by `applyRemoteChange`), exposed via `useTrip()`. `cacheSnapshot`/`readCachedSnapshot` mirror `documents` through `db.documents`. `DocumentsSection` reads from context (keeps only the outbox pending-upload merge). `DocumentManageSheet` drops its `onUpdated`/`onDeleted` (echo updates the list). Deleted `doc-live.ts`, the standalone `cacheDocuments`/`readCachedDocuments`, and the now-unused `listDocuments`.
- **Blob-cache eviction on a peer replace** (ADR-0057's subtle fix) is **kept**, relocated into `trip-state`'s `applyRemoteChange` document branch (`evictDocumentBlob`) — the WS payload still carries no fresh `updatedAt` to re-key the ADR-0055 cache, so evict on `update`/`delete`.

## Verification

Frontend `typecheck` + `291` tests pass; backend `typecheck` + `build` pass (Prisma client generated locally); `format:check` green; lint 0 errors (pre-existing `_seed`/`_old*`/`writeFile` warnings only). Backend integration tests (`trips.service.spec` getSnapshot) run in CI against seeded Postgres — the added assertion is `Array.isArray(snapshot.documents)`.

## Net effect

Documents are now symmetric with bookings; a parallel subsystem collapsed into the shared one (net less code). Blobs stay out of band (lazy `/content` + ADR-0055 cache), and `update`/`delete` remain online-only while uploads stay offline-capable via the ADR-0056 outbox.
