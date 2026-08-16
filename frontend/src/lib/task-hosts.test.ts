// A task's HOST (tasks brief §F, ADR-0191) — the derivations the mark and the section read.
//
// **The clock is pinned** (`frontend/CLAUDE.md`): every fixture carries a date.
import { describe, it, expect } from 'vitest';
import { CHANGE_ACTION, ENTITY_TYPE, TASK_STATUS, type Task } from '@waypoint/shared';
import {
  dropTasksForHostChange,
  openTaskCountsByHost,
  taskCountFor,
  taskHostInput,
  tasksForHost,
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

const onBooking = task('b1', { bookingId: 'bk-1' });
const onOtherBooking = task('b2', { bookingId: 'bk-2' });
const onEvent = task('e1', { eventId: 'ev-1' });
const general = task('g1');

describe('tasksForHost', () => {
  it('returns only that host’s tasks', () => {
    const rows = tasksForHost(
      [onBooking, onOtherBooking, onEvent, general],
      'booking',
      'bk-1',
      CLOCK,
    );
    expect(rows.map((r) => r.id)).toEqual(['b1']);
  });

  // The section is where you see what was DONE about this booking, not only what is left —
  // unlike the screen, which collapses settled behind a chip.
  it('keeps settled tasks, so the section shows what was done too', () => {
    const done = task('b3', { bookingId: 'bk-1', status: TASK_STATUS.DONE });
    const rows = tasksForHost([onBooking, done], 'booking', 'bk-1', CLOCK);
    expect(rows.map((r) => r.id).sort()).toEqual(['b1', 'b3']);
  });

  // A readiness check is not a thing you attach to a booking.
  it('never returns a readiness overlay, whatever FK it carries', () => {
    const overlay = task('auto', { bookingId: 'bk-1', derivedKey: 'lodging' });
    expect(tasksForHost([overlay], 'booking', 'bk-1', CLOCK)).toEqual([]);
  });
});

describe('taskHostInput', () => {
  it('names the FK for the host rather than spelling it at the call site', () => {
    expect(taskHostInput('booking', 'bk-1')).toEqual({ bookingId: 'bk-1' });
    expect(taskHostInput('maybeItem', 'm-1')).toEqual({ maybeItemId: 'm-1' });
  });
});

describe('openTaskCountsByHost — what the MARK counts', () => {
  // **The one place a task's mark parts company with a note's** (ADR-0191 §2): a note has no
  // lifecycle, a task does, and a row still marked after the task closed is a nag.
  it('counts open tasks and not settled ones', () => {
    const counts = openTaskCountsByHost([
      onBooking,
      task('b3', { bookingId: 'bk-1', status: TASK_STATUS.DONE }),
      task('b4', { bookingId: 'bk-1', status: TASK_STATUS.DISMISSED }),
    ]);
    expect(taskCountFor(counts, 'booking', 'bk-1')).toBe(1);
  });

  it('counts nothing for a host with no tasks', () => {
    expect(taskCountFor(openTaskCountsByHost([onBooking]), 'booking', 'bk-9')).toBe(0);
  });

  it('leaves readiness overlays out of the mark', () => {
    const counts = openTaskCountsByHost([task('a', { bookingId: 'bk-1', derivedKey: 'flights' })]);
    expect(taskCountFor(counts, 'booking', 'bk-1')).toBe(0);
  });

  it('keys each host separately', () => {
    const counts = openTaskCountsByHost([onBooking, onOtherBooking, onEvent]);
    expect(taskCountFor(counts, 'booking', 'bk-1')).toBe(1);
    expect(taskCountFor(counts, 'booking', 'bk-2')).toBe(1);
    expect(taskCountFor(counts, 'event', 'ev-1')).toBe(1);
  });
});

describe('dropTasksForHostChange — the cascade', () => {
  // A DB cascade writes no `Change` rows, so the client owes a local derivation off the
  // parent's delete (ADR-0152 §2). This is the generalised applier, not a fifth copy.
  it('drops a deleted host’s tasks', () => {
    const kept = dropTasksForHostChange([onBooking, onOtherBooking, general], {
      entityType: ENTITY_TYPE.BOOKING,
      entityId: 'bk-1',
      action: CHANGE_ACTION.DELETE,
    });
    expect(kept.map((t) => t.id)).toEqual(['b2', 'g1']);
  });

  it('returns the SAME array when nothing was dropped, so no re-render follows', () => {
    const rows = [onBooking, general];
    expect(
      dropTasksForHostChange(rows, {
        entityType: ENTITY_TYPE.BOOKING,
        entityId: 'bk-9',
        action: CHANGE_ACTION.DELETE,
      }),
    ).toBe(rows);
    expect(
      dropTasksForHostChange(rows, {
        entityType: ENTITY_TYPE.BOOKING,
        entityId: 'bk-1',
        action: CHANGE_ACTION.UPDATE,
      }),
    ).toBe(rows);
  });
});
