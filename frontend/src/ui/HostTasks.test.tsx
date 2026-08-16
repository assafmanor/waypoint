// @vitest-environment jsdom
// A host's tasks section (ADR-0191 §5) — the surface, the add path, and the one thing the
// drawing settled: these rows are `ListRow`s, not `.note-item`s.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TASK_STATUS, type Task } from '@waypoint/shared';

const NOW = new Date('2026-08-15T09:00:00.000Z');

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

let tripTasks: Task[] = [];
const created: unknown[] = [];
const updated: { id: string; input: unknown }[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      timezone: 'Asia/Jerusalem',
      destination: 'טוקיו',
      startDate: '2026-08-15',
      endDate: '2026-08-20',
    },
    tasks: tripTasks,
    users: [{ id: 'u1', displayName: 'אסף' }],
    members: [{ userId: 'u1' }],
    zoneCrossings: [],
    zoneEvidence: {
      events: [],
      bookings: [],
      places: [],
      crossings: [],
      primaryZone: 'Asia/Jerusalem',
    },
    taskVerbs: {
      createTask: async (input: unknown) => void created.push(input),
      updateTask: async (id: string, input: unknown) => void updated.push({ id, input }),
      deleteTask: async () => {},
    },
  }),
}));
vi.mock('../lib/useClock', () => ({ useClock: () => NOW }));

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';
import { HostTasks } from './HostTasks';
import { t } from '../i18n/he';

const wrap = (node: ReactNode) => (
  <MemoryRouter>
    <ToastProvider>
      <NavProvider>
        <ModeProvider>{node}</ModeProvider>
      </NavProvider>
    </ToastProvider>
  </MemoryRouter>
);
const show = () =>
  render(wrap(<HostTasks host={{ kind: 'booking', id: 'bk-1', name: 'Granbell' }} />));

afterEach(() => {
  cleanup();
  tripTasks = [];
  created.length = 0;
  updated.length = 0;
});

describe('HostTasks', () => {
  it('shows only this host’s tasks', () => {
    tripTasks = [
      task('mine', { bookingId: 'bk-1', title: 'לאשר את השעה' }),
      task('other', { bookingId: 'bk-2', title: 'משהו אחר' }),
      task('general', { title: 'כללית' }),
    ];
    show();
    expect(screen.getByText('לאשר את השעה')).toBeTruthy();
    expect(screen.queryByText('משהו אחר')).toBeNull();
    expect(screen.queryByText('כללית')).toBeNull();
  });

  // ADR-0045's no-empty-shell rule does NOT apply here: the section is how you ADD the
  // first one, so it states the absence and keeps its `＋`.
  it('states the absence rather than vanishing, because it is also the way in', () => {
    show();
    expect(screen.getByText(t.tasks.section.empty)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.tasks.section.add) })).toBeTruthy();
  });

  // **The finding the drawing produced** (ADR-0191 §5): `.note-item` has no lead slot,
  // because a note has no completion control.
  it('renders its rows as ListRows with a tick, not as note items', () => {
    tripTasks = [task('a', { bookingId: 'bk-1' })];
    show();
    const row = document.querySelector('.tsk-sec-list .wp-listrow');
    expect(row).toBeTruthy();
    expect(row!.querySelector('.wp-listrow-lead .tsk-tick')).toBeTruthy();
    expect(document.querySelector('.tsk-sec-list .note-item')).toBeNull();
  });

  // A selector must still be able to mean "the NOTES section" — four shipped specs caught
  // this when the two shared a root class.
  it('is distinguishable from the notes section it shares geometry with', () => {
    show();
    expect(document.querySelector('.note-sec.tsk-sec')).toBeTruthy();
    expect(document.querySelector('.note-sec:not(.tsk-sec)')).toBeNull();
  });

  it('writes the host onto a task created here, from the FK lookup', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.tasks.section.add) }));
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
      target: { value: 'לאשר את השעה' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: 'לאשר את השעה', bookingId: 'bk-1' });
  });

  it('ticks a task from the section without leaving it', () => {
    tripTasks = [task('a', { bookingId: 'bk-1' })];
    show();
    fireEvent.click(document.querySelector('.tsk-tick') as HTMLElement);
    expect(updated).toEqual([{ id: 'a', input: { status: TASK_STATUS.DONE } }]);
  });

  it('keeps a settled task in the list, struck', () => {
    tripTasks = [task('a', { bookingId: 'bk-1', status: TASK_STATUS.DONE, title: 'נעשה' })];
    show();
    expect(screen.getByText('נעשה')).toBeTruthy();
    expect(document.querySelector('.wp-listrow.tsk-settled')).toBeTruthy();
  });
});
