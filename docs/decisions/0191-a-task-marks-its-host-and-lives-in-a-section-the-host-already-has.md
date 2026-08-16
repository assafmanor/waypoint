# 0191 — A task marks its host, and lives in a section the host already has

**Status:** Accepted, and **built** (2026-08-16, tasks phase 4 + phase 3r — [session note](../planning/2026-08-16-tasks-phase-4-built.md)). Every number below is measured, first off the mockup's rendered DOM and then off the **running app**.
**Date:** 2026-08-16
**Design reference:** [`mockups/a-third-mark-on-a-host-row-v1.html`](../../mockups/a-third-mark-on-a-host-row-v1.html) — §1 the glyph · §2 what it counts · §3 what three marks cost · §4 the four host row shapes · §5 seeing and adding a host's tasks. **Promoted by this ADR.**
**Closes:** the tasks brief's **§F**, the last of its six open design questions.
**Build plan:** [`planning/2026-08-15-tasks-build-plan.md`](../planning/2026-08-15-tasks-build-plan.md) — phase 4.

**Builds on:** [0152](0152-a-note-is-one-entity-and-its-host-is-a-field.md) §2/§6 (the host FK model and "a section of the surface the host already has"), [0153](0153-the-notes-surface-the-mark-and-no-mode-gate.md) §5/§6/§8 (the mark, and the host passed as a fact never picked), [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §1/§3 (the second mark, and the section order this extends), [0188](0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md), [0189](0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md), [0190](0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md)

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

**And a finding the drawing produced that the prose had missed: the rows are `ListRow`s, not `.note-item`s.** `.note-item` has no lead slot, because a note has no completion control; a 44px `.tsk-tick` dropped into one renders an oversized circle floating beside the words. Using the tasks screen's own row instead brings the tick, the star, the deadline and the assignee already built. **The cost is that two sections on one surface are not the same row shape**, and that is the decision rather than an accident.

**Settled tasks stay in the section**, struck. This surface is where you see what was _done_ about this booking; the screen is where the settled collapse lives.

### 5. The host cascade is generalised — and stops where the shapes stop matching

Root rule 8's flagged obligation. `isHostedBy` is widened to any row carrying the five FKs, and `dropHostedForHostChange` is the one applier notes and tasks both call.

**It deliberately does not absorb the other two**, and the reason is that they are not the same operation: `dropAttachmentsForHostChange` reads a different two-member table **and** carries an extra case (a deleted document drops its own links, not only links pointing at it), and `clearPlaceRefsForChange` **clears a field** rather than dropping a row and is already generic over its own shape. Folding either in would mean a flag argument whose job is to say "behave differently" — the copy in a different costume. This is rule 8's "small extraction" taken and its "ask before the bigger refactor" honoured.

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
