import { describe, expect, it } from 'vitest';
import { resolveActiveTrip } from './active-trip';
import { TRIP } from '../fixtures';

const upcoming = { ...TRIP, id: 'trip-upcoming', startDate: '2026-08-01', endDate: '2026-08-10' };
const fartherUpcoming = {
  ...TRIP,
  id: 'trip-farther-upcoming',
  startDate: '2026-09-01',
  endDate: '2026-09-10',
};
const past = { ...TRIP, id: 'trip-past', startDate: '2026-01-01', endDate: '2026-01-10' };
const olderPast = {
  ...TRIP,
  id: 'trip-older-past',
  startDate: '2025-01-01',
  endDate: '2025-01-10',
};
const inProgress = {
  ...TRIP,
  id: 'trip-in-progress',
  startDate: '2026-07-01',
  endDate: '2026-07-20',
};

// All fixture trips run Asia/Tokyo — anchor "now" mid-morning JST so date-only
// comparisons aren't sensitive to the UTC-vs-JST day boundary.
const NOW = new Date('2026-07-07T09:00:00+09:00');

describe('resolveActiveTrip (ADR-0021)', () => {
  it('returns null with no trips', () => {
    expect(resolveActiveTrip([], NOW)).toBeNull();
  });

  it('prefers the current in-progress trip over upcoming/past', () => {
    expect(resolveActiveTrip([past, upcoming, inProgress], NOW)?.id).toBe('trip-in-progress');
  });

  it('picks the nearest upcoming trip when none is in progress', () => {
    expect(resolveActiveTrip([fartherUpcoming, upcoming, past], NOW)?.id).toBe('trip-upcoming');
  });

  it('falls back to the most recent past trip when none is upcoming or in progress', () => {
    expect(resolveActiveTrip([olderPast, past], NOW)?.id).toBe('trip-past');
  });

  it('deterministically picks the earlier-starting trip among overlapping in-progress trips', () => {
    const alsoInProgress = { ...inProgress, id: 'trip-also-in-progress', startDate: '2026-06-20' };
    expect(resolveActiveTrip([inProgress, alsoInProgress], NOW)?.id).toBe('trip-also-in-progress');
  });
});
