# 0055 — Document blob read caching

**Status:** Accepted
**Date:** 2026-07-17
**Refines:** [0015](0015-document-encryption-server-side.md)/[0034](0034-document-encryption-trust-model.md) (encryption posture), [0031](0031-hosting-on-railway.md) (ephemeral FS), [0042](0042-shared-state-is-offline-syncable.md) (offline reads)

## Context

Every document open pays full cost. Server-side, `getContent` does an S3 GET **plus** an AES-256-GCM decrypt on _every_ read (`backend/src/documents/documents.service.ts`). Client-side, `DocumentViewer` re-fetches the blob on _every_ mount — there's no in-memory, Cache API, or Dexie cache for the bytes (`frontend/src/ui/DocumentViewer.tsx`, `fetchDocumentContent` in `frontend/src/lib/api.ts`). For ~5 friends repeatedly opening the same passport scans and booking PDFs, the identical bytes are fetched and decrypted again and again, and the round-trip to the Railway Storage Bucket dominates the wait.

There is also a correctness gap. CLAUDE.md rule 5 and ADR-0042 promise documents work offline for reads, but only document _metadata_ (the list) is cached — the binaries are not. Opening a document offline, or re-opening one just viewed, hits the network and fails when offline.

Blob content is **immutable by `fileRef`**: a `fileRef` is a random UUID assigned once at write, and replacing a file mints a fresh `fileRef` and deletes the old blob (`documents.service.ts` `update`). A cache keyed by `fileRef` therefore never needs content invalidation — only eviction on delete/replace.

## Decision

Add a **read-through blob cache, ciphertext-only**, at two layers.

**Server — the "local filesystem cache when available".** A two-tier cache inside the storage module (`backend/src/documents/storage.ts` + a new `blob-cache.ts`), keyed by `fileRef`:

- an in-memory LRU of ciphertext blobs, bounded by total bytes, and
- a local-filesystem tier under a configured cache directory.
- `getObject` becomes read-through: **memory → filesystem → S3**, populating the tiers it missed. `putObject` warms the cache with the just-written blob so the first open after an upload is served locally. `deleteObject` evicts from every tier.
- **Ciphertext only.** Both tiers hold exactly the bytes S3 holds. Caching _plaintext_ on disk would put passport scans on the container filesystem and erode ADR-0015/0034's at-rest protection; the in-memory tier stays ciphertext too, for one uniform model. Decrypt still runs per read (cheap, CPU-bound) — the win is skipping the S3 round-trip, which is the expensive part.
- The filesystem tier is a **cache, never a source of truth.** The ephemeral container FS (ADR-0031) may drop it on redeploy — fine: a miss falls through to S3. This mirrors `storage.ts`'s existing rule that local disk is never the primary store in production.

**Client.** Cache the fetched blob so re-opens are instant and offline reads work (closing the rule-5 gap). Use the **Cache API**, keyed by the `/content` URL and kept separate from the Dexie outbox store, populated in `fetchDocumentContent`; the viewer benefits transparently. Evict the entry on document delete/replace.

## Consequences

- Repeat opens skip S3 (server) and the network entirely (client); offline document viewing works as promised by ADR-0042.
- New server config: a cache directory, a max-memory-bytes bound, and an off switch. Documented in `architecture/deployment.md`.
- **No change to the encryption trust model** — ciphertext in, ciphertext cached; the operator boundary of ADR-0034 is unchanged.
- **Independent of the faster-uploads work (ADR-0056).** The cache sits below the service and doesn't care how bytes arrived; the two tasks share only a disjoint edit to `api.ts`. See the [session-29 planning note](../planning/2026-07-17-session-29-document-caching-and-fast-uploads.md) for the file-ownership split.

## Alternatives considered

- **Plaintext cache (skip the decrypt):** rejected on disk — it breaks ADR-0015/0034 by writing passport scans in the clear. In memory the CPU saving is marginal and not worth a two-model split.
- **Redis as a shared cross-instance cache:** the natural home once there is more than one backend instance, but there's a single instance today (ADR-0031), so it's premature. Keep Redis for its earmarked BullMQ role; revisit if we scale out.
- **Rely on HTTP caching:** the `/content` route is auth-guarded and returns a bare body; browser HTTP caching is unreliable here and does nothing server-side or offline.
