import { describe, expect, it } from 'vitest';
import type { TripEvent } from '@waypoint/shared';
import {
  firstTimedOn,
  flapClock,
  PREP_TIER,
  prepTier,
  RUNWAY_DAYS,
  runwayLamps,
  tripStartMs,
} from './prep-tier';

const ev = (id: string, date: string, startsAt?: string): TripEvent =>
  ({ id, date, startsAt, title: id, kind: 'soft' }) as unknown as TripEvent;

describe('prepTier', () => {
  it('is the shipped card beyond a week, then climbs a step a day', () => {
    expect(prepTier(47)).toBe(PREP_TIER.FAR);
    expect(prepTier(RUNWAY_DAYS + 1)).toBe(PREP_TIER.FAR);
    expect(prepTier(RUNWAY_DAYS)).toBe(PREP_TIER.WEEK);
    expect(prepTier(3)).toBe(PREP_TIER.WEEK);
    expect(prepTier(2)).toBe(PREP_TIER.EVE2);
    expect(prepTier(1)).toBe(PREP_TIER.EVE);
  });

  // Day 1 itself is the first morning's face: `היום` over a clock to the first thing.
  it('treats day 1 as the eve tier', () => {
    expect(prepTier(0)).toBe(PREP_TIER.EVE);
  });
});

describe('runwayLamps', () => {
  it('always draws seven lamps, lighting one per day behind you', () => {
    expect(runwayLamps(7)).toEqual([false, false, false, false, false, false, false]);
    expect(runwayLamps(5)).toEqual([true, true, false, false, false, false, false]);
    expect(runwayLamps(3)).toEqual([true, true, true, true, false, false, false]);
  });

  it('never lights more than the strip has', () => {
    expect(runwayLamps(0).every(Boolean)).toBe(true);
    expect(runwayLamps(0)).toHaveLength(RUNWAY_DAYS);
  });
});

describe('firstTimedOn', () => {
  it('finds the earliest timed event on the date, ignoring untimed and other days', () => {
    const events = [
      ev('late', '2026-09-11', '2026-09-11T10:00:00Z'),
      ev('untimed', '2026-09-11'),
      ev('other-day', '2026-09-10', '2026-09-10T01:00:00Z'),
      ev('first', '2026-09-11', '2026-09-11T03:40:00Z'),
    ];
    expect(firstTimedOn(events, '2026-09-11')?.id).toBe('first');
  });

  it('is undefined when nothing on the day carries a time', () => {
    expect(firstTimedOn([ev('a', '2026-09-11')], '2026-09-11')).toBeUndefined();
  });
});

describe('tripStartMs', () => {
  // The clock counts to the instant the mode flips: trip-local midnight of day 1.
  it('is the trip-local midnight that starts day 1', () => {
    // Jerusalem is UTC+3 in September, so its midnight is 21:00Z the evening before.
    expect(tripStartMs('2026-09-11', 'Asia/Jerusalem')).toBe(Date.parse('2026-09-10T21:00:00Z'));
    // Reykjavik is UTC+0 all year.
    expect(tripStartMs('2026-09-11', 'Atlantic/Reykjavik')).toBe(
      Date.parse('2026-09-11T00:00:00Z'),
    );
  });
});

describe('flapClock', () => {
  it('reads HH:MM:SS to the target and can pass 24 hours', () => {
    const target = Date.parse('2026-09-11T03:40:00Z');
    expect(flapClock(Date.parse('2026-09-10T13:18:00Z'), target)).toEqual({
      hours: '14',
      minutes: '22',
      seconds: '00',
    });
    expect(flapClock(Date.parse('2026-09-09T13:18:05Z'), target)).toEqual({
      hours: '38',
      minutes: '21',
      seconds: '55',
    });
  });

  it('floors at zero once the target has been reached', () => {
    const target = Date.parse('2026-09-11T03:40:00Z');
    expect(flapClock(target + 5000, target)).toEqual({ hours: '00', minutes: '00', seconds: '00' });
  });
});
