// The overlay predicate (tasks brief §4, ADR-0190). The whole model is one sentence —
// `status` is the derivation's answer unless the row says `dismissed` — so these tests are
// mostly about proving that a stored row cannot override done-ness in either direction.
import { describe, it, expect } from 'vitest';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { automaticTasks, isLive, isManual, AUTOMATIC_TASK_ACTION } from './automatic-tasks';
import type { ReadinessCheck } from './readiness';

const CTX = {
  emptyDates: ['2026-08-18', '2026-08-20'],
  tripStartDate: '2026-08-15',
  travelerCount: 5,
};

const checks: ReadinessCheck[] = [
  { id: 'flights', done: false, hasOutbound: true, hasReturn: false },
  { id: 'lodging', done: false, count: 3, total: 7 },
  { id: 'itinerary', done: false, count: 2 },
  { id: 'documents', done: false, count: 2, total: 5 },
  { id: 'group', done: true },
];

const overlay = (over: Partial<Task> = {}): Task => ({
  id: 'auto-1',
  tripId: 't1',
  title: 'ignored — a derived row prints the derivation, never its own words',
  dueHasTime: false,
  important: false,
  status: TASK_STATUS.OPEN,
  derivedKey: 'lodging',
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

const byKey = (key: string) => (a: { key: string }) => a.key === key;

describe('automaticTasks', () => {
  it('returns one row per check, always five, whether done or not', () => {
    const rows = automaticTasks(checks, [], CTX);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.key)).toEqual([
      'flights',
      'lodging',
      'itinerary',
      'documents',
      'group',
    ]);
  });

  it('leaves an untouched check with no row at all', () => {
    const rows = automaticTasks(checks, [], CTX);
    expect(rows.every((r) => r.task === undefined)).toBe(true);
    expect(rows.every((r) => r.dismissed === false)).toBe(true);
  });

  it('attaches the overlay row to the check it carries the key for, and only that one', () => {
    const rows = automaticTasks(checks, [overlay()], CTX);
    expect(rows.find(byKey('lodging'))!.task).toBeTruthy();
    expect(rows.filter((r) => r.task !== undefined)).toHaveLength(1);
  });

  it('ignores a task with no derivedKey — a manual task is not an overlay', () => {
    const rows = automaticTasks(checks, [overlay({ derivedKey: undefined })], CTX);
    expect(rows.every((r) => r.task === undefined)).toBe(true);
  });

  // The two halves of the one sentence. A stored row may say "dismissed" and may not say
  // anything at all about done-ness — in EITHER direction.
  it('lets a human dismissal win', () => {
    const rows = automaticTasks(checks, [overlay({ status: TASK_STATUS.DISMISSED })], CTX);
    expect(rows.find(byKey('lodging'))!.dismissed).toBe(true);
  });

  it('keeps done DERIVED when the row claims done on an unsatisfied check', () => {
    const rows = automaticTasks(checks, [overlay({ status: TASK_STATUS.DONE })], CTX);
    // The data still says 3 of 7 nights are covered, so the check is not done — a stored
    // `done` would go stale the moment the hotel was booked, which is why it is never read.
    expect(rows.find(byKey('lodging'))!.done).toBe(false);
    expect(rows.find(byKey('lodging'))!.dismissed).toBe(false);
  });

  it('keeps done DERIVED when the row is open on a satisfied check', () => {
    const rows = automaticTasks(
      checks,
      [overlay({ derivedKey: 'group', status: TASK_STATUS.OPEN })],
      CTX,
    );
    expect(rows.find(byKey('group'))!.done).toBe(true);
  });

  it('names the missing flight leg so a host can seed the right direction', () => {
    expect(automaticTasks(checks, [], CTX).find(byKey('flights'))!.missingLeg).toBe('return');
    const noOutbound = checks.map((c) =>
      c.id === 'flights' ? { ...c, hasOutbound: false, hasReturn: true } : c,
    );
    expect(automaticTasks(noOutbound, [], CTX).find(byKey('flights'))!.missingLeg).toBe('outbound');
  });

  it('carries one action per check', () => {
    const rows = automaticTasks(checks, [], CTX);
    expect(rows.find(byKey('flights'))!.action).toBe(AUTOMATIC_TASK_ACTION.ADD_FLIGHT);
    expect(rows.find(byKey('group'))!.action).toBe(AUTOMATIC_TASK_ACTION.INVITE);
  });

  it('numbers empty days from the trip start, matching the day strip', () => {
    // 2026-08-15 is day 1, so 08-18 is day 4 and 08-20 is day 6.
    expect(automaticTasks(checks, [], CTX).find(byKey('itinerary'))!.meta).toContain('4, 6');
  });
});

describe('isLive — what "still missing" means', () => {
  it('drops a done check and a dismissed one, keeps the rest', () => {
    const rows = automaticTasks(checks, [overlay({ status: TASK_STATUS.DISMISSED })], CTX);
    const live = rows.filter(isLive).map((r) => r.key);
    expect(live).toEqual(['flights', 'itinerary', 'documents']);
  });
});

describe('isManual — what the tile counts and the facets filter', () => {
  it('separates a person’s task from the derivation’s overlay', () => {
    expect(isManual(overlay({ derivedKey: undefined }))).toBe(true);
    expect(isManual(overlay())).toBe(false);
    // Still the derivation's, however much a human has since said about it.
    expect(isManual(overlay({ assigneeUserId: 'u2', important: true }))).toBe(false);
  });
});
