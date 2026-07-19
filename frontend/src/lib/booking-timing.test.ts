import { describe, it, expect } from 'vitest';
import { BOOKING_TYPE, type TripEvent } from '@waypoint/shared';
import { bookingDurationUnit, formatBookingDuration } from './booking-timing';

const TZ = 'UTC';
const ev = (e: Partial<TripEvent>) => e as Parameters<typeof formatBookingDuration>[0];

describe('formatBookingDuration (per-category unit, ADR-0063 extension)', () => {
  it('transport reads in hours — even a red-eye that crosses a day', () => {
    expect(
      formatBookingDuration(
        ev({
          category: 'transport',
          date: '2026-07-16',
          startsAt: '2026-07-16T23:00:00Z',
          endsAt: '2026-07-17T02:00:00Z',
        }),
        TZ,
      ),
    ).toBe('3 שעות');
  });

  it('lodging reads in nights (check-in → check-out)', () => {
    expect(
      formatBookingDuration(
        ev({ category: 'lodging', date: '2026-07-16', endDate: '2026-07-19' }),
        TZ,
      ),
    ).toBe('3 לילות');
    expect(
      formatBookingDuration(
        ev({ category: 'lodging', date: '2026-07-16', endDate: '2026-07-17' }),
        TZ,
      ),
    ).toBe('לילה אחד');
  });

  it('a same-day activity reads in hours', () => {
    expect(
      formatBookingDuration(
        ev({
          category: 'activity',
          date: '2026-07-16',
          startsAt: '2026-07-16T10:00:00Z',
          endsAt: '2026-07-16T12:30:00Z',
        }),
        TZ,
      ),
    ).toBe('2:30 שע׳');
  });

  it('a multi-day activity reads in (inclusive) days', () => {
    expect(
      formatBookingDuration(
        ev({
          category: 'activity',
          date: '2026-07-16',
          endDate: '2026-07-17',
          startsAt: '2026-07-16T10:00:00Z',
          endsAt: '2026-07-17T16:00:00Z',
        }),
        TZ,
      ),
    ).toBe('יומיים');
  });

  it('returns null when there is nothing to measure', () => {
    expect(formatBookingDuration(ev({ category: 'transport', date: '2026-07-16' }), TZ)).toBeNull();
  });

  it('honours an explicit unit override — a hotel whose event carries a non-lodging category (e.g. a ⭐ icon set it to "other") still reads nights', () => {
    const event = ev({ category: 'other', date: '2026-07-15', endDate: '2026-07-17' });
    expect(formatBookingDuration(event, TZ)).toBe('3 ימים'); // event category alone → auto/days
    expect(formatBookingDuration(event, TZ, 'nights')).toBe('2 לילות'); // type-driven override
  });
});

describe('bookingDurationUnit', () => {
  it('keys on the booking type, not the linked event category', () => {
    expect(bookingDurationUnit(BOOKING_TYPE.HOTEL)).toBe('nights');
    expect(bookingDurationUnit(BOOKING_TYPE.FLIGHT)).toBe('hours');
    expect(bookingDurationUnit(BOOKING_TYPE.TRAIN)).toBe('hours');
    expect(bookingDurationUnit(BOOKING_TYPE.RESTAURANT)).toBe('auto');
  });
});
