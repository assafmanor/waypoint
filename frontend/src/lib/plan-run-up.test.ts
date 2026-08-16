// `openManualTasks` and `planRunUp` — what Plan Home reads, and what its lifted hero opens
// onto (ADR-0193 §1/§4).
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
import { openManualTasks, planRunUp, tasksDueSoon, type TaskClock } from './tasks';

// 2026-08-15 12:00 Jerusalem. Departure is 2026-08-25, ten days out.
const CLOCK: TaskClock = {
  nowMs: Date.parse('2026-08-15T09:00:00.000Z'),
  crossings: [],
  primaryZone: 'Asia/Jerusalem',
};
const DEPARTURE = Date.parse('2026-08-25T20:59:59.000Z');

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
const beforeDeparture = task('before', { dueAt: '2026-08-24T09:00:00.000Z' });
const duringTrip = task('during', { dueAt: '2026-08-28T09:00:00.000Z' });
const undated = task('undated');
const ALL = [overdue, dueThisWeek, beforeDeparture, duringTrip, undated];

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
      'before',
      'during',
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

describe('planRunUp — banded against the departure', () => {
  const open = openManualTasks(ALL, CLOCK);

  // THE POINT OF THE WHOLE SECTION. The split is the departure, not a week — which is what
  // makes these bands a statement about the countdown pinned directly above them.
  it('splits the dated remainder at the departure', () => {
    const bands = planRunUp(open, CLOCK, DEPARTURE);
    expect(ids(bands.beforeDeparture)).toEqual(['this-week', 'before']);
    expect(ids(bands.duringTrip)).toEqual(['during']);
    expect(ids(bands.undated)).toEqual(['undated']);
  });

  // `urgent` is `outranksChecks` exactly — the two ways the feature already models urgency,
  // reused rather than restated, so the lift and the screen cannot disagree about what leads.
  it('lifts overdue and important out, whatever their deadline says', () => {
    const importantDuring = task('imp-during', {
      dueAt: '2026-08-28T09:00:00.000Z',
      important: true,
    });
    const bands = planRunUp(openManualTasks([...ALL, importantDuring], CLOCK), CLOCK, DEPARTURE);
    // Overdue leads INSIDE the urgent band, and that is `sortTasks`' rule rather than an
    // accident of this one: `important` lifts only within a band and never across one, so a
    // flagged task due after the trip starts must not outrank something already late.
    expect(ids(bands.urgent)).toEqual(['overdue', 'imp-during']);
    // …and it is not counted twice: an urgent task leaves the band it would otherwise be in.
    expect(ids(bands.duringTrip)).toEqual(['during']);
  });

  // The boundary, stated as a test because "on the departure day" is exactly the case a
  // reader will assume goes the other way.
  it('counts a task due ON the departure day as before it', () => {
    const onTheDay = task('on-the-day', { dueAt: '2026-08-25T12:00:00.000Z' });
    const bands = planRunUp(openManualTasks([onTheDay], CLOCK), CLOCK, DEPARTURE);
    expect(ids(bands.beforeDeparture)).toEqual(['on-the-day']);
    expect(bands.duringTrip).toEqual([]);
  });

  it('is empty in every band when nothing is open, so the hero has nothing to lift', () => {
    const bands = planRunUp([], CLOCK, DEPARTURE);
    expect([
      ...bands.urgent,
      ...bands.beforeDeparture,
      ...bands.duringTrip,
      ...bands.undated,
    ]).toEqual([]);
  });
});
