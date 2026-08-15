# Tasks phase 1 — the spine, built

**Date:** 2026-08-15
**Plan:** [`2026-08-15-tasks-build-plan.md`](2026-08-15-tasks-build-plan.md) (the handoff for phases 2–6)
**Decisions:** [ADR-0188](../decisions/0188-a-tasks-tick-is-a-sibling-and-the-leading-element-says-who-owns-the-outcome.md) — **unchanged**; nothing in the build contradicted it. Model: [`2026-08-15-tasks-design-brief.md`](2026-08-15-tasks-design-brief.md) Part 1.

Entity + sync + the Index's fourth tile + the screen + create/edit + due + assignee + `important` + done/dismiss/delete. A shared trip to-do list that stands on its own; automatic tasks (phase 2) and the Trip Home band (phase 3) sit on top of it unchanged.

## What shipped

- **`packages/shared`** — `taskSchema` / `taskStatusSchema` / `taskDerivedKeySchema` in `entities.ts`, `createTaskSchema` / `updateTaskSchema` in `schemas.ts`, `ENTITY_TYPE.TASK` + `TASK_STATUS` + `TASK_DERIVED_KEY` in `constants.ts`, `tasks: Task[]` on `tripSnapshotSchema`.
- **`backend`** — the `Task` model with all five host FKs and `derivedKey` in the first migration, `src/tasks/` on `src/notes/`'s shape, and the snapshot join.
- **`frontend`** — one entry in each of the three registries, `lib/tasks.ts` for every derivation, `ui/IndexTasksView.tsx` + `TaskSheet` + `TaskManageSheet`, `ui/tasks.css`, and the fourth `IndexTile`.
- **`ListRow` grew exactly one slot** (`lead`), `icon` became optional, and no other consumer changed.

## Five things the build decided that the ADR and the brief did not

**1. `TASK_HOST_KEYS` is an ALIAS of `NOTE_HOST_KEYS`, not a copy of it.** Same five strings, same "at most one" rule, so the compiler holds them identical rather than a reviewer having to. If the sets are ever meant to diverge, that one line becomes a real list and the divergence is visible where it is introduced. `ATTACHMENT_HOST_KEYS` stays the precedent for a genuinely different set. Same for `TASK_HOST_FIELD`.

**2. The task PATCH is SPARSE, where the note PATCH is whole-content — and a test caught the cost of getting this wrong.** `updateNoteSchema`'s "an absent field means cleared" is bought by a note having exactly one edit surface. A task has two: the editor, which holds every field, and **the tick**, which settles a task without opening anything and sends `status` alone. The first draft of `TasksService.update` copied the note's `?? null` coercions, and the spec that asserts a tick leaves the deadline alone failed on it — a tick was erasing `dueAt`, and `body` had the identical bug one line up. Fixed at the root: every field is untouched when absent, and clearing is an explicit `null`. This is written on `updateTaskSchema` because it is a contract, not an implementation detail.

**3. A date-only deadline resolves to the END of that day** (`DAY_DEADLINE_HHMM = '23:59'`, `frontend/src/constants.ts`). "By Thursday" is discharged any time on Thursday; storing 00:00 would make a task due today read as overdue one minute past midnight. `dueHasTime: false` is what records that the hour was never typed, so no surface prints it. The alternative — special-casing date-only inside `taskBand` — was rejected because it puts a branch in a derivation every future reader has to carry, to avoid one constant at the single write site.

**4. `taskBand` uses two different zones on purpose, and this is the subtlest thing in `lib/tasks.ts`.** Whether a deadline has **passed** is absolute (`dueMs < nowMs`). Whether it is **today** is the reader's calendar day, in the zone they are standing in now. A task due 23:00 in Tokyo while you are still in Tel Aviv is neither overdue nor on your today, and the two halves would disagree if one zone answered both. Tested directly (`does not call a deadline overdue just because it is tomorrow where it falls due`).

**5. The settled-collapse is the facet axis' third chip, not a second control beside it.** Brief §13 names both a `הכל · שלי · הושלמו` axis **and** a count-in-label collapse toggle; built as one mechanism, because `ChoiceGrid` already carries a count per chip, so `הושלמו · 2` **is** the count-in-label toggle ADR-0061 established. Two controls would have been two ways to see one set of rows. A chip with nothing behind it is omitted entirely (ADR-0101).

## One guard added, and where it went

**`assertMemberInTrip`** (`backend/src/common/trip-scope.util.ts`). `assigneeUserId` is a client-supplied id written onto a trip's row — the same class of reference the three guards above it already cover — and a foreign one is a task delegated to somebody who can never see it. A **sibling** rather than a sixth line in `assertEntityRefsInTrip`'s table, per that file's own rule: the table keys on the referenced row's `id`, and a member resolves by the `(tripId, userId)` pair on `Membership`. Its own spec, per `backend/CLAUDE.md`, including the case a bare user lookup would wave through: a real user who is a member of a **different** trip.

## What was deliberately NOT done

- **The host-cascade appliers were not generalised.** They are four (not three — `dropAttachmentsForHostChange` is already the third), and the obligation belongs to **phase 4**, where the FKs are first read. Nothing in phase 1 reads a host, so generalising here would be a refactor with no consumer.
- **`assignedToAll` / `completedBy` are not in the migration.** Phase 6's, per the brief's phasing. The five host FKs and `derivedKey` **are** in it, because those are read in phases 2 and 4 and a second migration on a live synced entity is not free.
- **No host picker in the editor**, exactly as ADR-0153 §5 settled it for notes. A task written on the screen is general.
- **No search overlay.** The notes screen has one because 28 notes of free prose are hard to scan; a task list is short, sorted by urgency, and has a facet axis. Add it when a real trip's list is long enough to want it.

## Verification

`pnpm typecheck` + `pnpm build` green. Suites: **frontend 3813 passed** (224 files), **backend 678 passed / 1 skipped**, **shared 232 passed**. New: `lib/tasks.test.ts` (18), `ui/IndexTasksView.test.tsx` (20), `ListRow.test.tsx`'s three lead-slot cases, `tasks.service.spec.ts` (13), three `assertMemberInTrip` cases. Every task fixture pins its clock.

**One flake seen and cleared, recorded so the next session does not chase it:** `useMapCamera.test.tsx`'s easing-settle case failed once under full-suite load and passes in isolation on both a clean tree and this branch. It is timing-sensitive and unrelated to this change.

## Still owed

The device pass' three questions (mockup's last panel) — the owner's call was **ship as drawn, restyle later**, so the 26px ring at 1.5px is the mockup's exactly, and it is two CSS values in `ui/tasks.css` if a real phone disagrees.
