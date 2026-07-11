# Trip-mode editing model, the on-the-ground day view, and the real clock

**Status:** ACCEPTED (PM session 2026-07-12)
**Produces:** ADR-0025, ADR-0026, ADR-0027; doc updates to `product/modes.md`; tasks T-051, T-052, T-053.
**Refines:** ADR-0016 (modes are one surface). **Builds on:** ADR-0011 (hard/soft), ADR-0018 (now is derived, not stored).

## Problem

Three tangled issues surfaced in a PM review of Trip mode:

1. **The frontend clock is a demo stub.** `useClock` freezes "now" at `DEMO_NOW = 2026-07-07T18:52`, while the **backend guards against real server `Date.now()`**. So a reschedule the frontend thinks is valid ("move to 18:52 today") the server rejects as `MOVE_INTO_PAST` (5 days ago). That mismatch — not the reschedule logic — is why rescheduling feels broken.
2. **Rescheduling a past-due soft event is unsupported.** The common on-the-ground case (a 2pm plan still unmarked at 4pm) has no forgiving action; only ±step nudges exist, and the past guard fights them.
3. **No agreed line between Trip-mode and Plan-mode editing.** ADR-0016 said "editing is never hard-disabled in Trip mode," but never defined _what_ belongs where. The maybe-shelf / skip model is incoherent: `maybe.consumed` is a permanent one-way flag, `skip` filters an event out with only a transient undo toast, and a scheduled-then-skipped maybe becomes unrecoverable.

## Decisions

### A. Edit capability tiers (ADR-0025)

An edit's **tier is decided by blast radius, not by mode**. Mode decides _how_ you reach a tier.

| Tier                                                                            | Contents                                                                                                                                                                                                        | Trip mode                        | Plan mode                 |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------- |
| **1 — on-the-ground verbs** (one tap, on the item)                              | Soft: Done · Skip · Do-it-now · Delay/Earlier · Swap · Navigate. Hard: Navigate · On-my-way · Delay ±step _(confirm)_ · Done. Maybe-shelf → Schedule onto **today**. Add a **quick soft** event for today.      | ✅ primary surface               | ✅ available              |
| **2 — single-item structural** (opens an **inline edit sheet**, drops you back) | Edit one event's details/exact time · flip one event **hard↔soft** · **Delete** an event · quick-add a **booking** · add a **hard event** · link a booking to an event                                          | 🔓 via sheet                     | ✅ first-class            |
| **3 — trip-level building** (must be in Plan mode)                              | Add/remove **days** · move/reorder events **across days** · bulk arrange · trip **dates / destination / timezone** · **invites** & membership · maybe-shelf **research** (collecting places) · **budget** setup | 🚫 → "Switch to Plan to do this" | ✅ the point of Plan mode |

Two deliberate distinctions:

- **Skip vs. Delete.** On the ground you _Skip_ (Tier 1, reversible, keeps the row); true _Delete_ is Tier 2 (destroys). You cannot fat-finger a destroy on the timeline.
- **Schedule-from-shelf vs. build-the-shelf.** Pulling a parked idea onto today is Tier 1 (spontaneity); _collecting_ places is Tier 3 research.

**Escape hatch:** Tier-2 taps open a **bottom sheet** scoped to the one edit, over Trip mode; commit → back to the day ("unlock this one thing"). Tier-3 taps show a **"Switch to Plan to do this"** prompt (the existing per-device override, ADR-0016) — trip-level building deserves the Plan surface and its tablet layout.

This refines ADR-0016's "never hard-disabled": Tier 3 is _gated_ in Trip mode, but the gate is a one-tap, discoverable mode switch — not a dead end.

### B. The clock (ADR-0026)

- `useClock` defaults to real `Date.now()`. `DEMO_NOW` stops being the source of truth — frontend "now" and the backend's guard clock agree.
- A **dev-only time-travel control** (compiled out / hidden in prod) sets and scrubs "now" to any instant, persisted in `localStorage`, so Trip mode — slip states, countdowns, the ADR-0016 mode auto-switch — stays testable at any point in a trip's range. This _replaces_ the frozen stub with a controllable override, keeping testability without shipping fiction as the default.
- Mode auto-switch and slip detection both read this one clock, so time-travel exercises the whole system coherently.

### C. Soft-item lifecycle: derived phases, slip, shelf-as-parking-lot (ADR-0027)

**Status is only ever set by a human tap** (`planned | done | skipped`). The day view _derives_ a lifecycle phase from the clock on top of status — every past event visibly reads as "handled" without any auto-write. This is the same principle ADR-0018 used to drop stored `now`: storing a derived state needs something to flip it and goes stale offline.

| Derived phase             | Condition                                  | Treatment                                                                                                                            |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Upcoming**              | starts in future                           | normal                                                                                                                               |
| **Now**                   | window contains now                        | amber                                                                                                                                |
| **Passed (hard)**         | hard, `endsAt` past, still planned         | settled/greyed, reads as "happened"; falls out of Now/Next automatically (already time-derived). Subtle "didn't happen?" → Skip/edit |
| **Slipped (soft)**        | soft, past, still planned, **today**       | slip cluster at top of today under "Slipped — still on?"; **Do it now** (→ now, + ripple) / Skip / Pick a time                       |
| **Unresolved (past day)** | soft, past, planned, on an **earlier** day | greyed "not done" — factual history, not chased forward                                                                              |
| **Done / Skipped**        | human tapped                               | as designed                                                                                                                          |

**The shelf is a parking lot.** An idea is always in exactly one place: **parked** (shelf), **placed** (a day), **done**, or **deleted**.

- **Schedule** a shelf idea → it _leaves_ the shelf, becomes a day event. Consumed items stop rendering — no lingering disabled tombstone.
- **Skip** a soft event → it _returns to the shelf_ as a parked idea. Durable and reversible (the shelf is its home, not a 5-second toast). This makes Tier-1 Skip honest.
- The shelf renders **unplaced maybe ideas + skipped soft events**, uniformly — each one tap to _Schedule onto a day / Do it now / Pick a time_.
- **Done** stays checked off on the day. **Delete** (Tier 2) is the only thing that truly destroys.

**No schema change.** `MaybeItem.consumed` = "placed"; skipped events already carry `status`. The shelf view is a client-side union of unconsumed maybes + skipped soft events.

### D. The move-into-past guard (part of ADR-0027)

The backend `MOVE_INTO_PAST` guard is **correct and already scoped** — it only fires on a bare `startsAt` nudge (skipped when `date` is passed, i.e. a Plan-mode reassignment). It only _looked_ broken because the frontend clock diverged from it. After the clock fix (B):

- **Delay/Earlier** nudges: guard stays — you can't shove a soft event before now.
- **Do-it-now**: targets the current instant; must not be a casualty of the `<= now` comparison (send `now` and use `<` server-side, or send `now`+ε).
- **Edit-sheet "Pick a time"** and all **Plan-mode moves**: already exempt (they carry `date` / go through PATCH).

## Scope boundary

- **No new epic** — this all lives under `trip-content-ui` (which already covers mode switching + event/booking edit UI); its description is widened.
- **T-047** (event create/edit/delete form) is the Tier-2 edit sheet T-053 consumes — not rebuilt.
- **T-030** (hard-event edit confirmation) is the gate Tier-2 hard edits route through — not reinvented.
- **T-019** (mode switch) gains a dependency on T-051 (the real clock).

## Tasks

- **T-051** — Real clock + dev time-travel (S). Swap `useClock` default to `Date.now()`; dev-only settable/scrubbable "now" in `localStorage`, hidden in prod; update time tests. Feeds T-019.
- **T-052** — Soft-item lifecycle (M/L). Derived phase function; slip cluster + Do-it-now verb + ripple; shelf-as-parking-lot (skip parks, consumed items stop rendering, reschedule-from-shelf); ensure Do-it-now clears the `MOVE_INTO_PAST` guard. Needs T-051.
- **T-053** — Capability tiers + Plan escape (M). Tier map as shared constant; DayView verb rows become tier/mode-aware; wrap T-047's form as the Tier-2 bottom sheet; gate Tier-3 with the "Switch to Plan" prompt. Needs T-019, T-047, T-052.

## Follow-up doc work (in the tasks' acceptance criteria)

- `design/design-language.md` — slip treatment, shelf card grammar, the Tier-2 bottom sheet.
- `architecture/api-contract.md` — Do-it-now semantics and the guard-scope note.
- `product/modes.md` — the capability matrix (done in this session).
