# Tasks (משימות) — build plan

**Frame:** [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) (the row, the two menus, both Home bands — phases 1–3's decisions; **§1–§3 built, §4–§7 still design**) + [`2026-08-15-tasks-design-brief.md`](2026-08-15-tasks-design-brief.md) (Part 1, the model). Design reference [`mockups/tasks-row-and-refusals-v1.html`](../../mockups/tasks-row-and-refusals-v1.html), which is **the build spec** for the row, the two menus and both bands — it is interactive and self-measuring, so open it rather than reading its source.

**This file is the handoff.** It carries the phase scope, the status of each, and every decision taken _during_ the build that the ADR and the brief predate. A session picking up phase N reads: this file, ADR-0188, the mockup, brief Part 1, and the `CLAUDE.md` of the package it is in. **Do not read the whole `docs/` tree, and do not preload the ADRs Part 1 cites** — Part 1 already carries what they decided.

**One PR per phase.** Six phases, six branches, six PRs. Phase N+1 branches off `main` **after** phase N merges, never off phase N. Docs land in the same PR as the code they describe: prune or amend the backlog line, add a dated session note. An ADR **only when something is decided** — re-tuning a number or extending an existing rule does not earn one, and if the build contradicts ADR-0188 it is **amended in place**, never doubled.

---

## Status

| phase                    | branch                               | state                                                                                                                                                                  |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — the spine**        | `feat/tasks-phase-1-the-spine`       | **built** — [note](2026-08-15-tasks-phase-1-built.md)                                                                                                                  |
| **1b — editor + read**   | `feat/tasks-phase-1-the-spine`       | **built** — [ADR-0189](../decisions/0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md) · [note](2026-08-15-tasks-editor-built.md) |
| **2 — automatic tasks**  | `feat/tasks-phase-2-automatic-tasks` | **built** — [ADR-0190](../decisions/0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md) · [note](2026-08-16-tasks-phase-2-built.md)  |
| **3 — Trip Home band**   | —                                    | not started                                                                                                                                                            |
| **4 — hosts**            | —                                    | not started                                                                                                                                                            |
| **5 — the hero slot**    | —                                    | not started                                                                                                                                                            |
| **6 — `everyone` tasks** | —                                    | not started                                                                                                                                                            |

**Ship after phase 3.** Phases 1–3 are the product; 4–6 are the expensive half and can wait for real use.

---

## Settled — do not re-open

All of the brief's Part 1: one noun · automatics derived never stored · `derivedKey` as the human overlay · three assignment states with arbitrary multi-select refused · one `important` flag · nothing on the day rail · no mode gate · derived due-time zone · no tab · the flat urgency-ordered screen · the read-only hero slot · the phase order. Plus ADR-0188 §1–§7. The brief's own list is under "Not design questions".

**One amendment already written into the brief in place:** §2's "a manual and an automatic task look the same" holds everywhere **except the one element that is a verb**. Manual leads with the tick; automatic leads with the derivation's own badge.

## Two corrections the brief predates — verified against the code

1. **The host-cascade family already has THREE members, so tasks makes it FOUR.** The brief's reuse audit says tasks "makes it three" beside `dropNotesForHostChange` and `clearPlaceRefsForChange`. Out of date: `dropAttachmentsForHostChange` (`frontend/src/lib/attachments.ts:54`, ADR-0173 §7) is already the third, and its own comment says it "needed no new thinking". Four hand-written copies of one rule — _when a schema says `Cascade`, the client owes a local derivation off the parent's change_ (ADR-0157 §3) — is what root rule 8 exists to stop. **Generalise the three before adding the fourth, in phase 4** where the FKs are first read; not in phase 1, where nothing reads them. If it is not a small extraction, **stop and ask** — don't silently take the bigger refactor, don't silently add a fourth copy.

2. **`WhenField` cannot express a date-only value**, so the brief's §5 open question ("checked at plan time, not guessed at here") has an answer: **no**. `DayProps` is `date + start + end`; `SpanProps` is two `YYYY-MM-DDTHH:MM` endpoints, and its "date-only while half-entered" is a transient state on the control, not a supported value.

## Two forks, resolved before phase 1

**How a deadline is entered — `DateField` + an optional time `ValueToken`** (owner's call, 2026-08-15). Not a third `WhenField` variant: that primitive carries zones, windows, durations and per-leg refusal marks, none of which a task shares, so the variant would be mostly an opt-out list and every future change to it would have to reason about a shape using none of it. ADR-0177's own header already prescribes the alternative — _"a date token is `<DateField className="vt vt-date">`"_ — and `ValueToken kind="time"` opening `TimePicker` is the shipped way an hour sits inside a sentence. `dueHasTime` falls out of whether the time token holds a value; an empty date reads as "no deadline" through `vt-empty`.

**The timezone question this raised, and why it does not move the fork** (owner, 2026-08-15: _"we need to carry timezones to auto derive the time when a task is during a trip"_). Correct requirement, and **zone derivation is not the field's job in either option** — `WhenField` does not derive a zone either. It renders `<ZoneChip {...zone} />` from a prop, and the resolution is `authoringZone(base, { date, time }, zoneEvidence)` (`lib/places.ts`), a pure function the **host form** calls. So a task's due date resolves through exactly the mechanism brief §10 names, with `{}` as the base — no place FK in phase 1 means it resolves through the itinerary segment, which is the point: a deadline stays consistent with how the calendar day rolls for that traveller.

The chip is **read-only** (`ZoneChip` with no `onChange`, which is a shipped state of that primitive). Brief §5 gives `Task` no `displayTimezone` column and §10 says _"nothing is stored per task"_ — so there is a zone to **state** and nothing to pin. Adding an override column would be re-opening a settled entity shape.

**The device pass — ship as drawn, restyle later** (owner's call, 2026-08-15). Phase 1 builds the mockup's geometry exactly: 44px hit box at `border-radius: 12px`, 26px ring at 1.5px, `--line` on the ring and `--muted` on the mark at rest. The three things a desktop render cannot settle stay owed and are listed in the mockup's last panel; the first (does 26px read as pressable under a thumb) is two CSS values in `ui/tasks.css` if a real phone says otherwise.

---

## Phase 1 — the spine

Entity + sync + Index tile + screen + create/edit + due + assignee (nobody / one person) + `important` + done/dismiss/delete. A shared trip to-do list, useful standalone.

- **`packages/shared`** — `Task` in `entities.ts`, zod in `schemas.ts`, `ENTITY_TYPE.TASK` in `constants.ts` beside `NOTE`. Copy `Note`'s shape; it is this feature's sibling and the host-FK block is the same five columns.
- **`backend`** — the Prisma model, then `src/tasks/` on `src/notes/`'s exact shape (`.module` / `.controller` / `.service` + specs). **The migration carries the five host FKs and `derivedKey` even though nothing reads them until phases 2 and 4** — a nullable column is free today, a second migration on a live synced entity is not. **`prisma migrate dev` refuses non-interactively on warnings here — use `migrate diff` + `migrate deploy`.**
- **`frontend`** — one entry in each registry, never a new branch in an existing `switch` (ADR-0094/0095): the memory channel in `state/trip-state.tsx`, `CACHE_CHANNELS` in `lib/cache.ts`, `OUTBOX_VERB` + the op union + `outboxOpToCacheChanges` in `lib/outbox.ts`, `tasks: Task[]` in `tripSnapshotSchema`. Screen as `IndexTasksView` modelled on `ui/IndexNotesView.tsx` — `ChoiceGrid` for the one facet axis, `RevealList` on **every** control that changes the list (a bare `.filter()` is the one-off that made the Map jump for two releases), `EmptyState`, `Modal`.
- **The row is the mockup's.** Only shared-component change: `ListRow` gains a `lead` slot (`icon` becomes optional). Two rules a build will otherwise lose (ADR-0188 §1–§2): the lead is a **sibling** of the trigger, and it needs `z-index: 1` because it carries the kebab's negative-margin overhang while sitting **first** in DOM order. The hit box is a rounded **square** (12px), not a circle — a circle clips the hit region and a corner tap opens the task instead of completing it.
- **Tests:** `ListRow`'s new slot; the three registry entries; the screen's verbs. Pin the clock with `setSimulatedNow` — every fixture here carries dates.

**Built 2026-08-15** ([session note](2026-08-15-tasks-phase-1-built.md)), with ADR-0188 unchanged — nothing in the build contradicted it. Five decisions later phases inherit, all argued in the note:

- **`TASK_HOST_KEYS` is an ALIAS of `NOTE_HOST_KEYS`**, not a copy. Phase 4 wires the hosts against that alias; if the two sets are ever meant to diverge, that one line becomes a real list.
- **The task PATCH is SPARSE where the note PATCH is whole-content** (`updateTaskSchema` states why). A task has two edit surfaces — the editor and **the tick** — so absent-means-cleared would let one tick erase the task's words. A spec caught it; phase 2's dismiss and phase 6's `completedBy` both ride this same sparse path.
- **A date-only deadline resolves to the END of its day** (`DAY_DEADLINE_HHMM`), so a task due today is not overdue at 00:01. Phase 3's band reads `taskBand` and inherits this for free.
- **`taskBand` uses two zones deliberately** — "passed" is absolute, "today" is the reader's calendar day. Phase 3's "due today and overdue" is exactly this predicate, so do not re-derive it there.
- **The settled-collapse is the facet axis' third chip**, not a second control: `ChoiceGrid` already carries a count per chip, so `הושלמו · 2` **is** ADR-0061's count-in-label toggle.

One guard was added and phases 4–6 should extend rather than copy it: **`assertMemberInTrip`** in `backend/src/common/trip-scope.util.ts`, a sibling of `assertEntityRefsInTrip` because a member resolves by the `(tripId, userId)` pair rather than by a row id.

## Phase 1 follow-up — the editor and the read (**BUILT 2026-08-15**, and it came before phase 2)

The owner reviewed the shipped phase 1 and reported four things. Designed and rendered in [`mockups/task-editor-and-read-v1.html`](../../mockups/task-editor-and-read-v1.html) (**Accepted**, promoted by [ADR-0189](../decisions/0189-the-editor-uses-the-idiom-the-app-already-had-and-a-task-is-read-where-it-sits.md)), design session at [`2026-08-15-tasks-editor-design-session.md`](2026-08-15-tasks-editor-design-session.md), **build note at [`2026-08-15-tasks-editor-built.md`](2026-08-15-tasks-editor-built.md)** — the four decisions the build took that the design had not are there, and a session picking up phase 2 reads it rather than re-deriving them.

Why it exists at all: **ADR-0188 designed the row, the two menus and both Home bands — it never designed the editor**, and phase 1 built one from `NoteSheet`'s shape without rendering it. Three of the four reports are that gap.

What the mockup proposes, each measured at 360px:

- **`חשובה` becomes `EventForm`'s `יש הזמנה` row verbatim** (ADR-0136 §1: `.field` + `ToggleChip tone="cta"` + **`size="touch"`** + a star). Phase 1's chip measures **29px against ADR-0017's 44px floor** — the report said "ugly", and the defect under it is a touch target.
- **The assignee row is `ChoiceGrid layout="pills"` with a person where the glyph goes.** `Choice` grows one optional `AvatarPerson`; everything else — scroll, snap, edge mask, `useCenterSelected`, radiogroup ARIA — arrives from the primitive. **46px** per option against the shipped pill's 28px, and a new host is explicitly not bound by the deferred 44px debt `choice-grid.css` records in place. **Nothing is selected by default.**
- **`של כולנו` must be freed for phase 6.** It is the _everyone-independently_ state's word and phase 1 spent it on _unassigned_. The fork is live in the mockup's control: `מישהו מאיתנו` (the brief's own words) · `של הקבוצה` · `לא משויכת`.
- **Reading `body`: the row opens where it is**, ADR-0153 §4's shipped idiom, reusing `.note-open-foot` — the proposal is to **rename** that to a neutral `.row-open-foot`, never to copy it. **+46.3px** against **216.5px** for the detail sheet drawn beside it and rejected. The row's "there is more" mark costs **0px**.
- **`body` is write-only today** — the editor writes it and nothing renders it. That is a defect, not a missing nicety.

The owner's three calls, all built:

- **`חשוב`, not `חשובה`** — a label naming a mark does not inflect for `משימה`. Same in the `⋯` sheet.
- **`לא משויך`**, over `מישהו מאיתנו` and `של הקבוצה` — **and its default came back with it**, which is the interesting one: `של כולנו` is a **claim** a presumed default can make falsely, `לא משויך` **describes the form's state** and cannot be. Same saved value either way.
- **The Index tile order is `הזמנות · משימות · מסמכים · פתקים`** — below the spine, order by whether a tile can be LATE. The session's `משימות`-first recommendation was dropped against `Index.tsx`'s own comment that a task's prominence comes from the Home bands rather than from chrome.

**Two things the build learned that phase 2 inherits:** `Choice.lead` is a `ReactNode` rather than an `AvatarPerson` (the unassigned option is a person-shaped absence with no person to pass), and the open-in-place foot is now **shared** — `RowOpenFoot` + `.row-open-*` in `ui/domain/`, so a third surface that opens a row adds a `lead` and no CSS.

## Phase 2 — automatic tasks (**BUILT 2026-08-16**)

**Six decisions it needed first**, drawn and measured before any code — [the questions](2026-08-16-tasks-phase-2-open-questions.md), [ADR-0190](../decisions/0190-a-readiness-check-is-a-task-row-and-the-checks-sit-inside-the-urgency-ladder.md), [the build](2026-08-16-tasks-phase-2-built.md). **The order is the one to know:** the checks sit INSIDE the urgency ladder — urgent (important or overdue) → checks → the rest — in ONE list, which is the owner's revision of both orders the mockup drew, and it is what finally makes brief §2's "one noun, one list" true on screen.

`computeReadiness`'s five checks render as task rows, `derivedKey` wired, Plan Home converges. **`lib/readiness.ts` is untouched** — `status` is the derivation's answer _unless_ the row says `dismissed`. One predicate, one test.

Where ADR-0188 §4/§5/§7 get built and where the brief's §B survives contact or does not: the automatic row leads with the check's badge (PlanHome's existing `CHECK_ICON`), done-ness trails as `.chk-ok`, **the CTA button is deleted** (the row's tap does it — ADR-0061 §1 survives without a button, because `ListRow` has a tap where `.chk-row` is a `div`), and there is **no** reserved sync column (a task with no row has no write to badge). The two refusals are **absences** in the `⋯` sheet with `RowManageSheet`'s subject slot stating the reason above them — never a disabled item.

`.chk-row` / `.chk-ic` / `.chk-t` / `.chk-m` / `.chk-cta` / `.chk-ppl` **retire** here. `.chk-ok` survives. This is a deletion, not an addition. **Watch 360px specifically** — the design's own first draft was fine at 390 and broke at 360.

## Phase 3 — the Trip Home band (**BUILT 2026-08-16**)

**No ADR** — nothing here decided anything ADR-0188 §6 had not. [Session note](2026-08-16-tasks-phase-3-built.md) carries the two judgement calls it did contain: the band sits **above `גישה מהירה`** directly under the board (brief §11 is about prominence, and its one hard constraint — nothing on the collapsed board — is honoured), and a band row's tap goes to the **tasks screen** through ADR-0050's `focus` deep-link rather than a bare tab switch. Measured live: **226px** for three rows plus the overflow row, **61px** per row.

`.checklist` + the same rows under a `sec-title`. **Manual tasks only** — an automatic task's deadline is departure, so mid-trip every unmet check would sit there permanently overdue. Capped at 3 with an overflow row into the screen; **absent entirely when nothing is due** (ADR-0045: no empty shell). Depends on nothing but phase 1.

## Phase 3r — the Homes catch up with the screen

**Three gaps the owner found on a device (2026-08-16), grouped as one phase because they are
one cause: the Homes were built before the screen's rules settled, and never re-read them.**
None is a design question — the screen already decided each, and these are the surfaces that
did not follow. Cheap, and worth doing before phase 4 rather than after, since phase 4 adds a
fourth surface that would inherit the same drift.

**1. Both Homes order tasks differently from the Index, and it is a real divergence.** The
Index orders through `orderTaskRows` — _urgent (important OR overdue) → the checks → the rest
in urgency order_ (ADR-0190 §2, the owner's own revision). Trip Home's band does not: it runs
`tasksDueSoon` → `sortTasks`, which is _overdue → today → later_ with `important` lifting only
**within** its band. So an important task due in three days sits at the **top of the Index**
and **below everything due today** on Trip Home. The same tasks, two orders. Plan Home already
uses `orderTaskRows`; the band does not, and the fix is to stop having two answers.

**2 & 3. Plan Home's completed collapse only ever contains AUTOMATIC tasks.** It is
`automatic.filter((a) => a.done)` — a completed _manual_ task cannot appear there, and the
`הצג שהושלמו (N)` count counts only checks. So the section reads as "completed" while
answering about half the noun, which is the same one-noun failure ADR-0188 §4 and ADR-0190 §1
have each already corrected on other surfaces. The completed half should be the same
resolution the open half is.

**Watch when building it:** the band is capped at `TRIP_HOME_TASK_BAND_CAP` and the cap is
applied _after_ the order, so changing the order changes **which three rows show** — that is
the point, and it should be measured rather than assumed.

## Phase 4 — hosts

The five FKs wired: marks on host rows, inline composers, the way in. **The underestimated one** — five hosts × (create, read). Two rule-8 obligations land here: generalise the three host-cascade appliers (see correction 1 — ask if it is not a small extraction), and reuse `lib/note-host-target.ts` by **widening its name**, never copying its table. **Owes the brief's §F designed first** — the mark on a host row, on lines ADR-0152 §6c already measured as full, including whether a task and a note can mark the same row.

## Phase 5 — the hero slot

A hosted task in the lifted horizon. Depends on 4 — a task reaches the hero **through** its host. **Owes the brief's §E designed first**, and it lands as an **amendment in place to ADR-0160 §3 and §13**, not a new ADR beside them: §3 admits exactly three affordances and §13 says a fourth is "deliberately unbuilt and named so it cannot arrive quietly". The slot is a **read**, not a completion — the owner was offered the tickable version and declined.

## Phase 6 — `everyone` tasks

`assignedToAll` + `completedBy: String[]`. Cheap to build. **Owes the brief's §C designed first** — what "3 of 5 packed" looks like on a row, in a list, and to the person who has not packed. The LWW tick-collision ceiling is named in brief §6 and gets a `ponytail:` comment, not a design.

---

## Not a phase

**Push notifications** — their own epic, and tasks is only its first consumer (brief §12, own backlog line). Until it exists, **a due task surfaces only when someone opens the app, and no copy anywhere may imply otherwise.**

**Sub-tasks** — a task holding a checklist of its own (owner ask, 2026-08-15). Behind all six phases, own backlog line, wants a short PM pass before a mockup and wants designing **together with the brief's §C** (a parent's `2/5` read and `completedBy`'s are the same problem).
