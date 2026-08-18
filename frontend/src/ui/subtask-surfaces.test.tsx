// @vitest-environment jsdom
// **What a task holding a checklist says on the surfaces that render it** (ADR-0196 §3/§6).
//
// The decision under test is that a parent's lead is a **read** rather than a control, and
// that the same two elements — the arc and the count — carry it on the screen, on a Home band
// and in a host's section alike. That is the claim the small surfaces make expensive: there is
// no room for the steps themselves, so if the two elements do not say it, nothing does.
//
// It is also the assertion that would have caught the shape of bug this feature is most
// exposed to: a parent offering a press that has nothing to do.
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

describe("a parent's leading element is a read, not a control", () => {
  it('renders no button, so there is no press with nothing to do', () => {
    render(
      <TaskTick
        done={false}
        title="יציאה לשדה"
        onTick={vi.fn()}
        progress={{ done: 2, total: 5 }}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(t.tasks.progress(2, 5));
  });

  it('keeps the tick’s own box, so the row does not change shape', () => {
    render(
      <TaskTick
        done={false}
        title="יציאה לשדה"
        onTick={vi.fn()}
        progress={{ done: 2, total: 5 }}
      />,
    );
    // The same class the control wears — the arc is a layer on it, not a second control.
    expect(screen.getByRole('img').className).toContain('tsk-tick');
  });

  it('carries the fraction the arc is drawn from', () => {
    render(
      <TaskTick
        done={false}
        title="יציאה לשדה"
        onTick={vi.fn()}
        progress={{ done: 1, total: 4 }}
      />,
    );
    expect(screen.getByRole('img').getAttribute('style')).toContain('0.25');
  });

  it('reads as done when every step is', () => {
    render(<TaskTick done title="יציאה לשדה" onTick={vi.fn()} progress={{ done: 3, total: 3 }} />);
    expect(screen.getByRole('img').getAttribute('data-done')).toBe('true');
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
