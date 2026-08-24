// Task derivations (tasks brief §13, ADR-0188 §3). Pure and clock-injected: every function
// here takes `now` rather than reading it, so a fixture-driven test means the same thing
// every day it runs (`frontend/CLAUDE.md`'s clock rule, and the reason `readiness.ts` is
// shaped the same way).
//
// **The due ZONE is derived, never stored** (brief §10). A deadline resolves through
// ADR-0107's `currentZone(dueAt, crossings, primaryZone)` — the same resolver a live clock
// uses, with the due instant in place of `now` — so a deadline stays consistent with how
// the calendar day rolls for the traveller who is reading it. Nothing here holds a zone of
// its own, and no surface may reach for `trip.timezone` instead.
import {
  CHANGE_ACTION,
  ENTITY_TYPE,
  EVENT_STATUS,
  TASK_HOST_FIELD,
  TASK_STATUS,
  type Task,
  type TaskHostKey,
  type TaskStatus,
} from '@waypoint/shared';
import { TASK_BAND_LOOKAHEAD_DAYS } from '../constants';
import { isAutomaticSettled, isLive, isManual, type AutomaticTask } from './automatic-tasks';
import { inContext, type HostContext } from './host-context';
import { dropHostedForHostChange, isHostedBy, type HostChange, type NoteHostKind } from './notes';
// Imported for this file's own use AND re-exported below — `sortTasks` and the counts read
// `taskBand`, so a bare `export … from` would leave them unresolved here.
import {
  currentZone,
  dueZone,
  TASK_BAND,
  taskBand,
  type TaskBand,
  type TaskClock,
} from '@waypoint/shared';

export { dueZone, TASK_BAND, taskBand, type TaskBand, type TaskClock };
import { addDays, formatTime, relativeDayLabel, todayInTz } from './time';

/** The facet axis (brief §13). ONE axis, because `ChoiceGrid` is single-select — ownership
 *  and lifecycle share it, and `important` is carried by the sort rather than by a chip so
 *  that "important AND mine" stays askable. */
export const TASK_FACET = {
  ALL: 'all',
  MINE: 'mine',
  SETTLED: 'settled',
} as const;
export type TaskFacet = (typeof TASK_FACET)[keyof typeof TASK_FACET];

// ── THE DEADLINE'S TIME MODEL MOVED TO `@waypoint/shared` (ADR-0197 §5, phase 2) ────────
//
// `TASK_BAND`, `TaskBand`, `TaskClock`, `dueZone` and `taskBand` are now
// `shared/src/task-time.ts`, so the sweep that fires a task reminder reads a deadline the
// same way the row printing it does. Everything else in this file — the facets, the sort,
// the sub-task tree, the counts — stayed, because no server surface asks those questions.
//
// **Re-exported here** (`TaskClock` alone is threaded through 17 files), so consumers keep
// their import. One definition, over there.

/** **Settled is stated, not inferred from "not open"** (owner, 2026-08-19: a peer's fresh
 *  sub-task arrived ticked).
 *
 *  The two forms are identical for a well-formed row — there are three statuses — and they
 *  part company on a row that carries none, which is exactly what a peer's create used to
 *  deliver: `applyControlChangeToList` merges `Change.after` over what it already holds, and
 *  on a create it holds nothing. `!== OPEN` then answered **true** for every one of this
 *  file's twenty-two call sites at once: the step drew struck through with a green ✓, counted
 *  as done in its parent's fraction, and dropped out of `שלי`.
 *
 *  The server now sends the whole row (`tasks.service`'s create), which is the real fix. This
 *  is the direction the client should fail in anyway: a row it cannot read is work still to
 *  do, never work quietly marked finished. */
export const isSettled = (task: Task): boolean =>
  task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.DISMISSED;

// ── SUB-TASKS (ADR-0196) ────────────────────────────────────────────────────────────────
// **The whole feature is one split, paid once.** Everything below this comment exists so
// that the twenty-odd derivations above and after it never have to know children exist.
//
// The alternative — a `!task.parentTaskId` guard at each call site — is `isManual`'s second
// edition, and the app has already shipped that bug: six derivations here carry `isManual`
// by hand, and ADR-0193 §2 was amended because ONE surface forgot it and the Plan hero
// answered "how many are open" with a different number than the Index tile. A boundary makes
// the next derivation right by default instead of wrong by default.

export const isSubtask = (task: Task): boolean => task.parentTaskId != null;

/** A trip's tasks, split into what the surfaces iterate and what a parent opens onto. */
export interface TaskTree {
  /** Top-level tasks ONLY, each parent's `status` already resolved from its steps. This is
   *  what `useTrip().tasks` hands out, so every list derivation is correct unchanged. */
  roots: Task[];
  /** `parentTaskId` → its steps, in creation order. A checklist is authored, not ranked:
   *  `sortTasks`' urgency ladder has nothing to say about a row with no deadline. */
  byParent: Map<string, Task[]>;
}

/** **A parent's status is DERIVED, and the predicate is one the app already ships.** Brief
 *  §4's sentence for a readiness check transfers verbatim: *the derivation answers unless the
 *  row says `dismissed`*.
 *
 *  - `dismissed` is a human decision no derivation can produce ("this whole thing is off"),
 *    so it is stored and it wins.
 *  - Otherwise a parent is `done` exactly when every step is settled, and `open` otherwise.
 *    Nothing is written, so nothing can go stale — which is the reason the backlog line chose
 *    derived over stored in the first place.
 *  - A stored `done` on a row that later gains a step is therefore **ignored rather than
 *    repaired**: no migration, no write, no window where the two disagree.
 *
 *  `settledAt`/`settledBy` come from the last step settled, so "who finished this" still
 *  answers on a parent. */
function resolveParent(parent: Task, steps: Task[]): Task {
  if (steps.length === 0) return parent;
  if (parent.status === TASK_STATUS.DISMISSED) return parent;
  const done = steps.every(isSettled);
  const last = done
    ? steps.reduce((a, b) => ((a.settledAt ?? '') >= (b.settledAt ?? '') ? a : b))
    : undefined;
  return {
    ...parent,
    status: done ? TASK_STATUS.DONE : TASK_STATUS.OPEN,
    settledAt: done ? last?.settledAt : undefined,
    settledBy: done ? last?.settledBy : undefined,
  };
}

/** **The boundary.** Called once where the trip's tasks enter the app (`trip-state`), never
 *  per surface. Order is preserved so nothing downstream sees a list reshuffle. */
export function splitSubtasks(tasks: Task[]): TaskTree {
  const byParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const steps = byParent.get(task.parentTaskId);
    if (steps) steps.push(task);
    else byParent.set(task.parentTaskId, [task]);
  }
  const roots = tasks
    .filter((task) => !task.parentTaskId)
    .map((task) => resolveParent(task, byParent.get(task.id) ?? []));
  return { roots, byParent };
}

/** How many steps a task has, and how many are settled — the row's `2/5` and the arc's
 *  fraction, from one call so the two cannot disagree. `total: 0` means "not a parent",
 *  which is what every surface tests rather than a stored flag. */
export interface SubtaskProgress {
  done: number;
  total: number;
}

export function subtaskProgress(steps: Task[] | undefined): SubtaskProgress {
  const list = steps ?? [];
  return { done: list.filter(isSettled).length, total: list.length };
}

/** **What a parent's tick writes** (ADR-0196 §3, reversed 2026-08-19 on the owner's report
 *  _"you should be able to tick the parent task to mark all as complete"_).
 *
 *  A parent has no completion of its own — its status is derived — so its tick is a verb over
 *  the STEPS: settle everything still open, and once everything is settled, reopen it. Pure
 *  and returned as a plan rather than performed, because the harm the ADR rejected this on is
 *  in the second direction, and a caller that can see the plan can put one undo behind it.
 *
 *  **A `dismissed` step is never touched in either direction.** It is the one human answer no
 *  derivation produces (the predicate `automatic-tasks.ts` ships), so a bulk verb that swept
 *  it up would be erasing a decision rather than recording one. */
export interface SubtaskTickPlan {
  status: TaskStatus;
  steps: Task[];
}

export function planSubtaskTick(steps: Task[]): SubtaskTickPlan {
  const reopening = steps.every(isSettled);
  const status = reopening ? TASK_STATUS.OPEN : TASK_STATUS.DONE;
  const from = reopening ? TASK_STATUS.DONE : TASK_STATUS.OPEN;
  return { status, steps: steps.filter((step) => step.status === from) };
}

/** **The screen's order** (brief §13): `overdue → due today → due later → undated`, with
 *  `important` lifting WITHIN its band and never across it — an important task due next
 *  week must not outrank an overdue one. Inside a band the earlier deadline leads, and
 *  `createdAt` (then `id`) breaks the remaining ties so the list is totally ordered rather
 *  than merely usually-sorted, which is what stops a row shuffling under a thumb.
 *
 *  Settled tasks are NOT filtered here — that is `visibleTasks`' job. Sorting them by the
 *  same ladder is what makes the `הושלמו` facet read in a sane order too. */
export function sortTasks(tasks: Task[], clock: TaskClock): Task[] {
  const band = new Map(tasks.map((task) => [task.id, taskBand(task, clock)]));
  return [...tasks].sort((a, b) => {
    const bandDiff = band.get(a.id)! - band.get(b.id)!;
    if (bandDiff !== 0) return bandDiff;
    if (a.important !== b.important) return a.important ? -1 : 1;
    if (a.dueAt !== b.dueAt) return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

/** One row on the tasks screen — a task somebody wrote, or a readiness check. Both render
 *  as the same noun (brief §2) and they sort into ONE list, so the sort has to speak about
 *  both. */
export type TaskRow = { kind: 'task'; task: Task } | { kind: 'auto'; auto: AutomaticTask };

export const taskRowKey = (row: TaskRow): string =>
  row.kind === 'task' ? row.task.id : `auto:${row.auto.key}`;

/** **Is this task urgent enough to outrank a readiness check?** (owner, 2026-08-16: the
 *  checks go first "but also important above them", after "prioritized or due, overdue tasks
 *  should be on top".) Two ways to earn it, and they are the two the feature already models:
 *  the `important` flag, and a deadline that has passed. */
const outranksChecks = (task: Task, clock: TaskClock): boolean =>
  task.important || taskBand(task, clock) === TASK_BAND.OVERDUE;

/** **The screen's one list** (ADR-0190 §2 as revised by the owner): what is urgent, then the
 *  readiness checks, then everything else in urgency order.
 *
 *  The checks are NOT a band on the urgency ladder, and could not be — they carry no
 *  deadline, so `taskBand` has nothing to say about them. They sit between the two halves of
 *  the manual list instead: above the ordinary remainder because a trip that is not ready is
 *  a real obligation, and below anything overdue or flagged because those are the things a
 *  person has already said are urgent. One list and one card, which is what keeps brief §2's
 *  "one noun" true on screen rather than only in the model. */
export function orderTaskRows(
  manual: Task[],
  automatic: AutomaticTask[],
  clock: TaskClock,
): TaskRow[] {
  const sorted = sortTasks(manual, clock);
  const urgent = sorted.filter((task) => outranksChecks(task, clock));
  const rest = sorted.filter((task) => !outranksChecks(task, clock));
  return [
    ...urgent.map((task): TaskRow => ({ kind: 'task', task })),
    ...automatic.map((auto): TaskRow => ({ kind: 'auto', auto })),
    ...rest.map((task): TaskRow => ({ kind: 'task', task })),
  ];
}

/** Whether a row survives the facet, as a predicate for `revealRows` (ADR-0120) — never a
 *  bare `.filter()`, which is the one-off that made the Map jump for two releases.
 *
 *  **A readiness check is a task all the way through** (owner, 2026-08-16, amending ADR-0190
 *  §1): it counts as open while it is still missing, and it counts as COMPLETED once the
 *  data satisfies it or somebody waves it off. So `הכל` shows the live ones and `הושלמו`
 *  shows the settled ones, exactly as they do for a task a person wrote.
 *
 *  `שלי` is the one chip a check can still fail, and by construction rather than by rule:
 *  it asks `assigneeUserId === meId`, and an untouched check has no row to carry one.
 *  Delegate a check and it appears there like anything else — which is the point of
 *  `derivedKey` being an overlay rather than a second table. */
export function taskRowMatchesFacet(
  row: TaskRow,
  facet: TaskFacet,
  meId: string,
  byParent?: Map<string, Task[]>,
): boolean {
  if (row.kind !== 'auto') return taskMatchesFacet(row.task, facet, meId, byParent);
  if (facet === TASK_FACET.SETTLED) return isAutomaticSettled(row.auto);
  if (facet === TASK_FACET.MINE) return row.auto.task?.assigneeUserId === meId;
  return isLive(row.auto);
}
/** The manual half of the predicate above.
 *
 *  **`byParent` is the ONE place the boundary split is not the whole answer** (ADR-0196's
 *  audit). `שלי` asks "what do I owe", and a parent that is unassigned but whose third step
 *  is Dana's is work Dana owes — filtering on the parent's own `assigneeUserId` alone would
 *  hide it from the one filter whose entire job is to find it. So a parent matches `שלי` when
 *  IT or ANY of its steps is mine.
 *
 *  Optional, and that is deliberate rather than lazy: the two Home bands and the hero call
 *  this with no children in scope, and passing an index they do not have would be ceremony.
 *  Absent means "no steps to consider", which is exactly true there. */
export function taskMatchesFacet(
  task: Task,
  facet: TaskFacet,
  meId: string,
  byParent?: Map<string, Task[]>,
): boolean {
  if (facet === TASK_FACET.SETTLED) return isSettled(task);
  // Settled tasks collapse out of both open facets (brief §13) — a done task IS finished,
  // deliberately the opposite of ADR-0153 §3's "no past-collapse" for notes.
  if (isSettled(task)) return false;
  if (facet === TASK_FACET.MINE) {
    if (task.assigneeUserId === meId) return true;
    return (byParent?.get(task.id) ?? []).some(
      (step) => step.assigneeUserId === meId && !isSettled(step),
    );
  }
  return true;
}

/** How many rows each chip would show, for the count in its label. Takes the same rows the
 *  list is built from, so a chip cannot promise a number the list does not deliver. */
export function countTasksByFacet(
  rows: TaskRow[],
  meId: string,
  byParent?: Map<string, Task[]>,
): Record<TaskFacet, number> {
  const count = (facet: TaskFacet) =>
    rows.filter((row) => taskRowMatchesFacet(row, facet, meId, byParent)).length;
  return {
    [TASK_FACET.ALL]: count(TASK_FACET.ALL),
    [TASK_FACET.MINE]: count(TASK_FACET.MINE),
    [TASK_FACET.SETTLED]: count(TASK_FACET.SETTLED),
  };
}

/** The deadline as the row prints it (ADR-0188 §3): the relative day, plus the time when
 *  the task carries one. `late` drives the hue — `--miss-deep`, because overdue is a status
 *  and not a priority. Returns `undefined` for an undated task, which prints no deadline at
 *  all rather than a placeholder — and for a SETTLED one, for the same reason (owner,
 *  2026-08-24: a completed row on `הושלמו` read `באיחור · לפני 3 ימים 15:00`).
 *
 *  The words are ADR-0171's shipped `עד` and ADR-0085's relative-day phrasing, reused
 *  rather than re-invented; `time` is kept separable because the row isolates the numeric
 *  run (`ltrIsolate`) and Hebrew copy around it must not be dragged LTR (ADR-0118). */
export interface TaskDue {
  day: string;
  time?: string;
  late: boolean;
}

export function taskDue(task: Task, clock: TaskClock): TaskDue | undefined {
  // **A task that is finished owes nothing, so it reports no deadline.** `באיחור` and
  // `עד עוד 8 ימים` are claims about what is still due; on a struck-through row they name an
  // obligation that no longer exists, and the late one spends `--miss` on it. This is
  // ADR-0191 §6's rule ("a done event's task is not due in 3 days") applied to the task's own
  // done-ness rather than its host's.
  //
  // Suppressed HERE and not in the three rows that print it — `IndexTasksView`, `TaskSection`
  // and `TaskBandRow` all format from this one derivation (root rule 8), so a fourth surface
  // cannot bring it back. Ordering is untouched: `sortTasks` and `taskBand` read `dueAt`.
  if (!task.dueAt || isSettled(task)) return undefined;
  const zone = dueZone(task, clock);
  const readerZone = currentZone(clock.nowMs, clock.crossings, clock.primaryZone);
  return {
    day: relativeDayLabel(
      todayInTz(zone, new Date(task.dueAt)),
      todayInTz(readerZone, new Date(clock.nowMs)),
    ),
    time: task.dueHasTime ? formatTime(task.dueAt, zone) : undefined,
    late: Date.parse(task.dueAt) < clock.nowMs,
  };
}

/** **What the Home bands carry** (ADR-0188 §6, brief §13, amended by the owner 2026-08-16):
 *  manual tasks that are overdue or fall due within the next `TASK_BAND_LOOKAHEAD_DAYS`, in
 *  the screen's own urgency order.
 *
 *  **The window is a week, not a day.** "Due today and overdue" is the right rule for a band
 *  you read ON the day and the wrong one for anything that needs preparing — a task due
 *  Friday is not actionable on Friday, it is actionable now. Overdue is always in, whatever
 *  the window.
 *
 *  **Manual only, and that is the whole reason the band works.** An automatic task's deadline
 *  is the DEPARTURE, so mid-trip the departure has passed and every unmet check would sit
 *  here permanently overdue, in `--miss`, for the rest of the trip — flooding a band that
 *  exists to say "these few things, soon". Plan Home shows the checks in its own converged
 *  list instead, which is what ADR-0188 §6 designed.
 *
 *  The band boundary is measured against the reader's calendar day rather than a raw
 *  `now + 7×24h`, so "within a week" does not shift by an hour every hour. */
export function tasksDueSoon(
  tasks: Task[],
  clock: TaskClock,
  settledHosts: Set<string> = new Set(),
): Task[] {
  const readerZone = currentZone(clock.nowMs, clock.crossings, clock.primaryZone);
  const lastDay = addDays(todayInTz(readerZone, new Date(clock.nowMs)), TASK_BAND_LOOKAHEAD_DAYS);
  return sortTasks(
    tasks.filter((task) => {
      if (!isManual(task) || isSettled(task) || !task.dueAt) return false;
      // A done event's task is not "due in 3 days" — the thing it was about is over
      // (ADR-0191 §6). This is the surface the owner reported it from.
      if (isOnSettledHost(task, settledHosts)) return false;
      if (taskBand(task, clock) === TASK_BAND.OVERDUE) return true;
      return todayInTz(dueZone(task, clock), new Date(task.dueAt)) <= lastDay;
    }),
    clock,
  );
}

/** **Everything a person still owes, with no date window at all** (ADR-0193 §1).
 *
 *  `tasksDueSoon` above stays exactly as it is and stays **Trip Home's**. This is Plan
 *  Home's, and the difference is the whole of the reported defect: that predicate needs a
 *  `dueAt` and admits only overdue-or-within-`TASK_BAND_LOOKAHEAD_DAYS`, so an **undated**
 *  task and anything a week out were invisible on the one screen whose countdown routinely
 *  reads in weeks. The seven days were argued for a band you read ON the day; Plan Home is
 *  not that band.
 *
 *  **The clinching argument is internal consistency, not the window's size.** Plan Home's
 *  COMPLETED half (`isManual && isSettled`) has never had a date window — so an undated task
 *  was invisible while open and appeared under `הושלמו` the instant it was ticked, i.e. the
 *  section announced the completion of something it had never once shown. Widening is what
 *  makes the two halves ask the same question; a bigger number would not have.
 *
 *  Same three exclusions as everywhere else: automatic checks are not this list's business
 *  (they arrive as `AutomaticTask`s), a settled task is finished, and a task hanging on a
 *  settled host is not an open obligation (ADR-0191 §6). */
export function openManualTasks(
  tasks: Task[],
  clock: TaskClock,
  settledHosts: Set<string> = new Set(),
): Task[] {
  return sortTasks(
    tasks.filter(
      (task) => isManual(task) && !isSettled(task) && !isOnSettledHost(task, settledHosts),
    ),
    clock,
  );
}

/** The Index tile's preview line (brief §13): **the next thing due**, with an overdue count
 *  when there is one. A raw open-count barely moves and answers nothing. */
export interface TaskPreview {
  next?: Task;
  open: number;
  overdue: number;
}

export function taskPreview(
  tasks: Task[],
  automatic: AutomaticTask[],
  clock: TaskClock,
  settledHosts: Set<string> = new Set(),
): TaskPreview {
  // **The checks count** (owner, 2026-08-16, amending ADR-0190 §1). That ADR excluded them so
  // a brand-new trip would not announce "5 משימות פתוחות" before anyone had written one — and
  // the owner's reading is that such a trip HAS five things to do, which is what the tile is
  // for. A readiness check is an open task; the tile says how many are open.
  //
  // Only the COUNT changes. `next` names what is due soonest and a check has no `dueAt` to be
  // due at, so it can never be that; `overdue` is a deadline that passed, which a check has
  // none of either. Both stay about the tasks a person wrote, and both are still honest.
  // A closed host's tasks leave the count with the band (ADR-0191 §6): the tile says how many
  // things are open, and a task about a finished event is not one of them.
  const openManual = tasks.filter(
    (task) => isManual(task) && !isSettled(task) && !isOnSettledHost(task, settledHosts),
  );
  const dated = sortTasks(
    openManual.filter((task) => task.dueAt),
    clock,
  );
  return {
    next: dated[0],
    open: openManual.length + automatic.filter(isLive).length,
    overdue: openManual.filter((task) => taskBand(task, clock) === TASK_BAND.OVERDUE).length,
  };
}

/** The status a tick moves a task to — open ⇄ done. `dismissed` is not on this path: it is
 *  a rare escape that belongs on the `⋯` with the other low-frequency verbs (ADR-0188 §1),
 *  which is also why the control is one verb and not `SettleControl`'s symmetric pair. */
export const tickedStatus = (task: Task): TaskStatus =>
  task.status === TASK_STATUS.DONE ? TASK_STATUS.OPEN : TASK_STATUS.DONE;

// ── A task's HOST (tasks brief §5, phase 4) ────────────────────────────────────────────
// The five FKs the entity has carried since phase 1 and nothing read until now. Every helper
// here is the note equivalent reused rather than re-implemented: `TASK_HOST_FIELD` is an
// alias of `NOTE_HOST_FIELD`, `isHostedBy` was widened to any row carrying those five, and
// the cascade is `dropHostedForHostChange`. What is task-specific is only what the SECTION
// and the MARK need to say, which is below.

/** This host's tasks, in the screen's own urgency order — so a booking's list and the tasks
 *  screen cannot disagree about what leads. Settled ones are included: the section is where
 *  you see what was done about this booking, and the row draws them struck. */
export function tasksForHost(tasks: Task[], kind: NoteHostKind, id: string, clock: TaskClock) {
  return sortTasks(
    tasks.filter((task) => isManual(task) && isHostedBy(task, kind, id)),
    clock,
  );
}

/** The same list for a whole host CONTEXT rather than one host — the shape `notesForContext`
 *  already has, over the same generic `inContext`.
 *
 *  **A booked event is why this exists** (ADR-0160 §U8). A task about a flight is written on
 *  the BOOKING, and a booked event is materialized server-side with no client id at save time
 *  (ADR-0172 §7) — so a surface that resolves one host reads an empty list where the app holds
 *  a task. The lifted hero already resolves ONE context and reads notes and documents from it;
 *  tasks are the third content type through it, not a third function that happens to agree. */
export function tasksForContext(tasks: Task[], context: HostContext, clock: TaskClock): Task[] {
  return sortTasks(
    tasks.filter((task) => isManual(task) && inContext(context, task, isHostedBy)),
    clock,
  );
}

/** The host half of a `createTask` input — `{ bookingId: id }` — looked up rather than
 *  spelled at the call site, which is what keeps a surface from attaching a task to the
 *  wrong field and makes a sixth host free. */
export function taskHostInput(
  kind: NoteHostKind,
  id: string,
): Partial<Record<TaskHostKey, string>> {
  return { [TASK_HOST_FIELD[kind]]: id };
}

/** **The hosts that are CLOSED, keyed the way every host derivation here is keyed**
 *  (ADR-0191 §6, owner 2026-08-16: _"events marked as done/skipped shouldnt show tasks"_).
 *
 *  A settled host has no future, so its open tasks are not open obligations: they stop
 *  counting on the mark, drop out of both Home bands and leave the Index tile, and read
 *  struck in the host's own section. **Nothing is written** — this is a reading of the host,
 *  so un-skipping an event brings its tasks back exactly as they were.
 *
 *  Only events can be settled today, and the set is the shape rather than the answer: a
 *  second settleable host is one more loop here and no change at any call site. */
export function settledHostKeys(events: { id: string; status?: string }[]): Set<string> {
  const keys = new Set<string>();
  for (const event of events) {
    if (event.status === EVENT_STATUS.DONE || event.status === EVENT_STATUS.SKIPPED) {
      keys.add(`event:${event.id}`);
    }
  }
  return keys;
}

/** Whether this task hangs on a host that is closed. Empty set = nothing is closed, which is
 *  the common case and costs one `size` check. */
export function isOnSettledHost(task: Task, settledHosts: Set<string>): boolean {
  if (settledHosts.size === 0) return false;
  for (const [kind, field] of Object.entries(TASK_HOST_FIELD) as [NoteHostKind, TaskHostKey][]) {
    const id = task[field];
    if (id) return settledHosts.has(`${kind}:${id}`);
  }
  return false;
}

/** **How many OPEN tasks each host carries** — the mark's count (ADR-0191 §2).
 *
 *  Open only, and that is the one place a task's mark parts company with a note's. A note
 *  and a document have no lifecycle, so every one of them counts forever; a task does, and a
 *  row still marked after the task closed is a nag with nothing behind it. The trace is not
 *  lost — it is on the task, which stays under `הושלמו`.
 *
 *  Built once per task-list change rather than filtered per row: a day of twelve events asks
 *  this twelve times. */
export function openTaskCountsByHost(
  tasks: Task[],
  settledHosts: Set<string> = new Set(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!isManual(task) || isSettled(task)) continue;
    // A closed host's obligations stop being open (ADR-0191 §6) — so its row loses the mark
    // rather than carrying a count nobody can act on.
    if (isOnSettledHost(task, settledHosts)) continue;
    for (const [kind, field] of Object.entries(TASK_HOST_FIELD) as [NoteHostKind, TaskHostKey][]) {
      const id = task[field];
      if (!id) continue;
      counts.set(`${kind}:${id}`, (counts.get(`${kind}:${id}`) ?? 0) + 1);
      break;
    }
  }
  return counts;
}

/** This host's open-task count, or 0. The key shape is this file's business. */
export const taskCountFor = (counts: Map<string, number>, kind: NoteHostKind, id: string): number =>
  counts.get(`${kind}:${id}`) ?? 0;

/** The host cascade for tasks — the generalised applier, not a fifth copy of it.
 *
 *  **Plus the one case a host cascade cannot express: a deleted PARENT** (ADR-0196). The
 *  shared applier guards on `change.entityType in NOTE_HOST_FIELD`, and `ENTITY_TYPE.TASK` is
 *  not in that map — nor should it be, since widening it would make a NOTE droppable by a
 *  task delete to save one branch here. The DB cascade removes the steps server-side and
 *  writes no `Change` rows for them (ADR-0152 §2), so without this a deleted parent's steps
 *  sit orphaned in memory and in Dexie until the next cold sync.
 *
 *  This wrapper already exists and already IS the task-shaped call site, so the branch lands
 *  here rather than in a sixth applier. */
export function dropTasksForHostChange(tasks: Task[], change: HostChange): Task[] {
  const kept = dropHostedForHostChange(tasks, change);
  if (change.action !== CHANGE_ACTION.DELETE || change.entityType !== ENTITY_TYPE.TASK) {
    return kept;
  }
  const withoutSteps = kept.filter((task) => task.parentTaskId !== change.entityId);
  return withoutSteps.length === kept.length ? kept : withoutSteps;
}
