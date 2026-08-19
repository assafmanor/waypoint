// @vitest-environment jsdom
// A host's tasks section (ADR-0191 §5) — the surface, the add path, and the one thing the
// owner then reversed: these rows are `.note-item`s, the same shape the notes section uses.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { splitSubtasks } from '../lib/tasks';

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
    tasks: splitSubtasks(tripTasks).roots,
    subtasks: splitSubtasks(tripTasks).byParent,
    events: [],
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
import { HostTasks, useTaskStaging } from './HostTasks';
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

  // **ADR-0191 §5, REVERSED** (owner, 2026-08-16). Phase 4 gave this a `ListRow` and wrote
  // the cost down; the cost was a 40px indent against the notes section beside it. The row is
  // the same `.note-item` now, and only the LEAD differs — which is the whole claim, so it is
  // what this asserts.
  it('renders its rows as note items with a tick in the shared lead, not as ListRows', () => {
    tripTasks = [task('a', { bookingId: 'bk-1' })];
    show();
    const row = document.querySelector('.tsk-sec-list .note-item.tsk-row');
    expect(row).toBeTruthy();
    expect(row!.querySelector('.note-item-lead .tsk-tick-sec')).toBeTruthy();
    expect(document.querySelector('.tsk-sec-list .wp-listrow')).toBeNull();
    // The screen's 44px box must not come back with it: that is what broke the row.
    expect(document.querySelector('.tsk-sec-list .tsk-tick')).toBeNull();
  });

  // The four differences the alignment report was made of, and the two a unit can see.
  it('names its noun in the header, as the notes section does', () => {
    show();
    expect(document.querySelector('.tsk-sec .sec-h .t svg')).toBeTruthy();
  });

  // **The section says only what there is to say** (owner: "tasks should be more minimal").
  // An undated unassigned task rendered a whole meta line reading `לא משויך`, which on a Map
  // place card beside a note section is a line that says nothing — and its separator was
  // unconditional, so it opened with an orphan `·` too.
  it('renders no meta line at all when there is neither a deadline nor an assignee', () => {
    tripTasks = [task('a', { bookingId: 'bk-1' })];
    show();
    expect(document.querySelector('.tsk-sec-list .note-item .note-item-m')).toBeNull();
  });

  it('opens the meta with the deadline, never with a separator', () => {
    tripTasks = [task('a', { bookingId: 'bk-1', dueAt: '2026-08-20T12:00:00.000Z' })];
    show();
    const meta = document.querySelector('.tsk-sec-list .note-item-m')!;
    expect(meta.querySelector('.tsk-sep')).toBeNull();
    expect(meta.textContent!.trimStart().startsWith('·')).toBe(false);
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
    fireEvent.click(document.querySelector('.tsk-tick-sec') as HTMLElement);
    expect(updated).toEqual([{ id: 'a', input: { status: TASK_STATUS.DONE } }]);
  });

  it('keeps a settled task in the list, struck', () => {
    tripTasks = [task('a', { bookingId: 'bk-1', status: TASK_STATUS.DONE, title: 'נעשה' })];
    show();
    expect(screen.getByText('נעשה')).toBeTruthy();
    expect(document.querySelector('.note-item.tsk-row.tsk-settled')).toBeTruthy();
  });

  // A staged draft is rendered as a `Task` so the section looks the same before and after the
  // host exists — and that mapping is also what the editor re-opens on. It dropped `body`
  // entirely, so a staged task's words were lost the moment it was edited: typed once,
  // invisible on the row (a staged task has no open-in-place), and gone on the second save.
  it('keeps a staged task’s body when it is re-opened for editing', () => {
    render(wrap(<StagingHost />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.tasks.section.add) }));
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
      target: { value: 'לאשר את השעה' },
    });
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.bodyLabel), {
      target: { value: 'שתיים אחרי הצהריים' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
    fireEvent.click(screen.getByRole('button', { name: 'לאשר את השעה' }));
    expect((screen.getByLabelText(t.tasks.sheet.bodyLabel) as HTMLTextAreaElement).value).toBe(
      'שתיים אחרי הצהריים',
    );
  });
});

/** A host FORM's copy of the section: no id to hang an FK on, so the tasks are staged
 *  (ADR-0191 §7) — the shape `EventForm` and `BookingSheet` both run. */
function StagingHost() {
  const staging = useTaskStaging();
  return <HostTasks host={{ kind: 'booking', name: 'Granbell' }} staging={staging} />;
}
