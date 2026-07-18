# 0067 — Revocable short-code invites + removal blocks

**Status:** Accepted
**Date:** 2026-07-18
**Supersedes:** [0030](0030-join-is-link-only.md) (no short invite codes)
**Refines:** [0020](0020-auth-session-architecture.md) (stateless invite tokens), [0024](0024-app-shell-and-trip-lifecycle.md) (invite/join flow), [0005](0005-peers-not-roles-v1.md) / [0039](0039-trip-settings-admin-governed-data-plane.md) (removal)
**Closes:** backend-review B-07 (invite revocability + rejoin-after-removal)

## Context

The v1 invite was a **stateless HMAC token** — `base64url(tripId.expiresAt) + "." + HMAC(payload, JWT_SECRET)`, no DB row (ADR-0020). It had three problems the backend review (B-07) and product use surfaced:

1. **The link looks fishy.** `…/join/eyJ0cmlwSWQ…<64+ chars of base64>.<43-char HMAC>` reads like a phishing URL; people are reluctant to open or forward it.
2. **It can't be revoked, and it churns.** There is no record to invalidate, so a shared link lives its full 7 days no matter what; and the UI minted a _brand-new_ token on every "generate" press rather than showing one stable link.
3. **Removal doesn't hold.** Removing a member deletes their `Membership`, but any still-valid link lets them rejoin immediately as a peer. "Membership removal is the per-member control" (auth-and-google.md) was therefore only true until the next join.

ADR-0030 rejected short codes because they were "real new surface … over a tiny keyspace (6 chars), plus brute-force protection." That reasoning stands _against a 6-char code_; it does not stand against a longer code, and it did not anticipate the "long token looks fishy" problem, which is now the deciding force.

## Decision

**The invite is a durable, per-trip row addressed by a short code that resolves to the HMAC token.** The code — not the token — travels in the link.

- **`Invite` table (one row per trip, `tripId @unique`):** `{ code @unique, token, expiresAt, createdBy, createdAt, updatedAt, tripId }`. The `code` is the short public handle in `/join/<code>`; it is a **lookup to the `token`**, which stays the unforgeable grant and carries `tripId` + `expiresAt` in its HMAC payload (unchanged shape). Join/preview resolve `code → row → token`, verify + decode the token for the grant, then proceed. Because join is keyed on the **code** (a value only the row holds), a leaked `JWT_SECRET` can no longer forge a joinable invite — there is no matching code row — which also softens the old B-07 secret-leak concern.
- **Code format:** **10 lowercase English letters (`a–z`), case-insensitive** (stored and compared lowercased). ~2⁴⁷ keyspace — far above ADR-0030's rejected 6-char code, still a clean, typeable, non-fishy link. English-letters-only by request (no digits/symbols, nothing that reads as a token blob).
- **One stable, revocable link per trip.** `POST /trips/:tripId/invite` is **get-or-create**: it returns the trip's current active code (minting one only if none exists or it has expired), so opening trip-settings shows the _same_ link every time instead of generating a new one. `POST /trips/:tripId/invite/rotate` (**admin-only**) mints a fresh code + token in place — the old code stops resolving instantly (that is the revoke). One row per trip means rotation is an in-place update, not a pile of dead tokens.
- **Multi-use is unchanged.** Nothing about the row is consumed on join, so one code admits the whole group.
- **Removal writes a block (`TripBlock`, PK `[tripId, userId]`).** When an **admin removes another member** (not a self-leave), the membership delete and a `TripBlock` insert commit in the same transaction. `POST /trips/join/:code` rejects a blocked user with `403 REMOVED_FROM_TRIP`. A self-leave writes no block, so a voluntary leaver can still rejoin the live link. Clearing a block (admin re-invite) is a deliberate follow-up, not built here.
- **Already-a-member short-circuits the invite screen.** `GET /invites/:code` now returns the `tripId`. An authed visitor who is already a member of that trip is redirected straight into the trip instead of seeing the "you're invited" ticket.

## Consequences

- The link is short and friendly (`/join/qwertzuiop`), fixing the reluctance-to-open problem and matching the "one link per trip" mental model.
- Revocation exists (rotate), and removal is now durable against a live link — the block, not the link's validity, is the gate.
- New surface to protect: a short code over a public preview endpoint is a guessable oracle. 47 bits makes online brute force impractical, but the preview/join endpoints should still get the endpoint-specific throttling tracked in backend-review B-10; that hardening is not a prerequisite for this change but is the right next step.
- `JWT_SECRET` is still the token's HMAC key (no new secret), but invites no longer depend on it for _reachability_ — the code row does. A dedicated `INVITE_SECRET` remains an optional future split.
- A determined removed member can still rejoin under a **new Google identity** — unavoidable in an invite-only friends app; the block stops the common "same person, same link" case, which is the requirement.
- ADR-0030 is superseded. Its paste-a-link ergonomics still hold; the "no codes" clause does not.

## Alternatives considered

- **Keep the stateless token, add nothing.** Rejected — this is exactly B-07: fishy link, no revoke, removal doesn't hold.
- **Code _is_ the credential; drop the HMAC token.** Cleaner (the row + code secrecy is a sufficient grant), but the team wanted the token preserved and the code to resolve to it; keeping the token also gives belt-and-suspenders integrity at negligible cost. Chosen: code → token.
- **Soft-delete the membership (`removedAt`) instead of a block list.** Rejected — it fails _unsafe_: any read path that forgets the `removedAt IS NULL` filter (`MembershipGuard`, `getMe`, `listForUser`, snapshot) leaks _access_. The block list only gates _joining_; a missed check at worst re-admits a removed user (the bug we're fixing), never a data leak.
- **6-char code (per the mockup / ADR-0030).** Rejected — ~2²⁸ is enumerable; 10 letters costs nothing in a link and removes the brute-force worry.
- **Per-user invite tokens (one link per invitee).** Rejected — breaks the multi-use "share one link in the group chat" model the product is built around.
