import { describe, expect, it } from 'vitest';
import { resolveActiveTrip, resolveLanding, tripChip } from './active-trip';
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

describe('tripChip (ADR-0033)', () => {
  it('is "now" for a trip in progress today', () => {
    expect(tripChip(inProgress, NOW)).toBe('now');
  });

  it('is "soon" for an upcoming trip', () => {
    expect(tripChip(upcoming, NOW)).toBe('soon');
  });

  it('is "past" for a trip that already ended', () => {
    expect(tripChip(past, NOW)).toBe('past');
  });
});

describe('landing rule (ADR-0033): live → land in the trip, none live → /trips', () => {
  it('resolves to the live trip when one is in progress', () => {
    const resolved = resolveActiveTrip([past, upcoming, inProgress], NOW)!;
    expect(tripChip(resolved, NOW)).toBe('now');
  });

  it('resolves to a non-live trip (→ /trips landing) when nothing is in progress', () => {
    const resolved = resolveActiveTrip([past, upcoming], NOW)!;
    expect(tripChip(resolved, NOW)).not.toBe('now');
  });
});

describe('resolveLanding (ADR-0033 landing rule, refining ADR-0021)', () => {
  const trips = [past, upcoming, inProgress];

  it('opens the live trip on a cold reopen even when the last-opened trip is past', () => {
    // The reported bug: reopening lands on the last-visited (past) trip instead
    // of the trip that is live right now.
    expect(resolveLanding(trips, past.id, false, NOW)).toEqual({ tripId: inProgress.id });
  });

  it('opens the live trip on a cold reopen when the last-opened trip is upcoming', () => {
    expect(resolveLanding(trips, upcoming.id, false, NOW)).toEqual({ tripId: inProgress.id });
  });

  it('opens the live trip on a cold reopen with no stored id', () => {
    expect(resolveLanding(trips, null, false, NOW)).toEqual({ tripId: inProgress.id });
  });

  it('honors a manual in-session pick of a past trip regardless of a live trip', () => {
    expect(resolveLanding(trips, past.id, true, NOW)).toEqual({ tripId: past.id });
  });

  it('honors a manual in-session pick of an upcoming trip', () => {
    expect(resolveLanding(trips, upcoming.id, true, NOW)).toEqual({ tripId: upcoming.id });
  });

  it('keeps a live last-opened trip on a cold reopen (last-opened among overlapping live)', () => {
    const alsoInProgress = { ...inProgress, id: 'trip-also-in-progress', startDate: '2026-06-20' };
    // resolveActiveTrip alone would pick the earlier-starting one; the stored
    // live id wins so a reopen stays on the trip you last had open.
    expect(resolveLanding([inProgress, alsoInProgress], inProgress.id, false, NOW)).toEqual({
      tripId: inProgress.id,
    });
  });

  it('redirects to /trips on a cold reopen when nothing is live', () => {
    expect(resolveLanding([past, upcoming], past.id, false, NOW)).toEqual({ redirect: '/trips' });
  });

  it('redirects to /trips when a stale stored id no longer exists and nothing is live', () => {
    expect(resolveLanding([past, upcoming], 'trip-deleted', false, NOW)).toEqual({
      redirect: '/trips',
    });
  });

  it('falls back to resolution when a manually-picked id no longer exists', () => {
    // A pick that points at a since-deleted trip must not strand the user; the
    // cold-load rule takes over and lands on the live trip.
    expect(resolveLanding(trips, 'trip-deleted', true, NOW)).toEqual({ tripId: inProgress.id });
  });
});
