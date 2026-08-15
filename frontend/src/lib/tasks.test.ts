import { describe, expect, it } from 'vitest';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import {
  countTasksByFacet,
  sortTasks,
  TASK_BAND,
  TASK_FACET,
  taskBand,
  taskDue,
  taskMatchesFacet,
  taskPreview,
  tickedStatus,
  type TaskClock,
} from './tasks';

// Fixtures carry fixed dates, so the clock is an argument rather than the system's
// (`frontend/CLAUDE.md`). Everything here is pure, so there is nothing to reset.
const JLM = 'Asia/Jerusalem';
const TYO = 'Asia/Tokyo';
// 2026-08-15 10:00 in Jerusalem = 16:00 in Tokyo.
const NOW = Date.parse('2026-08-15T07:00:00.000Z');
const clock: TaskClock = { nowMs: NOW, crossings: [], primaryZone: JLM };

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

describe('taskBand', () => {
  it('puts an undated task last and a passed deadline first', () => {
    expect(taskBand(task('u'), clock)).toBe(TASK_BAND.UNDATED);
    expect(taskBand(task('o', { dueAt: '2026-08-14T07:00:00.000Z' }), clock)).toBe(
      TASK_BAND.OVERDUE,
    );
  });

  it('separates today from later by the READER’s calendar day', () => {
    // 21:00 Jerusalem, same day as `now`.
    expect(taskBand(task('t', { dueAt: '2026-08-15T18:00:00.000Z' }), clock)).toBe(TASK_BAND.TODAY);
    expect(taskBand(task('l', { dueAt: '2026-08-17T09:00:00.000Z' }), clock)).toBe(TASK_BAND.LATER);
  });

  // The two halves of the band deliberately use different zones: whether a deadline has
  // passed is absolute, while "today" is the day the reader is standing in.
  it('does not call a deadline overdue just because it is tomorrow where it falls due', () => {
    const tokyo: TaskClock = { ...clock, primaryZone: TYO };
    // 2026-08-16 00:30 Tokyo is 2026-08-15 18:30 Jerusalem — still in the future either way,
    // but a different calendar day depending on whose day you ask about.
    const soon = task('s', { dueAt: '2026-08-15T15:30:00.000Z' });
    expect(taskBand(soon, clock)).toBe(TASK_BAND.TODAY);
    expect(taskBand(soon, tokyo)).toBe(TASK_BAND.LATER);
  });
});

describe('sortTasks', () => {
  it('orders overdue → today → later → undated', () => {
    const rows = [
      task('undated'),
      task('later', { dueAt: '2026-08-20T09:00:00.000Z' }),
      task('overdue', { dueAt: '2026-08-10T09:00:00.000Z' }),
      task('today', { dueAt: '2026-08-15T18:00:00.000Z' }),
    ];
    expect(sortTasks(rows, clock).map((x) => x.id)).toEqual([
      'overdue',
      'today',
      'later',
      'undated',
    ]);
  });

  // The rule the whole ladder exists for: an important task due next week must NOT outrank
  // an overdue one (brief §13).
  it('lifts important WITHIN a band and never across one', () => {
    const rows = [
      task('plain-overdue', { dueAt: '2026-08-10T09:00:00.000Z' }),
      task('important-later', { dueAt: '2026-08-25T09:00:00.000Z', important: true }),
      task('important-overdue', { dueAt: '2026-08-12T09:00:00.000Z', important: true }),
    ];
    expect(sortTasks(rows, clock).map((x) => x.id)).toEqual([
      'important-overdue',
      'plain-overdue',
      'important-later',
    ]);
  });

  it('is a total order — equal tasks fall back to createdAt then id', () => {
    const rows = [
      task('b', { createdAt: '2026-08-02T00:00:00.000Z' }),
      task('a', { createdAt: '2026-08-02T00:00:00.000Z' }),
      task('c', { createdAt: '2026-08-01T00:00:00.000Z' }),
    ];
    expect(sortTasks(rows, clock).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the list it was given', () => {
    const rows = [task('z', { dueAt: '2026-08-25T09:00:00.000Z' }), task('a')];
    sortTasks(rows, clock);
    expect(rows.map((x) => x.id)).toEqual(['z', 'a']);
  });
});

describe('taskMatchesFacet', () => {
  const mine = task('mine', { assigneeUserId: 'me' });
  const theirs = task('theirs', { assigneeUserId: 'other' });
  const group = task('group');
  const done = task('done', { status: TASK_STATUS.DONE });
  const dismissed = task('dismissed', { status: TASK_STATUS.DISMISSED });

  it('collapses settled tasks out of both open facets', () => {
    expect(taskMatchesFacet(done, TASK_FACET.ALL, 'me')).toBe(false);
    expect(taskMatchesFacet(dismissed, TASK_FACET.ALL, 'me')).toBe(false);
    expect(taskMatchesFacet(group, TASK_FACET.ALL, 'me')).toBe(true);
  });

  it('reveals both settled kinds behind the settled facet', () => {
    expect(taskMatchesFacet(done, TASK_FACET.SETTLED, 'me')).toBe(true);
    expect(taskMatchesFacet(dismissed, TASK_FACET.SETTLED, 'me')).toBe(true);
    expect(taskMatchesFacet(group, TASK_FACET.SETTLED, 'me')).toBe(false);
  });

  // Unassigned is "the group's", not "mine" — the three assignment states of brief §6.
  it('reads "mine" as delegated to me, never as unassigned', () => {
    expect(taskMatchesFacet(mine, TASK_FACET.MINE, 'me')).toBe(true);
    expect(taskMatchesFacet(theirs, TASK_FACET.MINE, 'me')).toBe(false);
    expect(taskMatchesFacet(group, TASK_FACET.MINE, 'me')).toBe(false);
  });

  it('counts each chip', () => {
    const counts = countTasksByFacet([mine, theirs, group, done, dismissed], 'me');
    expect(counts).toEqual({ all: 3, mine: 1, settled: 2 });
  });
});

describe('taskDue', () => {
  it('says nothing at all for an undated task', () => {
    expect(taskDue(task('u'), clock)).toBeUndefined();
  });

  it('prints the relative day, and the time only when the task carries one', () => {
    expect(taskDue(task('a', { dueAt: '2026-08-15T18:00:00.000Z' }), clock)).toMatchObject({
      day: 'היום',
      time: undefined,
      late: false,
    });
    expect(
      taskDue(task('b', { dueAt: '2026-08-16T15:00:00.000Z', dueHasTime: true }), clock),
    ).toMatchObject({ day: 'מחר', time: '18:00', late: false });
  });

  it('marks a passed deadline late', () => {
    expect(taskDue(task('c', { dueAt: '2026-08-14T09:00:00.000Z' }), clock)?.late).toBe(true);
  });

  // The zone is derived, never stored (brief §10) — the same instant reads as a different
  // wall-clock depending on the segment it falls in.
  it('renders the time in the zone the deadline falls in', () => {
    const due = { dueAt: '2026-08-16T15:00:00.000Z', dueHasTime: true };
    expect(taskDue(task('d', due), clock)?.time).toBe('18:00');
    expect(taskDue(task('d', due), { ...clock, primaryZone: TYO })?.time).toBe('00:00');
  });
});

describe('taskPreview', () => {
  it('previews the next thing due, counting the overdue ones', () => {
    const preview = taskPreview(
      [
        task('done', { status: TASK_STATUS.DONE, dueAt: '2026-08-10T09:00:00.000Z' }),
        task('later', { dueAt: '2026-08-25T09:00:00.000Z' }),
        task('overdue', { dueAt: '2026-08-10T09:00:00.000Z' }),
        task('undated'),
      ],
      clock,
    );
    expect(preview.next?.id).toBe('overdue');
    expect(preview).toMatchObject({ open: 3, overdue: 1 });
  });

  it('has no next when nothing open carries a deadline', () => {
    expect(taskPreview([task('u'), task('v')], clock).next).toBeUndefined();
  });
});

describe('tickedStatus', () => {
  it('toggles open ⇄ done and never reaches dismissed', () => {
    expect(tickedStatus(task('a'))).toBe(TASK_STATUS.DONE);
    expect(tickedStatus(task('b', { status: TASK_STATUS.DONE }))).toBe(TASK_STATUS.OPEN);
    // Dismissing is a `⋯` verb, so a tick on a dismissed task reopens it rather than
    // toggling within the settled pair.
    expect(tickedStatus(task('c', { status: TASK_STATUS.DISMISSED }))).toBe(TASK_STATUS.DONE);
  });
});
