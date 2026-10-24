// `openManualTasks` — what Plan Home reads (ADR-0193 §1).
//
// `planRunUp` used to live here too, banding the lifted hero's run-up against the departure.
// It is DELETED (owner, 2026-08-16): the lift shows one list in the tasks screen's own order,
// so the derivation it needed is `orderTaskRows`, which already existed.
//
// Its own file rather than more of `tasks-due-soon.test.ts`, because the whole point of
// these two is that they are **not** that predicate: `tasksDueSoon` is Trip Home's window
// and stays exactly as it is. Putting the two in one file is how somebody later "unifies"
// them and quietly re-breaks the reported defect.
//
// **The clock is pinned** (`frontend/CLAUDE.md`): every fixture carries a date, so a test
// reading the system clock would mean something different every day it ran.
import { describe, it, expect } from 'vitest';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { openManualTasks, tasksDueSoon, type TaskClock } from './tasks';

// 2026-08-15 12:00 Jerusalem.
const CLOCK: TaskClock = {
  nowMs: Date.parse('2026-08-15T09:00:00.000Z'),
  crossings: [],
  primaryZone: 'Asia/Jerusalem',
};

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  tripId: 't1',
  title: id,
  dueHasTime: false,
  important: false,
  status: TASK_STATUS.OPEN,
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

const overdue = task('overdue', { dueAt: '2026-08-14T09:00:00.000Z' });
const dueThisWeek = task('this-week', { dueAt: '2026-08-18T09:00:00.000Z' });
const dueLater = task('later', { dueAt: '2026-08-24T09:00:00.000Z' });
const dueFar = task('far', { dueAt: '2026-08-28T09:00:00.000Z' });
const undated = task('undated');
const ALL = [overdue, dueThisWeek, dueLater, dueFar, undated];

const ids = (rows: Task[]) => rows.map((r) => r.id);

describe('openManualTasks — no date window at all', () => {
  // THE DEFECT, as a comparison rather than an assertion about one function. These two
  // predicates disagree on exactly the two classes the owner reported missing, and that
  // disagreement is the whole change.
  it('carries what tasksDueSoon drops: undated, and anything past the week', () => {
    expect(ids(tasksDueSoon(ALL, CLOCK))).toEqual(['overdue', 'this-week']);
    expect(ids(openManualTasks(ALL, CLOCK))).toEqual([
      'overdue',
      'this-week',
      'later',
      'far',
      'undated',
    ]);
  });

  it('leaves out settled tasks, so the open list stays open', () => {
    const done = task('done', { status: TASK_STATUS.DONE });
    expect(ids(openManualTasks([...ALL, done], CLOCK))).not.toContain('done');
  });

  // A task about a finished event is not an open obligation (ADR-0191 §6) — nothing is
  // written, so un-skipping the event brings it back.
  it('drops a task hanging on a settled host', () => {
    const hosted = task('hosted', { eventId: 'e1' });
    const settled = new Set(['event:e1']);
    expect(ids(openManualTasks([...ALL, hosted], CLOCK, settled))).not.toContain('hosted');
  });

  // A readiness check is an `AutomaticTask`, not this list's business — it arrives through
  // `automaticTasks` and is interleaved by `orderTaskRows`.
  it('is manual only', () => {
    const check = task('check', { derivedKey: 'flights' });
    expect(ids(openManualTasks([...ALL, check], CLOCK))).not.toContain('check');
  });

  it('returns the screen’s own urgency order', () => {
    const importantUndated = task('imp', { important: true });
    // `important` lifts WITHIN its band, so an undated flagged task leads the undated group
    // rather than the whole list — the ladder is unchanged, only the membership is.
    expect(ids(openManualTasks([undated, importantUndated], CLOCK))).toEqual(['imp', 'undated']);
  });
});
