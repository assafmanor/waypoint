import { describe, expect, it } from 'vitest';
import { resolveLanding, tripChip } from './active-trip';
import { DEVICE_TIMEZONE } from '../constants';
import { TRIP } from '../fixtures';
import { todayInTz } from './time';

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

// The chip counts from the DEVICE's day (ADR-0107, 2026-09-10), and the device running
// this suite can be anywhere — so every fixture sits weeks from `NOW`, and no case turns
// on which side of a midnight the host clock is.
const NOW = new Date('2026-07-07T09:00:00+09:00');

describe('tripChip reads the device day, not the trip zone', () => {
  it('is "now" on the departure date at home even while the destination is still on the eve', () => {
    // A westward trip: the far side is a day behind, and 15 hours before the flight the
    // trip's own zone still says "soon". The person is at home, where it is day 1.
    const startsToday = {
      ...TRIP,
      id: 'trip-westward',
      timezone: 'Pacific/Honolulu',
      startDate: todayInTz(DEVICE_TIMEZONE, NOW),
      endDate: '2027-01-01',
    };
    expect(tripChip(startsToday, NOW)).toBe('now');
    expect(resolveLanding([past, startsToday], null, false, NOW)).toEqual({
      tripId: startsToday.id,
    });
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
    // The stored live id wins so a reopen stays on the trip you last had open.
    expect(resolveLanding([inProgress, alsoInProgress], inProgress.id, false, NOW)).toEqual({
      tripId: inProgress.id,
    });
  });

  it('redirects to /trips when two trips are live and neither was the last one open', () => {
    // Overlapping live trips with no last-opened tiebreak: the list resolves the
    // ambiguity rather than a silent "earliest start wins" pick.
    const alsoInProgress = { ...inProgress, id: 'trip-also-in-progress', startDate: '2026-06-20' };
    expect(resolveLanding([inProgress, alsoInProgress], past.id, false, NOW)).toEqual({
      redirect: '/trips',
    });
    expect(resolveLanding([inProgress, alsoInProgress], null, false, NOW)).toEqual({
      redirect: '/trips',
    });
  });

  it('opens the one unfinished trip on a cold reopen when nothing is live', () => {
    // The 2026-09-10 amendment: with a single upcoming trip the list has nothing
    // to choose between, so the trip opens (in Plan mode) instead.
    expect(resolveLanding([past, upcoming], past.id, false, NOW)).toEqual({
      tripId: upcoming.id,
    });
    expect(resolveLanding([upcoming], null, false, NOW)).toEqual({ tripId: upcoming.id });
  });

  it('redirects to /trips on a cold reopen when several trips are upcoming and none is live', () => {
    expect(resolveLanding([past, upcoming, fartherUpcoming], upcoming.id, false, NOW)).toEqual({
      redirect: '/trips',
    });
  });

  it('redirects to /trips on a cold reopen when every trip has finished', () => {
    expect(resolveLanding([olderPast, past], past.id, false, NOW)).toEqual({ redirect: '/trips' });
  });

  it('redirects to /trips when a stale stored id no longer exists and nothing is unambiguous', () => {
    expect(resolveLanding([past, upcoming, fartherUpcoming], 'trip-deleted', false, NOW)).toEqual({
      redirect: '/trips',
    });
  });

  it('falls back to resolution when a manually-picked id no longer exists', () => {
    // A pick that points at a since-deleted trip must not strand the user; the
    // cold-load rule takes over and lands on the live trip.
    expect(resolveLanding(trips, 'trip-deleted', true, NOW)).toEqual({ tripId: inProgress.id });
  });
});
