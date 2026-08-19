# 0196 — A task can hold a checklist, and the exclusion is paid once

**Status:** Accepted and **built** (2026-08-18), with one deliberate exception named below. §1–§13 are shipped; **§7's `assignedToAll` half — the brief's §C — is not**, on the owner's call (_"I think that assign to all could be shipped after"_), and `assignedToAll` does not exist in the model yet either. The read is the same two elements when it arrives, so nothing there is re-decided. See the **build log** at the foot for what the build changed about this record.
**Date:** 2026-08-18
**Design reference:** [`mockups/a-task-that-holds-a-checklist-v1.html`](../../mockups/a-task-that-holds-a-checklist-v1.html) — §1 the exclusion drawn · §2 the parent row at three fractions · §3 the children in the open region · §4 the two small surfaces · §5 the brief's §C, closed and open · §6 the refusals, measured · **§7–§9 the authoring half, live** (added 2026-08-18 on the owner's reading: _"the mockup is missing one critical part of the design: how do you create sub tasks? … How do you edit them? Add/remove etc."_ — the first version drew authoring as a label in a foot). Every number below is read off that file's rendered DOM in a run that loaded Assistant.
**Prerequisite:** [`planning/2026-08-15-tasks-design-brief.md`](../planning/2026-08-15-tasks-design-brief.md), whose **§C** (an `everyone` task partially complete) this closes — the last of its six open design questions. **Session note:** [`planning/2026-08-18-sub-tasks-design-session.md`](../planning/2026-08-18-sub-tasks-design-session.md).

**Amends:** [0193 §2](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) — "what is missing counts everything open" gains the sentence that says what **one** open thing is. The amendment is written into that ADR in place, as brief §11 required for the hero and for the same reason.
**Builds on:** [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) (the `lead` slot, the tick's box, and §4 as reversed — the derived/stored predicate this reuses verbatim), [0189](0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md) §3 (the row opens in place; the open region a checklist goes into), [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md) (the one list and its order), [0191](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) §4/§5/§8 (the host section's row and its second tick density, which a child row is), [0195](0195-a-tick-is-answered-once-and-the-row-waits-for-it.md) (the tick's motion contract, which a child tick inherits unchanged), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §3 (the volume test §1 turns on), [0017](0017-mobile-first-device-targets.md) (the 44px floor), [0028](0028-plan-violet-color-budget-dark-ready.md) (the colour budget §4 spends nothing from)
**Relates:** [0012](0012-conflict-lww-undo.md) (the LWW ceiling that decides §3's rejected bulk verb), [0120](0120-filter-reveal-is-shared-infrastructure.md) (the reveal a parent row still collapses through), [0157](0157-a-place-can-be-removed.md) §3 / [0191](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) §5 (the client-side cascade the parent delete extends)

## Context

The backlog has carried **"Sub-tasks — a task holding a checklist of its own"** since 2026-08-15. It names its own questions so they are not re-derived — **one table or two**, **does a sub-task carry its own assignee**, **what is the progress read** — settles that **depth is capped at one level** and that **a parent's completion is derived**, and requires the third question to be answered together with the tasks brief's **§C**, because _"a parent's `2/5` read and `completedBy`'s read are the same problem, and answering them apart is how two progress vocabularies ship"_.

Five findings from reading the code shape everything below, and the first is the one the whole ADR turns on.

- **The exclusion is not 23 filters. It is one boundary — and the app has already shipped the bug the naive version would ship.** `lib/tasks.ts` exports 22 derivations and `lib/hero-task.ts` a 23rd. **Six of them already carry a per-call-site `isManual(task)` guard**, which is the same shape of predicate a child would need — and [ADR-0193 §2](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) was amended precisely because **one surface forgot it**, so the Plan hero answered "how many are open" with a different number than the Index tile. Adding a second remembered-everywhere predicate is that defect's second edition, and derivation twenty-four would be wrong by default rather than right by default.
- **`openTaskCountsByHost` is already correct against children, by construction.** It loops the five host FKs and `continue`s when none is set, so a row carrying no host FK can never increment a host's mark — even handed the raw array. That is a consequence of §8's refusal rather than of the exclusion, and knowing which of the two holds the number up is the difference between a fact and a coincidence.
- **`taskCountFor` has ZERO production call sites.** The backlog line names it among "the sharpest counting ones"; it feeds nothing. Every mark on every host row goes through `hostCountForContext` (`lib/notes.ts`) instead — `IndexBookingsView`, `Map`, `PlanDay`, `DayView`, all four. `lib/task-hosts.test.ts` and `lib/task-settled-host.test.ts` are its only callers. Counted, because CLAUDE.md says to count.
- **The client-side cascade has a real hole, and it is not a design question.** `dropHostedForHostChange` guards on `change.entityType in NOTE_HOST_FIELD`, and `ENTITY_TYPE.TASK` is not in that map. A DB cascade writes no `Change` rows ([ADR-0152](0152-a-note-is-one-entity-with-an-optional-host.md) §2, extended by [ADR-0157](0157-a-place-can-be-removed.md) §3), so a deleted parent's children would survive in memory and in the Dexie snapshot, orphaned, until the next cold sync.
- **The child row and its tick already exist.** [ADR-0191](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md) §5 built `.note-item.tsk-row` and `.tsk-tick-sec` — 20px of paint inside a **44px** target via the negative-margin recipe. So the 44px question the indent raises is already answered by shipped CSS, and a child row is a fourth call site rather than a new component.

## Decision

### 1. ONE table. `Task.parentTaskId`, with three refusals at the schema

A sub-task is a `Task` carrying `parentTaskId`. No second entity, no second noun.

**[ADR-0152](0152-a-note-is-one-entity-with-an-optional-host.md) §3's volume test is the argument, and it does not reach here.** That ADR bought a second vocabulary because Wikipedia and an LLM write at machine volume and would drown the group's own notes. A checklist under a task is written by the same five people at the same rate as the task above it. No firehose, no crowding, no second noun — the same reasoning brief §2 already used to refuse `בדיקה` for a readiness check.

**And the "lighter row" saves less than it costs.** A child still needs a title, a status, `settledAt`/`settledBy`, `createdBy`/`createdAt`/`updatedBy`/`updatedAt`, an id, a `tripId` — and the whole write path: optimistic patch, outbox verb, LWW, offline cache. What it drops is eight nullable columns. What a second row costs is a second `ENTITY_TYPE`, a second array in `tripSnapshotSchema`, a second `CACHE_CHANNELS` entry, a second set of outbox verbs, a second applier, a second Dexie table and a second REST module. Eight nullable columns are free today; that list is not.

**Three refusals, enforced by `.refine` at both edges** ([ADR-0023](0023-zod-first-entities-and-openapi.md)), in the idiom `taskHostCount(data) <= 1` already establishes:

- **A task carrying `parentTaskId` may not itself be a parent.** Depth is one level, and this is the decision that keeps every other question finite.
- **A task carrying `parentTaskId` may not carry a host FK, `dueAt`, `dueHasTime`, `displayTimezone`, `important`, `derivedKey`, `body` or `assignedToAll`.** §8 gives each of these its reason. Its host is its parent's.
- **A task may not be both a parent and `assignedToAll`.** §7's ring would otherwise have two denominators.

~~**A cap of 20 children**~~ **A cap of 30** (owner's call, 2026-08-19), refused at the editor with a sentence rather than silently truncated. Twenty came from a measurement — the open region costs **26.8px per child row**, so twenty is **536px**, the whole of a 640px viewport — and the measurement answered the wrong question: how many steps fit on one screen, not how many a packing list has. A real one runs past twenty and the region scrolls. What the cap is for is the runaway case, which is well above either figure. It stays a constant rather than a design, which is why moving it is one line and no ADR.

### 2. The exclusion is paid ONCE, at the state boundary — and the parent's status resolves there too

`useTrip()` stops exposing one flat `tasks` array and exposes two things:

```
tasks: Task[]                      // TOP-LEVEL only, each parent's status already resolved
subtasks: Map<string, Task[]>      // parentTaskId → its children, in creation order
```

The raw array stays where it already lives — inside `trip-state`'s own `useState`, feeding the verbs, and inside `lib/cache.ts` — so sync, the outbox and the appliers are untouched.

**This is the entire answer to the backlog line's warning**, and it is worth stating why it beats the obvious alternative. Filtering inside each derivation means 23 places that must remember, plus every derivation written afterwards. Splitting at the boundary means **every one of the 23 is correct unchanged**, and a new one is correct because it cannot see a child. The audit below is what makes that claim checkable rather than confident.

**The parent's status resolves at the same boundary, and the predicate is one the app already ships.** Brief §4's sentence for a readiness check transfers verbatim: **`status` is the derivation's answer unless the row says `dismissed`.**

- A parent is `done` when every child is `done`. Nothing is written, so nothing can go stale — which is the backlog line's own stated reason for choosing derived.
- `dismissed` is a human decision that no derivation can produce ("this whole thing is off"), so it is stored and it wins. Exactly `automatic-tasks.ts`'s `isLive`/`isAutomaticSettled` pair, at a second host.
- A stored `done` on a row that later gains a child is therefore **ignored rather than repaired** — the derivation answers whenever children exist, so no migration and no write.
- `settledAt`/`settledBy` derive as the last child's.

**`orderTaskRows`, `RevealList` and the beat are all untouched.** A parent row collapses out of the open facets the moment its last child is ticked, through ADR-0120's reveal, over the same `--t-base` — and the child's tick is `TaskTick` at `density="section"`, so ADR-0195's hold and its flush-on-unmount arrive for free.

### 3. A parent's leading element is the same tick, and it TICKS THE WHOLE CHECKLIST

> **REVERSED 2026-08-19** (owner, against the built screen: _"you should be able to tick the parent task to mark all as complete"_). The section below is kept as written because its geometry, its colour and its argument with [ADR-0188 §4](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) all still hold — **only "and no press at all" is gone**. What replaces it, and why the original reasoning was not enough:
>
> - **A parent's lead is a `<button>` again.** Same box, same ring, same arc, same ✓; `aria-pressed` is whether every step is settled and the accessible name says what the press does and where the checklist stands (`סימון כל תתי המשימות של «X» · הושלמו 2 מתוך 5`), because for a reader who cannot see the arc that name was the fraction's only home.
> - **A press settles every step still open; once they are all settled it reopens them.** A `dismissed` step is untouched in **both** directions: it is the one human answer no derivation produces, so a bulk verb that swept it up would erase a decision rather than record one.
> - **The parent's own row is still never written.** The whole point of §2's derived status survives the reversal intact — the tick writes children, and the parent's `done` remains something nobody can leave stale.
>
> **What the original argument got wrong.** §3 reasoned that a derived completion has nothing to press, and therefore that a button there would be inert — ADR-0188 §4's defect one control over. That is true of a readiness check, whose inputs nobody can write. It is false of a checklist, whose inputs are exactly what a person is holding: the ring is where a hand reaches to say "this whole thing is done", and refusing the press sent them to tick five rows one at a time.
>
> **And the harm this ADR rejected the bulk verb on is real, so it is paid for rather than argued away.** The Alternatives entry below refused a bulk tick because everything is LWW ([ADR-0012](0012-conflict-lww-undo.md)) and a bulk **un**-tick erases ticks four other people wrote. That objection stands; what it missed is that the app already ships the answer to it — a multi-write verb goes behind **one toast and one undo** (`EventForm`'s own phrasing), which is now what `taskVerbs.tickTask` does. The residue, named rather than hidden: `updateTask` sends `{ status }` and the server stamps `settledBy`/`settledAt`, so an undone reopen comes back **settled by whoever pressed undo**. Statuses are restored; attributions are not. Nothing in the UI reads a step's `settledBy` today, which is what makes that an acceptable price and also what would change if anything ever did.
>
> **It lives in ONE place.** `taskVerbs.tickTask(task)` — the six surfaces that draw a tick (`IndexTasksView`, `HostTasks`, `Home`, `PlanHome` ×2, `TaskSheet`) call it and none of them knows a parent is different. "Unless it holds a checklist" written at six call sites is `isManual`'s third edition, and [ADR-0193 §2](0193-what-is-missing-counts-everything-open-and-the-plan-hero-lifts.md) exists because one surface forgot the second.

The parent's `lead` is the shipped `.tsk-tick` box — same 44px, same 12px hit radius, same circle, same ✓ — rendered as a `<span role="img">` with the count as its accessible name, and its ring **filled to the completed fraction** by a masked `conic-gradient` in `--ok`. At `n = m` it is the ordinary done tick with nothing added: the arc has become the fill and the ✓ is the fill's own mark. One state, not two.

Measured: the parent row is **61px** against the leaf beside it at **62px**, the lead box **44 × 44** in both, and the parent's title column **219px** at 360 — against the **195px** ADR-0188 measured for a shipped manual row. The arc buys no width and costs no height.

**Why the FIRST version made it a read, and the one place this ADR argues with [ADR-0188 §4](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md)'s reversal rather than inheriting it.** The owner's reversal reads: _"Makes no sense that the indication for a complete task is different for automatic and manual tasks."_ It is about a distinction **the reader cannot see the cause of** — manual versus automatic is invisible on a row. A task with a checklist is not that: the cause is printed in the same element, as the fraction the ring is filled to, and again as the count one line below. The rule that survives is the real one — _do not give a row a different leading element for a difference the reader cannot account for_ — and it is honoured.

**And the alternative the reversal itself points at is closed here by a different door.** §4 said the exit from an inert circle is to make it work. For a readiness check that was right, because the data it derives from cannot be written. **A parent's children can be**, so a parent needs no overlay at all: it closes when its last child does.

### 4. The count is one element in the meta line, and it is on every surface

`.tsk-count`, reading `2/5`, neutral `--muted`, sharing line one of the meta with the deadline. An undated parent therefore keeps **one** line, which is what `.tsk-due`'s own `display: block` was bought for in ADR-0191 §8.

- **It spends no colour.** A quantity is not a status and not a deadline. Amber stays time and commitment, `--miss` stays overdue, `--ok` is spent only on the arc where "how much is done" is genuinely a status. Rule 4 holds with no exception.
- **The number is not inside the ring.** At the section density the circle is 20px, and two digits and a slash there are a smudge. The meta line exists on every surface; the inside of a 20px circle does not.
- **`2/5` needs no bidi isolate here, and gets one anyway.** Rendered both ways in the real Hebrew context (`עד מחר 04:30 2/5`) the paint order is **identical** — a `CS` separator between two `EN` runs takes the digits' direction, so there is nothing to reverse. It still goes through `ltrIsolate`, because ADR-0118's rule is about the **run**, not about the cases that happen to survive without it. The measurement is in the file so the claim is a render result rather than a deduction.
- **A separator glyph is refused.** `.tsk-sep` is inked `--line` — the app's hairline — which at 11.5px is barely a mark, and it is a class with **zero production consumers** today (two specs assert it is absent). The two facts are separated by their inks and by `.tsk-due + .tsk-count`'s 7px instead.

### 5. The children live in the open region the row already has

ADR-0189 §3 made a task's tap open it **in place**. That region already holds `.tsk-open-body` and `RowOpenFoot`; a checklist joins it as `.tsk-kids`, holding `.note-item.tsk-row` rows — the host section's shipped row — at `--sec-lead: 26px` / `--sec-tick: 20px`.

- **No new control and no new density.** The child's tick is `TaskTick density="section"`, measured at **44 × 44** of touch against ADR-0017's floor, from the negative-margin recipe ADR-0191 §5 already ships.
- ~~**The indent is 58px** — 14px of card inset plus the parent's 44px lead slot — so a child's text starts where the **parent's title** starts. Measured from the card's edge: parent title at **55px**, child title at **85px**.~~ **CORRECTED 2026-08-19** (owner, against the built screen: _"is the line difference between the title and the first sub task good? the tab before the sub tasks?"_). **The intent above is right and 58px did not deliver it** — read the two halves of the sentence against each other: it claims the child's text starts at the title and then measures it 30px past. Both halves of the arithmetic were wrong. `.wp-listrow-lead` is flush to the card and **is** the 44px (there is no 14px of card inset in front of it), `.wp-listrow-open` adds its own **10px**, and the tick's paint sits 3px inside its 26px cell. Measured in the running app at 390: the parent's title starts at **x = 319** and a step's tick painted to **x = 312** — seven pixels, aligned to nothing, which is exactly what reads as a stray tab.

  **So the number is derived rather than picked:** `--kid-title-x: 54px` (the 44px lead plus the button's 10px) is where the parent's title starts, and `padding-inline-start: calc(var(--kid-title-x) - var(--sec-lead))` puts a **step's text** on that same x. The ticks then step outboard toward the ring, which is the hierarchy. Four alternatives were rendered at phone width in dark before choosing: the step's **tick** aligned to the title (tidy, but it leaves the two texts in different columns, and [ADR-0191 §5](0191-a-task-marks-its-host-and-lives-in-a-section-the-host-already-has.md)'s own reversal — _"notes and tasks look totally different and have a different allignment"_ — is about exactly that); the step's tick aligned under the parent's **ring**, which is no indent at all and puts a child's text **outboard** of its parent's title, inverting the hierarchy; and 8px of extra air above the block, which reads slightly better and was left out as a separate question from the one asked. **`.tsk-open-body` keeps the card's 14px inset and is deliberately not moved** — it is a paragraph, not a row, and narrowing it costs 40px of measure at 390 for a tidiness nobody reported.

- **The way in is the foot, not a second button.** `＋ משימה` joins `עריכה` in `RowOpenFoot`, which is zero new CSS and one control per verb.
- **Cost of opening:** the five-child block plus the foot is **172px**, against the 60px closed row.

~~**One noun all the way down, including the word.** A child is a `משימה`, the add control is `＋ משימה`, and there is no `תת-משימה` anywhere.~~ **REVERSED 2026-08-18 by the owner:** _"let's call it תתי משימות"_. The word is **`תת משימה`**, plural **`תתי משימות`** — the field label, the add control (`＋ תת משימה`) and the composer's placeholder all use it. **The one-noun argument was right about the model and wrong about the label.** Brief §2's rule is about the entity, and that survives whole: one table, one row shape, one tick, one sort. What it cannot do is name a **field inside a task's own editor** — a label reading `משימות` there is ambiguous with the task the form is editing, and `משימות בפנים` (the first draft's answer) is vague where the thing has a name. A second word for a distinction the reader can see is not the drift §2 was written against.

### 6. The small surfaces carry the two elements and nothing else

This is where the design is actually tested, and it is why §4 puts the count in the meta line rather than in the ring.

- **Trip Home's band** — the arc in the lead, the count beside the deadline. Row measured at **61px**, level with every other band row; the count is **16px** wide. The band's own cap of 3 and its manual-only rule (ADR-0188 §6) are untouched.
- **A host's section** — the arc at `.tsk-tick-sec`'s density, the count as the whole of `.note-item-m`. Measured at **34.8px** against a bare task row's **20px**, and it is the one case where the count is what brings the meta line back at all: ADR-0191 §4 made that line absent when there is neither a deadline nor an assignee, and a parent has something to say.
- **The lifted hero** — `HeroLiftTask` gains an optional count, formatted by `toHeroTask` beside the deadline it already formats. A read, which is what ADR-0160 §U made that slot.
- **The mark on a host row** — unchanged, and deliberately. `TaskMark` counts open tasks, a parent is one open task, and a checklist is not five things to do about a booking.

### 7. §C is closed by the SAME two elements, and the open region is what disambiguates them

An `everyone` task (brief §6's third assignment state: `assignedToAll` + `completedBy: String[]`) reads `3/5` with the same arc and the same count. **The collapsed rows are deliberately indistinguishable**, and that is the answer rather than a gap: the question a collapsed row answers is _how much of this is left_, and it is the same question in both cases.

**One difference, and it is the one that matters to the reader.** A parent has no single act you can perform, so its lead is a read. An `everyone` task has exactly one — tick yourself — so **its lead is a control**, and the same circle carries both facts in the two channels it already has:

- **the arc is the group's progress**, `completedBy.length / roster`;
- **the ✓ inside it is your own answer.**

Which is §C's requirement met in the order §C states it: legible to **you** first (is there a ✓?), to the organiser second (how full is the ring?) — with no second identity system on the row, which is what ADR-0153 §4 refused and ADR-0191 §8 kept refusing.

**And the open region is where "items or people" is answered**, because it is the same region and the same row shape with different contents: a parent's holds its children, an `everyone` task's holds the **five people**, your row first. Measured, and the number is the argument: **134px against 134px** for five rows either way. Only your row is a control — you cannot tick for Dana, so hers is a `role="img"` read, the same span a parent's lead is.

**No strikethrough on a person.** `.tsk-settled` strikes a task's words because the obligation is over; a name is not an obligation, and striking it reads as "Dana is done with" rather than "Dana packed". The green tick is the whole statement.

**`completedBy`'s LWW ceiling is unchanged** and stays named rather than designed away (brief §6): two people ticking in the same second can lose one tick, the failure mode is "tick it again", and it is visible.

### 8. A sub-task carries an assignee, and that is the only optional thing it carries

**Yes to the assignee**, and it is the third question answered. At five people the whole value of a checklist is splitting it — _"airport run: Dana books the taxi, Noa prints the tickets"_ — and a checklist nobody can be given is a `body` field with rounder corners, which the task already has. It costs nothing: `assigneeUserId` is already on the row, and the face at the trailing edge of the title row is ADR-0191 §8's shipped statement of it.

**No to everything else, each with its reason:**

| refused on a child                         | why                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dueAt` / `dueHasTime` / `displayTimezone` | **The refusal that pays for all the others.** A child that cannot be dated cannot be urgent, cannot be overdue, has no `--miss` and has nothing to say on any surface ordered by urgency — so every urgency derivation is correct about it **vacuously**. The deadline is the parent's. |
| `important`                                | The flag lifts within a band, and there is no band to lift within.                                                                                                                                                                                                                      |
| a host FK                                  | Its host is its parent's. One statement of one fact, and it is what keeps `openTaskCountsByHost` honest untouched.                                                                                                                                                                      |
| `body`                                     | A child is one line. The parent's `body` is where prose goes, and a reader inside a reader is a second open region.                                                                                                                                                                     |
| `derivedKey`                               | §9.                                                                                                                                                                                                                                                                                     |
| `assignedToAll`                            | §1's third refusal, from the other side.                                                                                                                                                                                                                                                |
| children                                   | Depth is one.                                                                                                                                                                                                                                                                           |

**Measured, so the table is not merely tidy:** given every field a root task carries, five children take **298.8px** against **134px** as specified — and the drawing is worse than the number, because each child then prints its own deadline in `--miss` under a parent that is not overdue.

**A child's assignee does one more thing, and it is the audit's sharpest finding: it changes what `שלי` means.** See the audit's row for `taskMatchesFacet`.

### 9. An automatic task cannot have children, and the reason is not tidiness

Refused at the schema: `parentTaskId` and `derivedKey` are mutually exclusive, and a row carrying `derivedKey` may not be a parent.

- **A check nobody has touched has no row at all** (brief §4). A child would have to hang off an id that does not exist, so writing a checklist under "book a hotel" would silently mint the overlay row — a write produced by what the user experiences as a read, which is the exact defect ADR-0190's build already fixed once when opening the `⋯` minted a row.
- **The five checks are already the app's top-level checklist** (ADR-0190, ADR-0193 §3). A checklist under a checklist item is depth two in everything but the schema.
- **A check's words are already its kind** — ADR-0188 §4's own sentence, and the reason its badge went. "Book a hotel" decomposed is a set of bookings, which the app models as bookings.
- **The two completions answer different questions and no rule settles the contradiction.** A check's done-ness is derived from trip data; a child's is written by a person. A derivation saying done over a child saying open has no tie-break, and "a human answer wins" does not help, because the child is a human answer about something else.

### 10. A checklist is CREATED where the task is read, and there is no mode to choose

**There is no "convert to checklist", no flag and no second kind of task.** A task _becomes_ a
parent when it gets its first child and stops being one when the last is deleted — both are
`subtasks.get(id)?.length`, the derivation §2 already establishes. Nothing is stored, so
nothing can go stale, nothing needs a migration, and there is no state to undo.

The reason is what people actually do: nobody classifies a task before they know whether it
has parts. You write `יציאה לשדה`, and three days later you realise it has five. A stored
`isChecklist` would also permit a checklist with **no children** — a promise with nothing
behind it — which is the same defect as a `done` a derivation can contradict.

**So `＋ משימה` is in the foot of EVERY open row**, beside `עריכה`, including a task that has
no steps yet. If it appeared only on tasks that already had children, nothing could ever get
its first one. Measured: the foot is **38px** and the control **53px** wide, on a row that is
already open.

**The way in reveals a composer INSIDE the checklist, not a form.** `useNoteComposer` at a
second host, with an `<input>` where the note has a `<textarea>` — and **Enter commits here**,
which is deliberately the opposite of ADR-0152 §6b's rule that Enter writes a newline in a
note. It is the same reasoning both times: a note is prose, so the key that ends a line inside
one cannot end the note; a step is one line and has no inside, so Enter has nothing else to do.
The box stays open and focused afterwards, because a checklist is written in a burst — five
steps are five keystrokes-and-Enter, not five round trips through a sheet.

**And ADR-0191 §7's refusal of a title-only composer inverts here, on its own argument.** That
section refused a `NoteComposer`-shaped box for a _task_ because a task's **deadline** is what
puts it on a Home band and makes it overdue, so a title-only box "systematically produces the
weak kind" — while notes have no equivalent weak kind, because _a note is its body_. **A
sub-task has no deadline by refusal** (§8), so a step genuinely _is_ its title. The property
that made the composer right for a note holds; the property that made it wrong for a task does
not. This is reuse with a reason rather than reuse by resemblance.

### 11. The composer row IS a step's editor, and the read row does not change

A step has exactly two fields, so it gets no sheet of its own: opening `TaskSheet` on one would
show a deadline, an `important` flag and a host that are all refused, which is ADR-0188 §5's
"a disabled control promises an enabling that will never come".

**Tapping a step's words returns it to the composer, in its own place in the list.** That is
`NoteComposer`'s `reopen(index)` verbatim, for its own stated reason — "a typo costs an edit
rather than a delete and a retype". The same row then carries the other two verbs:

- **who owes it** — the assignee chip, which is where a step's assignee is set;
- **remove it** — the `✕`, so deleting a step is tap-then-`✕`, two presses for a destructive
  act, and the same shape `.note-chip-x` already ships.

**Three controls in one row is what keeps the READ row unchanged**, and that is the load-bearing
consequence: `.note-item` stays a two-column grid, so the notes section sharing that grid pays
nothing. **A step being edited keeps its own tick** rather than the add row's `＋` — it is still
a step, it can still be ticked mid-rename, and a `＋` there would claim the row is new.

Measured: the composer row is **35px** against a step's **20px**, so tapping one shifts what is
below it by 15px and the row itself stays put. The `＋`, the box and the assignee chip share one
centreline to **0px**, and the box's edge sits **0px** off the step text's own column. Both
numbers are repairs — see the Consequences for the two shipped-CSS traps that produced them.

**No reordering in v1.** Creation order is the order (the audit's `sortTasks` row). A checklist
of at most twenty, written in one burst, is already in the order it was thought of; and a drag
handle on a 26.8px row inside an open region is a target problem, not a feature. Named as
deferred rather than left to arrive quietly.

### 12. The editor holds the same list, in the FOURTH slot, and on a CREATE the steps stage

The open region is the fast path; **the editor is the complete one**, and it is the only one
reachable from every surface — a host section, a Home band and the hero all open a task rather
than expanding it. So `TaskSheet` carries the same rows and the same composer.

**The field order is read off `TaskSheet.tsx`, and the first draft of this section did not
read it.** It invented a two-field form; the owner replied with a photograph of the real one.
The shipped order is `מה צריך לעשות` · `עד מתי · לא חובה` · `מי אחראי` · `פרטים · לא חובה` ·
the `חשוב` chip · `FormActions`, and **the checklist goes fourth — after `מי אחראי`, before
`פרטים`.**

- **Not first, under the title.** Most tasks have no steps. A variable-height field between
  the title and the two fields every task does use would push them below the fold on a phone
  for a feature most tasks never touch.
- **Before `פרטים` rather than after it**, because the two answer the same question — _what
  does closing this involve_ — one **structured** and one prose, and the structured one should
  be the one you reach for first. `פרטים` keeps its place as the catch-all above the flag.

**The empty state is a control that reveals, not a box standing open** — and that rule comes
from this form itself: `עד מתי` rests as `הוספת תאריך`, and `＋ פתק` does exactly this for the
notes composer (ADR-0192 §2). An always-open composer would put a box on every task editor in
the app for a field most tasks leave empty. Drawn as `ValueToken`'s placeholder form, so the
form's two optional fields have one empty state; whether the build literally reuses
`ValueToken` or gives the field a two-line class of its own is a build call.

**And it does not break the sheet, which is measured rather than assumed.** `.modal-form` caps
at `75dvh` with a sticky action bar (the second consumer ADR-0189 added). Simulated at 75% of
a 640px frame: **157px** falls below the fold with no steps and **300px** with five — so the
checklist costs 143px of scroll on a form that already scrolled, and `חשוב` and `FormActions`
stay reachable. The field itself measures **175px** for five steps and a box, against 172px for
the open region's copy.

**A create has no id to hang `parentTaskId` on, so the steps stage** — and this is the **fourth**
consumer of a pattern the app already runs three times (`useNoteComposer().pending()`,
`DocumentAttachField`'s staged picks, and `useTaskStaging` from ADR-0191 §7a). Their ordering
rule carries over verbatim and is what makes it correct: the children's writes go out **after**
the parent's, inside the same change group, because the outbox is FIFO and a step queued first
would reach a server that cannot see its parent. `writeStagedTasks` already takes a `where`;
what it needs is **one type widening** on that parameter, not a fifth hook.

**A staged step cannot be ticked**, for the reason `HostTasks` already states about a staged
task: completing something unsaved is a state with nowhere to live.

### 13. Adding a step scrolls the composer back into view — and that needs a fix in the PRIMITIVE

Owner's call: adding a sub-task should scroll _"so that the new sub task (and the buttons below it) are in view"_, and _"if needed even change the primitive"_. It is needed.

**The primitive is broken for this today, and not only for this feature.** `.form-actions` is `position: sticky; inset-block-end: 0` **inside** `.modal-form`'s own scrollport, and nothing in the app declares `scroll-padding` anywhere except the Map's inline peek. So `scrollIntoView({ block: 'nearest' })` in any sheet-form parks its target flush with the scrollport's bottom edge — underneath the bar. **A/B'd in the mockup at two depths: +15px of clearance with `scroll-padding-block-end`, −53px without**, the composer landing entirely under a 55px bar, and the same number at three added steps and at six. `EventForm`, `BookingSheet`, `DocumentUploadSheet` and `TaskSheet` all carry it latently; `useFormErrors` escapes only by passing `block: 'center'`.

So `form-actions.css` gains one declaration and one token:

```css
:root {
  --form-actions-h: 68px;
}
.modal-form {
  scroll-padding-block-end: var(--form-actions-h);
}
```

**The token is what keeps the pair honest.** The bar measures **55px** against the token's 68 — covered, with slack — and both numbers are printed in the mockup's table side by side, because if the bar ever grows past the token the clearance stops working silently.

**`.body` needs none of this, and the check is worth recording:** `.nav` is sticky too, but it is a **sibling** of `.body` rather than inside its scrollport, so nothing there can land under it. The sheet is the only scroll container in the app with a sticky bar inside its own scrollport.

**Three rules make the scroll seamless rather than twitchy:**

- **`block: 'nearest'`, which is a no-op while the composer is fully visible.** Most commits move nothing, and a form that lurches on every Enter is the version this is avoiding.
- **The composer is what is scrolled, not the new row.** The caret is in the composer and the next keystroke goes there; park it and the row just committed sits directly above it.
- **After layout, not in the handler** — a `useLayoutEffect` keyed on the step count, so the scroll measures the box the new row created and the composer is never seen under the bar for a frame.

And **the input is never re-focused, only cleared**, which is what keeps this to a single movement: focus does not move, so the browser issues no caret scroll of its own.

`behavior` is guarded by `lib/motion.ts`'s `prefersReducedMotion()` — the form `Map.tsx`, `DayView.tsx` and `useFormErrors` already use. Worth knowing that `EventForm`, `BookingSheet` and `DocumentUploadSheet` pass a bare `behavior: 'smooth'` and do not: three call sites of six, which is a sweep rather than this feature's business.

## The audit — does this derivation see a child?

Required by the backlog line and by CLAUDE.md's rule about counting call sites before claiming what a derivation does. Consumer counts are non-test files, counted 2026-08-18. **With §2's boundary in place the answer is "no" for nineteen of twenty-three, by construction rather than by remembering** — and the four that are not "no" are the deliverable.

| derivation               | consumers                                                                  | sees a child?                          | why                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `dueZone`                | 0 (internal: `taskDue`, `tasksDueSoon`)                                    | no                                     | and vacuously — a child has no `dueAt` to resolve                                                                         |
| `taskBand`               | `TripHomeTaskBand` (+ internal)                                            | no                                     | roots only; a child would be `UNDATED` and mean nothing                                                                   |
| `isSettled`              | `TaskSection`, `TaskBandRow`, `IndexTasksView`, `PlanHome`, `hero-horizon` | **YES, by design**                     | the one derivation a child goes through — on its own row, and as the input to the parent's derived status                 |
| `sortTasks`              | `PlanHome`, `IndexTasksView` (+ 7 internal)                                | no                                     | roots only. Children keep **creation order**: a checklist is authored, not ranked                                         |
| `taskRowKey`             | `PlanHome`, `IndexTasksView`                                               | no                                     | keys root rows                                                                                                            |
| `orderTaskRows`          | `PlanHome`, `Home`, `IndexTasksView`, `PlanLift`                           | no                                     | its input is `useTrip().tasks`                                                                                            |
| `taskRowMatchesFacet`    | `IndexTasksView`                                                           | **YES — takes the child index**        | see below                                                                                                                 |
| `taskMatchesFacet`       | 0 (via `taskRowMatchesFacet`)                                              | **YES — takes the child index**        | **`שלי` must match a parent whose CHILD is mine.** A filter that hides work assigned to me is this feature's failure mode |
| `countTasksByFacet`      | `IndexTasksView`                                                           | **YES — passes the index through**     | counted off the same rows the list is built from, which is that function's own contract                                   |
| `taskDue`                | `IndexTasksView`, `TaskSection`, `TaskBandRow`, `Index`, `Home`            | no                                     | a child has no deadline to print                                                                                          |
| `tasksDueSoon`           | `TripHomeTaskBand`, `PlanHome`, `Home`                                     | no                                     | **the Home-band exclusion the backlog line predicted**, and it needs no new clause                                        |
| `openManualTasks`        | `PlanHome`                                                                 | no                                     | Plan Home's list is roots                                                                                                 |
| `taskPreview`            | `PlanHome`, `Index`                                                        | no                                     | **the ADR-0193 amendment, and it holds by construction**                                                                  |
| `tickedStatus`           | `IndexTasksView`, `TaskSection`, `HostTasks`, `PlanHome`, `Home`           | leaves and children only               | **never called for a parent** — a parent has no tick to derive a next status for                                          |
| `tasksForHost`           | `HostTasks`, `TaskSection`                                                 | no                                     | a child carries no host FK (§8)                                                                                           |
| `tasksForContext`        | `hero-horizon`                                                             | no                                     | same                                                                                                                      |
| `taskHostInput`          | `HostTasks`                                                                | n/a                                    | builds a create input; a child's never carries one                                                                        |
| `settledHostKeys`        | `HostTasks`                                                                | n/a                                    | a derivation over events                                                                                                  |
| `isOnSettledHost`        | `hero-horizon` (+ 3 internal)                                              | no                                     | reads host FKs, which a child has none of                                                                                 |
| `openTaskCountsByHost`   | `IndexBookingsView`, `PlanDay`, `Map`, `DayView`, `HostTasks`              | **correct even against the raw array** | the loop `continue`s on all five FKs, so a child can never increment a host. Held up by §8, not by §2                     |
| `taskCountFor`           | **0** — tests only                                                         | n/a                                    | **dead.** The live mark path is `hostCountForContext` (`lib/notes.ts`) at all four call sites                             |
| `dropTasksForHostChange` | `trip-state`, `lib/cache.ts`                                               | **YES — and it has a hole**            | see below                                                                                                                 |
| `toHeroTask`             | `PlanHome`, `Home`                                                         | no                                     | roots only; gains the optional count (§6)                                                                                 |

**`שלי`, and why the naive answer is wrong.** The facet asks `assigneeUserId === meId`. Applied to roots alone, a parent that is unassigned but whose third step is Dana's does not appear under Dana's `שלי` — the one filter in the app whose whole job is "what do **I** owe" would hide work assigned to her. So the predicate takes the child index and matches a parent when **it or any of its children** is mine. The rejected alternative — leaving `שלי` on the parent's own assignee, "because a sub-assignment is not an assignment" — is defensible in the model and wrong at the surface, and it is the only place in the audit where the boundary split is not the whole answer.

**`dropTasksForHostChange`, and the hole named in Context.** Deleting a parent must drop its children in the client, and today nothing would: the shared applier's guard is `change.entityType in NOTE_HOST_FIELD`, which `ENTITY_TYPE.TASK` is not in. The repair is a **task-specific case inside the wrapper that already exists for exactly this job** — `dropTasksForHostChange` is already the tasks-shaped call site of `dropHostedForHostChange`, so it gains the parent-delete branch and the shared applier is untouched. That is rule 8's small extraction, and it deliberately stops short of widening `NOTE_HOST_FIELD` with a sixth key, which would make a **note** droppable by a task delete for no reason.

## Consequences

- **`packages/shared`:** one nullable `parentTaskId` on `Task` and its zod schema, three `.refine` refusals, and a `TASK_SUBTASK_CAP` constant. **`backend/prisma`:** one column, one self-relation with `onDelete: Cascade`, one index. `tasks.service.ts`'s three verbs are unchanged.
- **`state/trip-state.tsx` is where the whole feature lands on the client:** the split, the resolved parent status, and `subtasks` on the context. Nineteen of twenty-three derivations are not touched at all.
- **Three signatures change** — `taskMatchesFacet`, `taskRowMatchesFacet`, `countTasksByFacet` — and one surface passes the new argument.
- **New CSS is four rules for the read half** — `.tsk-arc::after`, `.tsk-ring`, `.tsk-count` (+ its adjacency), `.tsk-kids` — **and a composer row for the authoring half**: the row's box, its `:focus-within`, the input reset, and the two 26px controls with `row-open.css`'s `::after` reach. Everything else is a shipped primitive at a further call site. If it grows much past that during the build, a primitive went unused.
- **Two shipped-CSS traps the authoring render exposed, both of which the build will hit again.** `App.css:1037` and `field.css` **both** define `.field`, and only one is reset: the `margin-top: 18px` App.css carries reaches every `.field` in the app, which inside a grid row is not a gap but a shove — it put the composer's box **9px** below the `＋` beside it, in all three places the composer appears. And `field.css` styles **by element** (`.field input`, (0,1,1)), so a bare `.tsk-kid-in` (0,1,0) lost and the row painted a rounded box **inside** a rounded box; it has to be `.field .tsk-kid-in`. Neither is a defect this design introduced and neither is fixed at its source here — the first is deliberate for forms and the second is how the primitive is written — but a build that writes these rules without knowing will reproduce both.
- **The `.field` collision is worth one line on the backlog and no more**: two sheets defining one class, where the later one does not reset what the earlier one sets, is a drift that will bite the next new host too. It is not this feature's to fix.
- **`.tsk-sep` stays unused**, and the two specs that assert its absence stay green.
- **One shipped string retires, and the code says so itself.** `t.tasks.sheet.titlePlaceholder`
  is `משהו אחד שצריך לעשות`, and its comment in `he.ts` gives the reason for the word `אחד`:
  _"it is the model's own bound, **since a task holding a checklist is a separate feature
  nobody has built**"_. This is that feature, so the bound is gone and the word goes with it.
  Found by reading the file rather than at build time, which is the only reason it is here.
- **`form-actions.css` gains `scroll-padding-block-end` and a `--form-actions-h` token** (§13) — a primitive change with four existing consumers, taken deliberately rather than worked around at this call site.
- **New `he.ts` copy:** `תתי משימות · לא חובה`, `＋ תת משימה`, the composer's placeholders, the ring's accessible name (`הושלמו N מתוך M` for a parent, `N מתוך M סימנו` for an `everyone` task), the open region's `＋ משימה`, the `everyone` foot's `כל אחד מסמן לעצמו`, and the cap's refusal.
- **A ticked-out parent leaves the list exactly as a ticked task does** — same reveal, same `--t-base`, no new departure to reason about.
- **Two backlog items get worse and neither is fixed here:** a parent with twenty children makes the unbounded-`Sheet` clipping item sharper, and the OPEN tick's **1.21:1 / 1.33:1** ring is now also what a parent at `0/n` looks like — so at zero the count in the meta line is carrying the row alone. Both are token/primitive decisions with ~200 consumers behind them, and both are already written down where the fix belongs.
- **Two defects this file's own render produced**, recorded because they are the kind that ship: a percentage in a **radial-gradient colour stop** resolves against the gradient's ray rather than the box, so the arc's first draft drew a pie chart with a 4px hole — and a pie at 4/5 is indistinguishable from done; and the count's modifier class was called `.gap`, which `App.css` already ships as a global `display: flex`, which dropped the count to its own line and took the parent row from 61px to **89px**. The obvious word is usually taken.

## Alternatives considered

- **Two tables — a lighter `Subtask` row.** Rejected (§1) on ADR-0152 §3's volume test, which buys a second noun only against a firehose, and on the ledger: eight nullable columns saved against a second entity type, snapshot array, cache channel, outbox verb set, applier, Dexie table and REST module.
- **Filtering children inside each of the 23 derivations.** Rejected (§2), and §1 of the mockup draws the result: it is `isManual`'s second edition, and ADR-0193 §2 exists because one surface forgot that one. Derivation twenty-four would be wrong by default.
- **A stored `done` on the parent, ADR-0188 §4's reversal applied whole.** Rejected (§2/§3): that reversal was forced by a derivation over data nobody can write. A parent's children **are** writable, so the derivation needs no overlay and cannot go stale — which is what the backlog line asked for.
- ~~**A parent's tick as a bulk verb over its children.**~~ **Reversed 2026-08-19 and now BUILT** (§3's amendment). Rejected first on harm rather than on cost: `completedBy` and every status are LWW ([ADR-0012](0012-conflict-lww-undo.md)), so a bulk un-tick erases ticks four other people wrote, in one press, with no warning. The harm was real and the conclusion was not: the app already puts a multi-write verb behind **one toast and one undo**, which is the warning that was missing. The asymmetry worry answered itself too — the verb is symmetric (settle what is open; reopen once all are settled), so there is nothing to explain.
- **A `סמן הכל` verb in the parent's `⋯`.** Rejected with the above and for the same reason — the menu is where low-frequency verbs live, not where a data-losing one becomes safe.
- **A ring around the ✓ as the progress element.** ADR-0191 §1 refused exactly this shape — for the **mark** on a host row, and on a cause that does not reach here: there it sat 2.5px below its neighbours because it is a flex item with no text baseline. In the `lead` cell there is no text line to sit on.
- **A progress bar instead of an arc.** Rejected on ADR-0193 §2's own argument, unchanged: a bar needs a fixed denominator and reads as a measurement of the trip. It also has nowhere to sit in a 61px row.
- **The number inside the ring.** Rejected (§4) on legibility at the section density's 20px, where two digits and a slash are a smudge.
- **`.tsk-sep`'s `·` between the deadline and the count.** Rejected (§4): it is inked `--line`, and reviving a class with zero production consumers to draw an invisible mark is not reuse.
- **A distinct collapsed row for an `everyone` task versus a parent.** Rejected (§7): the collapsed row answers "how much is left", which is one question; drawing two vocabularies for it is precisely what the backlog line warned about.
- **`assignedToAll` expressed as one child per traveller.** Rejected: it materialises five authored rows for one fact, so a roster change leaves the checklist stale — brief §3's own rejected alternative in a different costume — where `completedBy` is one scalar array with no join table.
- **A child with its own deadline.** Rejected (§8) and measured at **298.8px against 134px** for five children, with each printing `--miss` under a parent that is not overdue. It is also what would have made every urgency derivation a real question instead of a vacuous one.
- **`שלי` matching the parent's own assignee only.** Rejected (audit): correct in the model, and it hides work assigned to the person doing the filtering.
- **A `TaskSheet` for a child.** Rejected (§11): a step has two fields, so its editor would be mostly refusals — ADR-0188 §5's disabled control that promises an enabling that will never come.
- **A stored `isChecklist` flag, or a "convert to checklist" verb.** Rejected (§10): the children already say it, a flag would permit a checklist with none, and nobody classifies a task before they know whether it has parts.
- **`＋ משימה` only on tasks that already have steps.** Rejected (§10): nothing could then get its first one.
- **A title-only composer, by analogy with notes rather than by argument.** Explicitly _not_ the reasoning — ADR-0191 §7 refused exactly that shape for a task, and it inverts here only because a step carries no deadline to omit (§10).
- **Drag-to-reorder.** Deferred (§11), named: creation order is the order, and a drag handle on a 26.8px row is a target problem.
- **A separate assignee picker hung off the read row.** Rejected (§11): it needs a trailing cell, which would make `.note-item` a three-column grid and charge the notes section beside it for a task's affordance.
- ~~**`תת-משימה` as a second word.**~~ **Reversed by the owner** (§5): the entity stays one noun, and the **label** is `תתי משימות`, because `משימות` inside a task's own editor is ambiguous with the task being edited.
- **Widening `NOTE_HOST_FIELD` with `task → parentTaskId`.** Rejected (audit): it would make a note droppable by a task delete to save one branch in a wrapper that exists for this.

## Build log (2026-08-18) — what the build changed about this record

The design held. Everything below is what only writing it could produce, and it is here rather than in the session note because each item changes what a reader of the sections above should believe.

- **The refusal predicate had to learn what "carrying" means.** §1's list is refused by key, and the first version refused any key that was _present_ — so a create form sending its own defaults (`important: false`, `body: ''`) was refused for values nobody chose. `schemas.ts` now has one `carries()` helper (`value != null && value !== false && value !== ''`) and both edges use it. The refusal is about a **value**, not a key, and the design said "may not carry" without noticing the difference.
- **`updateTaskSchema` carries no `parentTaskId` at all.** §8 says a step's parent is set at create and never changes; the cheapest expression of that is a field that does not exist on the patch schema, so no surface can send one and no server branch has to refuse one. The server-side half is `subtaskPatchRefuses(input)` applied against the **loaded row**, because a sparse patch cannot say whether its target is a step.
- **The cascade wrapper kept its name.** The audit's finding was that `dropHostedForHostChange` never sees `ENTITY_TYPE.TASK`; the fix is a branch in `dropTasksForHostChange`, which now drops a deleted **parent's** steps as well as a deleted host's tasks. Widening `NOTE_HOST_FIELD` stays rejected for the reason already recorded, and renaming the wrapper for its second case would have cost every call site to say nothing new.
- **A parent's steps have to be a STABLE empty array.** `subtasks.get(id) ?? []` at a memoized row hands a fresh array every render, and the tasks screen re-renders on the clock — so the rows re-diffed once a second. One module-level `EMPTY_STEPS`.
- **The focus effect's guard was wrong in exactly the path the feature is for.** `const wasOpen = useRef(open)` initialised to the _current_ value, so a `SubtaskList` mounted **already open** — which is the path to a task's _first_ step — never registered a transition and never focused the box. `useRef(false)` and a mount counts as a reveal. Found by the e2e spec, invisible to the unit suite, and the same class as every other "read a per-arrival fact live instead of latching it" in `frontend/CLAUDE.md`.
- **`scrollIntoView` needs the optional call even after the primitive fix.** jsdom does not implement it, so `composeRef.current?.scrollIntoView?.(…)` — the guard `useFormErrors` already records, now at a second call site. §13's `scroll-padding-block-end` shipped as designed, with `--form-actions-h: 68px` in `tokens.css`.
- **Both §-Consequences CSS traps were hit again, in the real code, exactly as predicted** — the `.field` margin and `.field input`'s (0,1,1). Written up in advance and still paid for twice, which is the argument for having written them down. Neither is fixed at source; the backlog line stands.
- **One more of the same shape, and it is new:** `.tsk-kids-full` shipped with **no rule at all** and the paint-contract test caught it. That test also produced two false positives worth knowing about — it parsed `'nearest'` out of `block: 'nearest'` and `'form'` out of a `variant === 'form'` ternary inside a `className` — so the parser is now scoped to `Record<…> = { … }` declarations and the class string is hoisted out of the JSX. A `className` is a claim; the parser reading the claim is one too.
- **`AssigneePicker`'s options were a private helper inside `TaskSheet`.** A step's assignee needs the same list, so `NOBODY`/`assigneeFromChoice`/`choiceFromAssignee`/`useAssigneeOptions` moved to `ui/assignee-options.tsx` and `TaskSheet` imports them — rule 8's generalise-the-one-off, not a second copy.
- **The e2e height assertion needed a fair comparison row.** §4's claim is that the count costs the row nothing; the first run measured **18px** and the 18px was the **meta line**, because the plain task it compared against had no deadline and so printed no meta at all. Both rows carry a deadline now, which leaves the lead as the only thing that differs. A comparison is only a measurement once the other variables are held.
- **The shared refusal fixtures were too short to be ids.** `entityIdSchema` is `/^[a-z0-9-]{8,64}$/i`, and the first draft used `'p'` and `'u1'` — so every refusal assertion passed for the wrong reason. What caught it was writing an **accept** case beside each refusal; a refusal suite with no accepts reports green about nothing.

## Build log addendum (2026-08-19) — two owner reports against the built screen

Both arrived in one message, and both are amendments written in place above (§3's reversal, §5's correction) rather than new sections. What is here is what only building the fix taught.

- **The `.tsk-kids` comment already asserted the alignment it did not have.** It read _"14px of card inset plus the parent's 44px lead slot, so a step's tick starts where the parent's TITLE starts"_ — a claim, a derivation and a wrong answer in one sentence, sitting in the file the whole time. Nothing could catch it: jsdom reports every rect as zero, so the unit suite is blind to alignment by construction, and the design's own measurement had been taken from the mockup rather than the app. The e2e spec now asserts the two edges against each other, which is the only place that assertion can live.
- **Rendering the alternatives is what made the choice cheap.** Four indents were screenshotted at 390 in dark and compared: the loser was not "worse-looking", it was **hierarchy-inverting** — with the steps flush to the card, a child's text starts outboard of its parent's title. That is a fact about the render, not a taste, and reading it off an image took less time than arguing it.
- **The toast reports what the press WROTE, not what the checklist totals.** Pressing a parent with two of five steps already settled says `3 תתי משימות סומנו`. The first draft of the e2e assertion said five and the browser said three; three is right, because it is the same number the undo puts back.
- **`updateTask` had to become a named function before `tickTask` could call it.** It was a property in the returned object literal, so the bulk verb had no way to reach it without `taskVerbs` referring to itself mid-construction. One extraction, no behaviour change — and the first attempt at it landed the function inside the **booking** verbs' memo, because the anchor it matched on (`const stamp = …; return {`) appears in more than one memo in that file.
- **Twenty-five test files mock `taskVerbs` and each writes its own literal.** Adding a fourth verb meant touching all of them; two — the specs that actually press a tick — got a stand-in that runs the verb's own leaf branch, so their existing assertions about what was written still mean what they meant. That every spec hand-rolls this object is worth a backlog line and not a refactor inside this change.

## Build log addendum (2026-08-19, second round) — the editor's composer was documented and not wired

> Owner, against the built editor: _"task editing doesn't have the option to add or remove sub tasks."_

**§12's field said this from the start and the code did not do it.** The comment beside `composing` in `TaskSheet` read _"Open by itself once there are steps, where the list IS the invitation"_ — and the field passed `open={composing}`, whose only control (`＋ תת משימה`) renders in the **empty** branch. So a task that already had a checklist got a read-only list and there was no control anywhere to bring the box back. Renaming and removing were still reachable by tapping a step's words, which is how the report reads as "add or remove" rather than "add".

The fix is the sentence that was already there: `open={composing || steps.length > 0}`. The reveal now decides the **empty** field only.

Three things that fell out of it, each worth more than the one-line change:

- **`open` at mount now means two different things, and the focus has to follow the one a person caused.** `SubtaskList` focused the box on any mount-already-open, deliberately — that was the previous round's fix for the way in to a _first_ step, where the mount **is** the reveal. With the editor holding the composer open by itself, the same rule would open the phone's keyboard on every edit of a task with a checklist: `frontend/CLAUDE.md`'s "a shared component inheriting a default that answers a different question", one component further on. The rule that covers both, and needs nothing from the host: **a mount counts as a reveal only when there are no steps yet** — with none, `open` can only mean a press; with some, it may not.
- **Nothing could have failed.** `TaskSheet` has no component spec, and the two tests that read it (`task-sheet-reachable`, the paint contract) parse CSS and class names, not which props a host passes. The gap is now covered from both ends: `SubtaskList.test.tsx` owns the reveal-versus-present rule, and an e2e case opens the editor on a task with five steps and adds a sixth.
- **Two facts about writing that e2e**, both of which cost a run each. A route mock must echo the **DTO** and not the row — `taskSchema`'s optionals are `.optional()` and not `.nullable()`, so a mocked `settledAt: null` fails the client's parse and the write rolls back exactly as a 404 does, which reads as a product bug. And a fixture must not collide with the value under test: the first draft typed a step title the fixture already carried, so the assertion matched two elements and looked for a while like a double write. One POST in the request log is what ended that.

## Build log addendum (2026-08-19, third round) — a peer's step arrived ticked

> Owner: _"when receiving a new sub task from WS added by another member, the sub tasks appear as ticked. After restart they appear unticked as expected."_

**A create's `Change.after` was the caller's INPUT, and a client merges `after` over what it already holds — which on a create is nothing.** So a peer's step landed carrying only what the author typed (`{ id, title, parentTaskId }`), missing every field the server defaults. `status` is the one that bit.

`isSettled` read `status !== 'open'`, so `undefined` answered **settled**, and it answered that for all twenty-two of its call sites at once: the step drew struck through with a green ✓, counted as done in its parent's fraction, and dropped out of `שלי`. The reload "fixing" it is the tell — a snapshot carries the real row.

Two changes, because the two halves are separate mistakes:

- **The server sends the row** (`tasks.service`'s create: `after: (entity) => toTaskDto(entity)`). `ChangeService.mutate` has taken a function of the applied entity all along and `bookings.service` already sends a DTO this way; nothing new was needed. It wants `mutate<PrismaTask>` spelled out, for the reason `ChangePayload`'s own comment gives: two unannotated closures leave `T` as `unknown`.
- **The client fails in the safe direction.** `isSettled` now states what settled _is_ (`done` or `dismissed`) rather than what it is not. The forms are identical for a well-formed row — there are three statuses — and differ only on a row carrying none, where "work still to do" is the answer that cannot silently lose work.

**The general form of this is not fixed here and is on the backlog.** Six other services still send `after: input` on a create, and `applyControlChangeToList`'s own comment blesses it: _"A peer's plain create arrives without server-only fields until the next resync — the Index reads only type/title/code/place, so it renders fine."_ That was true of the surfaces it was written for. A task's `status` **is** the row, so it was the first entity where a defaulted field carries meaning — and the next one will not announce itself either.

## Build log addendum (2026-08-19, fourth round) — the composer committed into its own controls

> Owner: _"Removing a sub task doesn't always work, if there's text or something it won't remove it."_ and _"assigning a sub task ui doesn't work most of the time. You click on the little unassigned icon and instead of opening the options it just opens another sub task."_

**Two reports, one bug, and the second sentence names it exactly.** §11's composer commits on blur, and a tap on `✕` or on the assignee chip blurs the box **first**. So the pending words were written before the press landed:

- on the chip, `commit()` in add mode wrote a whole new step — _"it just opens another sub task"_, literally;
- on `✕`, `commit()` ran `reset()`, which returns the row to a read row and **unmounts the control being pressed**, so the click reached nothing and the step stayed.

With an empty box neither happens, which is the _"doesn't ALWAYS work"_.

**Three guards, because one mechanism does not cover the three ways focus leaves the box.** They are not redundancy:

- **`preventDefault` on the two controls' `pointerdown`.** Focus never moves, so there is no blur to guard — and it is the only one of the three that works on **iOS**, where a tapped `<button>` does not take focus and `relatedTarget` is therefore `null`. This app is phone-primary (ADR-0017), so that is the case that matters.
- **`relatedTarget` inside the composer**, for a keyboard Tab from the box to `✕`: no pointer event fires there, and committing would unmount the control being tabbed to.
- **`picking`**, because the picker is a `Modal` that takes focus when it opens. Without it the box blurs into the overlay a frame after the chip's press and commits anyway.

**What this says about ADR-0196 §11.** _"The composer row IS the step's editor"_ put a commit-on-blur box in a row with two other controls, and the ADR recorded the blur rule (`useNoteComposer().pending()`'s promise) without noticing that its neighbours are inside the blur's reach. `NoteComposer` has no such neighbours and no `onBlur` at all — its host reads `pending()` at save — so there was no prior art to copy and no guard to inherit. A commit-on-blur field with siblings needs to say what "leaving" means before it can say what leaving does.

**And two notes on testing it,** since both cost a run. jsdom fires no focus at all on `fireEvent.click`, so the unit suite can pin the three guards and never the gesture — the browser case is the whole point here. In that browser case the composer's own `scrollIntoView({ behavior: 'smooth' })` (§13) makes `✕` a moving target that Playwright's scroll-into-view never resolves, **even under `force`**, which skips actionability but still scrolls: the spec asks the browser for `prefers-reduced-motion` instead, which the app already reads.

## Build log addendum (2026-08-19, fifth round) — a target on its neighbour, and a draft that wasn't one

> Owner: _"on an already created sub task you can't reassign (change assignee). When clicking on the assignee it instead registers as a delete sub task and simply removes it."_ and _"When editing a task, edits to sub tasks take effect even if you canceled the edit and didn't save the task edits."_

### The chip's 44px target sat on the ✕

Measured in the running app at 390 before the fix: the chip painted at **x 72–98**, and `document.elementFromPoint` at **its own centre** returned `.tsk-kid-x`. Pressing the assignee really did press remove.

Two mistakes in five lines of CSS, both invisible in source:

- **The overlay was displaced, not centred.** `inset: 50% auto auto 50%` with `transform: translate(50%, -50%)` starts the box at the control's centre and then pushes it 22px further along, so each control's target sat 22–66px to the _side_ of the control it belongs to. Centring wants `translate(-50%, …)`; the value here reads like a copy from a rule anchored with `right` rather than `left`.
- **It was given a width at all.** The recipe it cites — `row-open.css`'s — reaches 44px in the **block** axis only (`inset: 50% 0 auto 0`), keeping the control's own width. That is not an accident of that rule, it is what stops two controls 6px apart from swallowing each other. A 44px-wide target on a 26px control with a 6px gap overlaps its neighbour by 12px **by construction**, before any displacement.

Both restored: 26 wide × 44 tall each, plus 10px between the two so a fingertip landing between them resolves to one rather than to whichever paints on top. The row is 26px tall, so the block axis is where ADR-0017's floor actually bites.

**It only ever showed on an existing step**, because `✕` is the neighbour and it renders only while a step is being edited. The add row has the chip alone, which is why every earlier test of the chip passed.

### The checklist was the one field `ביטול` did not undo

§12 wrote a step through the moment it was typed on an edit, reasoning that the parent already has an id so there is nothing to wait for. **True about the id and wrong about the form.** Cancel is a promise about everything the sheet holds, and a field that has already written is not a draft — so a step you removed and then thought better of was gone anyway.

Now both modes stage. The sheet holds `StepDraft[]` — an existing row keeps its id, a new one has none — seeded **once** from trip state, and the save computes a **diff** (`planSteps`): drop what left the list, patch what changed, add what has no id. Ticking a step in the sheet is staged too, or cancel would not undo that either; and with the whole list a draft, a create can offer the tick as well, which §12 had refused because "completing something unsaved is a state with nowhere to live".

Seeded once is deliberate and is the trade this makes: a peer's change to a step mid-edit does not reach back into a form someone is typing in, exactly as it does not for the title.

**What this says about §12.** Its sentence _"on an EDIT the steps are trip state and write immediately — the same immediacy the tick has"_ read as symmetry and was a category error: the tick lives on a **row**, which has no cancel, and the checklist lives in a **form**, which does. Immediacy is a property of the surface, not of the field.

## Build log addendum (2026-08-19, sixth round) — the editor asks before discarding

> Owner: _"We need to add the 'are you sure' for canceling a task create/edit when there are changes. Be wary of popping this up when not needed, read issues that we had with other kinds of entities regarding that."_

`TaskSheet` was the one authoring form without the guard. It now uses the shipped one — `useUnsavedGuard(dirty)` on both close paths (`Sheet`'s `onClose`, which is also the backdrop, Escape and system back, and the `ביטול` action), rendering the shared `tone="danger"` `ConfirmDialog` with `t.common.discard*`. No new mechanism, no new words.

**The warning is the interesting half, and the issue it refers to is on the record.** [ADR-0136](0136-an-event-can-also-be-booked.md)'s session-188 follow-up: `EventForm`'s `dirty` read `booked.touched`, which was a fair reading of "the human turned this on" while the flag could only mean that — and the same amendment redefined it as _the category may no longer move this_, true from the first render of every existing event. So **every** edit of **every** event opened dirty and the confirm fired on a form nobody had typed in; worst in Plan mode, where a tap on a row **is** the edit form and backing out of one costs a dialog. `BookingSheet` states the resulting rule as _"`iconTouched`/`kindTouched` are not state the user typed, so they are not part of dirtiness"_.

So three things here, in the order they matter:

- **Values only, diffed against a baseline captured ONCE** — `BookingSheet`'s "the same blob the fields were seeded from, so what did this open with has exactly one answer". This form has no derived field and reads no `touched` flag, and the comment beside the baseline says so, because the next field added is where that would go wrong.
- **`composing` is deliberately not in it.** Revealing the composer is not an edit, and this form has a control whose entire job is to reveal it — pressing `＋ תת משימה`, thinking better of it and leaving must be silent. That is the false positive this form was most exposed to.
- **The steps are diffed by the same `planSteps` the save runs**, so "is this dirty" and "what would be written" cannot drift apart.

**And capturing the baseline found a real bug in the previous round's staging.** The save was diffing against `subtasks.get(task.id)` — **live** trip state — so a step a peer added while the sheet was open read as a step this draft had removed, and saving anything at all would have **deleted it**. Diffing against what the form opened with leaves it alone. Both halves are pinned by tests that fail against the live-state version.
