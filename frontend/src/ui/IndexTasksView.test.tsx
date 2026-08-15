// @vitest-environment jsdom
// The tasks screen (tasks brief §13, ADR-0188): the row's four facts, the urgency order,
// the facet axis, and every verb the screen fires.
//
// **The clock is pinned** (`frontend/CLAUDE.md`) — every fixture here carries a date, so a
// test reading the system clock would mean something different every day it ran.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TASK_STATUS, type Task } from '@waypoint/shared';

// jsdom has no layout engine, so the refusal's bring-into-view has nothing to call.
Element.prototype.scrollIntoView = vi.fn();

// 2026-08-15 12:00 Jerusalem.
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

const overdue = task('t-overdue', {
  title: 'לאסוף את ה-JR Pass',
  dueAt: '2026-08-14T09:00:00.000Z',
  important: true,
});
const today = task('t-today', {
  title: 'להזמין את המסעדה',
  dueAt: '2026-08-15T15:00:00.000Z',
  dueHasTime: true,
  assigneeUserId: 'u2',
});
const later = task('t-later', { title: 'לקנות מתאם חשמל', dueAt: '2026-08-20T09:00:00.000Z' });
// The undated pair carry distinct `createdAt`s so the order below asserts the intended
// tie-break — oldest first within a band — rather than falling through to the id compare.
const undated = task('t-undated', {
  title: 'לבדוק אם האונסן מאפשר קעקועים',
  createdAt: '2026-08-02T00:00:00.000Z',
});
const mine = task('t-mine', {
  title: 'למשוך מזומן',
  assigneeUserId: 'u1',
  createdAt: '2026-08-03T00:00:00.000Z',
});
const done = task('t-done', {
  title: 'להעביר לנועם את הכסף',
  status: TASK_STATUS.DONE,
  createdAt: '2026-08-04T00:00:00.000Z',
});
const dismissed = task('t-dismissed', {
  title: 'לבדוק חניה',
  status: TASK_STATUS.DISMISSED,
  createdAt: '2026-08-05T00:00:00.000Z',
});

const ALL = [overdue, today, later, undated, mine, done, dismissed];

let tripTasks: Task[] = ALL;
const created: unknown[] = [];
const updated: { id: string; input: unknown }[] = [];
const deleted: string[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', name: 'טוקיו', timezone: 'Asia/Jerusalem' },
    tasks: tripTasks,
    users: [
      { id: 'u1', displayName: 'אסף' },
      { id: 'u2', displayName: 'דנה' },
    ],
    members: [{ userId: 'u1' }, { userId: 'u2' }],
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
      deleteTask: async (id: string) => void deleted.push(id),
    },
  }),
}));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../lib/useClock', () => ({ useClock: () => NOW }));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return {
    ...actual,
    useSyncStatus: () => ({ state: 'synced' }) as const,
    usePendingUploads: () => [],
  };
});

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';
import { IndexTasksView } from './IndexTasksView';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <ModeProvider>{node}</ModeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

const show = (onClose = () => {}) => render(wrap(<IndexTasksView onClose={onClose} />));
const visibleRows = () =>
  [...document.querySelectorAll('.wp-reveal:not(.hidden) .wp-listrow')] as HTMLElement[];
const titles = () =>
  visibleRows().map((r) => r.querySelector('.wp-listrow-title')?.textContent?.trim());

describe('IndexTasksView', () => {
  afterEach(() => {
    cleanup();
    tripTasks = ALL;
    created.length = 0;
    updated.length = 0;
    deleted.length = 0;
  });

  describe('the row', () => {
    it('leads with a tick that is a sibling of the trigger, not nested in it', () => {
      show();
      const row = visibleRows()[0];
      expect(row.querySelector('.wp-listrow-open .tsk-tick')).toBeNull();
      expect(row.firstElementChild?.className).toBe('wp-listrow-lead');
      expect(row.querySelector('.wp-listrow-lead .tsk-tick')).toBeTruthy();
    });

    it('prints the deadline, and the time only when the task carries one', () => {
      show();
      const overdueRow = visibleRows().find((r) => within(r).queryByText(overdue.title))!;
      expect(overdueRow.querySelector('.tsk-due.late')?.textContent).toContain('אתמול');
      const todayRow = visibleRows().find((r) => within(r).queryByText(today.title))!;
      const due = todayRow.querySelector('.tsk-due')!;
      expect(due.classList.contains('late')).toBe(false);
      expect(due.textContent).toContain('18:00');
    });

    it('prints no deadline at all for an undated task', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(undated.title))!;
      expect(row.querySelector('.tsk-due')).toBeNull();
    });

    it('names the assignee, and says nothing where the task is the group’s', () => {
      show();
      const delegated = visibleRows().find((r) => within(r).queryByText(today.title))!;
      expect(delegated.textContent).toContain('דנה');
      const group = visibleRows().find((r) => within(r).queryByText(later.title))!;
      expect(group.querySelector('.wp-listrow-meta')?.textContent).not.toContain('דנה');
    });

    // `important` spends no colour — shape and weight only (brief §7).
    it('marks an important task with a star and nothing else', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(overdue.title))!;
      expect(row.querySelector('.tsk-star')).toBeTruthy();
      const plain = visibleRows().find((r) => within(r).queryByText(later.title))!;
      expect(plain.querySelector('.tsk-star')).toBeNull();
    });
  });

  describe('the order', () => {
    it('runs overdue → today → later → undated, oldest first inside a band', () => {
      show();
      expect(titles()).toEqual([
        overdue.title,
        today.title,
        later.title,
        undated.title,
        mine.title,
      ]);
    });

    it('hides settled tasks from the default list', () => {
      show();
      expect(titles()).not.toContain(done.title);
      expect(titles()).not.toContain(dismissed.title);
    });
  });

  describe('the facet axis', () => {
    it('shows only tasks delegated to me under שלי — never the unassigned ones', () => {
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.mine) }));
      expect(titles()).toEqual([mine.title]);
    });

    it('reveals done AND dismissed together under הושלמו', () => {
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) }));
      expect(titles()).toEqual([done.title, dismissed.title]);
      expect(visibleRows()[0].classList.contains('tsk-settled')).toBe(true);
    });

    it('omits a chip with nothing behind it', () => {
      tripTasks = [later];
      show();
      expect(screen.queryByRole('radio', { name: new RegExp(t.tasks.filter.settled) })).toBeNull();
      expect(screen.queryByRole('radio', { name: new RegExp(t.tasks.filter.mine) })).toBeNull();
    });
  });

  describe('the verbs', () => {
    // The whole point of the sparse patch: a tick sends `status` and nothing else, so the
    // task keeps its words, its deadline and its host.
    it('ticks a task to done with a status-only patch', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(later.title))!;
      fireEvent.click(row.querySelector('.tsk-tick')!);
      expect(updated).toEqual([{ id: later.id, input: { status: TASK_STATUS.DONE } }]);
    });

    it('ticks a done task back open', () => {
      tripTasks = [done];
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) }));
      fireEvent.click(visibleRows()[0].querySelector('.tsk-tick')!);
      expect(updated).toEqual([{ id: done.id, input: { status: TASK_STATUS.OPEN } }]);
    });

    it('dismisses from the ⋯ sheet, which is where the rare verb lives', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(later.title))!;
      fireEvent.click(row.querySelector('.wp-listrow-kebab')!);
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.dismiss }));
      expect(updated).toEqual([{ id: later.id, input: { status: TASK_STATUS.DISMISSED } }]);
    });

    it('flags and unflags from the ⋯ sheet', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(later.title))!;
      fireEvent.click(row.querySelector('.wp-listrow-kebab')!);
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.flag }));
      expect(updated).toEqual([{ id: later.id, input: { important: true } }]);
    });

    it('deletes only behind the confirm', () => {
      show();
      const row = visibleRows().find((r) => within(r).queryByText(later.title))!;
      fireEvent.click(row.querySelector('.wp-listrow-kebab')!);
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.delete }));
      expect(deleted).toEqual([]);
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.confirmDelete }));
      expect(deleted).toEqual([later.id]);
    });
  });

  describe('the editor', () => {
    it('refuses a task with no title, and marks the box that cures it', () => {
      tripTasks = [later];
      show();
      fireEvent.click(screen.getByRole('button', { name: t.tasks.add }));
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
      expect(created).toEqual([]);
      expect(screen.getByText(t.tasks.sheet.needsTitle)).toBeTruthy();
    });

    it('writes an undated task rather than inventing a deadline for it', () => {
      tripTasks = [later];
      show();
      fireEvent.click(screen.getByRole('button', { name: t.tasks.add }));
      fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
        target: { value: 'לארוז' },
      });
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
      expect(created).toEqual([
        {
          title: 'לארוז',
          body: undefined,
          dueAt: undefined,
          dueHasTime: false,
          assigneeUserId: undefined,
          important: false,
        },
      ]);
    });

    // A date-only deadline is the END of that day (`DAY_DEADLINE_HHMM`) — storing 00:00
    // would make a task due today read as overdue one minute past midnight.
    it('resolves a date-only deadline to the end of that day, with dueHasTime false', () => {
      tripTasks = [later];
      show();
      fireEvent.click(screen.getByRole('button', { name: t.tasks.add }));
      fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
        target: { value: 'לארוז' },
      });
      fireEvent.change(document.querySelector('.df-input')!, {
        target: { value: '2026-08-18' },
      });
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
      expect(created).toHaveLength(1);
      const draft = created[0] as { dueAt: string; dueHasTime: boolean };
      expect(draft.dueHasTime).toBe(false);
      // 23:59 Jerusalem on the 18th.
      expect(draft.dueAt).toBe('2026-08-18T20:59:00.000Z');
    });

    it('opens an existing task on the values it was saved with', () => {
      tripTasks = [today];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      expect((screen.getByLabelText(t.tasks.sheet.titleLabel) as HTMLInputElement).value).toBe(
        today.title,
      );
    });
  });

  it('teaches what belongs here when the trip has no tasks at all', () => {
    tripTasks = [];
    show();
    expect(screen.getByText(t.tasks.empty.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: t.tasks.empty.action })).toBeTruthy();
  });
});
