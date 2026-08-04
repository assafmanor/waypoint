import { describe, it, expect } from 'vitest';
import { BOOKING_TYPE, type TripEvent } from '@waypoint/shared';
import { bookingDurationUnit, formatBookingDuration, timingLabels } from './booking-timing';
import { t } from '../i18n/he';

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

  it('an hour that merely crosses midnight reads in hours, NOT days (ADR-0114)', () => {
    // The reported bug: a 23:00→00:00 booking touches two calendar dates but is
    // one hour of elapsed time — it must read "שעה", never "יומיים".
    expect(
      formatBookingDuration(
        ev({
          category: 'food',
          date: '2026-07-20',
          startsAt: '2026-07-20T23:00:00Z',
          endsAt: '2026-07-21T00:00:00Z',
        }),
        TZ,
      ),
    ).toBe('שעה');
  });

  it('a timed multi-day activity reads its ELAPSED length, not an inclusive day count', () => {
    // 30h elapsed rounds to one day — not "יומיים" (the old calendar-inclusive count).
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
    ).toBe('יום');
    // 48h exactly → two days.
    expect(
      formatBookingDuration(
        ev({
          category: 'activity',
          date: '2026-07-16',
          endDate: '2026-07-18',
          startsAt: '2026-07-16T10:00:00Z',
          endsAt: '2026-07-18T10:00:00Z',
        }),
        TZ,
      ),
    ).toBe('יומיים');
  });

  it('a date-only multi-day span (no clock times) reads in inclusive calendar days', () => {
    // With no times to measure elapsed, an all-day event across N dates reads in
    // those (inclusive) days — the one place the calendar span is the right signal.
    expect(
      formatBookingDuration(
        ev({ category: 'activity', date: '2026-07-16', endDate: '2026-07-18' }),
        TZ,
      ),
    ).toBe('3 ימים');
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

  // ADR-0162: the type overrides its category where the two disagree. A hire is
  // `transport`, and reading a five-day one in that category's hours gave "120 ש׳".
  it('reads a car hire in the days you hold it, not transport hours', () => {
    expect(bookingDurationUnit(BOOKING_TYPE.CAR)).toBe('auto');
    expect(
      formatBookingDuration(
        ev({
          category: 'transport',
          date: '2026-07-15',
          endDate: '2026-07-20',
          startsAt: '2026-07-15T09:00:00Z',
          endsAt: '2026-07-20T09:00:00Z',
        }),
        TZ,
        bookingDurationUnit(BOOKING_TYPE.CAR),
      ),
    ).toBe('5 ימים');
  });
});

describe('timingLabels (ADR-0162: a Record, not a fall-through)', () => {
  it('gives a hire its counter wording', () => {
    expect(timingLabels(BOOKING_TYPE.CAR)).toEqual({
      start: t.index.form.pickupLabel,
      end: t.index.form.dropoffLabel,
    });
  });

  // The bug the if-chain hid: `transit` fell past every branch to the generic
  // התחלה/סיום, where a bus departs and arrives exactly like the train above it.
  it('gives a bus or a ferry the same departure/arrival a train gets', () => {
    expect(timingLabels(BOOKING_TYPE.TRANSIT)).toEqual(timingLabels(BOOKING_TYPE.TRAIN));
    expect(timingLabels(BOOKING_TYPE.TRANSIT)).toEqual({
      start: t.index.form.departLabel,
      end: t.index.form.arriveLabel,
    });
  });

  it('still answers every type it answered before', () => {
    expect(timingLabels(BOOKING_TYPE.HOTEL)).toEqual({
      start: t.index.form.checkinLabel,
      end: t.index.form.checkoutLabel,
    });
    expect(timingLabels(BOOKING_TYPE.FLIGHT)).toEqual({
      start: t.index.form.flightDepartLabel,
      end: t.index.form.flightArriveLabel,
    });
    for (const type of [BOOKING_TYPE.ACTIVITY, BOOKING_TYPE.RESTAURANT, BOOKING_TYPE.OTHER]) {
      expect(timingLabels(type)).toEqual({
        start: t.index.form.startLabel,
        end: t.index.form.endLabel,
      });
    }
  });
});
