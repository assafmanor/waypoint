---
date: 2026-08-18
kind: design session
surface: tasks — sub-tasks, and the brief's §C
status: designed, not built
mockup: mockups/a-task-that-holds-a-checklist-v1.html
adr: docs/decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md
---

# A task can hold a checklist, and the exclusion is paid once

A PM pass, then a mockup, then an ADR — the order the backlog line asked for. **Nothing is
built**, and the phase this belongs to is not scheduled.

The ask is the backlog's own line, carried since 2026-08-15:

> **Sub-tasks — a task holding a checklist of its own** (owner ask). … it wants a **short PM
> pass before a mockup**, designed **together with the brief's §C** — a parent's `2/5` read
> and `completedBy`'s are the same problem, and answering them apart is how two progress
> vocabularies ship.

Settled before the session started and not reopened: **depth is capped at one level**, and
**a parent's completion is derived, not written**.

Deliverables: [`mockups/a-task-that-holds-a-checklist-v1.html`](../../mockups/a-task-that-holds-a-checklist-v1.html)
and [ADR-0196](../decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md),
which also closes the tasks brief's **§C** — the last of its six open design questions —
and amends [ADR-0193 §2](../decisions/0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md)
in place.

## The three questions, answered

**One table or two → one.** `Task.parentTaskId`. ADR-0152 §3's volume test buys a second
noun only against a firehose, and five people writing a checklist are not one. The
lighter-row saving is eight nullable columns; the cost is a second entity type, snapshot
array, cache channel, outbox verb set, applier, Dexie table and REST module.

**Does a sub-task carry its own assignee → yes, and it is the ONLY optional thing it
carries.** At five people the value of a checklist is splitting it; a checklist nobody can be
given is a `body` field with rounder corners, and the task already has one. No deadline, no
`important`, no host FK, no `body`, no `derivedKey`, no children, no `assignedToAll` — each
refused at the schema with its reason.

**What is the progress read → an arc and a number, and they are the same two elements
`completedBy` uses.** The arc is the shipped tick's circle filled to the fraction; the count
is `2/5` in the meta line beside the deadline. On an `everyone` task the arc is the **group's**
progress and the ✓ inside it is **your own answer** — §C's "legible to you first, to the
organiser second" met in two channels of one element, with no second identity system on the
row.

## What reading the code changed, before anything was drawn

**The exclusion the backlog line warns about is not 23 filters — and the app has already
shipped that bug once.** Six derivations in `lib/tasks.ts` already carry a per-call-site
`isManual(task)` guard, and ADR-0193 §2 was amended precisely because **one surface forgot
it**. So the design pays the exclusion **once**, at the state boundary: `useTrip()` exposes
top-level tasks with each parent's status already resolved, plus a `subtasks` map. Nineteen
of the twenty-three derivations are then correct **unchanged**, and derivation twenty-four is
correct by default rather than wrong by default.

**Three findings the audit produced that prose would not have:**

- **`taskCountFor` has zero production call sites.** The backlog line names it among "the
  sharpest counting ones"; every mark on every host row goes through `hostCountForContext`
  instead, at all four call sites. Two spec files are its only callers.
- **`openTaskCountsByHost` is correct against children even handed the raw array** — its loop
  `continue`s when no host FK is set. Held up by the refusal on a child's host, not by the
  boundary split, and knowing which is what makes it a fact rather than a coincidence.
- **The client-side cascade has a hole.** `dropHostedForHostChange` guards on
  `change.entityType in NOTE_HOST_FIELD`, which `ENTITY_TYPE.TASK` is not in — so a deleted
  parent's children would sit orphaned in memory and in Dexie until the next cold sync. The
  repair is a branch in the tasks-shaped wrapper that already exists, not a sixth key in a map
  notes also read.

**And one place the naive answer is wrong.** `שלי` filtered on the parent's own assignee
would hide a task whose third step is assigned to the person doing the filtering — the one
filter whose whole job is "what do I owe". So the facet predicate takes the child index. It is
the only derivation where the boundary split is not the whole answer, and it is the reason the
audit was worth doing rather than asserting.

## What the render decided, and two defects it produced

- **A parent row is 61px against the leaf beside it at 62px**, its lead box 44 × 44 in both,
  and its title column 219px at 360 (ADR-0188 measured 195px for a shipped manual row). The
  arc buys no width and costs no height, so "one noun at one scale" survives.
- **A child's tick measures 44 × 44 of touch** from `.tsk-tick-sec`'s shipped negative-margin
  recipe. The 44px question the indent raises was already answered by ADR-0191 §5.
- **The refusals are measured, not argued:** five children carrying everything a root task
  carries take **298.8px** against **134px** as specified — and each prints its own deadline in
  `--miss` under a parent that is not overdue.
- **§C costs exactly what a checklist costs:** the open region holding five people is **134px**,
  the same 134px as five children. One region, one row shape, two contents.
- **`2/5` needs no bidi isolate here**, rendered both ways in the real Hebrew context — a `CS`
  separator between two `EN` runs takes the digits' direction. It gets one anyway, because
  ADR-0118's rule is about the run and not about the cases that survive without it.

**Two defects the file produced by being rendered, both invisible in source.** A percentage in
a **radial-gradient colour stop** resolves against the gradient's ray rather than the box, so
the arc's first draft (`calc(50% - 2.5px)` under `closest-side` on a 26px circle) drew a **pie
chart with a 4px hole** — and a pie at 4/5 is indistinguishable from done. And the count's
modifier class was called `.gap`, which `App.css` already ships as a global `display: flex`:
the count became a block-level flex box, dropped to a line of its own, and took the parent row
from 61px to **89px**. The obvious word is usually taken.

## The one place this argues with a shipped decision

ADR-0188 §4 was reversed by the owner with _"makes no sense that the indication for a complete
task is different for automatic and manual tasks"_. A parent's leading element **is** different
— it is a read rather than a control. The distinction that reversal was about is one the reader
cannot see the cause of; a task with a checklist prints its cause inside the same element, as
the fraction the ring is filled to, and again as the count one line below. The rule that
survives is the real one, and it is honoured.

The exit that reversal itself points at — make the circle work — is closed here by a different
door: for a readiness check it was right because the derived data cannot be written, and a
parent's children **can** be, so a parent needs no overlay at all. A bulk verb on the parent's
tick was drawn and rejected on harm rather than cost: everything is LWW (ADR-0012), so a bulk
un-tick erases ticks four other people wrote, in one press, with no warning.

## Left open, deliberately

- **The phase.** This is not scheduled against the tasks build plan's six phases, and it
  depends on nothing in them except §C's `assignedToAll`, which is phase 6 and also unbuilt.
- **The cap of 20** is a constant, from 26.8px per child row against a 640px viewport. A real
  phone can move it.
- **Two feel questions for the device pass:** whether a 2.5px arc at 26px reads as a fraction
  under a thumb, and whether the count alone carries a parent at `0/n` — where the ring is the
  same **1.21:1 / 1.33:1** hairline already on the backlog.
