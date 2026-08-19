// @vitest-environment jsdom
// **The discard guard, and mostly the times it must NOT fire** (owner, 2026-08-19: _"be wary
// of popping this up when not needed, read issues that we had with other kinds of entities"_).
//
// The issue being referred to is on the record and cost a release: `EventForm`'s `dirty` read
// `booked.touched`, and a later amendment redefined that flag as "the category may no longer
// move this" — true from the first render of every existing event. So **every** edit opened
// dirty and the confirm fired on a form nobody had typed in, worst in Plan mode where a tap on
// a row IS the edit form (ADR-0136's session-188 follow-up).
//
// The rule that came out of it is "diff the VALUE against what the form opened with, never a
// flag", and the tests below are mostly the negative half of it: opening and leaving must be
// silent, including from the states this particular form can be left in that are not edits.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TASK_STATUS, type Task } from '@waypoint/shared';
import { splitSubtasks } from '../lib/tasks';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

const h = vi.hoisted(() => ({ tripTasks: [] as Task[], deleted: [] as string[] }));

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 'trip', timezone: 'Asia/Jerusalem' },
    users: [
      { id: 'u1', displayName: 'אסף' },
      { id: 'u2', displayName: 'דנה' },
    ],
    members: [{ userId: 'u1' }, { userId: 'u2' }],
    subtasks: splitSubtasks(h.tripTasks).byParent,
    zoneEvidence: {
      events: [],
      bookings: [],
      places: [],
      crossings: [],
      primaryZone: 'Asia/Jerusalem',
    },
    taskVerbs: {
      createTask: async () => {},
      updateTask: async () => {},
      deleteTask: async (id: string) => void h.deleted.push(id),
      tickTask: async () => {},
    },
  }),
}));

import { TaskSheet } from './TaskSheet';

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id,
    tripId: 'trip',
    title: id,
    dueHasTime: false,
    important: false,
    status: TASK_STATUS.OPEN,
    createdBy: 'u1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'u1',
    ...over,
  }) as Task;

const PARENT = task('p', { title: 'לארוז', assigneeUserId: 'u1', body: 'משהו' });
const STEP = task('s1', { title: 'מטענים', parentTaskId: 'p' });

const show = (over: { task?: Task } = {}) => {
  const onClose = vi.fn();
  const view = render(wrapNav(<TaskSheet task={over.task} onSave={vi.fn()} onClose={onClose} />));
  /** Re-render so `useTrip()` is read again — the only way a mocked provider can deliver a
   *  peer's arrival, since mutating the fixture alone changes nothing the component sees. */
  const repaint = () =>
    view.rerender(wrapNav(<TaskSheet task={over.task} onSave={vi.fn()} onClose={onClose} />));
  return { onClose, repaint };
};

const cancel = () => fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.cancel }));
const asked = () => screen.queryByText(t.common.discardTitle) !== null;

beforeEach(() => {
  h.tripTasks = [PARENT, STEP];
  h.deleted = [];
});
afterEach(cleanup);

describe('leaving a form nobody typed in is silent', () => {
  it('does not ask when an EXISTING task is opened and left', () => {
    const { onClose } = show({ task: PARENT });
    cancel();
    expect(asked()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not ask when a CREATE is opened and left', () => {
    const { onClose } = show();
    cancel();
    expect(asked()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  // Revealing the composer is not an edit, and this form has a control whose whole job is to
  // reveal it — so it is exactly the false positive to guard against.
  it('does not ask after `＋ תת משימה` was pressed and nothing typed', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: `＋ ${t.tasks.subtasks.add}` }));
    cancel();
    expect(asked()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  // The steps are seeded from live trip state, so a peer's arrival must not read as an edit
  // this form made. It does not even appear — the list is seeded ONCE, deliberately, so a
  // change under a form someone is typing in does not move it.
  it('does not ask when a PEER adds a step while the form is open', () => {
    const { onClose, repaint } = show({ task: PARENT });
    h.tripTasks = [PARENT, STEP, task('s2', { title: 'בגדים', parentTaskId: 'p' })];
    repaint();
    expect(screen.queryByText('בגדים')).toBeNull();
    cancel();
    expect(asked()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });
});

// **The save diffs against what the form OPENED with, not against live state**, and this is
// the case that makes the difference load-bearing rather than tidy: a step this draft never
// saw is not a step this draft removed.
describe('a peer\u2019s step survives someone else\u2019s save', () => {
  it('is not deleted by a save that touched something else entirely', () => {
    const { repaint } = show({ task: PARENT });
    h.tripTasks = [PARENT, STEP, task('s2', { title: 'בגדים', parentTaskId: 'p' })];
    repaint();
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
      target: { value: 'לארוז מחר' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
    expect(h.deleted).toEqual([]);
  });
});

describe('leaving a form that was typed in asks first', () => {
  it('asks when the title changed', () => {
    const { onClose } = show({ task: PARENT });
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
      target: { value: 'לארוז מחר' },
    });
    cancel();
    expect(asked()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks when a step was removed, and removes nothing until the answer', () => {
    const { onClose } = show({ task: PARENT });
    fireEvent.click(screen.getByText('מטענים'));
    fireEvent.click(screen.getByLabelText(t.tasks.subtasks.remove));
    cancel();
    expect(asked()).toBe(true);
    expect(h.deleted).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks when a step was added', () => {
    show({ task: PARENT });
    const box = screen.getByLabelText(t.tasks.subtasks.add);
    fireEvent.change(box, { target: { value: 'נעליים' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    cancel();
    expect(asked()).toBe(true);
  });

  it('leaves on confirm, and stays on cancel', () => {
    const { onClose } = show({ task: PARENT });
    fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
      target: { value: 'לארוז מחר' },
    });
    cancel();
    fireEvent.click(screen.getByRole('button', { name: t.common.discardCancel }));
    expect(onClose).not.toHaveBeenCalled();

    cancel();
    fireEvent.click(screen.getByRole('button', { name: t.common.discardConfirm }));
    expect(onClose).toHaveBeenCalled();
    // Still nothing written: discarding is the one path that must not flush the step plan.
    expect(h.deleted).toEqual([]);
  });
});
