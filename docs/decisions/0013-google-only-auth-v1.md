# 0013 — Google-only authentication for v1

**Status:** Accepted
**Date:** 2026-07-09

## Context

Every member already has a Google account, and Google is required anyway for Maps, Calendar sync, and (later) Gmail import. We could also offer email/password.

## Decision

**Google OAuth is the only sign-in method for v1.** No email/password.

## Consequences

- One auth path to build and secure; no password storage/reset flows.
- The same Google connection unlocks the integration scopes we need.
- Anyone without a Google account can't join — acceptable for this group.

## Alternatives considered

- **Also email/password:** rejected for v1 — extra surface for zero benefit given everyone has Google.
