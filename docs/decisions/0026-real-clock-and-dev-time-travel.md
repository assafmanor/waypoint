# 0026 — Real clock as the time source + dev time-travel

**Status:** Accepted
**Date:** 2026-07-12
**Relates to:** [0018](0018-timeline-data-model-shape.md) (now is derived, not stored), [0016](0016-plan-trip-modes-one-surface.md) (mode auto-switch reads the clock)

## Context

The frontend `useClock` hook returns a demo stub: "now" is frozen at `DEMO_NOW = 2026-07-07T18:52`, advancing only by real elapsed seconds so countdowns tick. Every client-side time judgment — the amber "now" row, day progress, mode auto-switch — measures against that fiction. Meanwhile the **backend guards against real server `Date.now()`** (e.g. the `MOVE_INTO_PAST` check). The two clocks disagree by days, so a reschedule the frontend believes is valid the server rejects as being in the past. Rescheduling therefore appears broken when the logic is fine — the clocks just don't agree.

Simply deleting the stub for `Date.now()` would fix the mismatch but lose the ability to exercise Trip-mode behavior (slip states, countdowns, the date-driven mode switch) unless the real wall-clock happens to fall inside a trip's date range — which, for a seeded demo trip, it rarely does.

## Decision

- **Real `Date.now()` is the default time source** everywhere on the client. `DEMO_NOW` stops being the source of truth, so the frontend clock and the backend's guard clock agree.
- **A dev-only time-travel control** can set and scrub "now" to any instant, persisted in `localStorage`, and is compiled out / hidden in production builds. It replaces the frozen stub with a _controllable_ override.
- **One clock drives everything** derived from time — the mode auto-switch (ADR-0016) and the slip/lifecycle phases (ADR-0027) both read it — so time-travel exercises the whole system coherently.

## Consequences

- The reschedule/`MOVE_INTO_PAST` confusion disappears at the source: client and server share a clock.
- Trip mode stays fully testable at any point in a trip without waiting for real dates — via the dev control, not fiction shipped to users.
- The override is a dev affordance only; it is never synced and never present in prod. Production "now" is always real.
- Implemented in T-051; T-019 (mode switch) depends on it.

## Alternatives considered

- **Keep the frozen stub:** rejected — it is the root cause of the reschedule confusion and hides real time-dependent behavior.
- **Just swap `DEMO_NOW` → `Date.now()` and delete the scaffold:** rejected — loses Trip-mode testability whenever the real date is outside the demo trip's range.
- **Store a "simulated now" server-side:** rejected — reintroduces stored derived time (the exact thing ADR-0018 removed) and would leak a debug concept into shared state.
