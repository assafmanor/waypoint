# 0015 — Document encryption: server-side at rest

**Status:** Accepted
**Date:** 2026-07-09

## Context

Documents (passports, insurance) are sensitive. Options: client-side end-to-end (only members' devices hold keys; server never sees plaintext) vs. server-side at rest (server encrypts in storage and can decrypt).

## Decision

v1 uses **server-side encryption at rest**. Documents are encrypted in storage; the backend holds/manages keys and can decrypt to serve them to authorized members.

## Consequences

- Simpler: no client key management or key-sharing among the 5.
- Protects against a stolen disk / storage breach — **not** against the server operator or host. Acceptable for a private friends' tool.
- Keys must be managed carefully (env/secret store, never in the repo).
- E2E remains a possible future upgrade if the threat model changes.

## Alternatives considered

- **Client-side E2E:** stronger privacy, but significant key-management complexity for marginal benefit at this trust level. Deferred.
