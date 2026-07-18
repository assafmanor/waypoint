import { describe, expect, it } from 'vitest';
import type { EventCategory, TripEvent } from './entities';
import { CATEGORY_TIME_PROFILE, isAmbient, isBracketed, isMultiDay } from './icons';

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
    });
    expect(CATEGORY_TIME_PROFILE.lodging).toEqual({
      bracketed: true,
      ambientWhenMultiDay: true,
      transitions: { startKey: 'checkIn', endKey: 'checkOut' },
    });
  });

  it('seeds every other category as ordinary', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(CATEGORY_TIME_PROFILE[category]).toEqual({
        bracketed: false,
        ambientWhenMultiDay: false,
      });
    }
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
