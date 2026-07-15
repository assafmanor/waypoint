# 0022 — Control plane vs. data plane: only the data plane routes through ChangeService

**Status:** Accepted (partially superseded by ADR-0038)
**Date:** 2026-07-10
**Refines:** ADR-0019 (scopes its "every shared-state mutation" to the data plane).
**Partially superseded by:** ADR-0038 — `Trip` and roster-level `Membership` mutations move onto the **data plane** (settings edits must be realtime + offline). The control plane then effectively covers only `User` + auth (`Session`, `AuthIdentity`).

## Context

ADR-0019 established a hard rule: **every shared-state mutation goes through `ChangeService.mutate()`** (atomic entity-write + `Change`, WS broadcast after commit). Read literally, that forces the sync core — `ChangeService`, the WS gateway, the change log — to exist before _any_ write, including creating a trip or adding a member. That inverts a sensible build order: you cannot stand up a working slice (create a trip, see it) without first building the riskiest infrastructure.

But not all shared state is the same. Some entities are **structural and rare** (who exists, what trips exist, who belongs to which); others are the **collaborative timeline** that members edit on the ground and that genuinely needs realtime, undo, ripple, and offline. Only the second kind needs the `Change` machinery.

## Decision

Split shared state into two planes; only the **data plane** routes through `ChangeService`.

- **Control plane** — `User`, `Trip`, `Membership` (and auth: `AuthIdentity`, `Session`). Mutations are **plain authenticated CRUD** in their domain services: no `Change` record, no WS broadcast, no offline outbox. Authorization still applies (`MembershipGuard`; `creator = admin`, ADR-0005/0018). These are low-frequency, structural changes; a member joining doesn't belong on the per-trip timeline change-feed.
- **Data plane** — `TripEvent`, `Booking`, `MaybeItem`, `TripNote`, `TripDocument` (metadata). **Every** mutation goes through `ChangeService.mutate()` exactly as ADR-0019 requires — atomic write+`Change`, monotonic `seq`, broadcast after commit, undo via inverse `Change`, offline outbox.

The snapshot (`GET /trips/:id/snapshot`) still returns **both** planes (members are part of the trip picture); the distinction is about the **write path and the change log**, not about what's readable. Control-plane changes are picked up on the next snapshot/refresh, not streamed as `Change` frames. (If live membership presence is ever wanted, it rides the existing `presence` WS message — not the change log.)

## Consequences

- **Build order unlocks basics-first.** A read-only skeleton (seed → read API → frontend) and then control-plane CRUD (trip creation, membership) can ship **before** the sync core — no `ChangeService` dependency. `ChangeService`/WS is built with the first data-plane write, not the first write of any kind.
- The "one choke point" guarantee of ADR-0019 is **narrowed, not weakened**: it still covers 100% of the churny, collaborative, conflict-prone surface. The control plane's low write rate and last-writer-wins-on-refresh semantics are acceptable at ~5 members/trip.
- Slight asymmetry to remember: control-plane edits are **not** undoable via the toast and **not** in the change-feed. Acceptable — you don't "undo" creating a trip the way you undo moving an event.
- Upgrade path: if a control-plane entity ever needs realtime/undo, move just that entity onto `ChangeService` — the door stays open per-entity, same as the CRDT upgrade path in ADR-0019.

## Alternatives considered

- **Everything through `ChangeService` (literal ADR-0019):** rejected — forces the sync core before any usable slice; over-applies heavy machinery to rare structural writes.
- **A second, lighter change log for the control plane:** rejected — no consumer needs it in v1 (no control-plane undo, no control-plane realtime); it's speculative complexity.
