import { describe, expect, it } from 'vitest';
import { BOOKING_SOURCE, BOOKING_TYPE, EVENT_KIND, EVENT_STATUS } from '@waypoint/shared';
import type { Booking, TripEvent } from '@waypoint/shared';
import { computeReadiness } from './readiness';

const NOW = '2026-07-01T00:00:00Z';

const event = (id: string, date: string): TripEvent => ({
  id,
  tripId: 't1',
  date,
  title: id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 1,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const booking = (id: string, type: Booking['type']): Booking => ({
  id,
  tripId: 't1',
  type,
  title: id,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

// A 3-day trip (05→07) for compact, obvious empty-day math.
const RANGE = { startDate: '2026-07-05', endDate: '2026-07-07' };

describe('computeReadiness', () => {
  it('marks every dimension complete → 100%', () => {
    const r = computeReadiness({
      ...RANGE,
      events: [event('a', '2026-07-05'), event('b', '2026-07-06'), event('c', '2026-07-07')],
      bookings: [booking('f', BOOKING_TYPE.FLIGHT), booking('h', BOOKING_TYPE.HOTEL)],
      memberCount: 3,
    });
    expect(r.pct).toBe(100);
    expect(r.emptyDates).toEqual([]);
    expect(r.checks.every((c) => c.done)).toBe(true);
  });

  it('lists empty days chronologically and fails the itinerary check', () => {
    const r = computeReadiness({
      ...RANGE,
      events: [event('a', '2026-07-06')], // 05 and 07 are empty
      bookings: [booking('f', BOOKING_TYPE.FLIGHT), booking('h', BOOKING_TYPE.HOTEL)],
      memberCount: 3,
    });
    expect(r.emptyDates).toEqual(['2026-07-05', '2026-07-07']);
    const itinerary = r.checks.find((c) => c.id === 'itinerary')!;
    expect(itinerary.done).toBe(false);
    expect(itinerary.count).toBe(2);
  });

  it('flags missing flights and lodging independently', () => {
    const r = computeReadiness({
      ...RANGE,
      events: [event('a', '2026-07-05'), event('b', '2026-07-06'), event('c', '2026-07-07')],
      bookings: [booking('h', BOOKING_TYPE.HOTEL)], // flight missing
      memberCount: 3,
    });
    expect(r.checks.find((c) => c.id === 'flights')!.done).toBe(false);
    expect(r.checks.find((c) => c.id === 'lodging')!.done).toBe(true);
  });

  it('treats a solo trip (only the creator) as an incomplete group', () => {
    const solo = computeReadiness({ ...RANGE, events: [], bookings: [], memberCount: 1 });
    expect(solo.checks.find((c) => c.id === 'group')!.done).toBe(false);
    const joined = computeReadiness({ ...RANGE, events: [], bookings: [], memberCount: 2 });
    expect(joined.checks.find((c) => c.id === 'group')!.done).toBe(true);
  });

  it('is a rounded fraction of the four checks (one of four done → 25%)', () => {
    const r = computeReadiness({
      ...RANGE,
      events: [], // all days empty
      bookings: [], // no flight, no lodging
      memberCount: 3, // only the group check passes
    });
    expect(r.pct).toBe(25);
  });
});
