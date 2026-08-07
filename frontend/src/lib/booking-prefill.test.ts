// **What a booking's schedule offers** (field reports #4 and #11). The values live in
// `BOOKING_TYPE_PROFILE.times`; what is tested here is the two rules that read them, plus
// the one property that must survive a new booking type being added.
import { describe, it, expect } from 'vitest';
import {
  BOOKING_TYPE,
  DAY_START_TIME,
  bookingTimeOffer,
  eventMidSpan,
  BOOKING_TYPE_TO_CATEGORY,
  type BookingType,
} from '@waypoint/shared';
import { offerDayTimes, offerLegTimes, offeredEnd } from './booking-prefill';
import { BOOKING_TYPE_ICON } from '../constants';

const leg = (start = '', end = '') => ({ start, end });
const NONE = leg();

describe('the offer belongs to the type', () => {
  // **The one rule a future booking type must not break.** Everything else here is a
  // value the owner can re-tune; this is the line that says WHY flights have no values to
  // tune. A journey's ends are exact instants (ADR-0171 §1) — the carrier chose them — so
  // guessing one would write a false instant onto a hard commitment. Pinned against
  // `eventMidSpan` rather than against a list of type names, so a new mode inherits the
  // answer by saying what its middle is.
  it('offers nothing for a type whose middle is a journey, and something for every other', () => {
    for (const type of Object.values(BOOKING_TYPE) as BookingType[]) {
      const isJourney =
        eventMidSpan({
          category: BOOKING_TYPE_TO_CATEGORY[type],
          icon: BOOKING_TYPE_ICON[type],
        })?.kind === 'journey';
      expect({ type, offers: bookingTimeOffer(type).kind !== 'none' }).toEqual({
        type,
        offers: !isJourney,
      });
    }
  });
});

describe('offeredEnd', () => {
  it('gives a hotel the next day at its check-out clock', () => {
    // A stay counted in nights cannot be zero of them, so the day moves too (field #4).
    expect(offeredEnd(BOOKING_TYPE.HOTEL, '2026-09-11T15:00')).toBe('2026-09-12T10:00');
  });

  it('gives a car hire the same day at the counter clock', () => {
    expect(offeredEnd(BOOKING_TYPE.CAR, '2026-09-11T10:00')).toBe('2026-09-11T10:00');
  });

  it('gives an activity a typical length after whatever the start is', () => {
    // 120 minutes, from the `activity` category's own `typicalMinutes` (ADR-0161 §5) —
    // not a second per-type list saying the same thing.
    expect(offeredEnd(BOOKING_TYPE.ACTIVITY, '2026-09-11T09:00')).toBe('2026-09-11T11:00');
  });

  it('rolls a duration past midnight into the following day', () => {
    expect(offeredEnd(BOOKING_TYPE.ACTIVITY, '2026-09-11T23:30')).toBe('2026-09-12T01:30');
  });

  it('gives a flight the DAY and never a clock', () => {
    expect(offeredEnd(BOOKING_TYPE.FLIGHT, '2026-09-11T15:30')).toBe('2026-09-11');
  });

  it('answers nothing when there is no day to anchor to', () => {
    expect(offeredEnd(BOOKING_TYPE.HOTEL, '')).toBeNull();
  });
});

describe('offerLegTimes', () => {
  it('offers the start clock when the day is first set, and the end with it', () => {
    const next = offerLegTimes(BOOKING_TYPE.HOTEL, NONE, leg('2026-09-11'), false);
    expect(next).toEqual({ start: '2026-09-11T15:00', end: '2026-09-12T10:00' });
  });

  it('uses the day-start clock for a type with no convention of its own', () => {
    const next = offerLegTimes(BOOKING_TYPE.ACTIVITY, NONE, leg('2026-09-11'), false);
    expect(next.start).toBe(`2026-09-11T${DAY_START_TIME}`);
  });

  it('never guesses a clock for a flight, only the end DAY', () => {
    const next = offerLegTimes(BOOKING_TYPE.FLIGHT, NONE, leg('2026-09-11'), false);
    expect(next).toEqual({ start: '2026-09-11', end: '2026-09-11' });
  });

  it('moves an untouched end when the start moves', () => {
    const previous = leg('2026-09-11T09:00', '2026-09-11T11:00');
    const next = offerLegTimes(
      BOOKING_TYPE.ACTIVITY,
      previous,
      leg('2026-09-11T14:00', '2026-09-11T11:00'),
      false,
    );
    // The duration came along, which is the owner's own wording for this rule.
    expect(next.end).toBe('2026-09-11T16:00');
  });

  it('leaves a TOUCHED end exactly where it was put', () => {
    const previous = leg('2026-09-11T09:00', '2026-09-11T18:00');
    const next = offerLegTimes(
      BOOKING_TYPE.ACTIVITY,
      previous,
      leg('2026-09-11T14:00', '2026-09-11T18:00'),
      true,
    );
    expect(next.end).toBe('2026-09-11T18:00');
  });

  it('does not re-offer a start clock that was just cleared', () => {
    // The whole reason this function takes the previous leg: keyed on the DAY changing,
    // so emptying the time is an edit the offer stays out of.
    const previous = leg('2026-09-11T15:00', '2026-09-12T10:00');
    const next = offerLegTimes(BOOKING_TYPE.HOTEL, previous, leg('2026-09-11'), true);
    expect(next.start).toBe('2026-09-11');
  });
});

describe('offerDayTimes', () => {
  const day = (date = '', start = '', end = '') => ({ date, start, end });

  it('offers a point type the day start and a typical length after it', () => {
    const next = offerDayTimes(BOOKING_TYPE.RESTAURANT, day(), day('2026-09-11'), false);
    // 90 minutes, from `food`'s own typical length.
    expect(next).toEqual({ date: '2026-09-11', start: DAY_START_TIME, end: '08:30' });
  });

  it('moves an untouched end with the start', () => {
    const previous = day('2026-09-11', '07:00', '08:30');
    const next = offerDayTimes(
      BOOKING_TYPE.RESTAURANT,
      previous,
      day('2026-09-11', '19:00', '08:30'),
      false,
    );
    expect(next.end).toBe('20:30');
  });

  it('leaves a touched end alone', () => {
    const previous = day('2026-09-11', '07:00', '22:00');
    const next = offerDayTimes(
      BOOKING_TYPE.RESTAURANT,
      previous,
      day('2026-09-11', '19:00', '22:00'),
      true,
    );
    expect(next.end).toBe('22:00');
  });
});
