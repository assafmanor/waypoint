# 0074 — Removing a member evicts their live WebSocket

**Status:** Accepted (2026-07-18)
**Date:** 2026-07-18
**Relates:** [0019](0019-sync-protocol.md) (the WS fan-out), [0020](0020-auth-session-architecture.md) (trip authz deliberately not in the token, so removal takes effect immediately), [0039](0039-trip-settings-admin-governed-data-plane.md) (removal is an admin governance primitive).

## Context

WS membership was checked **once, at upgrade** (`handleUpgrade`). `removeMember` deleted the `Membership` and broadcast a `membership:delete` change **to the same channel that still held the removed member's socket** — nothing closed that socket or dropped it from the channel map (backend architecture review, 2026-07-18, **B-02**). So a removed member's app kept its stream open and continued to receive every subsequent booking, document, code, and place edit in real time. This directly contradicts the design's own rationale for keeping trip authorization **out** of the token (ADR-0020): removal is supposed to take effect immediately. REST honored it (404 after removal); the realtime plane did not.

## Decision

The `SyncGateway` gains a server-side eviction path:

- **`disconnectUser(tripId, userId)`** closes every socket in the trip's channel belonging to that user (WS close code **1008**, "membership revoked"), prunes them from the channel map, and refreshes presence. `TripsService.removeMember` calls it (via a `ChangeService` passthrough, keeping domain services depending only on `ChangeService`) **after** the membership delete commits.
- **`disconnectTrip(tripId)`** closes every socket for a trip; `deleteTrip` calls it alongside the existing ephemeral `trip:delete` broadcast, so no member keeps a live stream to a trip that no longer exists.

## Consequences

- A removed member stops receiving the trip's changes immediately, matching the REST 404 — the documented "removal is immediate" guarantee now holds on both planes.
- The eviction is best-effort against a client that immediately reconnects, but a reconnect re-runs the upgrade membership check and is rejected (404) now that the row is gone — so there is no re-subscribe hole.
- This stays single-instance by design (the in-process channel map, ADR-0019). A future multi-instance fan-out (LISTEN/NOTIFY or a bus) would need to route the eviction to whichever instance holds the socket; noted, not built.
- Regression test (`sync.gateway.spec.ts`, a live WS server): connect as the seeded member, call `disconnectUser`, assert the socket closes (1008) and a subsequent broadcast delivers no frame; `disconnectTrip` closes the socket too.

## Alternatives considered

- **Re-verify membership on a periodic WS heartbeat.** Useful defense-in-depth, but slow (a removed member keeps receiving until the next beat); explicit eviction on removal is immediate. The heartbeat can be added later as a backstop.
- **Put trip authorization in the access token and rely on its 15-min expiry.** Rejected long ago (ADR-0020) precisely so removal is immediate; that property is what this restores for WS.
