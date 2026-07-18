# 0065 — App scope: many trips, small groups per trip (grow-later, not capped)

**Status:** Accepted (Assaf sign-off 2026-07-18)
**Date:** 2026-07-18
**Clarifies:** the product framing in [vision.md](../product/vision.md), [prd-v1.md](../product/prd-v1.md), [architecture/overview.md](../architecture/overview.md), [architecture/tech-stack.md](../architecture/tech-stack.md), and `CLAUDE.md` — and the "~5" phrasing echoed in several earlier ADRs.
**Relates:** [0005](0005-peers-not-roles-v1.md), [0012](0012-conflict-lww-undo.md), [0019](0019-sync-protocol.md), [0021](0021-multi-trip-membership.md), [0022](0022-control-plane-vs-data-plane.md), [0031](0031-hosting-on-railway.md), [0034](0034-document-encryption-trust-model.md) — the per-trip sizing and trust reasoning in these stands; this ADR only corrects how the app's overall scope was described.

## Context

The docs repeatedly described Waypoint as "a private tool for ~5 friends," "not built for scale," optimized for "a handful of trips and ~5 users each." Assaf flagged (2026-07-18) that this conflates two different numbers and sets the wrong mindset for anyone — human or agent — picking the project up:

- **"~5" was only ever the size of one trip's group** — the number of friends traveling together on a single trip. It is a legitimate _per-trip_ design assumption: it's why LWW-without-CRDTs, in-process per-trip fan-out, and last-writer-wins-on-refresh are proportionate (ADR-0012/0019/0022).
- **It was never a ceiling on the app.** Waypoint is meant to host many trips and many users. Describing the whole product as "a 5-person tool that isn't built for scale" invites future work that quietly bakes in a low-user-count cap — the exact opposite of the intent.

The app is genuinely not production-scaled today, and v1 still targets one real trip as its proof. That honesty stays. What changes is the _posture_: **not yet scaled**, held with a **grow-later** mindset — not **small by design, capped forever**.

## Decision

**Frame Waypoint as a multi-trip, multi-user app whose per-trip group is small (~5). "~5" describes a single trip's group and is never a ceiling on the app. The app is not production-scaled yet — v1 targets one real trip — but the architecture and every new decision keep a grow-later posture: nothing may bake in a low-user-count assumption at the app level.**

Concretely:

1. **Per-trip sizing stays.** "~5 members per trip" remains a valid assumption for collaboration, conflict, sync, and realtime fan-out. The ADRs that lean on it (0005/0012/0019/0022) are unchanged.
2. **App-level framing is corrected** in the living docs (CLAUDE.md, README, vision, PRD, overview, tech-stack): the product serves many trips and many users; today's simplifications are v1 conveniences we can grow past, not permanent caps.
3. **Invite-only ≠ small.** Waypoint stays invite-only with no public discovery or social layer (PRD §5) — that's a privacy/product choice, not a user-count limit. Many people can be invited across many trips.
4. **The bright line for new work:** a simplification that's cheap to undo later (in-process fan-out, single node, timer-based workers) is fine; a choice that would force a data-model rewrite to grow (per-device-only state, records without user/trip ids, hard-coded small-N limits) is not. This restates the existing overview tenet ("small but not painted into a corner") as scope policy.

## Consequences

- The docs no longer read as "a private 5-person app." Future contributors inherit a grow-later mindset by default.
- **ADR-0034's operator-trust model is explicitly trip-scoped.** Its "a private tool run by one of the ~5, so the operator already has the group's trust" reasoning holds for a single self-hosted group, but does **not** generalize to a public multi-tenant deployment. If Waypoint ever hosts trips for people who don't trust the operator, the document trust model must be revisited (client-side encryption, per the alternatives ADR-0015/0034 already name). Recorded here so scale doesn't silently erode that boundary.
- No code or schema change follows from this ADR; it's a framing correction. The only diff beyond docs is copy: a few "5-person tool / not built for scale" strings become "small group per trip / not yet scaled."
- v1 scope is unchanged: one real trip remains the near-term target and success measure.

## Alternatives considered

- **Rewrite the historical ADRs that say "~5 users."** Rejected — those are the immutable record, and their per-trip reasoning is correct. Correcting the living docs plus adding this ADR is the repo's own supersede-don't-edit discipline (decisions/README.md).
- **Drop the "~5" everywhere.** Rejected — the per-trip number is real and load-bearing for the collaboration/sync choices. The fix is to say _what_ it sizes (a single trip's group), not to erase it.
- **Declare the app commercial / built-for-scale now.** Rejected — overstates today's reality. "Not yet scaled, grow-later" is the honest and correct posture.
