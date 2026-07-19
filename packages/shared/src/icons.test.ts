import { describe, expect, it } from 'vitest';
import type { EventCategory, TripEvent } from './entities';
import {
  CATEGORY_TIME_PROFILE,
  eventDurationUnit,
  eventEndBoundary,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  isMultiDay,
} from './icons';

const ORDINARY_CATEGORIES: EventCategory[] = [
  'food',
  'sightseeing',
  'nature',
  'activity',
  'shopping',
  'services',
  'other',
];

const ev = (partial: Partial<TripEvent>): TripEvent => ({
  id: 'ev',
  tripId: 't',
  date: '2026-07-07',
  title: 'x',
  kind: 'soft',
  status: 'planned',
  source: 'manual',
  sortOrder: 1,
  createdAt: '2026-07-07T00:00:00Z',
  updatedAt: '2026-07-07T00:00:00Z',
  updatedBy: 'u',
  ...partial,
});

describe('CATEGORY_TIME_PROFILE', () => {
  it('has one row per category (9)', () => {
    expect(Object.keys(CATEGORY_TIME_PROFILE)).toHaveLength(9);
  });

  it('seeds transport & lodging as bracketed + ambient-when-multi-day with transition keys', () => {
    expect(CATEGORY_TIME_PROFILE.transport).toEqual({
      bracketed: true,
      ambientWhenMultiDay: true,
      transitions: { startKey: 'departure', endKey: 'arrival' },
      durationUnit: 'hours',
    });
    expect(CATEGORY_TIME_PROFILE.lodging).toEqual({
      bracketed: true,
      ambientWhenMultiDay: true,
      transitions: { startKey: 'checkIn', endKey: 'checkOut' },
      durationUnit: 'nights',
    });
  });

  it('seeds every other category as ordinary', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(CATEGORY_TIME_PROFILE[category]).toEqual({
        bracketed: false,
        ambientWhenMultiDay: false,
        durationUnit: 'auto',
      });
    }
  });
});

describe('eventDurationUnit', () => {
  it('reads hours for transport, nights for lodging, auto otherwise', () => {
    expect(eventDurationUnit(ev({ category: 'transport' }))).toBe('hours');
    expect(eventDurationUnit(ev({ category: 'lodging' }))).toBe('nights');
    for (const category of ORDINARY_CATEGORIES) {
      expect(eventDurationUnit(ev({ category }))).toBe('auto');
    }
    expect(eventDurationUnit(ev({ category: undefined }))).toBe('auto');
  });
});

describe('isBracketed', () => {
  it('is true for transport & lodging', () => {
    expect(isBracketed(ev({ category: 'transport' }))).toBe(true);
    expect(isBracketed(ev({ category: 'lodging' }))).toBe(true);
  });

  it('is false for ordinary categories and for a null/unset category', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(isBracketed(ev({ category }))).toBe(false);
    }
    expect(isBracketed(ev({ category: undefined }))).toBe(false);
  });
});

describe('isMultiDay', () => {
  it('is true when endDate lands on a later day', () => {
    expect(isMultiDay(ev({ date: '2026-07-07', endDate: '2026-07-09' }))).toBe(true);
  });

  it('is false with no endDate (single overnight tail) or a same-day endDate', () => {
    expect(isMultiDay(ev({ date: '2026-07-07' }))).toBe(false);
    expect(isMultiDay(ev({ date: '2026-07-07', endDate: '2026-07-07' }))).toBe(false);
  });
});

describe('eventTransitionKeys', () => {
  it('resolves generic departure/arrival for a train (or any non-flight transport)', () => {
    for (const icon of ['🚄', '🚆', '🚌', '⛴️', '🚗']) {
      expect(eventTransitionKeys(ev({ category: 'transport', icon }))).toEqual({
        startKey: 'departure',
        endKey: 'arrival',
      });
    }
  });

  it('resolves the same generic keys for transport with no icon (manual event)', () => {
    expect(eventTransitionKeys(ev({ category: 'transport', icon: undefined }))).toEqual({
      startKey: 'departure',
      endKey: 'arrival',
    });
  });

  it('refines to take-off/landing for a flight (✈️)', () => {
    expect(eventTransitionKeys(ev({ category: 'transport', icon: '✈️' }))).toEqual({
      startKey: 'flightDeparture',
      endKey: 'flightArrival',
    });
  });

  it('resolves check-in/check-out for lodging', () => {
    expect(eventTransitionKeys(ev({ category: 'lodging', icon: '🏨' }))).toEqual({
      startKey: 'checkIn',
      endKey: 'checkOut',
    });
  });

  it('is undefined for a non-bracketed or unset category', () => {
    expect(eventTransitionKeys(ev({ category: 'food' }))).toBeUndefined();
    expect(eventTransitionKeys(ev({ category: undefined }))).toBeUndefined();
  });
});

describe('isAmbient', () => {
  it('is true for a multi-day transport or lodging event', () => {
    expect(isAmbient(ev({ category: 'lodging', date: '2026-07-07', endDate: '2026-07-09' }))).toBe(
      true,
    );
    expect(
      isAmbient(ev({ category: 'transport', date: '2026-07-07', endDate: '2026-07-08' })),
    ).toBe(true);
  });

  it('is false for a same-day bracketed event (a same-day flight still counts)', () => {
    expect(isAmbient(ev({ category: 'transport', date: '2026-07-07' }))).toBe(false);
  });

  it('is false for an ordinary category even when multi-day', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(isAmbient(ev({ category, date: '2026-07-07', endDate: '2026-07-09' }))).toBe(false);
    }
  });
});

describe('eventEndBoundary', () => {
  it('uses the exact end instant when endsAt is set (arrival / check-out / activity end)', () => {
    const endsAt = '2026-07-07T14:30:00Z';
    expect(eventEndBoundary(ev({ startsAt: '2026-07-07T10:30:00Z', endsAt }))).toEqual({
      kind: 'instant',
      at: Date.parse(endsAt),
    });
  });

  it('falls back to the whole check-out day for a multi-day stay with no end time', () => {
    expect(
      eventEndBoundary(
        ev({ date: '2026-07-05', endDate: '2026-07-09', startsAt: '2026-07-05T15:00:00Z' }),
      ),
    ).toEqual({ kind: 'day', date: '2026-07-09' });
  });

  it('prefers the end instant over the day even for a multi-day stay (check-out wins over check-in)', () => {
    const endsAt = '2026-07-09T11:00:00Z';
    expect(
      eventEndBoundary(
        ev({
          date: '2026-07-05',
          endDate: '2026-07-09',
          startsAt: '2026-07-05T15:00:00Z',
          endsAt,
        }),
      ),
    ).toEqual({ kind: 'instant', at: Date.parse(endsAt) });
  });

  it('uses the single moment for a same-day event with only a start', () => {
    const startsAt = '2026-07-07T09:00:00Z';
    expect(eventEndBoundary(ev({ startsAt }))).toEqual({
      kind: 'instant',
      at: Date.parse(startsAt),
    });
  });

  it('falls back to the whole day for an untimed event (only a date)', () => {
    expect(eventEndBoundary(ev({ date: '2026-07-07' }))).toEqual({
      kind: 'day',
      date: '2026-07-07',
    });
  });
});
