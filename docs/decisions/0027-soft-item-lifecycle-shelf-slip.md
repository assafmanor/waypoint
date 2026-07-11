# 0027 — Soft-item lifecycle: derived phases, slip/Do-it-now, shelf as a parking lot

**Status:** Accepted
**Date:** 2026-07-12
**Builds on:** [0011](0011-hard-soft-event-model.md) (hard/soft), [0018](0018-timeline-data-model-shape.md) (now is derived, statuses are `planned | done | skipped`)

## Context

The on-the-ground day view mishandled the lifecycle of a soft item in three ways:

1. **Past-due events were left in limbo.** A planned soft event whose time had passed stayed indistinguishable from an upcoming one, with no forgiving way to act on it — the common "it's 4pm and the 2pm plan is still sitting there" case.
2. **`maybe.consumed` is a permanent one-way flag.** Scheduling a maybe item disabled its shelf card forever as a "scheduled" tombstone.
3. **`skip` filtered an event out of the day with only a transient undo toast.** `restore` was rendered only for _done_ items, so once the toast passed a skipped soft event had no path back. Combined with (2), a scheduled-then-skipped maybe became unrecoverable.

Two separate concepts — `maybe.consumed` and `event.status = skipped` — both meant "not on today" and didn't talk to each other.

## Decision

**1. Derive the lifecycle phase from the clock; never auto-write status.** Status is only ever set by a human tap (`planned | done | skipped`). On top of it, the day view computes a phase — so every past event visibly reads as "handled" without any stored mutation:

| Phase                 | Condition                            | Treatment                                                                                                              |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Upcoming              | starts in future                     | normal                                                                                                                 |
| Now                   | window contains now                  | amber                                                                                                                  |
| Passed (hard)         | hard, `endsAt` past, still planned   | settled/greyed, reads as "happened"; falls out of Now/Next (already time-derived). Subtle "didn't happen?" → Skip/edit |
| Slipped (soft)        | soft, past, planned, **today**       | slip cluster at top of today, "Slipped — still on?"; **Do it now** (→ now, + ripple) / Skip / Pick a time              |
| Unresolved (past day) | soft, past, planned, **earlier day** | greyed "not done" — factual history, not chased forward                                                                |
| Done / Skipped        | human tapped                         | as designed                                                                                                            |

This mirrors ADR-0018's reasoning for dropping stored `now`: auto-writing a derived state needs a trigger, emits per-event `Change` traffic, can write a false "done," and goes stale on an offline phone.

**2. The shelf is a parking lot.** An idea is always in exactly one place: **parked** (shelf), **placed** (a day), **done**, or **deleted**.

- **Schedule** a shelf idea → it leaves the shelf, becomes a day event; consumed items stop rendering (no tombstone).
- **Skip** a soft event → it returns to the shelf as a parked idea — durable and reversible, making Tier-1 Skip honest (ADR-0025).
- The shelf renders **unplaced maybe ideas + skipped soft events**, uniformly; each one tap to Schedule / Do-it-now / Pick a time.
- **Done** stays checked off on the day; **Delete** (Tier 2) is the only true destroy.

**3. The `MOVE_INTO_PAST` guard stays, correctly scoped.** It fires only on a bare `startsAt` nudge (skipped when `date` is passed). Delay/Earlier keep it; **Do-it-now** targets the current instant and must not be rejected by the `<= now` comparison (send `now`, compare with `<`, or send `now`+ε); edit-sheet Pick-a-time and Plan moves are already exempt.

## Consequences

- Every past event has a clear, honest, derived state — nothing lies, nothing goes stale offline, no sync churn.
- A whole failure class disappears: no dead tombstones, no unrecoverable skips. Skip is genuinely reversible because the shelf is its durable home.
- **No schema change** — `MaybeItem.consumed` = "placed"; skipped events already carry `status`. The shelf is a client-side union.
- Implemented in T-052; consumed by T-053's tier wiring.

## Alternatives considered

- **Auto-write `done`/`passed` to elapsed events:** rejected — false records, `Change` traffic per event, needs a trigger, stale offline (the ADR-0018 flaw).
- **Derive for soft, auto-settle hard:** rejected — reintroduces a status-writer for hard events and its offline edge cases for marginal benefit.
- **Minimal back-paths (a "Skipped today" section + un-consume on skip):** rejected — keeps the two-concept split and its future edge cases; the parking-lot unification removes mechanism instead of patching it.
