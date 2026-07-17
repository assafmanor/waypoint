# 0058 — Documents move into the trip snapshot

**Status:** Accepted
**Date:** 2026-07-17
**Supersedes:** [0057](0057-documents-join-live-sync-and-offline-cache.md) (the section-owned live path it added is removed)
**Refines:** [0049](0049-index-tab-mode-and-lifecycle.md) (documents were section-owned; now snapshot-carried like their booking peers); relates to [0019](0019-sync-protocol.md), [0042](0042-shared-state-is-offline-syncable.md), [0055](0055-document-blob-read-caching.md)

## Context

ADR-0057 made documents live and offline-capable, but did it with a **parallel subsystem**: `DocumentsSection` fetched its own list, a bespoke `doc-live.ts` emitter fanned WS `document` changes to the mounted section, and `db.documents` was mirrored by hand. Every other shared entity — events, bookings, maybeItems, places, members — instead rides the `TripSnapshot`: loaded once on trip open, cached wholesale by `cacheSnapshot`, and kept live in `trip-state` via `applyControlChangeToList` (React state) + `applyChangeToCache` (Dexie). Documents were the sole exception.

Reviewing 0057 raised the obvious question: is the snapshot the better home? ADR-0049 never made a principled call to exclude documents — it calls bookings and documents "peers." The exclusion was incremental happenstance (documents were built later). Two facts make the snapshot path clean to adopt:

- `getSnapshot` is already one atomic `$transaction` (`trips.service.ts`); adding a `document.findMany` is one line.
- The WS gateway broadcasts every committed change to **all** channel clients including the sender (`sync.gateway.ts`), and `ChangeService.mutate` broadcasts _before_ the HTTP response returns. So a client's **own** create/update/delete reconciles through its own echo (idempotent `applyControlChangeToList`) — no optimistic setter or post-write refetch needed.

## Decision

Carry document **metadata** in the `TripSnapshot` and treat documents as a first-class reactive list, exactly like bookings. This **supersedes ADR-0057**: its emitter and the section's bespoke fetch/seed/mirror are deleted.

- **Backend:** `tripSnapshotSchema` gains `documents: DocumentSummary[]`; `getSnapshot` adds `document.findMany` to its transaction and maps with `toDocumentSummaryDto`.
- **Frontend:** `trip-state` holds a `documents` reactive list seeded from `snapshot.documents`, re-seeded on resync, and updated by `applyRemoteChange` via `applyControlChangeToList`; it's exposed through `useTrip()`. `cacheSnapshot`/`readCachedSnapshot` mirror `documents` through the (already-declared) `db.documents` table. `DocumentsSection` reads `documents` from context and keeps only the outbox-derived pending-upload merge (ADR-0056). `doc-live.ts`, the section's fetch/seed/mirror, the standalone `cacheDocuments`/`readCachedDocuments`, and the now-unused `listDocuments` are removed. `DocumentManageSheet` drops its `onUpdated`/`onDeleted` callbacks — the echo updates the list.
- **Blobs stay out of band.** Only summaries ride the snapshot (never `fileRef`, ADR-0015/0034); bytes still load lazily via `/content` + the ADR-0055 blob cache. The **peer-replace blob-cache eviction** from ADR-0057 is kept — the WS `document/update` payload still carries no fresh `updatedAt` to re-key the cache — but moves into `trip-state`'s `applyRemoteChange` (fires for own and peer replaces alike) via `evictDocumentBlob`.

## Consequences

- Documents are now fully symmetric with bookings: one load path, one cache path, one live path. Net **less** code — a parallel subsystem collapses into the shared one.
- Own create/update/delete reconcile via the self-echo (which precedes the write's HTTP response), so no flicker and no manual refetch.
- The snapshot payload grows by document metadata (a handful of small rows) on every trip open/resync — negligible at this scale.
- Document `update`/`delete` remain online-only (unchanged from before — not in the outbox); uploads stay offline-capable via the ADR-0056 outbox.

## Alternatives considered

- **Keep ADR-0057 (section-owned + emitter).** Works and is contained, but leaves documents as the one entity on a bespoke path — more concepts, two mechanisms doing one job. Superseded now that we've decided the uniformity is worth the one-time cross-cutting change.
- **Put blob bytes in the snapshot too.** Never — they're large, encrypted, and lazily loaded by design (ADR-0055); only metadata belongs in the snapshot.
- **Optimistic own-write setters instead of relying on the echo.** Unnecessary: the gateway echoes to the sender before the HTTP response resolves, so `applyControlChangeToList` already has the row by the time a sheet closes.
