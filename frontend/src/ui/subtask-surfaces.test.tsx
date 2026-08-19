// @vitest-environment jsdom
// **What a task holding a checklist says on the surfaces that render it** (ADR-0196 §3/§6,
// §3 reversed 2026-08-19).
//
// The decision under test is that a parent's lead is the ORDINARY tick wearing its progress —
// the arc reads the fraction and the press answers for every step at once — and that the same
// two elements, the arc and the count, carry it on the screen, on a Home band and in a host's
// section alike. That is the claim the small surfaces make expensive: there is no room for the
// steps themselves, so if the two elements do not say it, nothing does.
//
// The first version of this file asserted the opposite (`queryByRole('button')` null), which
// is why the reversal is written here rather than only in the ADR: the spec was the decision's
// only enforcement, so it is the spec that has to change with it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TASK_STATUS, type Task, type User } from '@waypoint/shared';
import { TaskTick } from './TaskTick';
import { TaskBandRow } from './TaskBandRow';
import { t } from '../i18n/he';

vi.mock('../lib/one-shot', () => ({
  BEAT: { TICK: 'is-ticking' },
  playBeat: () => 0,
}));

afterEach(cleanup);

const users: User[] = [];
const CLOCK = {
  nowMs: Date.parse('2026-08-18T09:00:00.000Z'),
  crossings: [],
  primaryZone: 'Asia/Jerusalem',
};

const task = (over: Partial<Task> & { id: string }): Task =>
  ({
    tripId: 'trip',
    title: over.id,
    dueHasTime: false,
    important: false,
    status: TASK_STATUS.OPEN,
    createdBy: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  }) as Task;

const parentTick = (over: Partial<{ done: number; total: number }> = {}, onTick = vi.fn()) => {
  const progress = { done: 2, total: 5, ...over };
  render(
    <TaskTick
      done={progress.done === progress.total}
      title="יציאה לשדה"
      onTick={onTick}
      progress={progress}
    />,
  );
  return screen.getByRole('button');
};

describe("a parent's leading element ticks its whole checklist", () => {
  it('is a control, and its name says what the press does and where it stands', () => {
    const tick = parentTick();
    expect(tick.getAttribute('aria-label')).toBe(t.tasks.subtasks.tickAll('יציאה לשדה', 2, 5));
    expect(tick.getAttribute('aria-pressed')).toBe('false');
  });

  // The whole point of the reversal: the press exists and it reaches the caller, which is the
  // one place (`taskVerbs.tickTask`) that knows a parent writes its STEPS rather than itself.
  it('presses through to the caller', () => {
    const onTick = vi.fn();
    fireEvent.click(parentTick({}, onTick));
    expect(onTick).toHaveBeenCalled();
  });

  it('keeps the tick’s own box, so the row does not change shape', () => {
    // The same class the control wears — the arc is a layer on it, not a second control.
    expect(parentTick().className).toContain('tsk-tick');
  });

  it('carries the fraction the arc is drawn from', () => {
    expect(parentTick({ done: 1, total: 4 }).getAttribute('style')).toContain('0.25');
  });

  it('reads as done when every step is, and offers the way back', () => {
    const tick = parentTick({ done: 3, total: 3 });
    expect(tick.getAttribute('data-done')).toBe('true');
    expect(tick.getAttribute('aria-pressed')).toBe('true');
  });

  // `total: 0` is not a parent — this is what keeps every ordinary task's tick a control
  // without any surface testing for "is this a checklist".
  it('is the ordinary control for a task with no steps', () => {
    const onTick = vi.fn();
    render(
      <TaskTick done={false} title="להחליף כסף" onTick={onTick} progress={{ done: 0, total: 0 }} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onTick).toHaveBeenCalled();
  });
});

describe('the count is the whole statement where the steps cannot fit', () => {
  const parent = task({ id: 'p', title: 'יציאה לשדה' });

  it('says 2/5 on a Home band row', () => {
    render(
      <TaskBandRow
        task={parent}
        users={users}
        clock={CLOCK}
        progress={{ done: 2, total: 5 }}
        onTick={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/2\/5/)).toBeTruthy();
  });

  // A parent with no deadline has nothing else to put on that line, so the count is what
  // brings the meta line back at all.
  it('brings back the meta line on an undated parent', () => {
    const { container } = render(
      <TaskBandRow
        task={parent}
        users={users}
        clock={CLOCK}
        progress={{ done: 0, total: 3 }}
        onTick={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(container.querySelector('.tsk-count')).toBeTruthy();
  });

  it('says nothing at all for a task that is not a parent', () => {
    const { container } = render(
      <TaskBandRow task={parent} users={users} clock={CLOCK} onTick={vi.fn()} onOpen={vi.fn()} />,
    );
    expect(container.querySelector('.tsk-count')).toBeNull();
  });
});
