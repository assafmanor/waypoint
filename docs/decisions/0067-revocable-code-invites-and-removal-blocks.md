# 0067 — Revocable short-code invites + removal blocks

**Status:** Accepted
**Date:** 2026-07-18
**Supersedes:** [0030](0030-join-is-link-only.md) (no short invite codes)
**Refines:** [0020](0020-auth-session-architecture.md) (stateless invite tokens), [0024](0024-app-shell-and-trip-lifecycle.md) (invite/join flow), [0005](0005-peers-not-roles-v1.md) / [0039](0039-trip-settings-admin-governed-data-plane.md) (removal)
**Closes:** backend-review B-07 (invite revocability + rejoin-after-removal)

## Context

The v1 invite was a **stateless HMAC token** — `base64url(tripId.expiresAt) + "." + HMAC(payload, JWT_SECRET)`, no DB row (ADR-0020). It had three problems the backend review (B-07) and product use surfaced:

1. **The link looks fishy.** `…/join/eyJ0cmlwSWQ…<64+ chars of base64>.<43-char HMAC>` reads like a phishing URL; people are reluctant to open or forward it.
2. **It can't be revoked, it churns, and it outlives the trip.** There is no record to invalidate, so a shared link lives its full 7-day timer no matter what; the UI minted a _brand-new_ token on every "generate" press rather than showing one stable link; and the timer is unrelated to the trip, so a link can expire mid-planning (trip booked weeks out) yet a leaked one keeps working after the trip is over.
3. **Removal doesn't hold.** Removing a member deletes their `Membership`, but any still-valid link lets them rejoin immediately as a peer. "Membership removal is the per-member control" (auth-and-google.md) was therefore only true until the next join.

ADR-0030 rejected short codes because they were "real new surface … over a tiny keyspace (6 chars), plus brute-force protection." That reasoning stands _against a 6-char code_; it does not stand against a longer code, and it did not anticipate the "long token looks fishy" problem, which is now the deciding force.

## Decision

**The invite is a durable, per-trip row whose short `code` is the credential.** The code travels in the link; there is no separate token.

- **`Invite` table (one row per trip, `tripId @unique`):** `{ code @unique, createdBy, createdAt, updatedAt, tripId }`. The random unguessable `code` is both the public handle in `/join/<code>` **and** the grant — join/preview resolve `code → row → tripId` directly. No HMAC token: once the invite is a row keyed by a unique random code, a token adds nothing. Reachability is the code (join looks up by code); the trip binding is the row's `tripId` column; both sit behind the same DB trust boundary, so an HMAC over the row's own data would only verify our data against our data. Dropping it also means invites no longer depend on `JWT_SECRET` at all — there is nothing to forge, because a joinable invite _is_ a code row.
- **Code format:** **8 characters of base58** — `a–z A–Z 0–9` minus the look-alikes `0 O I l`, case-sensitive. ~2⁴⁷ keyspace (`8 × log₂58 ≈ 47` bits — the same strength as 10 lowercase letters, two characters shorter, and unambiguous if read off a screen). The code lives in a tapped link, so case-sensitivity costs nothing; excluding the ambiguous glyphs keeps it clean. Far above ADR-0030's rejected 6-char keyspace.
- **Validity = until the trip ends, or until an admin rotates. No fixed timer.** With explicit revoke and a durable row, a rolling TTL only churns the one stable link and can lapse mid-planning. Instead a code is live from creation until **the trip's `endDate` has passed in the trip's timezone** (checked live at join/preview against the current trip, so editing the trip dates extends/shortens the link automatically), or until it is rotated. An over trip's code is a `410 INVITE_EXPIRED`.
- **One stable, revocable link per trip.** `POST /trips/:tripId/invite` is **get-or-create**: it returns the trip's current code (minting one only if none exists), so opening trip-settings shows the _same_ link every time instead of generating a new one. `POST /trips/:tripId/invite/rotate` (**admin-only**) mints a fresh code in place — the old code stops resolving instantly (that is the revoke). One row per trip means rotation is an in-place update, not a pile of dead codes.
- **Multi-use is unchanged.** Nothing about the row is consumed on join, so one code admits the whole group.
- **Removal writes a block (`TripBlock`, PK `[tripId, userId]`).** When an **admin removes another member** (not a self-leave), the membership delete and a `TripBlock` insert commit in the same transaction. `POST /trips/join/:code` rejects a blocked user with `403 REMOVED_FROM_TRIP`. A self-leave writes no block, so a voluntary leaver can still rejoin the live link.
- **Re-invite = clear the block.** Because a kicked member leaves the roster entirely, the `TripBlock` rows _are_ the "removed people" list. Trip Settings shows a **Removed** section (admin-only, `GET /trips/:tripId/blocks` → `{ userId, displayName, avatarColor, blockedAt }[]`); an "allow back in" action deletes the block (`DELETE /trips/:tripId/blocks/:userId`, admin-only), after which the person rejoins via the existing link. This closes the accidental-kick footgun.
- **Already-a-member short-circuits the invite screen.** `GET /invites/:code` returns the `tripId`. An authed visitor who is already a member of that trip is redirected straight into the trip instead of seeing the "you're invited" ticket.

## Consequences

- The link is short and friendly (`/join/7Gk9mQ2p`), fixing the reluctance-to-open problem and matching the "one link per trip" mental model.
- The link is stable for the trip's whole planning-through-travel life and dies on its own once the trip ends — no mid-planning expiry, no link that outlives the trip.
- Revocation exists (rotate), removal is durable against a live link (the block, not the link's validity, is the gate), and an accidental kick is reversible (allow-back).
- New surface to protect: a short code over a public preview endpoint is a guessable oracle. ~47 bits makes online brute force impractical, but the preview/join endpoints should still get the endpoint-specific throttling tracked in backend-review B-10; that hardening is not a prerequisite for this change but is the right next step.
- Invites no longer touch `JWT_SECRET` (or any secret) — the code row is the whole grant. One fewer coupling, and the old "JWT_SECRET leak forges invites" concern is gone outright.
- A determined removed member can still rejoin under a **new Google identity** — unavoidable in an invite-only friends app; the block stops the common "same person, same link" case, which is the requirement.
- ADR-0030 is superseded. Its paste-a-link ergonomics still hold; the "no codes" clause does not.

## Alternatives considered

- **Keep the stateless token, add nothing.** Rejected — this is exactly B-07: fishy link, no revoke, removal doesn't hold.
- **Store an HMAC token alongside the code (code → token lookup).** Considered and rejected as ceremony: with a row keyed by a unique random code, the code is the secret and the row's `tripId` column is the binding; an HMAC over the row's own data verifies our data against our data behind the same DB trust boundary, so it adds no reachability or authorization guarantee. Dropping it removes the `JWT_SECRET` coupling. Chosen: the code _is_ the credential.
- **Soft-delete the membership (`removedAt`) instead of a block list.** Rejected — it fails _unsafe_: any read path that forgets the `removedAt IS NULL` filter (`MembershipGuard`, `getMe`, `listForUser`, snapshot) leaks _access_. The block list only gates _joining_; a missed check at worst re-admits a removed user (the bug we're fixing), never a data leak.
- **Block with no un-block (defer re-invite).** Rejected — an accidental kick would lock a friend out permanently; the `TripBlock` rows already _are_ the removed-members list, so surfacing an admin "allow back in" is cheap and closes the loop.
- **6-char code (per the mockup / ADR-0030).** Rejected — ~2²⁸ is enumerable; 8 base58 chars cost nothing in a link and give ~2⁴⁷.
- **Per-user invite tokens (one link per invitee).** Rejected — breaks the multi-use "share one link in the group chat" model the product is built around.
