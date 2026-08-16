# 0191 — A task marks its host, and lives in a section the host already has

**Status:** Accepted, **built**, and **amended 2026-08-16** — §5's row shape is reversed and §6–§8 added, on five owner reports from a device ([session note](../planning/2026-08-16-tasks-host-surface-corrections.md), [mockup](../../mockups/a-task-row-that-matches-its-neighbour-v1.html)). Originally accepted and built (2026-08-16, tasks phase 4 + phase 3r — [session note](../planning/2026-08-16-tasks-phase-4-built.md)). Every number below is measured, first off the mockup's rendered DOM and then off the **running app**.
**Date:** 2026-08-16
**Design reference:** [`mockups/a-third-mark-on-a-host-row-v1.html`](../../mockups/a-third-mark-on-a-host-row-v1.html) — §1 the glyph · §2 what it counts · §3 what three marks cost · §4 the four host row shapes · §5 seeing and adding a host's tasks. **Promoted by this ADR.**
**Closes:** the tasks brief's **§F**, the last of its six open design questions.
**Build plan:** [`planning/2026-08-15-tasks-build-plan.md`](../planning/2026-08-15-tasks-build-plan.md) — phase 4.

**Builds on:** [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §2/§6 (the host FK model and "a section of the surface the host already has"), [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §5/§6/§8 (the mark, and the host passed as a fact never picked), [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §1/§3 (the second mark, and the section order this extends), [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md), [0189](0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md), [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md)

## Context

Phase 4 owed brief §F designed first, and §F's own words are that the cost is _"measured rather than argued"_. Reading the code closed most of it before anything was drawn:

- **Two marks already coexist.** `NoteMark` and `DocumentMark` share a meta line on four row types, added under `DocumentMark`'s own rule that they are _"not the same promise"_. "Can a task and a note both mark one row" was answered by shipped code, with a different pair.
- **§F's premise had expired.** It inherited _"these lines are already measured as full"_ from ADR-0152 §6c — whose composition rule was **retired 2026-08-09**. The meta line is the sync badge and the marks and nothing else.

What was genuinely open was the glyph, what the mark counts, which hosts, and — not asked by §F at all — **where a task is seen and added**, which is the half phase 4 actually needs.

## Decision

### 1. The glyph is a CHECKBOX, not the bare `check` tasks are drawn with elsewhere

`NoteMark`'s rule is one silhouette per noun, and tasks' silhouette is `check`. But `check` is also the completion control's mark, **and that collision sharpened when ADR-0188 §4 was reversed**: since the automatic row lost its badge, `check` appears on a task row as the tick and nothing else. A bare ✓ on a booking row would read "this is done".

Measured, and this is why the measurement did not decide it: a bare ✓ and a checkbox are **identical** — 0px of row height, 0px of baseline offset, 20.8px wide, the same as `NoteMark`. So reading decided it, and the cost is one new path in a curated set, which `icons.ts` defines as an ordinary code change.

**Rejected: a ring around the ✓**, which echoes the completion control's own vocabulary. It sits **2.5px below** the marks beside it and costs the row **1.8px**, and the cause is structural rather than a value to tune: `.note-mark` and `.doc-mark` are `inline-flex` boxes whose first child is an `.icon`, so their baseline is that icon's text baseline; the ring is a flex container with no text, so its baseline is synthesized from its bottom margin edge — and `vertical-align` cannot reach it, because it is a flex **item**. Every fix is a special case for one mark on a line whose other two agree for free.

### 2. The mark counts OPEN tasks only

The one place a task's mark parts company with the two beside it. A note and a document have no lifecycle, so every one of them counts forever; a task does, and a row still marked after the task closed is a nag with nothing behind it. The trace is not lost — it is on the task, which stays under `הושלמו`.

Verified in the running app: a booking carrying three tasks reads **2** once one is ticked.

### 3. All five hosts, with two costs named rather than smoothed

`TASK_HOST_KEYS` is an alias of `NOTE_HOST_KEYS`, so all five are already wired. Two are not free:

- **`MaybeCard`'s mark is a CORNER**, opposite the `✕` so the two shipped corner affordances cannot meet — and corners are finite, with both taken.
- **The Map place row's tag line has a drop queue**, and `Map.tsx` says in place that the note mark is _"LAST, deliberately: it is the item this line drops to the next row first, so a crowded row can never lose a semantic tag to it."_ A third mark joins the end of that queue.

Both are "works, at a price", not "does not work". Measured on the two line-shaped hosts: the third mark costs **0px** on the event row (`.wp-event-m`, §6c's hardened `nowrap` flex line) and the meta line does not wrap on the `ListRow` shape either.

### 4. A task is seen and added in a section the host ALREADY has

§F never asks this and phase 4 needs it. Notes answered it completely (ADR-0152 §6: a section of the surface the host already has, never a new screen), so tasks go to the **same home on every host** — which is what makes this phase cheap:

| host       | where its notes live                                           | tasks    |
| ---------- | -------------------------------------------------------------- | -------- |
| event      | `notesSlot` on the expanded card · `EventForm` · `EventDetail` | the same |
| booking    | `BookingSheet` · `BookingDetail` → `DetailSheet`               | the same |
| place      | `notesSlot` on the Map place card                              | the same |
| document   | `DocumentManageSheet`                                          | the same |
| maybe-item | `MaybeManageSheet`                                             | the same |

**The host is passed as a fact, never picked** (ADR-0153 §5, which tasks already inherit through ADR-0189's editor having no host picker). The FK comes from `TASK_HOST_FIELD` through `taskHostInput`, so a sixth hostable entity is a line in `@waypoint/shared` and nothing in the UI.

**Order: documents → TASKS → notes.** ADR-0174 §3's rule is kept ("a document is a thing you need and a note is something about it"), with a task between the two because it is a thing to **do** — nearer the need than the knowledge.

~~**And a finding the drawing produced that the prose had missed: the rows are `ListRow`s, not `.note-item`s.**~~ **REVERSED 2026-08-16**, on the owner's first sight of it: _"notes and tasks look totally different and have a different allignment"_. The original text is below, struck, because the reasoning was sound and the conclusion was wrong — `.note-item` genuinely had no lead slot, and the mistake was accepting a second row shape rather than **giving it one**.

> ~~`.note-item` has no lead slot, because a note has no completion control; a 44px `.tsk-tick` dropped into one renders an oversized circle floating beside the words. Using the tasks screen's own row instead brings the tick, the star, the deadline and the assignee already built. The cost is that two sections on one surface are not the same row shape, and that is the decision rather than an accident.~~

**What that cost actually was, measured in the running app** — and this is why it should never have been accepted on a drawing: both rows span 31→330, but the task's text started at **x=276** against the note's **x=316**, a **40px** indent from the `ListRow` lead column, with the title at **700/13.5px** against **400/13px**, a section header icon on one and not the other, and `·` spaced in one meta line and not the other. Four differences, one of them structural.

**The row now IS `.note-item`**, which gains a shared leading cell: a note's leading element is the 2px rule it always had, a task's is its tick, and both texts start at `--sec-lead`. Measured after: **0px** of text-edge delta, the task row falling **61px → 35px** onto the note row's own height, and **the notes paying nothing**. The tick is the same control at a second density, clearing ADR-0017's floor through [ADR-0177](0177-a-when-reads-as-a-sentence.md)'s `::after` reach — **44px** of touch against a 20px paint — rather than the screen's 44px box, which is precisely what made a `.note-item` look broken.

**…and that tick was never actually drawn** (amended 2026-08-16, owner from a device: _"what's this tick?? Why is it white? Why not like in the mockups?"_). The paragraph above specifies it exactly — 44px of touch against a 20px paint — and `--sec-tick: 20px` has sat in `notes.css` since this shipped, but the rename from `.tsk-tick` to **`.tsk-tick-sec`** left the paint behind on the old name and **no rule was ever written for the new one**. A `<button>` with no CSS renders platform chrome, so every host surface in §4's table shipped a white rounded square with a bare ✓ in it. Two things a future reader needs from this:

- **The reach is the negative margin, not an `::after`.** `.tsk-tick` and `.wp-listrow-kebab` both already hold a 44px target inside a small box that way, and a second mechanism for one job is what rule 8 forbids — so the two densities now share every declaration and differ in two custom properties (`--tick-ink`, `--tick-inset`). ADR-0177's `::after` reach is the right answer for a `ValueToken` inside a line of text; it is not needed where a control is already its own grid cell.
- **Nothing could have caught it.** `HostTasks.test.tsx` asserts the element, its `aria-pressed` and its click, and jsdom has no stylesheet — so a class name is only a string to the whole unit suite. The guard is therefore a **CSS contract test** (`tasks-section-paint.contract.test.ts`, the idiom `tasks-avatar-size.test.ts` set): it parses every class `TaskSection` emits against the sheets it imports, and a name with no rule fails unless it is listed as structural (a hook meant to be selected, never painted) or as knowingly unpainted. **`tsk-sec-quiet` is the one entry in that second list** — §7's quiet form density was specified and likewise never written, and it is left open rather than cured here, because the owner's same-day report asks the notes section to match the tasks section's _full-strength_ look and that makes the quiet variant a live question. On `docs/backlog.md`.

**What is shared is the GEOMETRY, not a component.** Each section keeps its own body: a note's is text plus author and elapsed time, a task's is a title plus a deadline and an owner. A shared row component would have been mostly a passthrough, and the thing that was actually diverging was the CSS.

**And the section says only what there is to say** (owner: _"tasks should be more minimal"_, from the Map place card). A task with neither a deadline nor an assignee renders **no meta line at all** — it was printing a whole line reading `לא משויך`, which beside a note section is a line that says nothing. The tasks SCREEN keeps the full owner-state, because that is a list you scan for what to do next and "nobody yet" is an answer there; a host's section is not that list. Measured on the place card: a bare task row is **20px** against a note row's 35px.

**Settled tasks stay in the section**, struck. This surface is where you see what was _done_ about this booking; the screen is where the settled collapse lives.

### 5. The host cascade is generalised — and stops where the shapes stop matching

Root rule 8's flagged obligation. `isHostedBy` is widened to any row carrying the five FKs, and `dropHostedForHostChange` is the one applier notes and tasks both call.

**It deliberately does not absorb the other two**, and the reason is that they are not the same operation: `dropAttachmentsForHostChange` reads a different two-member table **and** carries an extra case (a deleted document drops its own links, not only links pointing at it), and `clearPlaceRefsForChange` **clears a field** rather than dropping a row and is already generic over its own shape. Folding either in would mean a flag argument whose job is to say "behave differently" — the copy in a different costume. This is rule 8's "small extraction" taken and its "ask before the bigger refactor" honoured.

### 6. A settled host's tasks stop counting, and stay readable

**Added 2026-08-16** (owner: _"events marked as done/skipped shouldnt show tasks"_). The report was wider than it read: a `done` event did not merely keep its `tsk-mark` — its open task was sitting in the Trip Home `משימות קרובות` band, so a closed host was generating live obligations on the landing screen.

**A settled host has no future, so its open tasks are not open obligations.** The mark drops them, both Home bands drop them, the Index tile stops counting them, and the host's own section still lists them **struck**. That is exactly what a settled _task_ already does, which is the argument: no new vocabulary is spent.

**Nothing is written.** `settledHostKeys` is a derivation over the events array and `isOnSettledHost` reads it, so un-skipping an event brings its tasks back precisely as they were. Rejected: **auto-settling the tasks with the host** — the cleanest read, but it writes to entities the user never touched, and `skipped` plainly does not mean `done`. Rejected: **hiding them entirely** — a task you wrote about that event becomes unreachable from the surface you wrote it on.

Only events can be settled today. The set is the _shape_ rather than the answer: a second settleable host is one more loop in `settledHostKeys` and no change at any call site.

### 7. Where a task is ADDED, and what the Map card had to give up for it

**Two problems wore one coat** in the owner's report (_"I'm not sure where tasks are added … perhaps we need a different path for tasks"_), and only one of them was a design question.

**The gap:** `EventForm` mounted `HostNotes` and a composer and had **nothing for tasks at all** — not a read, not a way in. That was never decided; it was missed. It has the section now.

**The decision: `＋ משימה` opens the real editor, and a host FORM states it quietly.** Rejected: a `NoteComposer`-shaped title-only box. **The argument this ADR first gave for that was wrong and the owner corrected it** — it claimed "a note has no life outside its host and a task has its own screen and tile", and notes have an Index tile and a screen too (`IndexNotesView`). What survives is narrower and is the whole of it: **a note _is_ its body**, so a free-text composer omits nothing from it, while a task's **deadline** is what puts it on the Home band, makes it overdue and makes it the tile's "next" — so a title-only composer systematically produces the weak kind, and notes have no equivalent weak kind. The form's control is quieter because the form is **not the main add point** (owner's call): the read surfaces are, and the form's is there for the task that occurs to you while you are typing the event.

**And the Map place card had to give something up.** With the tasks section as a fifth PINNED grid row the card measured **411px against its own 420px cap** — on a place carrying one task, one note, one reference and neither a summary nor a document. That is [ADR-0182](0182-a-day-is-a-sequence-you-can-step-through.md) §9's documented cut-off with nine pixels of slack. So the card's flexible track is now **one scroller holding both sections** (`.map-cardwrote`) rather than the note list alone. **The cost is that the notes header no longer pins** ([ADR-0167](0167-the-badge-is-the-thumbnails-frame.md) §9.5 pinned it when it was the only section): with two sections nothing can pin both, and losing `שיבוץ ליום` under the fold is worse than losing a sticky header. Measured after, with three tasks and two notes: card at its cap, the shared region scrolling 160 of 260px, and the way-in block **on screen**.

**Before that, the same positional grid produced a plain defect** (owner: _"what's happening with place tasks/notes going over each other!"_). Every rule on that card is keyed by `grid-row`, and phase 4 gave the tasks section `.note-sec` for its geometry — so `> .note-sec` matched **both** sections and stacked two headers on one row and two lists on another. `.tsk-sec` existed for exactly this disambiguation and these rules never picked it up. **Four unit specs caught the same collision inside components and none of them could see this one**, because a positional stylesheet is not a DOM query.

### 7a. On a CREATE too, staged — and `שיבוץ ליום` hides only in day scope

**Added 2026-08-16**, both from the owner reading §7 back.

**Staging.** §7 shipped the form's section behind `{event && …}` / `{booking && …}`, so it existed on an EDIT and not on a create (owner: _"why did you add a quiet task section only for event/booking edit? Why not on creation?"_). A create has no id to hang the FK on — which is a reason to **stage**, not a reason to have no way in. `useTaskStaging` + `writeStagedTasks` are the third consumer of a pattern the same forms already run twice (`useNoteComposer().pending()`, `DocumentAttachField`'s staged picks), and they ride `writeNotesBehind`'s ordering rather than inventing their own: the write goes out **after** the host's, inside the same change group, because the outbox is FIFO and a task queued first would reach a server that cannot see its host. A staged row cannot be ticked — completing something unsaved is a state with nowhere to live.

**`שיבוץ ליום` is hidden for a place already slotted on the day in scope**, and **only in day scope**. The first attempt hid it whenever the place was linked at all, and ten shipped specs encoding [ADR-0135](0135-a-place-becomes-an-event-or-a-booking.md) §1 failed — because the Map's list is **built from** places that events and bookings already use, so unscoped the verb would almost never appear. Day-scoped the claim is narrow and true: this place already has a slot on the day you are looking at. In all-days the verb always stands, because "already scheduled" has no meaning without a day to be scheduled on — a place visited Tuesday is a fine thing to schedule for Thursday. An idea never counts: a place on the shelf is exactly the state this verb answers.

**And a coverage hole the narrowing exposed.** `Map.test.tsx`'s `allDaysOn()` is a **read** returning a boolean, and three call sites used it where the action (`tapAllDays()`) was meant — including a block whose own comment says _"both day scopes on purpose"_. Those variants had been running the same scope twice. It surfaced only because this is the first behaviour on that card that differs **between** the scopes; `frontend/CLAUDE.md`'s "assert across both day scopes" rule assumed the harness did what it said.

### 8. A linked task says what it is linked to

**Added 2026-08-16** (owner: _"in the tasks page, linked tasks don't show their host, and I think that it must have some indication of what it's linked to"_). **This designs nothing.** The notes screen has carried `.note-host` — an `Icon` from `NOTE_HOST_ICON` plus the host's name — since ADR-0153 §4, along with `noteGlyph` on the leading badge and `useNoteHostWayIn` for whether the host can be reached. The tasks screen picked up none of it. `noteHost()` read only the five FKs, so it widened from `Note` to `HostedRow` in one word — the same extraction `isHostedBy` and `dropHostedForHostChange` already took in §5.

**One real constraint: a task row has no badge slot.** ADR-0188 §1 gives a row with a `lead` no icon, because the tick _is_ its leading element. So where a note says its host **twice** (the category glyph and the chip), a task says it **once**, and the meta line is the only place it can be said.

**Where the assignee went, and why the line then fit.** ADR-0190 §6 put the owner's NAME in this meta line, and argued that an unassigned task must say `לא משויך` because silence in a text line is indistinguishable from a name that did not fit. **Amended 2026-08-16** (owner, against Microsoft To Do: _"I actually prefer the way they handled showing the assignee (title row, only avatar)"_): the face alone, at the trailing edge of the **title** row. In a fixed slot the absence is unambiguous — there is a place for a face and no face in it — so §6's premise expires exactly as ADR-0188 §3's did before it. The face is `Avatar`'s non-interactive form and therefore `aria-hidden`, so the row carries the name in a visually-hidden span: moving to a face-only must make the assignee _compact_, not _unreadable_.

**That line then held three things and broke.** The wrap was accidental — it landed wherever the strings ran out, so the row's shape moved with its content. Both single-line repairs were measured and both lose what they cut: `nowrap` with the chip first gives `לא…`, with the chip last gives `ביק…`, which is the point of the chip. **So the split is deliberate** (owner's own proposal): the **deadline owns line one**, and the host chip and the assignee share line two. It costs **1px** against the accidental wrap (79 against 78) and gives the chip **89px instead of 73**, so a host name that used to ellipsise reads whole — and an undated task keeps one line, at 62px. Rejected: **grouping the screen by host**, which `IndexTasksView` already argues against in place for notes ("grouping rebuilds, worse, what every host row already does"). Rejected: **a leading badge for a task**, which would re-open ADR-0188 §1 to buy a second statement of the same fact.

## Consequences

- **`TaskMark`, `TaskSection`, `HostTasks` are net-new**; `tasksForHost`, `taskHostInput`, `openTaskCountsByHost` and `dropTasksForHostChange` join `lib/tasks.ts`. `computeReadiness` and the notes modules are untouched in behaviour.
- **`.tsk-sec` exists so a selector can still mean "the NOTES section".** The two share `.note-sec`'s geometry — one section shape per surface — and sharing the root class alone made `querySelector('.note-sec')` start finding the tasks one, since tasks read above notes. **Four shipped specs caught it**, which is the argument for the extra class rather than against it.
- **`noteCountForContext` is now `hostCountForContext`**, with the old name kept as an alias: it was always generic over the tally, and tasks pass their own map through it.
- **`icons.ts` gains `checkbox`.**
- **Every host surface mounts one more component**, and no host grew a new surface.
- **New `he.ts` copy:** `tasks.mark` and `tasks.section`.
- **Nineteen test mocks gained `tasks`/`taskVerbs`** — the cost of a derivation reaching more screens, and it surfaced as 460 red tests in one run rather than as a subtle wrong answer.

## Alternatives considered

- **A bare ✓ for the mark.** Rejected (§1) on reading rather than measurement — the two cost identically, and `check` on a task row now means the tick.
- **A ring around the ✓.** Rejected (§1) at **2.5px** of baseline offset and **1.8px** of row height, from a cause no value can tune.
- **One combined "has content" glyph** for all three. Rejected on `DocumentMark`'s own argument extended: three different promises, and one glyph cannot say which a tap will get you.
- **Counting all tasks, as notes and documents do.** Rejected (§2): they have no lifecycle and a task does.
- **A merged "what is here" section** holding notes and tasks together. Rejected (§4): one verb that has to ask "note or task?" after the press.
- **No section, with the host reached from the task instead.** Rejected (§4): the mark on the row would then point nowhere.
- **Folding the attachment and place-ref cascades into one applier.** Rejected (§5) — different operations, and the flag argument that would unify them is the copy in a different costume.
