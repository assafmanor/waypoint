# 0073 — Growth hardening: paged change feed, Membership(userId) index, race-safe last-admin

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Refines:** [0019](0019-sync-protocol.md)/[0068](0068-sync-cursor-commit-consistency.md) (the `/changes` catch-up feed), [0039](0039-trip-settings-admin-governed-data-plane.md) (last-admin auto-promotion).
**Relates:** [0065](0065-app-scope-many-trips-small-groups.md) (multi-trip, multi-user growth posture).

## Context

Three growth-facing gaps (backend architecture review, 2026-07-18, **B-09**), harmless at today's scale but worth closing before real user growth:

1. **Unbounded change feed.** `GET /changes?sinceSeq=0` streamed a trip's entire `Change` log (each row carrying `before`/`after` JSON) in one response — a client with a very old cursor, or a bug that reset it, pulled the whole history unbounded.
2. **Missing `Membership(userId)` index.** `getMe`/`listForUser` filter `Membership` by `userId` alone, but the composite unique `(tripId, userId)` leads with `tripId`, so those queries scan — fine now, linear as membership rows accumulate across many users/trips.
3. **Racy last-admin promotion.** `removeMember` deleted the membership, then a _separate_ `ensureAdminExists` read the remaining members and maybe promoted. Two concurrent admin removals could both observe "an admin still remains" and neither promote (leaving the trip admin-less), or both promote.

## Decision

1. **Page the change feed.** `GET /changes` returns at most `CHANGES_PAGE_LIMIT` rows (a `@waypoint/shared` constant, 500), ordered by `seq`. The client's reconnect catch-up keeps fetching from the last returned `seq` while a page comes back full, stopping on the first short page (`trip-state.tsx`). Server `take` and client loop share the one constant so they always agree.
2. **`@@index([userId])` on `Membership`** (migration `20260718120000_membership_userid_index`) so the by-`userId` reads use an index.
3. **Race-safe last-admin promotion.** The delete + remaining-members check + promotion now run in **one** `mutateMany` transaction, which holds the per-trip advisory lock (ADR-0068). Concurrent removals fully serialize, so the trip keeps exactly one admin — never admin-less, never double-promoted.

## Consequences

- A long or reset cursor can no longer pull an unbounded history in one response; catch-up is naturally incremental. (Re-baselining via `/snapshot` for a truly ancient cursor remains the heavier fallback — future work if `Change` retention becomes a concern.)
- The membership-by-user reads scale with an index rather than a scan.
- Last-admin governance holds under concurrency, reusing the B-01 lock rather than adding new locking.
- Regression tests: `/changes` caps a page at `CHANGES_PAGE_LIMIT` and the remainder is a short continuation page; removing both admins concurrently leaves exactly one (promoted) admin.

## Alternatives considered

- **A cursor/continuation token in the response envelope.** The response is a bare `Change[]` (ADR-0023 serialization); a shared page-size constant + "loop while full" gives the same guarantee without changing the contract shape.
- **`SELECT … FOR UPDATE` on memberships for the admin check.** Equivalent, but the per-trip advisory lock already exists (ADR-0068) and folding delete+check+promote into one transaction reuses it with no new lock.
- **`Change` retention/compaction now.** Deferred — the page bound removes the acute risk; retention is a separate lifecycle decision (open question in the review).
