# 0029 — Trip-mode day-scope: verb gating for past and future days

**Status:** Accepted
**Date:** 2026-07-13
**Refines:** [0025](0025-trip-mode-edit-capability-tiers.md) (blast-radius tiers), [0027](0027-soft-item-lifecycle-shelf-slip.md) (derived phases, Do-it-now)

## Context

ADR-0025 decides an edit's tier by **blast radius**, not by mode, and says nothing about **which day** is being viewed when the edit happens. Day navigation already exists and is mode-agnostic (`activeDate`/`setActiveDate`, clamped to the trip's date range) — so today, in Trip mode, a member can flip the day-strip to yesterday or next week and fire any Tier-1/Tier-2 verb at it. Nothing currently distinguishes "acting on what's in front of me right now" (the premise of Trip mode, ADR-0016) from "rewriting a day that already happened" or "pre-acting on a day that hasn't arrived."

Two gaps, surfaced together:

1. **Past days.** Browsing a day before trip-local "today" looks and behaves identically to today — every create/edit/delete/move verb still works on it. There's no visual signal you're looking at history, and no lock stopping a silent rewrite.
2. **Future days.** Nothing stops **Do-it-now** (ADR-0027) from firing on a day that hasn't started — but Do-it-now moves an item to _the current instant_, which is incoherent for a day that isn't today.

## Decision

**Day-scope is a second axis, orthogonal to ADR-0025's tiers.** Tier decides _what_ an edit does; day-scope decides _whether it's reachable at all_, based on the viewed day vs. trip-local "today" — always derived via `todayInTz(trip.timezone, new Date(getNow()))` compared against the event's own `date` (never stored, per ADR-0018/0026). An overnight hard event (starts 23:00, ends past midnight) is scoped by its `date`, not its `endsAt` — consistent with how it's already anchored everywhere else.

**Trip mode only** — Plan mode has no "past/future" distinction; it's the building surface regardless of which day is on screen.

- **Past day, Trip mode:**
  - **Locked:** create, edit, delete, move (Delay/Earlier/Swap) — rewriting history isn't "on-the-ground," it's Tier-3-adjacent structural work that happens to target an old day.
  - **Still allowed:** Done, Skip, Navigate — retroactively resolving "did this actually happen?" is legitimate cleanup, doesn't rewrite time, and is exactly what ADR-0027's "Unresolved (past day)" phase expects a human to eventually settle.
  - The day view itself carries a visual signal (not just the day-strip pill) that you're looking at history.
- **Future day, Trip mode:**
  - **Locked:** Do-it-now only — it targets "now," which doesn't exist yet for that day.
  - **Still allowed:** everything else (Done, Skip, Delay/Earlier, Swap, Navigate, the Tier-2 edit sheet) — checking or nudging tomorrow's flight is still reacting to a real plan, not trip-building (Tier 3 already owns add/remove days, cross-day reorder, bulk arrange).
- **Today, Trip mode:** unchanged — full Tier-1/Tier-2 surface, exactly as ADR-0025 already describes.

## Consequences

- Answers the open product question ADR-0025/0027 left unresolved: day-scope locking is now a decided rule, not a per-implementer judgment call.
- `DayView.tsx`/`verbs.ts` gate by day-scope in addition to tier; the tier map (T-053) and the day-scope rule (this ADR) are two independent checks a verb must clear, not one merged mechanism.
- Hard-event edits that do clear day-scope still route through the single ADR-0011/T-030 confirmation gate — no new confirmation path.
- Implemented in T-061 (day-scope gating + past-day visual), on top of T-062 (day-switcher/`activeDate`) and gated behind T-053 (tier map) landing first.

## Alternatives considered

- **Lock everything on non-today days (past and future alike):** rejected — would also hide Done/Skip/Navigate on a past day and Delay/Swap on a future one, breaking legitimate on-the-ground use (settling yesterday's stragglers, nudging tomorrow's known plan) for no safety gain.
- **Fold day-scope into the existing tier numbers (e.g. "past-day edit = Tier 3"):** rejected — conflates two different questions (blast radius vs. temporal reachability); a Tier-1 verb like Done doesn't change blast radius by moving to yesterday, so it shouldn't inherit Tier-3's gate-to-Plan-mode UX.
- **Only handle past days, leave future-day Do-it-now unaddressed:** rejected — same underlying axis, and the incoherence (Do-it-now on a day that hasn't started) is a real, easy-to-hit bug otherwise.
