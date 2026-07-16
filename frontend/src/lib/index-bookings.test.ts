import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { splitBookings } from './index-bookings';

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

const linkedEvent = (bookingId: string, date: string, hhmm = '09:00'): TripEvent => ({
  id: `ev-${bookingId}`,
  tripId: 't1',
  date,
  title: 'x',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  startsAt: `${date}T${hhmm}:00+09:00`,
  bookingId,
  sortOrder: 1,
  source: 'manual',
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

describe('splitBookings', () => {
  it('files a booking whose linked event is before today under past', () => {
    const b = booking('b1', 'old');
    const { past, upcoming } = splitBookings([b], [linkedEvent('b1', '2026-07-05')], TZ, NOW);
    expect(past.map((r) => r.booking.id)).toEqual(['b1']);
    expect(upcoming).toHaveLength(0);
    expect(past[0].event?.id).toBe('ev-b1');
  });

  it('keeps a same-day linked booking upcoming (today is not past)', () => {
    const b = booking('b1', 'today');
    const { past, upcoming } = splitBookings([b], [linkedEvent('b1', '2026-07-07')], TZ, NOW);
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
});
