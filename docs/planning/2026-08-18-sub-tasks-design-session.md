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

## Round two — the authoring half, which the first version left as a label

The owner's reading of the first version:

> The mockup is missing one critical part of the design: how do you create sub tasks? How do
> you decide whether a task is one step or has multiple sub tasks? How do you edit them?
> Add/remove etc.

Correct: the first version drew the read side completely and left `＋ משימה` as a word in a
foot. Mockup §7–§9 and ADR §10–§12 are the answer, and they are **live** rather than drawn —
the question is about a flow, and a still frame of a composer answers it about as well as a
photograph of a keyboard answers "how does typing feel".

**There is no mode to decide.** A task becomes a parent when it gets its first step and stops
being one when the last is deleted — both `subtasks.get(id)?.length`. Nobody classifies a task
before they know whether it has parts, and a stored flag would permit a checklist with no
steps. So `＋ משימה` sits in **every** open row's foot, including a task with none, because
otherwise nothing could get its first one.

**The composer is `useNoteComposer` at a second host, and the reuse has an argument rather than
a resemblance.** ADR-0191 §7 refused a title-only composer for a _task_ because a task's
deadline is what puts it on a Home band, so a title-only box "systematically produces the weak
kind". A step has no deadline **by refusal**, so a step genuinely is its title — the property
that made the composer right for a note, holding here and not there. **Enter commits**, which
is deliberately the opposite of ADR-0152 §6b's rule for a note, on that rule's own reasoning: a
note is prose and has an inside, a step is one line and has none.

**The composer row is also the step's whole editor** — tap a step's words and it returns to the
box in its own place (`reopen(index)`, verbatim), with the assignee chip and the `✕` beside it.
Three controls in one row is what keeps the **read** row unchanged, which is the load-bearing
part: `.note-item` stays a two-column grid and the notes section sharing it pays nothing.

**On a create the steps stage** — the fourth consumer of a pattern the app runs three times, and
`writeStagedTasks` needs one type widening rather than a fifth hook.

**And §9 was drawn twice.** The first version invented a two-field editor; the owner replied
with a photograph of the real one. Redrawn off `TaskSheet.tsx` and `he.ts`, the shipped order is
`מה צריך לעשות` · `עד מתי` · `מי אחראי` · `פרטים` · `חשוב` · `FormActions`, and **the checklist
goes fourth** — not first, because most tasks have no steps and a variable-height field would
push the fields every task uses below the fold; and before `פרטים` rather than after, because
both answer "what does closing this involve" and the structured one should be the one you reach
for. **The empty state is a reveal control**, which is this form's own idiom: `עד מתי` rests as
`הוספת תאריך`. Measured: with five steps, 300px falls below `.modal-form`'s fold against 157px
with none — the sheet already scrolled, and the sticky action bar keeps `שמירה` reachable.

**One shipped string retires and the code says so itself.** `titlePlaceholder` is
`משהו אחד שצריך לעשות`, and `he.ts` explains the word `אחד`: _"it is the model's own bound,
since a task holding a checklist is a separate feature nobody has built"_. This is that feature.

### Round three — the word, and a primitive change

**`תתי משימות`, the owner's call**, replacing the first draft's `משימות בפנים`. It reverses this
session's own "one noun all the way down, including the word", and the reversal is right about
the half it touches: brief §2's rule is about the **entity** — one table, one row shape, one
tick, one sort — and it cannot name a **field inside a task's own editor**, where `משימות` is
ambiguous with the task being edited. The label, the add control (`＋ תת משימה`) and the
composer's placeholder all take the word.

**And "scroll the new sub-task into view" turned out to need a fix in a shipped primitive**
(owner: _"if needed even change the primitive"_ — it was needed). `.form-actions` is
`position: sticky; inset-block-end: 0` **inside** `.modal-form`'s own scrollport, and nothing in
the app declares `scroll-padding` anywhere except the Map's inline peek — so
`scrollIntoView({ block: 'nearest' })` in **any** sheet-form parks its target flush with the
scrollport's bottom edge, which is under the bar. A/B'd live at two depths: **+15px** of
clearance with `scroll-padding-block-end: var(--form-actions-h)`, **−53px** without, the
composer landing entirely beneath a 55px bar, same number at three added steps and at six.
Latent today for `EventForm`, `BookingSheet`, `DocumentUploadSheet` and `TaskSheet`.

`.body` needs none of it: `.nav` is a **sibling** of that scrollport rather than inside it, so
the sheet is the app's only case.

**And the first attempt at that A/B reported "no difference"** — it wrote the override onto the
element, and `paint()` rebuilds the DOM before the scroll runs. A comparison that rebuilds its
own subject measures nothing. It is a stylesheet now, and a control in the file so a reader can
press it.

### Two shipped-CSS traps the authoring render exposed

The owner reported the first before the file was re-read: _"there's some css issues with line
alignment (the + and the text field for instance, the specific sub task editing)"_.

- **`App.css` and `field.css` both define `.field`, and only one is reset.** `App.css:1037`
  carries `margin-top: 18px` — a form's gap — and `field.css` never touches it. Inside a grid
  row that is a shove, not a gap: the composer's box measured 18px shorter than its own cell
  and sat **9px below** the `＋`, in all three places the composer appears.
- **A primitive that styles by element has to be out-specified.** `field.css`'s `.field input`
  is (0,1,1) and a bare `.tsk-kid-in` is (0,1,0), so `border: 0` lost and the row painted a
  rounded box **inside** a rounded box. Same class as ADR-0195's `.tsk-tick:hover .icon`.

Measured after both: the `＋`, the box and the assignee chip share one centreline to **0px**,
the box's edge sits **0px** off the step text's column, and the composer row fell from 55px to
**35px** against a step's 20px.

## Left open, deliberately

- **The phase.** This is not scheduled against the tasks build plan's six phases, and it
  depends on nothing in them except §C's `assignedToAll`, which is phase 6 and also unbuilt.
- **The cap of 20** is a constant, from 26.8px per child row against a 640px viewport. A real
  phone can move it.
- **Two feel questions for the device pass:** whether a 2.5px arc at 26px reads as a fraction
  under a thumb, and whether the count alone carries a parent at `0/n` — where the ring is the
  same **1.21:1 / 1.33:1** hairline already on the backlog.
- **Reordering steps.** Creation order is the order. A drag handle on a 26.8px row inside an
  open region is a target problem, so it is named rather than left to arrive quietly.
- **The `.field` collision** (two sheets, one class, no reset) is a drift worth one backlog
  line and is not this feature's to fix.
