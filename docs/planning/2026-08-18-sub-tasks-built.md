---
date: 2026-08-18
kind: build session
surface: tasks — sub-tasks
status: built
adr: docs/decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md
mockup: mockups/a-task-that-holds-a-checklist-v1.html
---

# Sub-tasks, built

[ADR-0196](../decisions/0196-a-task-can-hold-a-checklist-and-the-exclusion-is-paid-once.md) designed this the same day; this note is the build. The ADR's **build log** carries what the build changed about the design and is the thing to read — this note is the shape of the change and the two decisions that were the build's own.

## What shipped

**`packages/shared`** — `parentTaskId` on `taskSchema`; `createTaskSchema` gains the field plus the `.refine` that refuses a deadline, a wall-clock flag, a pinned zone, `important`, a body, a `derivedKey` and any host on a step; `subtaskPatchRefuses` for the sparse-patch half the schema cannot see; `TASK_SUBTASK_CAP = 20`. `updateTaskSchema` deliberately has **no** `parentTaskId`.

**`backend`** — one nullable column, one self-relation with `onDelete: Cascade`, one index, one migration. `TasksService.assertParent` refuses an unknown parent, a parent that is itself a step (the half of "depth is one level" only the server can see), and the 21st child. `update` refuses a patch that would give a loaded step what a step may not have.

**`frontend`** — the whole feature lands at the state boundary: `splitSubtasks` in `lib/tasks.ts`, called once in `trip-state.tsx`, so `useTrip()` hands out top-level tasks with each parent's status **resolved** plus a `subtasks` map. Nineteen of twenty-three derivations were not touched. `taskMatchesFacet`/`taskRowMatchesFacet`/`countTasksByFacet` take an optional child index for `שלי` — the one place the boundary is not the whole answer. `TaskTick` gains the arc; `SubtaskList` is the checklist and its composer, shared by the tasks screen and `TaskSheet`; `RowOpenFoot` gains a leading second verb; `form-actions.css` gains the `scroll-padding-block-end` §13 asked for.

## The two decisions the build made

**The exclusion stayed one boundary under pressure.** Two moments in the build wanted a second filter — the `שלי` facet, and the parent-delete cascade. Neither got one: `שלי` takes the child index as an argument and says so in its own test, and the cascade extends `dropTasksForHostChange` rather than widening `NOTE_HOST_FIELD`. The count of untouched derivations is what the design bought, and paying it back one call site at a time is how it would have been lost.

**`assignedToAll` is not in this change, and that is the owner's call** (_"I think that assign to all could be shipped after"_). The brief's §C therefore stays open in the code even though ADR-0196 §7 closes it in the design: the arc and the count are built and will carry §C unchanged, but nothing renders them for an `everyone` task because `assignedToAll` does not exist yet.

## What was verified

`pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test` (frontend 4003 · backend 685 · shared 248) and `pnpm lint` all clean; the backend integration spec ran against a real local Postgres with the migration applied. The Playwright spec `e2e/subtask-ring.spec.ts` is the half no unit test can reach — that the arc **paints**, that the parent's row is the same height as an equivalent leaf, that a step's tick really is 44px, and that the lead offers no press. It found a real focus bug (the ADR's build log has it) before it found anything else.
