# 0076 — Low-severity hardening: refresh single-flight, `email_verified`, document owner validation

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0020](0020-auth-session-architecture.md) (refresh rotation; the identity/session model), [0015](0015-document-encryption-server-side.md)/[0034](0034-document-encryption-trust-model.md) (document ownership), [0019](0019-sync-protocol.md) (the change `after` payload).

## Context

The backend architecture review's Low findings (2026-07-18, **B-11 / B-12 / B-13**):

- **B-11** — two near-simultaneous refreshes of the same cookie both read the row; the second rotation invalidates the first's freshly-issued token → forced re-login. The client already coalesced concurrent refreshes **within a tab**; the residual race is **cross-tab**.
- **B-12** — Google sign-in ignored `email_verified`; and User + AuthIdentity were provisioned in two separate writes (an identity upsert failing after the user upsert leaves a user with no identity).
- **B-13** — a document's client-supplied `ownerUserId` was never checked against `Membership`; orphaned blobs have no reconciliation; and the change feed's `after` payload shape is inconsistent across services (some log the partial input, not the persisted DTO).

## Decision

Implemented now:

- **B-11 (cross-tab single-flight):** `refreshAccessToken` wraps the refresh in a **Web Lock** (`navigator.locks.request('wp-refresh', …)`) on top of the existing in-tab promise coalescing, so concurrent refreshes across tabs serialize — the next tab runs only after the shared cookie has already rotated. Falls back to the bare call where the Locks API is unavailable.
- **B-12 (`email_verified` + atomic provisioning):** `handleGoogleCallback` rejects a sign-in with `email_verified === false` (401), and provisions **User + AuthIdentity in one `$transaction`**.
- **B-13 (owner validation):** `DocumentsService.create` rejects a `ownerUserId` that isn't a `Membership` of the trip (400), before storing anything.

Deferred, documented here as deliberate:

- **Orphan-blob reconciliation.** The document workflow still biases toward "orphan a blob rather than lose a document" (a non-`P2002` DB failure after `putObject` leaves ciphertext no row references). No sweeper yet; acceptable at current scale (single self-hosted group, ADR-0034/0065). The eventual fix is a periodic reconciler listing storage keys not referenced by any `Document.fileRef` — tracked in the backlog.
- **`email`-change account-linking policy.** Account-linking keys on `User.email @unique` while `AuthIdentity` keys on `sub`, so a user who changes their Google primary email creates a _new_ `User` the existing identity re-points to, orphaning the old one. Low likelihood; **policy for now: leave as-is** (a changed primary email is treated as a new account) rather than silently merging — noted so a future identity-merge feature is a deliberate choice, not a surprise.
- **Standardizing the change `after` payload to the persisted DTO** across every service is a broader refactor (several services log the partial `input`); left as a known inconsistency, tracked in the backlog. It affects feed rendering / any future replay, not correctness today.

## Consequences

- Multi-tab sessions no longer log each other out on a refresh race; an unverified Google email can't provision or link an account; a document can't be attributed to a non-member.
- The two deferred items (orphan-blob sweep, `after` standardization) stay visible in the backlog rather than being silently dropped.
- Regression tests: an unverified email rejects and provisions nothing; a non-member `ownerUserId` is a 400.

## Alternatives considered

- **A server-side refresh grace window (accept the previous hash briefly).** Robust, but needs a schema column (previous-hash + expiry) and rotation bookkeeping; the client-side Web Lock fixes the acute multi-tab case with no schema change. The grace window remains the option if a lock-less path ever matters.
- **Merge accounts on email change (B-12).** Deferred — a real identity-merge feature is a product decision, not a hardening fix; documenting the current behavior is the honest interim.
