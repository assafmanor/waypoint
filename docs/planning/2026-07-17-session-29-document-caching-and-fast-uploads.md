# 2026-07-17 · Session 29 — Document caching & faster uploads: two parallel tasks

**Goal of this session:** decompose "a file caching system + faster uploads" into **two independent tasks that two agents can build simultaneously without colliding**, and lay down the ADRs, briefs, and backlog so each agent can pick up its task cold.

This session produced **planning only** — no implementation. The record of the _why_ is [ADR-0055](../decisions/0055-document-blob-read-caching.md) and [ADR-0056](../decisions/0056-faster-document-uploads.md); this note is the _how we split it_.

## Current state (what the code does today)

- **Upload (write)** — fully synchronous and double-hopped: `browser → multipart POST → backend buffers the whole file in memory → base64 → AES-256-GCM encrypt → putObject to S3 → DB row (change log) → response`. The client blocks on the entire chain; the S3 PUT dominates. Cap 10 MB (`MAX_DOCUMENT_SIZE_BYTES`). No offline upload. (`documents.service.ts`, `storage.ts`, `DocumentUploadSheet.tsx`.)
- **Read (open)** — no cache anywhere: `getContent` does an S3 GET + decrypt on every open, and `DocumentViewer` re-fetches the blob on every mount. (`documents.service.ts:getContent`, `DocumentViewer.tsx`.)
- **Gap:** CLAUDE.md rule 5 / ADR-0042 promise offline document reads, but only metadata is cached; the binaries are not.
- **Useful invariant:** a blob is **immutable by `fileRef`** (replace mints a new `fileRef`, deletes the old) — so a `fileRef`-keyed cache needs eviction on delete only, never content invalidation.

## The two tasks

| Task                            | ADR                                                     | One-line scope                                                                                                                                |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Document blob caching**   | [0055](../decisions/0055-document-blob-read-caching.md) | Read-through, ciphertext-only cache: server two-tier (in-memory LRU + local FS) below `getObject`, and a client-side Cache API read cache.    |
| **B — Faster document uploads** | [0056](../decisions/0056-faster-document-uploads.md)    | Optimistic upload via the offline outbox: close the sheet instantly, queue the file blob, flush in the background; server idempotent re-POST. |

## Why they're independent (the design guarantee)

- **Task A sits _below_ the service.** The cache lives entirely inside the storage module (server) and a client read wrapper. It doesn't care how bytes arrived.
- **Task B changes _how bytes get to `putObject`_** (client queueing + server idempotency). It calls `putObject` unchanged; the cache-warm inside `putObject` is Task A's code and is transparent to Task B.
- **No ordering dependency.** Either can merge first. If both land, an outbox-flushed upload (B) also warms the cache (A) — a free bonus, not a coupling.

## File-ownership map

Assign each agent its column. Files appear in exactly one column except the single shared touchpoint called out below.

**Task A — caching (owns):**

- `backend/src/documents/blob-cache.ts` _(new)_ — the two-tier ciphertext cache.
- `backend/src/documents/storage.ts` — `getObject` read-through, `putObject` warm, `deleteObject` evict.
- `backend/src/common/env.ts` — cache env constants (see below).
- `backend/src/documents/blob-cache.spec.ts` _(new)_; `backend/src/documents/storage.spec.ts` — cache tiers, eviction, ciphertext-only.
- `frontend/src/lib/doc-cache.ts` _(new)_ — client blob cache over the **Cache API** (deliberately **not** Dexie/the outbox store, to stay off Task B's turf).
- `frontend/src/lib/api.ts` — **`fetchDocumentContent` only** (wrap the read).
- `frontend/src/ui/DocumentViewer.tsx` — benefits transparently; touch only if the eviction hook needs it.

**Task B — uploads (owns):**

- `frontend/src/lib/outbox.ts` — new `uploadDocument` `OutboxOp` + `runOp` case; carry the `Blob` in the op.
- `frontend/src/db.ts` — outbox store already exists; confirm `Blob` payloads persist (Dexie supports them) and adjust the type if needed.
- `frontend/src/ui/DocumentUploadSheet.tsx` — validate, close immediately, enqueue, hand back an optimistic doc.
- `frontend/src/ui/DocumentsSection.tsx` — render the optimistic "uploading" / error row until it flushes.
- `frontend/src/lib/api.ts` — **`uploadDocument` only** (unchanged signature; the outbox calls it on flush).
- `backend/src/documents/documents.service.ts` — idempotent create on duplicate client `id`; no orphaned second blob on retry.
- `backend/src/documents/documents.service.spec.ts` — idempotency + retry test.
- `packages/shared/src/schemas.ts` — only if a shared type is needed; prefer keeping pending state client-only.

**The one shared file:** `frontend/src/lib/api.ts`. Task A edits `fetchDocumentContent`; Task B edits `uploadDocument`. **Disjoint functions.** Rule: neither reorders imports or shared helpers at the top of the file; whoever merges second runs `pnpm format` and resolves the trivial overlap. This is the _only_ expected conflict point.

## Per-task briefs

### Task A — Document blob caching (ADR-0055)

- **Read first:** ADR-0055, ADR-0015 + ADR-0034 (why ciphertext-only), ADR-0031 (why FS is a cache, never truth). Skim `storage.ts` and `documents.service.ts:getContent`.
- **Build:** the `fileRef`-keyed two-tier server cache (in-memory LRU bounded by bytes + local FS dir), wired read-through into `getObject`, warmed by `putObject`, evicted by `deleteObject`; the client Cache-API read cache in a new `doc-cache.ts`, used by `fetchDocumentContent`, evicted on delete/replace.
- **Env (add to `env.ts` + document in `deployment.md`):** `DOC_CACHE_DIR` (filesystem cache path; unset → memory-only), `DOC_CACHE_MAX_BYTES` (in-memory LRU bound), `DOC_CACHE_DISABLED` (kill switch). Sensible dev defaults so nothing breaks unconfigured.
- **Acceptance:** a second open of the same doc issues no S3 GET (server) and no network fetch (client); an offline re-open succeeds; delete/replace evicts both tiers; the on-disk cache file is ciphertext, never plaintext; `pnpm typecheck && pnpm build && pnpm --filter @waypoint/backend test` green.
- **Out of scope:** streaming ingest, Redis, any change to the upload path.

### Task B — Faster document uploads (ADR-0056)

- **Read first:** ADR-0056, ADR-0042 (outbox model), ADR-0018 (client-id idempotency). Study `outbox.ts` (op union, `runOp`, `flushOutbox`, the 4xx-drop rule) and `DocumentUploadSheet.tsx`.
- **Build:** the `uploadDocument` outbox op (carrying the `Blob` + create input with a client `id`); sheet closes instantly with an optimistic doc; `DocumentsSection` shows a pending/error state; background flush posts via the unchanged `uploadDocument` API fn; server `create` made idempotent on duplicate `id` (no 500, no orphaned blob on retry).
- **Acceptance:** submitting closes the sheet with no perceptible wait and shows the doc immediately; going offline, uploading, then reconnecting flushes the file; a forced double-flush creates exactly one document and one blob; `pnpm typecheck && pnpm build && pnpm --filter @waypoint/backend test` green.
- **Out of scope:** the cache (Task A), Redis, presigned/E2E direct upload, streaming ingest.

## Running the two agents

Both branch off this planning branch's base (or `main` once this docs PR merges). Because ownership is disjoint save for the two `api.ts` functions, they can run concurrently start to finish; merge order doesn't matter. Each agent's Definition of Done is its brief's acceptance list plus `pnpm format`.

## Deferred (to backlog, not this split)

- **Streaming server ingest** — drop the full in-memory buffer + base64 inflation; a follow-up to Task A/B once both land (touches `storage.ts`/`putObject`, so sequence it _after_ Task A to avoid a merge fight).
- **Redis** — shared cross-instance read cache (A) and/or write-buffer (B) only become relevant if we scale past one backend instance; keep Redis for its earmarked BullMQ role.
- **Presigned / client-side E2E direct upload** — gated on revisiting ADR-0034's trust model.
