# 0194 — A task deadline can pin its zone

**Status:** Accepted, **built** (2026-08-17).
**Date:** 2026-08-17

**Amends:** the tasks brief's §10 and [0193](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md)'s neighbourhood — a task now stores `displayTimezone`, which three places previously recorded as deliberately absent.
**Builds on:** [0107](0107-events-carry-a-display-timezone.md) (an event carries a display zone; the resolver), [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) (the task entity).

## Context

> _"Timezone should be selectable in the task form (create and edit), the same way as in the event and booking forms."_ (owner, 2026-08-17)

A task deliberately had **no** stored zone, and it was written down three times — in `taskSchema`'s docblock, in the Prisma model, and in the tasks brief §10. The due zone was derived through ADR-0107's resolver with `dueAt` in place of `now`: _the zone you will be standing in when this falls due_. The form's chip stated that zone and offered no pin.

That was the right decision **while nobody could choose**. A traveller's "Thursday 18:00" does mean 18:00 wherever they will be, and deriving it keeps a deadline honest across a zone crossing with nothing to maintain.

## Decision

### 1. A picked zone is stored, because a picked zone that is not stored is not picked

`Task.displayTimezone` joins the model, nullable, `Event.displayTimezone`'s twin down to the name. Absent = derived, which is every task written before this and every one where the chip is left alone.

**The alternative was authoring-only** — let the picker decide how the typed wall-clock becomes an instant, store nothing, keep deriving the display. Rejected, and the reason is the exact bug `Event.displayTimezone` exists to prevent: pick Tokyo, type 09:00, and a resolver answering "the zone you will be in" renders it as 03:00 somewhere else. **A deadline showing a wall-clock nobody typed is worse than a deadline with no zone control at all**, because the first looks like data and the second looks like a missing feature.

### 2. The pin wins in ONE function, which is why every surface honours it

`dueZone` takes the task rather than the instant and prefers `displayTimezone`. Both consumers — `taskDue` (what a row prints) and `tasksDueSoon` (the band's window) — already came through it.

**Counted before the change rather than asserted after it** (root `CLAUDE.md`'s rule): two call sites, both in `lib/tasks.ts`. That is the whole audit, and it is why "store it" and "store it and make every surface honour it" turned out to be the same work.

### 3. The chip is always offered, unlike the event form's

`EventForm` withholds `onChange` once a **place** decides the zone, because correcting it at the place is the honest edit (ADR-0107 §3: place wins). A task has no place, so nothing can out-rank the pin and the chip is offered whenever there is a deadline with an hour on it.

Suggested zones come from `zoneEvidence` — the trip's primary and the zones its itinerary touches — and **not** from a `places` prop the way the event form builds them. An event reads the place list because it has a place; a task has none, so reaching for `places` added a dependency this component does not need. It also broke two suites whose `useTrip` mock had no reason to provide one, which is how the unnecessary dependency announced itself.

### 4. `null` un-pins

`updateTaskSchema` types it `nullish`, matching `dueAt`: absent = untouched, `null` = back to derived. A cleared deadline clears the pin with it — a zone pinned to no date is a value nothing can read.

## Consequences

- **The migration is additive and cannot change how a single stored task reads**: nullable, no default, no backfill, and NULL is the existing behaviour. Reversible by dropping the column.
- Three places that recorded the absence as deliberate are corrected in the same change rather than left to contradict the code — `taskSchema`'s docblock, the Prisma model comment, and this ADR standing in for brief §10.
- A task's deadline and an event's time now behave the same way, which is what the request asked for and what makes the two forms teachable as one idiom.
- **Not done:** the `⋯` menu offers no "reset zone" — the chip's own `חזרה לאזור אוטומטי` is the way back, exactly as on the event form.
