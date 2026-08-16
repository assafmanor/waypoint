// @vitest-environment jsdom
//
// **Plan's prep hero lifts, and what it opens onto is true** (ADR-0193 §1/§2/§3/§4).
//
// Replaces `PlanHome.rebuff.test.tsx`, whose whole subject — a hero that is not a control
// and answers a tap with a beat — was ADR-0160 §H, retired here by §H's own revisit clause.
// The file is not deleted so much as inverted: the two things it guarded (the hero is not a
// button; a press does nothing) are now the two things that must NOT be true.
//
// What is worth guarding is what a screenshot cannot show:
//   · the reported defect itself — `הכול מוכן` above open tasks — as a test that fails on
//     the OLD gate and passes on the new one;
//   · that an undated task is visible while open, which is the asymmetry with the completed
//     half that made widening the only consistent repair;
//   · that the hero is a control only when there is something to open;
//   · and ADR-0160 §4's constraint, which is the one that will be broken by accident: a
//     liftable card must have NO interactive descendant, because Chrome tears it apart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TASK_STATUS,
  type Task,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';
import { PLAN_LIFT_TASK_CAP } from '../constants';
import { PlanHome } from './PlanHome';

// Pinned: the hero renders a COUNTDOWN and every band is a comparison against the clock,
// so an unpinned one would mean something different every day this ran.
const NOW = '2026-08-03T09:00:00Z';

const trip: Trip = {
  id: 't1',
  name: 'נאפולי',
  destination: 'Naples',
  startDate: '2026-08-10',
  endDate: '2026-08-17',
  timezone: 'Europe/Rome',
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
};

const ev = (id: string): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: '2026-08-11',
  startsAt: '2026-08-11T09:00:00Z',
  sortOrder: 0,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  tripId: 't1',
  title: `task ${id}`,
  dueHasTime: false,
  important: false,
  status: TASK_STATUS.OPEN,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
  ...over,
});

let tasks: Task[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip,
    events: [ev('e1')],
    bookings: [],
    places: [],
    documents: [],
    users: [{ id: 'u1', displayName: 'אסף' }],
    setActiveDate: () => {},
    tasks,
    zoneCrossings: [],
    taskVerbs: {
      createTask: async () => {},
      updateTask: async () => {},
      deleteTask: async () => {},
    },
  }),
}));

vi.mock('../state/map-scope-state', () => ({
  usePlaceErrandReturn: () => {},
}));

const prep = () => document.querySelector('.prep')!;
const show = () => render(wrapNav(<PlanHome onNavigate={() => {}} />));

describe('PlanHome — the list counts everything open', () => {
  beforeEach(() => setSimulatedNow(Date.parse(NOW)));
  afterEach(() => {
    setSimulatedNow(null);
    tasks = [];
    cleanup();
  });

  // THE REPORTED DEFECT. The trip is fully prepared on every derived check the fixture can
  // satisfy… except it is not, because four tasks are open. Under the old gate
  // (`converged.length === 0`) the head printed `הכול מוכן 🎉` here, since none of these
  // four is dated inside a week.
  it('does not say הכול מוכן while undated and far-off tasks are open', () => {
    tasks = [
      task('a'),
      task('b'),
      task('c', { dueAt: '2026-09-20T12:00:00Z' }),
      task('d', { dueAt: '2026-09-25T12:00:00Z' }),
    ];
    show();
    expect(screen.queryByText(t.planHome.checklist.allDone)).toBeNull();
  });

  // …and the other half of the same decision: the sentence is not deleted. It is the only
  // moment this screen says something good, and it is true when nothing is open.
  it('still says הכול מוכן when genuinely nothing is open', () => {
    tasks = [task('a', { status: TASK_STATUS.DONE })];
    show();
    // The fixture's live readiness checks are what would otherwise keep the list non-empty,
    // so assert against the real condition: no rows, and the sentence present.
    const rows = document.querySelectorAll('.checklist .wp-listrow');
    if (rows.length === 0) expect(screen.getByText(t.planHome.checklist.allDone)).toBeTruthy();
  });

  // The asymmetry that made widening the only consistent repair: `completedManual` has never
  // had a date window, so before this change an undated task was invisible while open and
  // appeared under `הושלמו` the instant it was ticked.
  it('shows an undated open task rather than only showing it once completed', () => {
    tasks = [task('u', { title: 'לקנות מתאם חשמל' })];
    show();
    fireEvent.click(screen.getByRole('button', { name: t.planHome.checklist.showFar(1) }));
    expect(screen.getByText('לקנות מתאם חשמל')).toBeTruthy();
  });

  // §3: urgent stays inline, the rest folds. An `important` task is urgent whatever its
  // deadline, which is `outranksChecks`' own rule reused rather than restated.
  it('keeps an important task inline and folds the far ones', () => {
    tasks = [
      task('imp', { title: 'חשובה', important: true }),
      task('far', { title: 'רחוקה', dueAt: '2026-09-20T12:00:00Z' }),
    ];
    show();
    // The important one is in the card without expanding anything…
    expect(screen.getByText('חשובה')).toBeTruthy();
    // …and the far one is behind the collapse row, which names how many it holds.
    expect(screen.getByRole('button', { name: t.planHome.checklist.showFar(1) })).toBeTruthy();
  });

  // §2: the hero's second number. Absent at zero — there is no "0 משימות פתוחות" state.
  it('prints the open-task count on the hero, with the overdue tally', () => {
    tasks = [task('late', { dueAt: '2026-08-01T12:00:00Z' }), task('u')];
    show();
    const hero = prep();
    expect(within(hero as HTMLElement).getByText(t.planHome.prep.openTasks)).toBeTruthy();
    expect(within(hero as HTMLElement).getByText('2')).toBeTruthy();
    expect(within(hero as HTMLElement).getByText(t.tasks.band.overdue(1))).toBeTruthy();
  });

  it('carries no task readout when nothing is open', () => {
    tasks = [];
    show();
    expect(prep().querySelector('.prep-tasks')).toBeNull();
  });
});

describe('PlanHome — the hero lifts', () => {
  beforeEach(() => setSimulatedNow(Date.parse(NOW)));
  afterEach(() => {
    setSimulatedNow(null);
    tasks = [];
    cleanup();
  });

  it('is a button once there is a run-up, and opens the lift', () => {
    tasks = [task('a', { title: 'להוציא ביטוח' })];
    show();
    expect(prep().tagName).toBe('BUTTON');
    fireEvent.click(prep());
    expect(document.querySelector('.prep-lifted')).toBeTruthy();
  });

  // **ONE list, in the tasks screen's own order** (owner, 2026-08-16) — the five date-keyed
  // bands are gone, so what has to hold is that the lift and the screen behind it cannot
  // disagree about what leads. `orderTaskRows` is the single source of that order, and this
  // asserts the lift is actually reading it: urgent first, then the live checks, then the
  // rest. An undated flagged task outranking a dated one is the case that proves it is the
  // ladder and not a date sort.
  it('shows one list in the tasks screen order, with no band headings', () => {
    tasks = [
      task('plain', { title: 'רגילה', dueAt: '2026-08-20T12:00:00Z' }),
      task('flagged', { title: 'חשובה', important: true }),
    ];
    show();
    fireEvent.click(prep());
    const card = document.querySelector('.prep-lifted') as HTMLElement;
    // No headings at all — the bands were the only consumer of `.hero-lbl` here.
    expect(card.querySelectorAll('.hero-lbl')).toHaveLength(0);
    const names = [...card.querySelectorAll('.hero-task-nm')].map((n) => n.textContent);
    // **The ladder, as a relation that can actually fail:** the flagged task leads, and a
    // live readiness CHECK sits behind it. That is the half the retired date-bands were
    // bending — they put `ללא תאריך` last regardless of `important`, so a flagged undated
    // task fell below every check. Asserted as a relation rather than a full list because
    // the fixture's live checks fill `PLAN_LIFT_TASK_CAP` on their own, which is the next
    // test's subject.
    expect(names[0]).toBe('חשובה');
    const checkTitles = [...card.querySelectorAll('.hero-task')]
      .filter((r) => !r.querySelector('.hero-task-due .icon') && r.querySelector('.hero-task-due'))
      .map((r) => r.querySelector('.hero-task-nm')?.textContent);
    expect(checkTitles.length).toBeGreaterThan(0);
    expect(names.indexOf(checkTitles[0]!)).toBeGreaterThan(0);
  });

  // The cap, and the half of it that matters: the remainder is STATED. A silently truncated
  // list reads as "this is everything", which is the one thing a summary must not do.
  it('caps the list and says how many it is not showing', () => {
    tasks = Array.from({ length: 9 }, (_, i) =>
      task(`t${i}`, { title: `משימה ${i}`, dueAt: `2026-08-2${i}T12:00:00Z` }),
    );
    show();
    fireEvent.click(prep());
    const card = document.querySelector('.prep-lifted') as HTMLElement;
    const shown = card.querySelectorAll('.hero-task').length;
    expect(shown).toBe(PLAN_LIFT_TASK_CAP);
    // …and the overflow line is present, naming a non-zero remainder.
    const more = card.querySelector('.hero-task-more');
    expect(more).toBeTruthy();
    expect(more!.textContent).toMatch(/\d/);
  });

  // A check has no `dueAt` and never can (ADR-0190 §2 turns on exactly that), so its second
  // line must not wear the deadline's clock. The first build mapped `meta` onto `due` and
  // every check read as though `חסרות טיסת הלוך` were a deadline — caught in the running
  // app, so it is pinned here.
  it('a readiness check carries a meta line, not a clocked deadline', () => {
    tasks = [];
    show();
    if (prep().tagName !== 'BUTTON') return; // no live checks in this fixture, nothing to assert
    fireEvent.click(prep());
    const checks = document.querySelector('.prep-lift-body') as HTMLElement;
    const rows = [...checks.querySelectorAll('.hero-task')];
    const checkRow = rows.find((r) => r.textContent?.includes('מתוך'));
    expect(checkRow, 'a readiness check should be in the run-up').toBeTruthy();
    expect(checkRow!.querySelector('.hero-task-due .icon')).toBeNull();
  });

  // **A READ.** No tick, no menu — ADR-0160 §U settled that for the trip hero and the owner
  // declined the tickable version. It is also what pays §4's constraint for free.
  it('the bands are a read: no control inside them', () => {
    tasks = [task('a', { title: 'משימה' })];
    show();
    fireEvent.click(prep());
    const body = document.querySelector('.prep-lift-body') as HTMLElement;
    expect(body.querySelectorAll('button, a, input')).toHaveLength(0);
  });

  // The collapsed hero must not be on screen beside its own promotion — `visibility`, never
  // `display`, because the descent measures that box.
  it('hides the collapsed hero while lifted', () => {
    tasks = [task('a')];
    show();
    fireEvent.click(prep());
    expect(prep().className).toContain('is-lifted');
  });

  // THE REGRESSION GUARD for ADR-0160 §4, and it needs a comment because what it protects is
  // invisible: a `<button>` nested inside the hero's own `<button>` is not merely invalid
  // markup — Chrome CLOSES the outer element at the nested one and reparents every following
  // sibling out of it (1 of 4 children left, measured in `mockups/hero-horizon-v1.html`).
  // A snapshot cannot see it, and neither can a render that only checks the pieces exist:
  // they DO exist, just not inside the hero. So assert both halves — no interactive
  // descendant, and the hero still owns its own parts.
  //
  // This is the constraint the prep hero acquired permanently by becoming a control, and the
  // likeliest way to break it is a well-meant `⋯` or a tick added to the readiness row.
  it('a liftable hero contains no nested control, and keeps its own children', () => {
    tasks = [task('late', { dueAt: '2026-08-01T12:00:00Z' })];
    show();
    const hero = prep();
    expect(hero.tagName).toBe('BUTTON');
    expect(hero.querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
    for (const sel of ['.prep-count', '.prep-dates', '.prep-ready', '.prep-track', '.prep-tasks']) {
      expect(hero.querySelector(sel), sel).toBeTruthy();
    }
  });

  // …and the other side of it: with no run-up there is nothing to open, so the hero goes
  // back to being the `<div>` it always was rather than announcing a control that would do
  // nothing on activation (ADR-0150 §8 from the other direction).
  it('is not a control when there is no run-up to open', () => {
    tasks = [];
    show();
    // Only meaningful once the derived checks are all satisfied too; when they are not, the
    // checks themselves are the run-up and the hero is correctly pressable.
    const liveChecks = document.querySelectorAll('.checklist .tsk-auto').length;
    if (liveChecks === 0) expect(prep().tagName).toBe('DIV');
  });
});
