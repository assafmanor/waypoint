// @vitest-environment jsdom
//
// The per-day transition row (ADR-0064 §B). It had no test of its own until the row's
// TITLE became a decision (2026-08-06) rather than a pass-through of `event.title`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { TransitionRow } from './TransitionRow';
import type { TransitionEntry } from '../lib/day-entries';

afterEach(cleanup);

const base = { tripId: 't', createdAt: '', updatedAt: '', updatedBy: 'u' };
const event = (title: string): TripEvent =>
  ({
    ...base,
    id: 'e',
    bookingId: 'fl',
    date: '2026-08-06',
    title,
    kind: EVENT_KIND.HARD,
    status: EVENT_STATUS.PLANNED,
    source: EVENT_SOURCE.MANUAL,
    sortOrder: 0,
    startsAt: '2026-08-05T19:00:00Z',
    endsAt: '2026-08-05T23:00:00Z',
  }) as TripEvent;
const flight: Booking = {
  ...base,
  id: 'fl',
  type: BOOKING_TYPE.FLIGHT,
  title: 'x',
  source: BOOKING_SOURCE.MANUAL,
  fromPlaceId: 'fra',
  toPlaceId: 'tlv',
} as Booking;

/** The reported title: a route whose origin carries a long parenthesised official name. */
const ROUTE = 'פרנקפורט (Frankfurter Flughafen – FRA) ← בן גוריון';

const row = (edge: 'start' | 'end', title = ROUTE) => {
  const entry: TransitionEntry = {
    kind: 'transition',
    event: event(title),
    edge,
    atMs: Date.parse('2026-08-05T23:00:00Z'),
    labelKey: 'flightArrival',
  };
  render(<TransitionRow entry={entry} tz="Asia/Jerusalem" bookings={[flight]} onOpen={vi.fn()} />);
  return document.querySelector('.tr-title')!.textContent ?? '';
};

// **THE ROW IS ABOUT ONE END OF THE ROUTE, and its own label already says which** (owner,
// 2026-08-06: _"the landing row is very long and unreadable, perhaps we should just display the
// relevant place?"_). The other endpoint is not context — it is the half that pushed the
// relevant one off the row, and it truncated the wrong way round: the airport you left survived
// in full and the one you landed at was cut to a single letter.
describe('a transition row names the end it is about', () => {
  it('an arrival names where you landed, not where you took off', () => {
    const title = row('end');
    expect(title).toContain('בן גוריון');
    expect(title).not.toContain('פרנקפורט');
  });

  it('a departure names where you left from', () => {
    const title = row('start');
    expect(title).toContain('פרנקפורט');
    expect(title).not.toContain('בן גוריון');
  });

  // The arrow is the route's, and a row showing one end has no route to draw.
  it('drops the route arrow with it', () => {
    expect(row('end')).not.toContain('←');
  });

  // Shortened by the same `shortPlaceLabel` every other glanceable route surface uses — which
  // strips CATEGORY noise and deliberately not a parenthesised official name, so a long one
  // survives on the departure row. Asserted rather than glossed: halving the row is what this
  // change buys, and `פרנקפורט (Frankfurter Flughafen – FRA)` is still a long half.
  it('does not invent a shortening `shortPlaceLabel` does not do', () => {
    expect(row('start')).toContain('Frankfurter Flughafen');
  });

  // NOT A ROUTE, NOT TOUCHED: an ordinary event keeps the name someone gave it.
  it('leaves a non-route title exactly as it is', () => {
    expect(row('end', 'ארוחת ערב אצל יוקי')).toContain('ארוחת ערב אצל יוקי');
  });
});
