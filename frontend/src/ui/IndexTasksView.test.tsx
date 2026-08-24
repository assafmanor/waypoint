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
import { splitSubtasks, tickedStatus } from '../lib/tasks';

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
// Carries a PASSED deadline on purpose: this is the row the deadline defect was reported
// from, and it only shows up on a settled task that had a date to miss.
const done = task('t-done', {
  title: 'להעביר לנועם את הכסף',
  status: TASK_STATUS.DONE,
  dueAt: '2026-08-13T09:00:00.000Z',
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
    trip: {
      id: 't1',
      name: 'טוקיו',
      timezone: 'Asia/Jerusalem',
      // The readiness derivation reads these now (ADR-0190): the screen renders the five
      // automatic checks above its manual list, so the trip has to be a real enough trip
      // for `computeReadiness` to answer about.
      destination: 'טוקיו',
      startDate: '2026-08-15',
      endDate: '2026-08-20',
    },
    events: [],
    bookings: [],
    places: [],
    documents: [],
    setActiveDate: () => {},
    // The real split, so the mock hands out exactly what the provider does: roots with each
    // parent's status resolved, plus the steps keyed by parent (ADR-0196 §2). A hand-written
    // map would drift from `splitSubtasks` the first time its rules changed.
    tasks: splitSubtasks(tripTasks).roots,
    subtasks: splitSubtasks(tripTasks).byParent,
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
      // A leaf's tick is unchanged by ADR-0196 §3's reversal, so the stand-in is the verb's
      // own leaf branch: what this spec tests is the surface's wiring, not the verb.
      tickTask: async (task: Task) =>
        void updated.push({ id: task.id, input: { status: tickedStatus(task) } }),
    },
  }),
}));
vi.mock('../state/auth-state', () => ({
  useAuth: () => ({ me: { user: { id: 'u1' } } }),
  // The task sheet's push ask reads this one. `push: undefined` — this fixture's server has
  // no VAPID keypair, so the ask renders nothing, which is what these tests are about.
  useMaybeAuth: () => ({ me: { user: { id: 'u1' } } }),
}));
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

const openDocuments = vi.fn();
const show = (onClose = () => {}, initialTaskId?: string) =>
  render(
    wrap(
      <IndexTasksView
        onClose={onClose}
        onOpenDocuments={openDocuments}
        initialTaskId={initialTaskId}
      />,
    ),
  );
const visibleRows = () =>
  [...document.querySelectorAll('.wp-reveal:not(.hidden) .wp-listrow')] as HTMLElement[];
const MANUAL_TITLES = ALL.map((x) => x.title);
/** Four of `computeReadiness`'s five: the fixture's two travellers already satisfy `group`,
 *  and a satisfied check is not "still missing" (`isLive`). */
const LIVE_CHECKS = 4;
/** The readiness checks on screen. Keyed on `.tsk-auto`, NOT on "has no tick" — since
 *  2026-08-16 every row has a tick, which is the whole point of that change. */
const autoRows = () => visibleRows().filter((r) => r.classList.contains('tsk-auto'));
// `.tsk-title-txt`, not the whole title row — the assignee's face lives at that row's
// trailing edge now (ADR-0190 §6 as amended), and an `Avatar` renders its initial as text, so
// reading the row would append a stray letter to every title.
const titles = () =>
  visibleRows().map((r) => r.querySelector('.tsk-title-txt')?.textContent?.trim());

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

    // **Nor for a settled one** (owner, 2026-08-24): `done` missed its date, and on the
    // `הושלמו` list it printed `באיחור ·` in `--miss` beside a struck-through title — a
    // status about work nobody owes any more.
    it('prints no deadline on a settled task, late or not', () => {
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) }));
      const row = visibleRows().find((r) => within(r).queryByText(done.title))!;
      expect(row.querySelector('.tsk-due')).toBeNull();
      expect(row.textContent).not.toContain(t.tasks.due.late);
    });

    // **The FACE, on the title row, and nothing where nobody owns it** (ADR-0190 §6 amended
    // 2026-08-16 on the owner's comparison with Microsoft To Do). §6's own argument for
    // spelling out `לא משויך` was that silence in a text line is indistinguishable from a
    // name that did not fit; in a fixed slot an empty one is unambiguous, which is what let
    // the word go. So this asserts the SLOT rather than the words.
    it('shows the assignee as a face on the title row, and nothing where the task is the group’s', () => {
      show();
      const delegated = visibleRows().find((r) => within(r).queryByText(today.title))!;
      const face = delegated.querySelector('.wp-listrow-title .tsk-who-row');
      expect(face).toBeTruthy();
      // The face itself is `aria-hidden` (`Avatar`'s non-interactive form), so the row says
      // the name in a visually-hidden span — otherwise moving to a face-only would have made
      // the assignee unreadable rather than compact.
      expect(delegated.querySelector('.wp-listrow-title .visually-hidden')?.textContent).toContain(
        'דנה',
      );
      // …and the name is no longer duplicated into the meta line it used to live in.
      expect(delegated.querySelector('.wp-listrow-meta')?.textContent ?? '').not.toContain('דנה');
      expect(titles()).toContain(today.title); // and the visible title is unchanged

      const group = visibleRows().find((r) => within(r).queryByText(later.title))!;
      expect(group.querySelector('.tsk-who-row')).toBeNull();
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
    // **Urgent first, then the readiness checks, then the rest** (ADR-0190 §2, owner's
    // revision). `overdue` is both important AND overdue, so it leads; everything else is
    // ordinary and falls below the checks in the same urgency ladder as before.
    it('runs urgent → readiness checks → the rest in urgency order', () => {
      show();
      const order = titles();
      expect(order[0]).toBe(overdue.title);
      const manualAfter = order.slice(1).filter((x) => MANUAL_TITLES.includes(x!));
      expect(manualAfter).toEqual([today.title, later.title, undated.title, mine.title]);
      // …and every check sits between the two halves.
      const firstCheck = order.findIndex((x) => !MANUAL_TITLES.includes(x!));
      const lastCheck = order.map((x) => !MANUAL_TITLES.includes(x!)).lastIndexOf(true);
      expect(firstCheck).toBe(1);
      expect(lastCheck).toBeLessThan(order.indexOf(today.title));
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

    // **And a SATISFIED readiness check joins them** (owner, 2026-08-16, amending
    // ADR-0190 §1): a check the data has closed is something you are finished with, which
    // is exactly what this chip asks. The fixture's two travellers satisfy `group`.
    it('reveals done, dismissed and satisfied checks together under הושלמו', () => {
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) }));
      expect(titles()).toContain(done.title);
      expect(titles()).toContain(dismissed.title);
      expect(autoRows()).toHaveLength(1);
      expect(
        visibleRows()
          .find((r) => within(r).queryByText(done.title))!
          .classList.contains('tsk-settled'),
      ).toBe(true);
    });

    it('omits a chip with nothing behind it', () => {
      tripTasks = [later];
      show();
      // `שלי` has nothing: no manual task is delegated to me, and no check has been given
      // to anyone. `הושלמו` DOES have something — the satisfied `group` check — which is
      // the amendment, so it is the one chip that survives an empty manual list.
      expect(screen.queryByRole('radio', { name: new RegExp(t.tasks.filter.mine) })).toBeNull();
      expect(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) })).toBeTruthy();
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
      // A satisfied check sits under this chip too now, and has no tick — find the row by
      // its words rather than by position.
      const row = visibleRows().find((r) => within(r).queryByText(done.title))!;
      fireEvent.click(row.querySelector('.tsk-tick')!);
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

    // The row's tap OPENS IT IN PLACE now (ADR-0189 §3), so the way to the editor is the
    // foot's verb — not the row. That is the change, not an incidental re-route: phase 1
    // pointed this tap at the editor and `body` ended up with no reader anywhere.
    it('opens an existing task on the values it was saved with, from the open row', () => {
      tripTasks = [today];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.edit }));
      expect((screen.getByLabelText(t.tasks.sheet.titleLabel) as HTMLInputElement).value).toBe(
        today.title,
      );
    });

    // **EMPTYING A BOX CLEARS THE FIELD** (owner, 2026-08-16: _"removing the task description
    // and saving doesn't actually persist it"_). `updateTaskSchema` is sparse — absent means
    // untouched, so the tick can send `{ status }` alone — and the editor was sending
    // `undefined` for a box it had just emptied, which is the same word for "left alone".
    // Three fields shared the defect; a `null` is what the whole path already knew how to
    // apply, at the server, in the optimistic patch and in the Dexie mirror.
    it('clears an emptied body, deadline and assignee with an explicit null', () => {
      tripTasks = [{ ...today, body: 'ליד התחנה' }];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.edit }));
      fireEvent.change(screen.getByLabelText(t.tasks.sheet.bodyLabel), { target: { value: '  ' } });
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.clearDue }));
      fireEvent.click(screen.getByRole('radio', { name: t.tasks.sheet.nobody }));
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
      expect(updated).toEqual([
        {
          id: today.id,
          input: {
            title: today.title,
            body: null,
            dueAt: null,
            dueHasTime: false,
            // A cleared deadline clears the pinned zone with it (2026-08-17): a zone pinned
            // to no date is a value nothing can read. Same explicit `null` as its
            // neighbours, and for the same reason — the sparse patch cannot tell an
            // untouched field from an emptied one.
            displayTimezone: null,
            assigneeUserId: null,
            important: false,
          },
        },
      ]);
    });

    // The other half of the same contract: a create has nothing to clear, and
    // `createTaskSchema` takes no nulls — so an untouched box is simply not sent.
    it('sends no nulls on a create — an empty box there is an absence, not a clearing', () => {
      tripTasks = [later];
      show();
      fireEvent.click(screen.getByRole('button', { name: t.tasks.add }));
      fireEvent.change(screen.getByLabelText(t.tasks.sheet.titleLabel), {
        target: { value: 'לארוז' },
      });
      fireEvent.click(screen.getByRole('button', { name: t.tasks.sheet.save }));
      expect(Object.values(created[0] as Record<string, unknown>)).not.toContain(null);
    });
  });

  // `body` was WRITE-ONLY through all of phase 1 — the editor wrote it and nothing in the
  // app rendered it (ADR-0189 §3). These two are the readers.
  describe('reading a task', () => {
    it('prints the body under the row when the row is opened, and not before', () => {
      tripTasks = [{ ...today, body: 'מינימום ארבעה, ולא אחרי 17:00' }];
      show();
      expect(screen.queryByText('מינימום ארבעה, ולא אחרי 17:00')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      expect(screen.getByText('מינימום ארבעה, ולא אחרי 17:00')).toBeTruthy();
    });

    it('marks the row that has more to read, and only that row', () => {
      tripTasks = [{ ...today, body: 'יש פרטים' }, later];
      show();
      expect(document.querySelectorAll('.tsk-more-mark')).toHaveLength(1);
    });

    it('opens a task with no body too — the foot carries the verb', () => {
      tripTasks = [today];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      expect(document.querySelector('.row-open-foot')).toBeTruthy();
      expect(document.querySelector('.tsk-open-body')).toBeNull();
    });

    // **The foot says the verb and nothing else** (owner, 2026-08-16: _"no need to show the
    // assignee name in the expanded task, we already have the assignee avatar"_). The name was
    // right when it was the row's only statement of who owes it; since the face moved to the
    // title row it is the same fact twice, three lines apart.
    it('says no assignee name under an open row — the face on the title row is the statement', () => {
      tripTasks = [today];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      const foot = document.querySelector('.row-open-foot')!;
      expect(foot.querySelector('.row-open-lead')).toBeNull();
      expect(foot.textContent).not.toContain('דנה');
      expect(foot.textContent).toContain(t.tasks.manage.edit);
      // And nothing where the task is the group's either: the empty slot is the statement.
      cleanup();
      tripTasks = [undated];
      show();
      fireEvent.click(screen.getByRole('button', { name: undated.title }));
      expect(document.querySelector('.row-open-foot')!.textContent).not.toContain(
        t.tasks.sheet.nobody,
      );
    });

    it('closes an open row when another one opens — one at a time', () => {
      tripTasks = [
        { ...today, body: 'א' },
        { ...later, body: 'ב' },
      ];
      show();
      fireEvent.click(screen.getByRole('button', { name: today.title }));
      fireEvent.click(screen.getByRole('button', { name: later.title }));
      expect(document.querySelectorAll('.row-open-foot')).toHaveLength(1);
      expect(screen.queryByText('א')).toBeNull();
      expect(screen.getByText('ב')).toBeTruthy();
    });
  });

  // **The empty state now means "nothing at all to do", not "nobody has typed yet"**
  // (ADR-0190 §1). A trip with no manual tasks still owes its readiness checks, so the
  // screen has content from the moment the trip exists — and the way to add one is the
  // ordinary `+` button rather than the empty state's CTA.
  it('shows the readiness checks rather than an empty state on a trip with no tasks', () => {
    tripTasks = [];
    show();
    expect(screen.queryByText(t.tasks.empty.title)).toBeNull();
    expect(autoRows().length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: new RegExp(t.tasks.add) })).toBeTruthy();
  });

  describe('automatic tasks (ADR-0190)', () => {
    // ONE card, not a separate one above — brief §2's "one noun, one list" on screen.
    it('puts the checks in the same list card as the manual tasks', () => {
      tripTasks = [today];
      show();
      expect(document.querySelectorAll('.listcard')).toHaveLength(1);
      // FOUR, not five: the fixture has two travellers, so the `group` check is already
      // satisfied and `isLive` drops it — the list is what is still MISSING.
      expect(autoRows().length).toBe(LIVE_CHECKS);
    });

    // **The tick is the SAME control a manual task carries** (owner, 2026-08-16, reversing
    // ADR-0188 §4's leading element): one noun, one row shape, all the way down to the verb.
    it('is STRUCTURALLY identical to a manual row — same tick, no badge', () => {
      tripTasks = [today];
      show();
      const auto = autoRows()[0];
      const manual = visibleRows().find((r) => !r.classList.contains('tsk-auto'))!;
      expect(auto.querySelector('.wp-listrow-lead .tsk-tick')).toBeTruthy();
      // **No badge** (owner, 2026-08-16): it restated the title beside it, and it was the
      // last structural difference between the two kinds.
      expect(auto.querySelector('.wp-listrow-badge')).toBeNull();
      expect(manual.querySelector('.wp-listrow-badge')).toBeNull();
      // A check with no row has nothing in flight to badge either (ADR-0188 §7).
      expect(auto.querySelector('.wp-listrow-sync')).toBeNull();
    });

    it('completes a check by ticking it, minting the overlay row on the way', () => {
      tripTasks = [];
      show();
      fireEvent.click(autoRows()[0].querySelector('.tsk-tick') as HTMLElement);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ status: TASK_STATUS.DONE });
      expect((created[0] as { derivedKey?: string }).derivedKey).toBeTruthy();
    });

    // A human answer wins in BOTH directions — the point of "complete/uncomplete".
    it('un-completes a satisfied check, and the row stops reading as done', () => {
      tripTasks = [];
      show();
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.settled) }));
      // `group` is satisfied by the fixture's two travellers and nobody has touched it.
      const satisfied = autoRows()[0];
      expect(satisfied.querySelector('.tsk-tick')!.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(satisfied.querySelector('.tsk-tick')!);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ status: TASK_STATUS.OPEN });
    });

    // The chips read a `Task` row, and an untouched check has none — so they sit it out
    // rather than each growing a second meaning.
    it('hides the checks under any facet but הכל', () => {
      tripTasks = [mine];
      show();
      expect(autoRows().length).toBe(LIVE_CHECKS);
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.tasks.filter.mine) }));
      expect(autoRows()).toHaveLength(0);
    });

    // **Reversed by the owner on 2026-08-16** (amending ADR-0190 §1): the checks are tasks,
    // so they count. Two manual + four still-missing checks = six under `הכל`.
    it('counts the still-missing checks into הכל alongside the tasks people wrote', () => {
      tripTasks = [today, later];
      show();
      const all = screen.getByRole('radio', { name: new RegExp(t.tasks.filter.all) });
      expect(all.textContent).toContain(String(2 + LIVE_CHECKS));
    });

    // **Opening a MENU writes nothing** (brief §4: the row is minted by the verb). This is
    // the distinction the first build got wrong — it created on `⋯`, so merely looking wrote.
    it('writes nothing when the ⋯ is merely opened on an untouched check', () => {
      tripTasks = [];
      show();
      fireEvent.click(autoRows()[0].querySelector('.wp-listrow-kebab') as HTMLElement);
      expect(created).toHaveLength(0);
      expect(screen.getByText(t.tasks.subject.derived)).toBeTruthy();
    });

    it('mints the overlay row when a verb is actually used on it', () => {
      tripTasks = [];
      show();
      fireEvent.click(autoRows()[0].querySelector('.wp-listrow-kebab') as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: t.tasks.manage.dismiss }));
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ status: TASK_STATUS.DISMISSED });
      expect((created[0] as { derivedKey?: string }).derivedKey).toBeTruthy();
    });

    it('offers no עריכה and no מחיקה on a check, and states why above them', () => {
      tripTasks = [];
      show();
      fireEvent.click(autoRows()[0].querySelector('.wp-listrow-kebab') as HTMLElement);
      expect(screen.getByText(t.tasks.subject.derived)).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.tasks.manage.edit })).toBeNull();
      expect(screen.queryByRole('button', { name: t.tasks.manage.delete })).toBeNull();
    });
  });
});

describe('?task= — a task named from outside the app (ADR-0197 §6)', () => {
  afterEach(() => {
    cleanup();
    tripTasks = ALL;
  });

  it('opens that task’s sheet on arrival', () => {
    // A notification about a deadline has to open THAT deadline. Before this the URL had no
    // way to name a task at all, so every task notification landed on the list.
    const target = ALL[0];
    show(() => {}, target.id);
    expect(document.querySelector('.task-sheet')).not.toBeNull();
  });

  it('opens nothing when no task is named', () => {
    show();
    expect(document.querySelector('.task-sheet')).toBeNull();
  });

  it('opens nothing for an id this trip does not have', () => {
    // A task deleted between the send and the tap. The list is the honest fallback — the
    // notification's subject is simply gone.
    show(() => {}, 'task-that-was-deleted');
    expect(document.querySelector('.task-sheet')).toBeNull();
  });

  it('waits for the task to ARRIVE rather than spending itself on an empty list', () => {
    // The cold-start case, and the reason the effect is keyed on both the id and the list:
    // a notification tap loads the app from nothing, so `tasks` is empty on the first
    // render and a one-shot keyed on the id alone would fire against it and open nothing.
    const target = ALL[0];
    tripTasks = [];
    const view = show(() => {}, target.id);
    expect(document.querySelector('.task-sheet')).toBeNull();

    tripTasks = ALL;
    view.rerender(
      wrap(
        <IndexTasksView
          onClose={() => {}}
          onOpenDocuments={openDocuments}
          initialTaskId={target.id}
        />,
      ),
    );
    expect(document.querySelector('.task-sheet')).not.toBeNull();
  });
});
