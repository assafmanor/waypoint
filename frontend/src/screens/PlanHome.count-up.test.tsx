// @vitest-environment jsdom
//
// **PlanHome's stat tiles count up rather than snapping to their value**
// (docs/backlog.md's "useCountUp" line; ADR-0143). `useCountUp` itself has no
// animation to prove wrong under `prefers-reduced-motion` (jsdom's default,
// with no `matchMedia` stubbed) — it resolves straight to the target, which is
// indistinguishable from a plain `{events.length}`. So this stubs `matchMedia`
// to report motion IS wanted and steps fake timers through the count, which is
// the only way to tell "wired to useCountUp" apart from "still a bare number."
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
} from '@waypoint/shared';
import type { Booking, Trip, TripEvent } from '@waypoint/shared';
import { COUNT_UP } from '../constants';
import { setSimulatedNow } from '../lib/useClock';
import { wrapNav } from '../test/nav-harness';
import { PlanHome } from './PlanHome';

// Pinned, same fixture shape as PlanHome.rebuff.test.tsx: an upcoming trip, so
// this exercises the main (non-past) StatTile block.
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

const bk = (id: string): Booking => ({
  id,
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: `booking ${id}`,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip,
    events: [ev('e1'), ev('e2')],
    bookings: [bk('b1')],
    places: [],
    documents: [],
    users: [{ id: 'u1' }],
    setActiveDate: () => {},
  }),
}));

vi.mock('../state/map-scope-state', () => ({
  usePlaceErrandReturn: () => {},
}));

const bookingsTile = () =>
  document.querySelector('.wp-stattile:nth-of-type(1) .wp-stattile-v') as HTMLElement;

describe('PlanHome — the stat tiles count up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSimulatedNow(Date.parse(NOW));
    // Motion IS wanted — the inverse of jsdom's own default — so the count-up
    // actually animates instead of resolving straight to the target.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setSimulatedNow(null);
    cleanup();
  });

  it('starts at 0 and counts up to the real booking count, not straight to it', () => {
    render(wrapNav(<PlanHome onNavigate={() => {}} />));
    // The count-up's own mount effect calls `setValue(0)` before arming the
    // interval — a plain `{bookings.length}` would show '1' from this first
    // paint on, so '0' here is the proof this tile is actually wired to the
    // hook and not still a bare number.
    expect(bookingsTile().textContent).toBe('0');
    act(() => {
      vi.advanceTimersByTime(COUNT_UP.STEP_MS * COUNT_UP.STEPS);
    });
    expect(bookingsTile().textContent).toBe('1');
  });
});
