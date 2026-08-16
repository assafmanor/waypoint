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
  TASK_HOST_FIELD,
  TASK_STATUS,
  type Task,
  type TaskHostKey,
  type TaskStatus,
} from '@waypoint/shared';
import { TASK_BAND_LOOKAHEAD_DAYS } from '../constants';
import { isAutomaticSettled, isLive, isManual, type AutomaticTask } from './automatic-tasks';
import { dropHostedForHostChange, isHostedBy, type HostChange, type NoteHostKind } from './notes';
import { currentZone, type ZoneCrossing } from './places';
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

/** Where a task sits on the urgency ladder. Ordered by value, so the sort is a subtraction
 *  and the bands cannot be compared in the wrong direction by accident. */
export const TASK_BAND = {
  OVERDUE: 0,
  TODAY: 1,
  LATER: 2,
  UNDATED: 3,
} as const;
export type TaskBand = (typeof TASK_BAND)[keyof typeof TASK_BAND];

/** Everything a due date has to be read against. One object rather than four arguments,
 *  the shape `ZoneEvidence` already uses next door. */
export interface TaskClock {
  nowMs: number;
  crossings: ZoneCrossing[];
  primaryZone: string;
}

/** The zone a deadline means (brief §10) — ADR-0107's resolver with `dueAt` in place of
 *  `now`, so a task due after a zone crossing reads in the zone you will be in when it
 *  falls due rather than the one you are in while looking at it. */
export function dueZone(dueAt: string, clock: TaskClock): string {
  return currentZone(Date.parse(dueAt), clock.crossings, clock.primaryZone);
}

/** Which band a task is in. **Overdue is measured against the instant, "today" against the
 *  calendar day** — and the two use different zones on purpose: whether a deadline has
 *  passed is an absolute fact, while "today" is the reader's day, which is the zone they
 *  are standing in now. A task due at 23:00 in Tokyo while you are still in Tel Aviv is
 *  not yet overdue and is not on your today. */
export function taskBand(task: Task, clock: TaskClock): TaskBand {
  if (!task.dueAt) return TASK_BAND.UNDATED;
  const dueMs = Date.parse(task.dueAt);
  if (dueMs < clock.nowMs) return TASK_BAND.OVERDUE;
  const readerZone = currentZone(clock.nowMs, clock.crossings, clock.primaryZone);
  const today = todayInTz(readerZone, new Date(clock.nowMs));
  return todayInTz(readerZone, new Date(dueMs)) === today ? TASK_BAND.TODAY : TASK_BAND.LATER;
}

export const isSettled = (task: Task): boolean => task.status !== TASK_STATUS.OPEN;

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
export function taskRowMatchesFacet(row: TaskRow, facet: TaskFacet, meId: string): boolean {
  if (row.kind !== 'auto') return taskMatchesFacet(row.task, facet, meId);
  if (facet === TASK_FACET.SETTLED) return isAutomaticSettled(row.auto);
  if (facet === TASK_FACET.MINE) return row.auto.task?.assigneeUserId === meId;
  return isLive(row.auto);
}
/** The manual half of the predicate above. */
export function taskMatchesFacet(task: Task, facet: TaskFacet, meId: string): boolean {
  if (facet === TASK_FACET.SETTLED) return isSettled(task);
  // Settled tasks collapse out of both open facets (brief §13) — a done task IS finished,
  // deliberately the opposite of ADR-0153 §3's "no past-collapse" for notes.
  if (isSettled(task)) return false;
  if (facet === TASK_FACET.MINE) return task.assigneeUserId === meId;
  return true;
}

/** How many rows each chip would show, for the count in its label. Takes the same rows the
 *  list is built from, so a chip cannot promise a number the list does not deliver. */
export function countTasksByFacet(rows: TaskRow[], meId: string): Record<TaskFacet, number> {
  const count = (facet: TaskFacet) =>
    rows.filter((row) => taskRowMatchesFacet(row, facet, meId)).length;
  return {
    [TASK_FACET.ALL]: count(TASK_FACET.ALL),
    [TASK_FACET.MINE]: count(TASK_FACET.MINE),
    [TASK_FACET.SETTLED]: count(TASK_FACET.SETTLED),
  };
}

/** The deadline as the row prints it (ADR-0188 §3): the relative day, plus the time when
 *  the task carries one. `late` drives the hue — `--miss-deep`, because overdue is a status
 *  and not a priority. Returns `undefined` for an undated task, which prints no deadline at
 *  all rather than a placeholder.
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
  if (!task.dueAt) return undefined;
  const zone = dueZone(task.dueAt, clock);
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
export function tasksDueSoon(tasks: Task[], clock: TaskClock): Task[] {
  const readerZone = currentZone(clock.nowMs, clock.crossings, clock.primaryZone);
  const lastDay = addDays(todayInTz(readerZone, new Date(clock.nowMs)), TASK_BAND_LOOKAHEAD_DAYS);
  return sortTasks(
    tasks.filter((task) => {
      if (!isManual(task) || isSettled(task) || !task.dueAt) return false;
      if (taskBand(task, clock) === TASK_BAND.OVERDUE) return true;
      return todayInTz(dueZone(task.dueAt, clock), new Date(task.dueAt)) <= lastDay;
    }),
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
): TaskPreview {
  // **The checks count** (owner, 2026-08-16, amending ADR-0190 §1). That ADR excluded them so
  // a brand-new trip would not announce "5 משימות פתוחות" before anyone had written one — and
  // the owner's reading is that such a trip HAS five things to do, which is what the tile is
  // for. A readiness check is an open task; the tile says how many are open.
  //
  // Only the COUNT changes. `next` names what is due soonest and a check has no `dueAt` to be
  // due at, so it can never be that; `overdue` is a deadline that passed, which a check has
  // none of either. Both stay about the tasks a person wrote, and both are still honest.
  const openManual = tasks.filter((task) => isManual(task) && !isSettled(task));
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

/** The host half of a `createTask` input — `{ bookingId: id }` — looked up rather than
 *  spelled at the call site, which is what keeps a surface from attaching a task to the
 *  wrong field and makes a sixth host free. */
export function taskHostInput(
  kind: NoteHostKind,
  id: string,
): Partial<Record<TaskHostKey, string>> {
  return { [TASK_HOST_FIELD[kind]]: id };
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
export function openTaskCountsByHost(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!isManual(task) || isSettled(task)) continue;
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

/** The host cascade for tasks — the generalised applier, not a fifth copy of it. */
export function dropTasksForHostChange(tasks: Task[], change: HostChange): Task[] {
  return dropHostedForHostChange(tasks, change);
}
