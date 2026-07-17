# 0056 — Faster document uploads

**Status:** Proposed
**Date:** 2026-07-17
**Refines:** [0042](0042-shared-state-is-offline-syncable.md) (offline outbox), [0018](0018-timeline-data-model-shape.md) (client-id idempotency); relates to [0015](0015-document-encryption-server-side.md)/[0034](0034-document-encryption-trust-model.md)

## Context

Uploading a document is fully synchronous and blocks the user. On submit, the upload sheet stays open with a spinner while the request buffers the whole file in memory, base64-encodes it (~33% inflation), AES-encrypts it, PUTs it to the Railway Storage Bucket, and writes the DB row — only then does the sheet close (`frontend/src/ui/DocumentUploadSheet.tsx` → `uploadDocument` in `frontend/src/lib/api.ts`). On a phone on hotel Wi-Fi, that wait is the complaint. Uploads also can't happen offline at all, unlike every other shared write (ADR-0042).

## Decision

Make uploads **feel instant by moving them onto the existing offline outbox** (ADR-0042), rather than speeding the byte transfer itself:

- On submit, validate, **close the sheet immediately**, and enqueue a new `uploadDocument` outbox op carrying the file blob (Dexie stores `Blob`s) plus the create input with a client-generated `id`. The document appears at once in an optimistic "uploading" state in `DocumentsSection`.
- The outbox flushes the op in the background — and on reconnect, device-wide — via the existing `flushOutbox`/`flushAllOutbox` machinery (`frontend/src/lib/outbox.ts`), calling the unchanged `POST` upload. On success the row becomes real; a hard 4xx drops it like any other op; a network error keeps it queued.
- The client holds the bytes durably (IndexedDB) until the server confirms — **no new server-side durable component**, and offline upload comes for free.

**Server idempotency.** A re-POST on a flush retry must be safe. Create keys on the client `id`; a duplicate must be treated as already-applied (the ADR-0018 posture the outbox already assumes for event creates) rather than surfacing a 500, and a retry after a mid-flight failure must not orphan a second encrypted blob. Harden `documents.service.create` accordingly.

## Consequences

- Uploads are perceived as instant and work offline, consistent with ADR-0042; the upload sheet no longer blocks on the network.
- A new outbox op type (`uploadDocument`) stores a `Blob` — the first binary payload in the outbox; `db.ts`/`outbox.ts` grow a case and the pending count includes queued uploads.
- The optimistic document needs a pending / error affordance in the list until it flushes.
- **Independent of read caching (ADR-0055).** The two share only a disjoint edit to `api.ts` (`uploadDocument` here vs `fetchDocumentContent` there). See the [session-29 planning note](../planning/2026-07-17-session-29-document-caching-and-fast-uploads.md).

## Alternatives considered

- **Redis write-buffer (client → Redis → background worker → S3):** makes the _server_ accept fast, but Redis is not a durable store — a crash or eviction before the flush loses the file — and it forces a pending/ready state machine plus reading blobs back out of Redis until they land in S3. That's real machinery and a data-loss surface for a 5-user tool; the client outbox delivers the same "instant" with the client as the durable holder and offline support included. Deferred (Redis keeps its earmarked BullMQ role).
- **Presigned direct-to-S3 upload (client PUTs straight to the bucket):** removes the double hop, but the client would upload _plaintext_ — incompatible with server-side encryption (ADR-0015/0034) unless we move to client-side E2E crypto, which 0034 explicitly defers. Not now.
- **Streaming server ingest (stream multipart → encrypt → S3 multipart upload, dropping the full in-memory buffer + base64 inflation):** a real efficiency win on memory and time-to-durable, but it touches `storage.ts`/`putObject` — the file ADR-0055 owns — so keeping it out preserves the clean parallel split. Filed to the backlog as a follow-up once both land.
