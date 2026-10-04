import { describe, expect, it } from 'vitest';
import type { Trip } from '@waypoint/shared';
import { tripsLifetime } from './resurface';

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
