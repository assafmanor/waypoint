// `tasksDueSoon` — what the Home bands carry (ADR-0188 §6, tasks brief §13, window widened
// by the owner 2026-08-16 from "today and overdue" to a week).
//
// **The clock is pinned** (`frontend/CLAUDE.md`): every fixture here carries a date, so a
// test reading the system clock would mean something different every day it ran.
import { describe, it, expect } from 'vitest';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { tasksDueSoon, type TaskClock } from './tasks';

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
const dueToday = task('today', { dueAt: '2026-08-15T15:00:00.000Z', dueHasTime: true });
// Inside the week (now is 2026-08-15) …
const dueLater = task('later', { dueAt: '2026-08-20T09:00:00.000Z' });
// …and beyond it.
const dueFar = task('far', { dueAt: '2026-09-02T09:00:00.000Z' });
const undated = task('undated');

const ids = (rows: Task[]) => rows.map((r) => r.id);

describe('tasksDueSoon', () => {
  // **A week, not a day** (owner, 2026-08-16): a task due Friday is not actionable on
  // Friday, it is actionable now.
  it('carries overdue and anything due within the week, and nothing else', () => {
    expect(ids(tasksDueSoon([overdue, dueToday, dueLater, dueFar, undated], CLOCK))).toEqual([
      'overdue',
      'today',
      'later',
    ]);
  });

  it('stops at the window — a deadline past it waits its turn', () => {
    expect(ids(tasksDueSoon([dueFar], CLOCK))).toEqual([]);
  });

  it('never carries an undated task, however long the window', () => {
    expect(ids(tasksDueSoon([undated], CLOCK))).toEqual([]);
  });

  it('drops settled tasks — done and dismissed alike', () => {
    const rows = tasksDueSoon(
      [
        overdue,
        task('done', { dueAt: '2026-08-14T09:00:00.000Z', status: TASK_STATUS.DONE }),
        task('gone', { dueAt: '2026-08-14T09:00:00.000Z', status: TASK_STATUS.DISMISSED }),
      ],
      CLOCK,
    );
    expect(ids(rows)).toEqual(['overdue']);
  });

  // **The reason the band works at all** (ADR-0188 §6). An automatic task's deadline is the
  // DEPARTURE, so mid-trip every unmet check would sit here permanently overdue, in --miss,
  // for the rest of the trip — flooding a band that exists to say "these things, today".
  it('excludes readiness overlays even when their row is overdue', () => {
    const rows = tasksDueSoon(
      [overdue, task('auto', { dueAt: '2026-08-14T09:00:00.000Z', derivedKey: 'lodging' })],
      CLOCK,
    );
    expect(ids(rows)).toEqual(['overdue']);
  });

  it('returns the screen’s own order, overdue before today', () => {
    expect(ids(tasksDueSoon([dueToday, overdue], CLOCK))).toEqual(['overdue', 'today']);
  });

  it('is empty when nothing is due, so the host can render nothing at all', () => {
    expect(tasksDueSoon([dueFar, undated], CLOCK)).toEqual([]);
  });
});
