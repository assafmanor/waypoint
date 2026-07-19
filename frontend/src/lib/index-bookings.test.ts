import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { type Trip } from '@waypoint/shared';
import { scheduleLabel, splitBookings } from './index-bookings';

const TZ = 'Asia/Tokyo';
const NOW = Date.parse('2026-07-07T12:00:00+09:00'); // "today" = 2026-07-07 in Tokyo
const ISO = '2026-07-01T00:00:00Z';

const booking = (
  id: string,
  title: string,
  type: Booking['type'] = BOOKING_TYPE.HOTEL,
): Booking => ({
  id,
  tripId: 't1',
  type,
  title,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

const linkedEvent = (
  bookingId: string,
  date: string,
  hhmm = '09:00',
  endHhmm?: string,
): TripEvent => ({
  id: `ev-${bookingId}`,
  tripId: 't1',
  date,
  title: 'x',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  startsAt: `${date}T${hhmm}:00+09:00`,
  ...(endHhmm ? { endsAt: `${date}T${endHhmm}:00+09:00` } : {}),
  bookingId,
  sortOrder: 1,
  source: 'manual',
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

/** Strip a linked event's clock times, leaving only its calendar date. */
const untimed = (event: TripEvent): TripEvent => {
  const bare = { ...event };
  delete bare.startsAt;
  delete bare.endsAt;
  return bare;
};

/** Turn a single-day linked event into a multi-day span (check-in → check-out). */
const span_ = (event: TripEvent, endDate: string, hhmm: string): TripEvent => ({
  ...event,
  endDate,
  endsAt: `${endDate}T${hhmm}:00+09:00`,
});

const TRIP = { startDate: '2026-07-05', timezone: TZ } as Trip;

describe('splitBookings', () => {
  it('files a booking whose linked event is before today under past', () => {
    const b = booking('b1', 'old');
    const { past, upcoming } = splitBookings([b], [linkedEvent('b1', '2026-07-05')], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
    expect(past[0].event?.id).toBe('ev-b1');
  });

  it('files a same-day booking under past once its end instant has passed', () => {
    // arrives 11:00, now is 12:00 — behind you, even though it is still "today"
    const b = booking('b1', 'landed');
    const { past, upcoming } = splitBookings(
      [b],
      [linkedEvent('b1', '2026-07-07', '09:00', '11:00')],
      TZ,
      NOW,
    );
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
  });

  it('keeps a same-day booking upcoming while its end instant is still ahead', () => {
    // starts 14:00 / ends 16:00, now is 12:00 — still to come
    const b = booking('b1', 'later today');
    const { past, upcoming } = splitBookings(
      [b],
      [linkedEvent('b1', '2026-07-07', '14:00', '16:00')],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('files a same-day end-less booking under past once its single moment has passed', () => {
    const b = booking('b1', 'departed'); // departs 09:00, no arrival time; now 12:00
    const { past } = splitBookings([b], [linkedEvent('b1', '2026-07-07', '09:00')], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
  });

  it('keeps an untimed booking on today upcoming until midnight', () => {
    const b = booking('b1', 'no clock time');
    const { past, upcoming } = splitBookings(
      [b],
      [untimed(linkedEvent('b1', '2026-07-07'))],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('treats an unlinked booking as upcoming and sorts it after scheduled ones', () => {
    const scheduled = booking('b1', 'scheduled');
    const loose = booking('b2', 'loose');
    const { upcoming, past } = splitBookings(
      [loose, scheduled],
      [linkedEvent('b1', '2026-07-09')],
      TZ,
      NOW,
    );
    expect(past).toHaveLength(0);
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1', 'b2']);
    expect(upcoming[1].event).toBeUndefined();
  });

  it('orders scheduled rows chronologically', () => {
    const early = booking('b1', 'early');
    const late = booking('b2', 'late');
    const { upcoming } = splitBookings(
      [late, early],
      [linkedEvent('b2', '2026-07-10', '08:00'), linkedEvent('b1', '2026-07-08', '08:00')],
      TZ,
      NOW,
    );
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1', 'b2']);
  });

  it('keeps an in-progress multi-day stay upcoming until its check-out passes', () => {
    const b = booking('b1', 'hotel'); // checked in 07-05, checks out 07-09; today is 07-07
    const span = span_(linkedEvent('b1', '2026-07-05', '15:00'), '2026-07-09', '11:00');
    const { past, upcoming } = splitBookings([b], [span], TZ, NOW);
    expect(upcoming.map((r) => r.booking.id)).toEqual(['b1']);
    expect(past).toHaveLength(0);
  });

  it('files a multi-day stay under past only after its check-out day', () => {
    const b = booking('b1', 'hotel'); // checked out 07-06, before today (07-07)
    const span = span_(linkedEvent('b1', '2026-07-04', '15:00'), '2026-07-06', '11:00');
    const { past, upcoming } = splitBookings([b], [span], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
  });
});

describe('scheduleLabel (span-aware, ADR-0053)', () => {
  const hotel = booking('h', 'hotel', BOOKING_TYPE.HOTEL);

  it('shows the check-in time before the stay begins', () => {
    const ev = span_(linkedEvent('h', '2026-07-10', '15:00'), '2026-07-14', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07, before check-in
    expect(label).toContain('צ׳ק-אין');
    expect(label).toContain('15:00');
    expect(label).not.toContain('צ׳ק-אאוט');
  });

  it('shows the check-out day (no time) mid-stay', () => {
    const ev = span_(linkedEvent('h', '2026-07-05', '15:00'), '2026-07-14', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07, mid-stay
    expect(label).toContain('צ׳ק-אאוט');
    expect(label).not.toContain('11:00');
    expect(label).not.toContain('צ׳ק-אין');
  });

  it('shows the check-out time on the check-out day', () => {
    const ev = span_(linkedEvent('h', '2026-07-04', '15:00'), '2026-07-07', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07 = check-out day
    expect(label).toContain('צ׳ק-אאוט');
    expect(label).toContain('היום');
    expect(label).toContain('11:00');
  });

  it('shows the check-in day on the check-in day itself', () => {
    const ev = span_(linkedEvent('h', '2026-07-07', '15:00'), '2026-07-10', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07 = check-in day
    expect(label).toContain('צ׳ק-אין');
    expect(label).toContain('היום');
    expect(label).toContain('15:00');
  });
});
