import { describe, expect, it } from 'vitest';
import type { Trip } from '@waypoint/shared';
import { tripAnniversaries, tripsLifetime } from './resurface';

const trip = (startDate: string, endDate: string, destinationCountryCode?: string) =>
  ({ startDate, endDate, destinationCountryCode }) as Trip;

describe('tripsLifetime', () => {
  it('counts trips, inclusive days and distinct countries', () => {
    expect(
      tripsLifetime([
        trip('2025-09-23', '2025-10-02', 'JP'),
        trip('2026-10-25', '2026-10-29', 'IS'),
        trip('2024-05-01', '2024-05-01', 'jp'),
      ]),
    ).toEqual({ trips: 3, days: 16, countries: 2 });
  });

  it('counts a day two trips share once', () => {
    expect(
      tripsLifetime([trip('2025-01-01', '2025-01-05'), trip('2025-01-05', '2025-01-06')]).days,
    ).toBe(6);
  });

  it('leaves countries absent, not zero, when no trip names one', () => {
    expect(tripsLifetime([trip('2025-01-01', '2025-01-02')])).toEqual({ trips: 1, days: 2 });
  });
});

describe('tripAnniversaries', () => {
  const japan = { ...trip('2025-09-23', '2025-10-02'), id: 'jp' } as Trip;
  const iceland = { ...trip('2024-09-23', '2024-09-27'), id: 'is' } as Trip;

  it('names each trip whose first day this is and that has a place to name', () => {
    const memories = new Map([
      ['jp', { place: 'מקדש סנסו-ג׳י' }],
      ['is', { place: 'Gullfoss' }],
    ]);
    expect(
      tripAnniversaries([japan, iceland], memories, '2026-09-23').map(({ trip, years }) => [
        trip.id,
        years,
      ]),
    ).toEqual([
      ['jp', 1],
      ['is', 2],
    ]);
  });

  it('has no card without a place, or for a trip this device never opened', () => {
    expect(tripAnniversaries([japan, iceland], new Map([['jp', {}]]), '2026-09-23')).toEqual([]);
  });
});
