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
  taskRowMatchesFacet,
  tickedStatus,
  type TaskClock,
  type TaskRow,
} from './tasks';
import type { AutomaticTask } from './automatic-tasks';

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
    const counts = countTasksByFacet(
      [mine, theirs, group, done, dismissed].map((t) => ({ kind: 'task', task: t }) as const),
      'me',
    );
    expect(counts).toEqual({ all: 3, mine: 1, settled: 2 });
  });

  // **A readiness check is a task all the way through** (owner, 2026-08-16, amending
  // ADR-0190 §1): open while still missing, COMPLETED once the data satisfies it or a
  // person waves it off.
  describe('a check on the facet axis', () => {
    const auto = (over: Partial<AutomaticTask> = {}): TaskRow => ({
      kind: 'auto',
      auto: {
        key: 'lodging',
        icon: 'hotel',
        title: 'לינה',
        meta: '',
        done: false,
        dismissed: false,
        action: 'add-lodging',
        ...over,
      } as AutomaticTask,
    });

    it('shows a still-missing check under הכל and not under הושלמו', () => {
      expect(taskRowMatchesFacet(auto(), TASK_FACET.ALL, 'me')).toBe(true);
      expect(taskRowMatchesFacet(auto(), TASK_FACET.SETTLED, 'me')).toBe(false);
    });

    it('moves a SATISFIED check behind הושלמו — done-ness is the derivation’s', () => {
      expect(taskRowMatchesFacet(auto({ done: true }), TASK_FACET.SETTLED, 'me')).toBe(true);
      expect(taskRowMatchesFacet(auto({ done: true }), TASK_FACET.ALL, 'me')).toBe(false);
    });

    it('moves a DISMISSED check behind הושלמו too', () => {
      expect(taskRowMatchesFacet(auto({ dismissed: true }), TASK_FACET.SETTLED, 'me')).toBe(true);
      expect(taskRowMatchesFacet(auto({ dismissed: true }), TASK_FACET.ALL, 'me')).toBe(false);
    });

    // The one chip a check can still fail, and by construction: `שלי` reads an assignee,
    // and an untouched check has no row to carry one. Delegate it and it appears.
    it('reaches שלי only once somebody has been given it', () => {
      expect(taskRowMatchesFacet(auto(), TASK_FACET.MINE, 'me')).toBe(false);
      const delegated = auto({ task: task('t', { assigneeUserId: 'me', derivedKey: 'lodging' }) });
      expect(taskRowMatchesFacet(delegated, TASK_FACET.MINE, 'me')).toBe(true);
    });

    it('counts checks into the chips alongside the tasks people wrote', () => {
      const counts = countTasksByFacet(
        [{ kind: 'task', task: mine } as const, auto(), auto({ key: 'flights', done: true })],
        'me',
      );
      expect(counts).toEqual({ all: 2, mine: 1, settled: 1 });
    });
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

  // With NO pin the zone is derived — the same instant reads as a different wall-clock
  // depending on the segment it falls in (brief §10, still true for every unpinned task).
  it('renders the time in the zone the deadline falls in', () => {
    const due = { dueAt: '2026-08-16T15:00:00.000Z', dueHasTime: true };
    expect(taskDue(task('d', due), clock)?.time).toBe('18:00');
    expect(taskDue(task('d', due), { ...clock, primaryZone: TYO })?.time).toBe('00:00');
  });

  // **A PINNED zone wins over the derivation** (2026-08-17, reversing brief §10 now that the
  // form can choose one). This is the whole point of storing it: without the pin the same
  // task renders at a wall-clock nobody typed the moment the reader's segment differs — and
  // the two assertions below are that difference, held against one instant.
  it('honours a pinned zone over the one the deadline falls in', () => {
    const due = { dueAt: '2026-08-16T15:00:00.000Z', dueHasTime: true };
    // Derived would say 18:00 here…
    expect(taskDue(task('e', due), clock)?.time).toBe('18:00');
    // …and the pin says the hour it was typed at, from wherever it is read.
    const pinned = task('e', { ...due, displayTimezone: TYO });
    expect(taskDue(pinned, clock)?.time).toBe('00:00');
    expect(taskDue(pinned, { ...clock, primaryZone: TYO })?.time).toBe('00:00');
  });

  // The relative DAY follows the pinned zone too, not just the clock face — a deadline
  // pinned to Tokyo can be "tomorrow" while the reader's own day is still today.
  it('reads the day in the pinned zone as well as the time', () => {
    const due = { dueAt: '2026-08-15T20:00:00.000Z', dueHasTime: true };
    const here = taskDue(task('f', due), clock);
    const there = taskDue(task('f', { ...due, displayTimezone: TYO }), clock);
    expect(here?.day).not.toBe(there?.day);
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
      [],
      clock,
    );
    expect(preview.next?.id).toBe('overdue');
    expect(preview).toMatchObject({ open: 3, overdue: 1 });
  });

  it('has no next when nothing open carries a deadline', () => {
    expect(taskPreview([task('u'), task('v')], [], clock).next).toBeUndefined();
  });

  // **The checks count** (owner, 2026-08-16, amending ADR-0190 §1) — a trip nobody has
  // prepared has things to do, and the tile is what says how many.
  it('counts the still-missing checks, and not the satisfied ones', () => {
    const check = (over: Partial<AutomaticTask>): AutomaticTask =>
      ({
        key: 'lodging',
        icon: 'hotel',
        title: '',
        meta: '',
        done: false,
        dismissed: false,
        action: 'add-lodging',
        ...over,
      }) as AutomaticTask;
    const preview = taskPreview(
      [task('a'), task('b')],
      [check({}), check({ key: 'flights' }), check({ key: 'group', done: true })],
      clock,
    );
    expect(preview.open).toBe(4);
  });

  // The line itself is unaffected: a check has no deadline to be "next" at, or to be late.
  it('leaves `next` and `overdue` about the tasks a person wrote', () => {
    const check = { key: 'lodging', done: false, dismissed: false } as AutomaticTask;
    const preview = taskPreview([task('u')], [check], clock);
    expect(preview.next).toBeUndefined();
    expect(preview.overdue).toBe(0);
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
