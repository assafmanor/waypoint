// @vitest-environment jsdom
//
// **Plan's prep hero answers a tap, and answers with nothing more** (ADR-0160 §H).
//
// Its own file, and the first test PlanHome has, because what is worth guarding here is a
// pair of decisions that a screenshot cannot show and that read as omissions rather than
// choices: the hero is NOT a control, and the beat it plays is NOT the form-refusal shake.
// Both are easy to "fix" into the wrong thing later.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { BEAT } from '../lib/one-shot';
import { setSimulatedNow } from '../lib/useClock';
import { wrapNav } from '../test/nav-harness';
import { PlanHome } from './PlanHome';

// Pinned: the prep hero renders a COUNTDOWN, so which branch it takes is a function of the
// clock, and an unpinned one would mean something different every day this ran.
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

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip,
    events: [ev('e1')],
    bookings: [],
    places: [],
    documents: [],
    users: [{ id: 'u1' }],
    setActiveDate: () => {},
  }),
}));

vi.mock('../state/map-scope-state', () => ({
  usePlaceErrandReturn: () => {},
}));

const prep = () => document.querySelector('.prep')!;

describe('PlanHome — the prep hero rebuffs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSimulatedNow(Date.parse(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
    setSimulatedNow(null);
    cleanup();
  });

  const show = () => render(wrapNav(<PlanHome onNavigate={() => {}} />));

  it('plays the rebuff beat on a tap, and takes it back off', () => {
    show();
    expect(prep().className).not.toContain(BEAT.REBUFF);
    fireEvent.click(prep());
    expect(prep().className).toContain(BEAT.REBUFF);
    // jsdom cannot read `--t-base`, so `motionDurationMs` answers 0 and the removal is the
    // next task rather than 240ms out (`lib/one-shot.ts`'s own note).
    vi.advanceTimersByTime(1);
    expect(prep().className).not.toContain(BEAT.REBUFF);
  });

  // The rebuff is a RISE that settles back. The nudge is a lateral shake meaning something
  // is WRONG, and a tap on a surface that was never a control is not an error — reusing it
  // here would say the wrong thing in the one channel this feature has.
  it('is the rebuff and not the form-refusal nudge', () => {
    show();
    fireEvent.click(prep());
    expect(prep().className).toContain('is-rebuffing');
    expect(prep().className).not.toContain('is-nudging');
  });

  // Trip's board is a `<button>` because it opens the lifted horizon. This hero opens
  // nothing — its depth is the checklist directly beneath it — so announcing a control and
  // then doing nothing when it is activated would be a promise it cannot keep.
  it('is not a control: no button, no role, no tab stop', () => {
    show();
    expect(prep().tagName).toBe('DIV');
    expect(prep().getAttribute('role')).toBeNull();
    expect(prep().getAttribute('tabindex')).toBeNull();
    // The checklist's own CTAs are still the buttons on this screen, so this is not a
    // screen with no controls — it is a hero that is not one of them.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(prep().querySelector('button')).toBeNull();
  });

  it('a second tap is felt again rather than doing nothing', () => {
    show();
    fireEvent.click(prep());
    vi.advanceTimersByTime(1);
    expect(prep().className).not.toContain(BEAT.REBUFF);
    fireEvent.click(prep());
    expect(prep().className).toContain(BEAT.REBUFF);
  });
});
