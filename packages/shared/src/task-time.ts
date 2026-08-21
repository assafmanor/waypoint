// What a task deadline MEANS in time (ADR-0194, ADR-0197 §5, notifications phase 2).
//
// Moved out of `frontend/src/lib/tasks.ts` for the reason `zones.ts` next door states: the
// sweep that decides when to fire a task reminder must read a deadline the same way the row
// printing it does. Everything else in `lib/tasks.ts` — the facets, the sort, the sub-task
// tree, the counts — stays on the frontend, because no server surface asks those questions.
//
// Clock-injected, like everything in `zones.ts`: the caller supplies `nowMs`.
import type { Task } from './entities';
import { currentZone, todayInTz, type ZoneCrossing } from './zones';

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

/** **The zone a deadline means** — the PINNED one when there is one, else ADR-0107's
 *  resolver with `dueAt` in place of `now` (brief §10, amended 2026-08-17).
 *
 *  Deriving it was right while nobody could choose it: a deadline read in the zone you will
 *  be standing in when it falls due, which is what a traveller means by "Thursday 18:00".
 *  Once the form can PIN a zone that stops being true — type 09:00 with Tokyo picked and the
 *  resolver renders 03:00 somewhere else, a wall-clock nobody typed. So a pin wins, and its
 *  absence still derives, which is every task written before this.
 *
 *  **This function is the whole audit.** Every surface that asks what zone a deadline means
 *  comes through here — `taskDue` (what a row prints), `tasksDueSoon` (the band's window),
 *  and from phase 4 the sweep that fires the reminder — so pinning is honoured everywhere by
 *  changing one derivation rather than each caller. Counted before the change, not assumed. */
export function dueZone(task: Pick<Task, 'dueAt' | 'displayTimezone'>, clock: TaskClock): string {
  if (task.displayTimezone) return task.displayTimezone;
  return currentZone(Date.parse(task.dueAt!), clock.crossings, clock.primaryZone);
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
