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
import { BEAT } from '../lib/one-shot';
import type { CheckId } from '../lib/readiness';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';
import { PLAN_TASK_CAP } from '../constants';
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

/** **A trip with nothing left to prepare** — the state ADR-0193 §4 read as unreachable, and
 *  the only one in which the hero is not a control. Satisfying the five checks from real data
 *  would take a round-trip pair of placed flights, a bed for every night, an event on every
 *  date and two passports; a ticked overlay row per check reaches the same resolution
 *  (`automaticTasks`: a human answer wins in both directions) without pinning this test to
 *  `computeReadiness`' inputs, which are not its subject. */
const allChecksAnswered = (): Task[] =>
  (['flights', 'lodging', 'itinerary', 'documents', 'group'] satisfies CheckId[]).map((key) =>
    task(key, { derivedKey: key, status: TASK_STATUS.DONE }),
  );

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
/** The OPEN list's card. The completed drawer is a `.checklist` too, so a bare
 *  `.checklist .tsk-auto` counts the ticked checks as though they were still live. */
const openCard = () => document.querySelector('.checklist')!;
const show = () => render(wrapNav(<PlanHome onNavigate={() => {}} />));

describe('PlanHome — the list counts everything open', () => {
  beforeEach(() => setSimulatedNow(Date.parse(NOW)));
  afterEach(() => {
    setSimulatedNow(null);
    tasks = [];
    cleanup();
  });

  // **THE STRIPE** (owner, 2026-08-16: _"when there are no items there's just a stripe"_).
  // The card is `.checklist`, a 1px-bordered box — so a card holding only a COLLAPSED drawer
  // painted as a 2px line under the section title while two open tasks sat folded inside it.
  // Both were due in 16 days, which the retired near/far split classed as "far".
  //
  // The guard is not "the stripe is gone" but the invariant that makes it unreachable: **if
  // anything is open, a row is on screen.** A cap cannot break it — the first N of a list is
  // never zero — where a predicate could, and did.
  it('always shows a row when anything is open, whatever its deadline', () => {
    tasks = [
      task('a', { title: 'לקנות נעלי טיולים', dueAt: '2026-08-27T12:00:00Z' }),
      task('b', { title: 'לקנות מעיל', dueAt: '2026-08-27T12:00:00Z' }),
    ];
    show();
    expect(document.querySelectorAll('.checklist .wp-listrow').length).toBeGreaterThan(0);
    expect(screen.getByText('לקנות נעלי טיולים')).toBeTruthy();
    expect(screen.getByText('לקנות מעיל')).toBeTruthy();
    // …and nothing claims the trip is done while they are open.
    expect(screen.queryByText(t.planHome.checklist.emptyTitle)).toBeNull();
  });

  // The empty state itself — a block, not the 11px hint it used to be, and inside the card
  // so the section keeps one silhouette. Only reachable when the checks are satisfied too.
  it('shows the empty state as a block when genuinely nothing is open', () => {
    tasks = [...allChecksAnswered(), task('a', { status: TASK_STATUS.DONE })];
    show();
    expect(openCard().querySelectorAll('.wp-listrow')).toHaveLength(0);
    expect(screen.getByText(t.planHome.checklist.emptyTitle)).toBeTruthy();
    expect(openCard().querySelector('.fb-empty')).toBeTruthy();
  });

  // An undated task is a row like any other now — no window, no fold of its own. Before the
  // widening it was invisible while open and appeared under `הושלמו` the moment it was ticked.
  it('shows an undated open task as an ordinary row', () => {
    tasks = [task('u', { title: 'לקנות מתאם חשמל' })];
    show();
    expect(screen.getByText('לקנות מתאם חשמל')).toBeTruthy();
  });

  // The fold is a CAP: it appears only past `PLAN_TASK_CAP`, and it names its remainder.
  it('folds only past the cap, and says how many it folded', () => {
    tasks = Array.from({ length: 9 }, (_, i) =>
      task(`t${i}`, { title: `משימה ${i}`, dueAt: `2026-08-2${i}T12:00:00Z` }),
    );
    show();
    const shown = document.querySelectorAll('.checklist .wp-listrow').length;
    const more = document.querySelector('.chk-more-row');
    expect(more).toBeTruthy();
    // The drawer renders its rows collapsed, so count what is ABOVE the fold instead.
    expect(shown).toBeGreaterThanOrEqual(PLAN_TASK_CAP);
    fireEvent.click(more!);
    expect(document.querySelector('.chk-more-row')!.getAttribute('aria-expanded')).toBe('true');
  });

  // §2's second number, and **it counts the readiness checks too** (owner, 2026-08-16: _"in
  // the hero it says משימות פתוחות X which doesn't include the automatic tasks"_). ADR-0190
  // §1 as amended settled that a check IS an open task, and `taskPreview` has counted them
  // for the Index tile ever since — so the hero reusing that function is what stops two
  // surfaces answering one question with two numbers.
  it('counts the readiness checks in the hero, not just the manual tasks', () => {
    tasks = [task('late', { dueAt: '2026-08-01T12:00:00Z' }), task('u')];
    show();
    const hero = prep() as HTMLElement;
    expect(within(hero).getByText(t.planHome.prep.openTasks)).toBeTruthy();
    // The fixture has live checks, so the count must exceed the two manual tasks — the exact
    // number is `computeReadiness`' business and asserting it here would pin this test to a
    // derivation it is not about.
    const shown = Number(hero.querySelector('.prep-tasks-n')!.textContent);
    const liveChecks = document.querySelectorAll('.checklist .tsk-auto').length;
    expect(liveChecks).toBeGreaterThan(0);
    expect(shown).toBe(2 + liveChecks);
    // …and overdue stays manual by construction: a check has no `dueAt` to have passed.
    expect(within(hero).getByText(t.tasks.band.overdue(1))).toBeTruthy();
  });

  // Absent at zero — there is no "0 משימות פתוחות" state (ADR-0045 in one line). With the
  // checks counted, "nothing open" means the checks are satisfied too, which is what
  // `allChecksAnswered` sets up.
  it('carries no task readout when nothing at all is open', () => {
    tasks = allChecksAnswered();
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
    // the fixture's live checks fill `PLAN_TASK_CAP` on their own, which is the next
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
    expect(shown).toBe(PLAN_TASK_CAP);
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
    tasks = allChecksAnswered();
    show();
    expect(openCard().querySelectorAll('.tsk-auto')).toHaveLength(0);
    expect(prep().tagName).toBe('DIV');
  });

  // **THE EMPTY PRESS IS STILL ANSWERED** (owner, 2026-08-17). ADR-0193 §4 retired §H's
  // rebuff on the reasoning that there is no state where the card is pressable and empty —
  // the state exists, it is a trip with nothing left to prepare, and a tap there did nothing
  // at all. Same beat, same shared rule, as the Trip board (§Q).
  it('answers a press with the rebuff beat when there is nothing to lift', () => {
    vi.useFakeTimers();
    try {
      tasks = allChecksAnswered();
      show();
      expect(prep().className).not.toContain(BEAT.REBUFF);
      fireEvent.click(prep());
      expect(prep().className).toContain(BEAT.REBUFF);
      // Nothing opened: the beat is the whole answer.
      expect(document.querySelector('.prep-lifted')).toBeNull();
      // It is the RISE, not the form-refusal shake — pressing something that was never a
      // control is not an error.
      expect(prep().className).not.toContain(BEAT.NUDGE);
      // jsdom cannot read `--t-base`, so `motionDurationMs` answers 0 and the removal is the
      // next task (`lib/one-shot.ts`) — which is what lets a second press be felt again.
      vi.advanceTimersByTime(1);
      expect(prep().className).not.toContain(BEAT.REBUFF);
      fireEvent.click(prep());
      expect(prep().className).toContain(BEAT.REBUFF);
    } finally {
      vi.useRealTimers();
    }
  });

  // …and it must not fire on the way into the run-up, which is the whole of the other state.
  it('does not rebuff a hero that has something to lift', () => {
    tasks = [task('a', { title: 'להוציא ביטוח' })];
    show();
    fireEvent.click(prep());
    expect(document.querySelector('.prep-lifted')).toBeTruthy();
    expect(document.querySelector(`.${BEAT.REBUFF}`)).toBeNull();
  });
});
