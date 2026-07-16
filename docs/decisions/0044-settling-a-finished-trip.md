# 0044 — Settling (Done / Skip / Restore) on a finished trip

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (finished trip = read-only archive), [0043](0043-day-view-now-line-phases-and-archive-chrome.md) (Done reframed as a retrospective record; settling is reversible on a past day)

## Context

ADR-0043 made settle **reversible on a past day _within the live trip_**: you can mark Done/Skip and un-mark them (the interactive ✓ / `שחזר`), because settling is the archive's retrospective job and offering "check but never uncheck" is a mistake with no correction.

The open question (raised 2026-07-16): should that same retrospective settling extend to a **finished trip** — after the live window closes?

The friction is [ADR-0040](0040-trip-mode-access-window-and-past-trip-archive.md): a finished trip is a **read-only archive**, and Trip mode is gated to the live window — a finished trip is viewed in **Plan mode**, which has no settle UI at all (no now-line, no phases, no settle strip, no Done ✓). So "settle a finished trip" is not a gate flip on an existing surface; it means **introducing a settle surface where ADR-0040 deliberately put none**.

There is a real user need behind it: the trip ends, someone never got around to marking the last day's dinner as "היינו," and wants to tidy the record afterward — or fix a mis-tap. The record is the point of the reframed Done (ADR-0043 §2); a record you can't correct once home is a weak record.

## Options

1. **Leave it — finished trips stay fully read-only (status quo, ADR-0040).** Simplest, preserves the archive's "it's over, it's history" clarity. Cost: the record is frozen with whatever (in)accuracies it had at the window's close.
2. **A read-only archive that still accepts settle-only writes.** Keep Plan mode and the read-only chrome for structure (no create/edit/delete/move), but surface the same Done/Skip/Restore settle affordances the past-day archive has, on the finished trip's day list. Settling is status-only and already offline-syncable (ADR-0042), so it does not reopen the structural data plane. Cost: "read-only archive" now has an exception that must be explained; a settle surface has to live somewhere in the Plan-mode finished-trip view.
3. **A bounded grace window.** Allow settling for N days after the trip ends, then freeze. Cost: arbitrary cutoff, extra state, and it still needs option 2's surface during the window — complexity without a clear win.

## Decision

**Option 2 is adopted.** A finished trip stays a read-only _structural_ archive, but **settle status (Done / Skip / Restore) remains editable**, reusing the past-day archive's affordances (ADR-0043 §4). Rationale: settling is a different plane from structural editing — ADR-0042 already treats status as syncable shared state, and ADR-0043 already established the archive's job is retrospective settling. Extending that one plane past the window is consistent; freezing it is the odd stop.

This **revises ADR-0040's "read-only archive"** into "read-only _structural_ archive, settle-editable."

**Guiding principle (broader than this ADR):** archived days and trips are _mostly_ read-only, but a small set of sanctioned exceptions — settle being the first — are allowed and must be **supported by the infrastructure**, not bolted on. The data/sync plane should treat "settle a past/finished thing" as a first-class, permitted write (it already is, per ADR-0042), and the access/permission layer should express "structurally frozen, settle-editable" rather than a blunt read-only flag.

**Deferred to later, not now:** a **time-bounded freeze** — stop accepting even settle edits after some interval past the trip's end (the option-3 idea). Not adopted now (arbitrary cutoff, extra state); revisit if unbounded post-trip edits prove to be a problem.

**Open sub-question — the surface & how a "check" looks in an archive (Plan mode has no settle design yet).** The Plan builder row (`PlanDay.tsx` `BuilderRow`) currently shows _no_ settle status at all and, when read-only, carries no trailing affordance; skipped events are filtered out. So this decision needs an accompanying **presentation design** for the done/skip/unresolved state and its toggle in the archive. Two candidate directions, to be resolved in a follow-up (likely its own short ADR + mockup):

- **(a) Settle control on the Plan archive row.** Keep the finished trip in Plan mode (ADR-0040) and add a settle affordance to the read-only builder row's free trailing slot — a `--ok` green ✓ record (identical to Trip mode; the status mini-palette is mode-neutral, ADR-0028, so it costs no violet/amber/teal budget) that toggles undo, plus a neutral "settle?" ghost for an unresolved item. Smallest change; keeps ADR-0040's mode routing intact.
- **(b) Reuse the past-day archive treatment.** Render a finished trip's day in the _same_ read-only archive DayView a live trip's past day uses (settle strip + interactive ✓), making ADR-0043 §4's "one archive language" literal. Cleaner conceptually, but re-routes the finished-trip day surface away from the Plan builder.

## Scope / non-goals

- Not proposing to reopen create / edit / delete / move / retime on a finished trip — those stay Plan-gated and, post-window, locked (ADR-0029/0040).
- Not changing anything about the **live** trip's past-day behavior — that shipped with ADR-0043.
- The exact surface (Plan-mode inline settle vs. a read-only Trip-mode archive view) is deferred to the implementing ADR once the direction is chosen.

## Editability is three cases, not two (clarification)

The read-only gate keys off the **trip phase**, not the viewed day (`tripPhase` in `lib/mode.ts`; `PlanDay` sets `readOnly = tripPhase === 'past'`). So a live trip's past day is deliberately _more_ editable than a finished trip, and the settle control this ADR adds is **finished-trip-only** in Plan:

| Context                              | Structure                                                  | Settle (Done / Skip / Restore)                        |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| Live trip · past day · **Trip mode** | read-only (rebuild = switch to Plan)                       | yes — archive settle strip + interactive ✓ (ADR-0043) |
| Live trip · past day · **Plan mode** | **fully editable** — create/edit/move/delete/reorder/shelf | not shown here — settle lives in Trip mode            |
| **Finished trip** · Plan mode        | frozen (structural archive)                                | **the settle control this ADR adds**                  |

Rationale: while the trip is live you rebuild in Plan and settle in Trip mode — the ADR-0043 division (Plan builds, Trip follows/settles) holds. A finished trip has no Trip mode (ADR-0040), so Plan mode is the _only_ surface, and it must host the settle exception. The settle control therefore appears on a Plan row **only when `readOnly` (finished trip)** — never on a live trip's fully-editable Plan rows.
