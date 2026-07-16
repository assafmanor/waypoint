# 0044 — Settling (Done / Skip / Restore) on a finished trip

**Status:** Proposed
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

## Recommendation (for decision)

Lean **option 2**, scoped tightly: a finished trip stays a read-only _structural_ archive, but **settle status (Done / Skip / Restore) remains editable**, reusing the past-day archive's exact affordances (ADR-0043 §4). Rationale: settling is a different plane from structural editing — ADR-0042 already treats status as syncable shared state, and ADR-0043 already established that the archive's job is retrospective settling. Extending that one plane past the window is consistent; freezing it is the odd stop.

This needs sign-off because it **revises ADR-0040's "read-only archive"** into "read-only _structural_ archive, settle-editable," and requires a home for the settle affordances inside the Plan-mode finished-trip view (or a scoped read-only Trip-mode archive view — a secondary design question).

## Scope / non-goals

- Not proposing to reopen create / edit / delete / move / retime on a finished trip — those stay Plan-gated and, post-window, locked (ADR-0029/0040).
- Not changing anything about the **live** trip's past-day behavior — that shipped with ADR-0043.
- The exact surface (Plan-mode inline settle vs. a read-only Trip-mode archive view) is deferred to the implementing ADR once the direction is chosen.
