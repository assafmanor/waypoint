# 0066 — Client local data is wiped on sign-out and genuine session loss

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0020](0020-auth-session-architecture.md) (in-memory access token + rotating refresh), [0034](0034-document-encryption-trust-model.md) (server-side encryption; operator-trust), [0042](0042-shared-state-is-offline-syncable.md) (read-cache + outbox), [0055](0055-document-blob-read-caching.md) (client Cache-API blob cache), [0058](0058-documents-in-the-trip-snapshot.md) (documents mirrored into Dexie), [0065](0065-app-scope-many-trips-small-groups.md) (many-user app; 0034's operator-trust is trip-scoped)

## Context

To read offline (CLAUDE.md rule 5 / ADR-0042/0055), the client persists a lot on the device: the whole trip snapshot mirrored into IndexedDB (Dexie — events, bookings, document _summaries_, maybe-items, places, members, trip, `latestSeq`), the trip list, the write outbox, the last-known identity in `localStorage`, the active-trip id, and — crucially — **decrypted document bytes** (passports, insurance, visas) in a Cache-API store.

The auth model (ADR-0020) keeps the access token in memory only, so signing out drops credentials cleanly. But sign-out and session-expiry only ever cleared the token and the cached identity — **none of the persisted trip data or decrypted blobs**. Everything above survived a logout on the device.

The frontend review (2026-07-18, `docs/reviews/frontend-architecture-review.md`, F-01) flagged this as the top risk. Two concrete failures: (1) after sign-out the next person on a shared/returned/sold device can read the previous user's trip data and decrypted passport scans (via the app or DevTools), and `fetchDocumentContent` serves the blob cache _before_ any auth check; (2) `OutboxAutoFlush` flushes every trip's queue whenever _any_ user is authed, so a write queued by user A can POST under user B's session.

ADR-0065 sharpened why this matters now: Waypoint is a many-trip, many-user app, so account switching on one device is a mainstream case, not an edge one — and it explicitly scoped ADR-0034's "the operator already has the group's trust" reasoning to a single self-hosted group, which does not license leaving decrypted documents on a shared client indefinitely.

## Decision

**On sign-out and on a genuine session loss, the client wipes all locally persisted data before returning to the signed-out state.** A single `wipeLocalData()` (`frontend/src/lib/cache.ts`) clears every Dexie table (events, bookings, documents, snapshotMeta, tripList, outbox), removes the active-trip id from `localStorage`, deletes the entire document blob cache (`clearAllCachedDocuments()` in `doc-cache.ts`), and re-primes the outbox pending badge. It is called from `logout()` and from the `onSessionExpired` path (a 401 while online that a silent refresh could not fix — ADR-0020).

**The offline cold-boot fallback is deliberately exempt.** When the boot refresh + `/me` both fail with no network, the app restores the last-known identity and renders from cache (ADR-0042 "Read"); that path must _keep_ the cache and never wipes. Only a real, online sign-out or auth rejection tears data down — a transient offline blip is not a logout.

This is device-local hygiene, not a new trust boundary: server-side encryption and membership authorization are unchanged and remain the real enforcement (ADR-0015/0034).

## Consequences

- A signed-out (or session-expired) device no longer retains another user's trip data or decrypted documents. Cross-session leakage on a shared device is closed for the wipe-on-sign-out case, and a stale outbox can't flush under a different session.
- Signing out and back in re-fetches the snapshot (online) rather than reading a warm cache — an acceptable cost; sign-out is rare and always online.
- **This does _not_ protect against a device compromised while signed in**, and it is not client-side encryption. Per ADR-0065, if Waypoint ever serves tenants who don't trust the operator, the document trust model still needs revisiting (client-side encryption, the ADR-0015/0034 alternative). This ADR narrows the local-persistence exposure; it does not resolve the multi-tenant trust question.
- `cache.ts` now calls `initOutboxCount()` from `outbox.ts` (which already imports from `cache.ts`) — a benign runtime-only import cycle; both are invoked at runtime, and typecheck/build/tests pass.

## Alternatives considered

- **Encrypt local data at rest with a per-user key.** Stronger (covers a signed-in-device compromise) but needs key management the app doesn't have yet, and doesn't remove the need to drop data a signed-out user shouldn't reach. Wipe-on-sign-out is the proportionate first step; encryption stays the escalation named by ADR-0015/0034/0065.
- **Scope every cache by a user id so a re-login simply can't read another user's rows.** A good complementary hardening, but it leaves the prior user's decrypted blobs on disk until overwritten. Wiping is simpler and removes the bytes outright; namespacing can layer on later.
- **Do nothing (rely on operator trust, ADR-0034).** Rejected under ADR-0065: that reasoning is trip-scoped and does not extend to shared devices in a many-user app.
