# Session 11 — Gap-chip fix for start-only events + row end-times (2026-07-14)

**Outcome:** Bug fix + small display enhancement surfaced by manual testing (a user screenshot of a self-built trip). Branch restarted from `main` after #72.

## Bug: gap chips never appeared on real trips

The builder's gap chip measured dead time from the **previous event's `endsAt`** to the next event's `startsAt`, and bailed if `endsAt` was missing. The event-create form leaves the end time **optional**, so hand-built trips have start-only events → the gap detector always returned null → no chip ever showed (the seeded demo only worked because its fixtures carry end times). A day with an obvious 8-hour hole showed nothing.

**Fix:** an event with no `endsAt` is treated as its **start instant** (`aEnd = a.endsAt ?? a.startsAt`), so the visible hole between consecutive start-only events still surfaces. Extracted the logic to `lib/gaps.ts` (`gapBetween` + `GAP_MIN_MINUTES` + `GapDefaults`) with a unit test — it was inline and untested, which is exactly why the miss shipped.

## Enhancement: rows show the time range

Builder rows (and the Trip-mode day rows) showed only the start time. They now render `start–end` when an `endsAt` exists (`.bld-time` / `.item .time`, `white-space: nowrap`).

## Verified

Full CI pipeline locally against real Postgres (`typecheck · build · test · lint · format:check`) — all green; **226** tests (154 frontend incl. new `gaps` suite + 72 backend).
