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
import {
  CATEGORY_ALL,
  matchesCategory,
  matchesQuery,
  scheduleLabel,
  splitBookings,
  visibleRows,
} from './index-bookings';
import { FILTER_STAGGER_MAX_MS, FILTER_STAGGER_MS } from '../constants';

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

  it('reads the day relative to today, not as a trip day-number (ADR-0085)', () => {
    // today 07-07: a flight tomorrow / in three days reads מחר / עוד N ימים.
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const tomorrow = scheduleLabel(
      linkedEvent('f', '2026-07-08', '08:30'),
      flight,
      TRIP,
      new Date(NOW),
    );
    expect(tomorrow).toBe('המראה · מחר · 08:30');
    const soon = scheduleLabel(
      linkedEvent('f', '2026-07-10', '08:30'),
      flight,
      TRIP,
      new Date(NOW),
    );
    expect(soon).toContain('עוד 3 ימים');
  });

  it('shows the check-out day (no time) mid-stay', () => {
    const ev = span_(linkedEvent('h', '2026-07-05', '15:00'), '2026-07-14', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07, mid-stay
    expect(label).toContain('צ׳ק-אאוט');
    expect(label).not.toContain('11:00');
    expect(label).not.toContain('צ׳ק-אין');
  });

  it('drops the verb once check-out has passed, even on the same day', () => {
    // checked out today at 11:00, now is 12:00 — already behind you (ADR-0089).
    const ev = span_(linkedEvent('h', '2026-07-04', '15:00'), '2026-07-07', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW));
    expect(label).not.toContain('צ׳ק-אאוט');
    expect(label).toBe('היום · 11:00');
  });

  it('drops the transition verb for a booking behind you (ADR-0089)', () => {
    const flight = booking('f', 'flight', BOOKING_TYPE.FLIGHT);
    const past = scheduleLabel(
      linkedEvent('f', '2026-07-05', '08:30'),
      flight,
      TRIP,
      new Date(NOW),
    );
    expect(past).not.toContain('המראה');
    expect(past).toBe('שלשום · 08:30');
    // still names the verb while it's ahead of you
    const ahead = scheduleLabel(
      linkedEvent('f', '2026-07-09', '08:30'),
      flight,
      TRIP,
      new Date(NOW),
    );
    expect(ahead).toContain('המראה');
  });

  it('shows the check-in day on the check-in day itself', () => {
    const ev = span_(linkedEvent('h', '2026-07-07', '15:00'), '2026-07-10', '11:00');
    const label = scheduleLabel(ev, hotel, TRIP, new Date(NOW)); // today 07-07 = check-in day
    expect(label).toContain('צ׳ק-אין');
    expect(label).toContain('היום');
    expect(label).toContain('15:00');
  });
});

describe('matchesCategory (ADR-0098 §2 category filter)', () => {
  it('matches everything for "all"', () => {
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.FLIGHT), CATEGORY_ALL)).toBe(true);
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.HOTEL), CATEGORY_ALL)).toBe(true);
  });

  it("matches only the booking's own type otherwise", () => {
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.FLIGHT), BOOKING_TYPE.FLIGHT)).toBe(
      true,
    );
    expect(matchesCategory(booking('b1', 'x', BOOKING_TYPE.HOTEL), BOOKING_TYPE.FLIGHT)).toBe(
      false,
    );
  });
});

describe('matchesQuery (ADR-0098 §2 search)', () => {
  it('matches everything for a blank query', () => {
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), '')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), '   ')).toBe(true);
  });

  it('matches by title, case-insensitively', () => {
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'ramen')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'RAMEN')).toBe(true);
    expect(matchesQuery(booking('b1', 'Ichiran Ramen'), 'sushi')).toBe(false);
  });

  it('matches by confirmation code, case-insensitively', () => {
    const b = { ...booking('b1', 'x'), confirmationCode: 'NA832' };
    expect(matchesQuery(b, 'na832')).toBe(true);
    expect(matchesQuery(b, 'zz')).toBe(false);
  });
});

describe('visibleRows (ADR-0098 §4 stagger)', () => {
  const rows = (n: number, type: Booking['type'] = BOOKING_TYPE.HOTEL) =>
    Array.from({ length: n }, (_, i) => ({ booking: booking(`b${i}`, `row${i}`, type) }));

  it('marks every row visible and increments the delay for "all" with no query', () => {
    const { rows: out, nextIndex } = visibleRows(rows(3), CATEGORY_ALL, '');
    expect(out.every((r) => r.visible)).toBe(true);
    expect(out.map((r) => r.delayMs)).toEqual([0, FILTER_STAGGER_MS, FILTER_STAGGER_MS * 2]);
    expect(nextIndex).toBe(3);
  });

  it('hides non-matching rows with a zero delay, and only counts visible ones toward the stagger', () => {
    const mixed = [
      { booking: booking('b1', 'x', BOOKING_TYPE.FLIGHT) },
      { booking: booking('b2', 'y', BOOKING_TYPE.HOTEL) },
      { booking: booking('b3', 'z', BOOKING_TYPE.FLIGHT) },
    ];
    const { rows: out, nextIndex } = visibleRows(mixed, BOOKING_TYPE.FLIGHT, '');
    expect(out.map((r) => r.visible)).toEqual([true, false, true]);
    expect(out[1].delayMs).toBe(0);
    expect(out[2].delayMs).toBe(FILTER_STAGGER_MS); // second VISIBLE row, not third row
    expect(nextIndex).toBe(2);
  });

  it('caps the delay at FILTER_STAGGER_MAX_MS for a long list', () => {
    const { rows: out } = visibleRows(rows(50), CATEGORY_ALL, '');
    expect(out.at(-1)?.delayMs).toBe(FILTER_STAGGER_MAX_MS);
  });

  it('chains a startIndex so upcoming → past shares one continuous stagger', () => {
    const upcoming = visibleRows(rows(2), CATEGORY_ALL, '');
    const past = visibleRows(rows(2), CATEGORY_ALL, '', upcoming.nextIndex);
    expect(past.rows.map((r) => r.delayMs)).toEqual([FILTER_STAGGER_MS * 2, FILTER_STAGGER_MS * 3]);
  });
});
