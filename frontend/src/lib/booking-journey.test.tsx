// @vitest-environment jsdom
// The frontend's half of the pair (ADR-0154 §5): the rule itself is unit-tested in
// `@waypoint/shared`, so what is worth asserting here is the ONE thing this file adds —
// where the schedule comes from. A `Booking` carries none, so the ordering of a pair
// depends entirely on how the linked event is read, and reading it wrongly makes the
// earlier leg the return with no other symptom.
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

let tripBookings: Booking[] = [];
let tripEvents: TripEvent[] = [];
vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Jerusalem', startDate: '2026-08-15', endDate: '2026-08-20' },
    zoneCrossings: [],
    users: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
    },
    bookings: tripBookings,
    events: tripEvents,
  }),
}));

import { useRoundTripPartner, type RoundTripPartner } from './booking-journey';

const bk = (id: string, from: string, to: string): Booking => ({
  id,
  tripId: 't1',
  type: BOOKING_TYPE.TRAIN,
  title: id,
  fromPlaceId: from,
  toPlaceId: to,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
});
const ev = (bookingId: string, when: { date: string; startsAt?: string }): TripEvent => ({
  id: `e-${bookingId}`,
  tripId: 't1',
  title: bookingId,
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  bookingId,
  sortOrder: 0,
  source: EVENT_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...when,
});

const out = bk('b-out', 'pl-a', 'pl-b');
const back = bk('b-back', 'pl-b', 'pl-a');

function read(booking: Booking): RoundTripPartner | null {
  let seen: RoundTripPartner | null = null;
  function Probe() {
    seen = useRoundTripPartner(booking);
    return null;
  }
  render(<Probe />);
  return seen;
}

describe('useRoundTripPartner', () => {
  afterEach(() => {
    cleanup();
    tripBookings = [];
    tripEvents = [];
  });

  it('orders the pair by the linked events, not by list order', () => {
    tripBookings = [back, out];
    tripEvents = [
      ev('b-out', { date: '2026-07-19', startsAt: '2026-07-19T04:00:00Z' }),
      ev('b-back', { date: '2026-07-28', startsAt: '2026-07-28T04:00:00Z' }),
    ];
    expect(read(out)).toMatchObject({ partner: back, leg: 'back' });
    expect(read(back)).toMatchObject({ partner: out, leg: 'out' });
  });

  // A leg scheduled to a DAY but not to an instant is still placed. Reading it as
  // unscheduled would let the earlier journey be called the return.
  it('orders a day-only leg by its date', () => {
    tripBookings = [out, back];
    tripEvents = [ev('b-out', { date: '2026-07-19' }), ev('b-back', { date: '2026-07-28' })];
    expect(read(back)).toMatchObject({ partner: out, leg: 'out' });
  });

  it('hands back the partner’s own event, so a surface can state when it is', () => {
    tripBookings = [out, back];
    tripEvents = [ev('b-back', { date: '2026-07-28', startsAt: '2026-07-28T04:00:00Z' })];
    expect(read(out)?.partnerEvent?.startsAt).toBe('2026-07-28T04:00:00Z');
    // And nothing to state when the partner has no slot yet.
    expect(read(back)?.partnerEvent).toBeUndefined();
  });

  it('is null for no booking at all — the create form has nothing to pair', () => {
    tripBookings = [out, back];
    expect(read(null as unknown as Booking)).toBeNull();
  });
});
