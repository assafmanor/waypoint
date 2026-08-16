// **A task whose HOST is settled** (ADR-0191 §6, owner 2026-08-16: _"events marked as
// done/skipped shouldnt show tasks"_).
//
// The rule is *stop counting, stay readable*: the mark drops it, both Home bands drop it and
// the Index tile stops counting it — and nothing is written, so un-skipping the event brings
// it back exactly as it was. That last part is what these tests are really for: the derivation
// is the whole feature, so a fixture that flips one event's status must flip every answer.
//
// **The clock is pinned** (`frontend/CLAUDE.md`): every fixture carries a date.
import { describe, it, expect } from 'vitest';
import { EVENT_STATUS, TASK_STATUS, type Task } from '@waypoint/shared';
import {
  isOnSettledHost,
  openTaskCountsByHost,
  settledHostKeys,
  taskCountFor,
  taskPreview,
  tasksDueSoon,
  type TaskClock,
} from './tasks';

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

const onDone = task('a', { eventId: 'ev-done', dueAt: '2026-08-17T12:00:00.000Z' });
const onSkipped = task('b', { eventId: 'ev-skipped', dueAt: '2026-08-17T12:00:00.000Z' });
const onPlanned = task('c', { eventId: 'ev-planned', dueAt: '2026-08-17T12:00:00.000Z' });
const general = task('d', { dueAt: '2026-08-17T12:00:00.000Z' });

const EVENTS = [
  { id: 'ev-done', status: EVENT_STATUS.DONE },
  { id: 'ev-skipped', status: EVENT_STATUS.SKIPPED },
  { id: 'ev-planned', status: EVENT_STATUS.PLANNED },
];
const SETTLED = settledHostKeys(EVENTS);
const ALL = [onDone, onSkipped, onPlanned, general];

describe('settledHostKeys', () => {
  // Skipped counts as settled: both mean the thing is over, and a task about a skipped
  // event is no more actionable than one about a finished one.
  it('keys done AND skipped events, and nothing else', () => {
    expect([...SETTLED].sort()).toEqual(['event:ev-done', 'event:ev-skipped']);
  });

  it('is empty when nothing is settled, which is the common case', () => {
    expect(settledHostKeys([{ id: 'x', status: EVENT_STATUS.PLANNED }]).size).toBe(0);
  });
});

describe('isOnSettledHost', () => {
  it('answers for the host the task actually hangs on', () => {
    expect(isOnSettledHost(onDone, SETTLED)).toBe(true);
    expect(isOnSettledHost(onSkipped, SETTLED)).toBe(true);
    expect(isOnSettledHost(onPlanned, SETTLED)).toBe(false);
  });

  it('says no for a general task, which has no host to be settled', () => {
    expect(isOnSettledHost(general, SETTLED)).toBe(false);
  });

  it('short-circuits on an empty set rather than walking the five FKs', () => {
    expect(isOnSettledHost(onDone, new Set())).toBe(false);
  });
});

describe('what a settled host takes away', () => {
  it('drops the MARK — the row loses its count', () => {
    expect(taskCountFor(openTaskCountsByHost(ALL, SETTLED), 'event', 'ev-done')).toBe(0);
    expect(taskCountFor(openTaskCountsByHost(ALL, SETTLED), 'event', 'ev-planned')).toBe(1);
  });

  // The surface the owner reported it from: a done event's task was sitting in
  // `משימות קרובות` on the landing screen.
  it('drops it from the Home bands', () => {
    expect(tasksDueSoon(ALL, CLOCK, SETTLED).map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('drops it from the Index tile’s open count', () => {
    expect(taskPreview(ALL, [], CLOCK, SETTLED).open).toBe(2);
  });
});

// **Nothing is written**, so the whole thing is reversible by changing the host back — which
// is the argument for deriving it rather than settling the tasks themselves.
describe('un-settling the host brings its tasks back', () => {
  const REOPENED = settledHostKeys([{ id: 'ev-done', status: EVENT_STATUS.PLANNED }]);

  it('restores the mark, the band and the count with no write to the task', () => {
    expect(taskCountFor(openTaskCountsByHost(ALL, REOPENED), 'event', 'ev-done')).toBe(1);
    expect(tasksDueSoon(ALL, CLOCK, REOPENED).map((x) => x.id)).toContain('a');
    expect(onDone.status).toBe(TASK_STATUS.OPEN);
  });
});

// The default argument matters: every caller that has not been taught about settled hosts
// must behave exactly as it did before.
describe('with no settled hosts the answers are unchanged', () => {
  it('counts, bands and previews everything open', () => {
    expect(taskCountFor(openTaskCountsByHost(ALL), 'event', 'ev-done')).toBe(1);
    expect(tasksDueSoon(ALL, CLOCK).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(taskPreview(ALL, [], CLOCK).open).toBe(4);
  });
});
