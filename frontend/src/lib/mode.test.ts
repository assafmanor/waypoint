import { describe, expect, it } from 'vitest';
import { daysUntilStart, deriveMode } from './mode';
import { TRIP } from '../fixtures';

describe('deriveMode', () => {
  it('is Plan mode before the trip starts', () => {
    expect(deriveMode(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe('plan');
  });

  it('is Trip mode from startDate through endDate inclusive', () => {
    expect(deriveMode(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBe('trip');
    expect(deriveMode(TRIP, new Date('2026-07-14T23:59:00+09:00'))).toBe('trip');
  });

  it('is Plan mode after the trip ends', () => {
    expect(deriveMode(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBe('plan');
  });

  it('reads the calendar day in the trip timezone, not UTC', () => {
    // 2026-07-14 23:30 JST is still the last trip day locally, even though
    // it's already 2026-07-14T14:30Z / past midnight UTC the next day.
    expect(deriveMode(TRIP, new Date('2026-07-14T14:30:00Z'))).toBe('trip');
    // One hour later it's 2026-07-15 00:30 JST — Plan mode.
    expect(deriveMode(TRIP, new Date('2026-07-14T15:30:00Z'))).toBe('plan');
  });
});

describe('daysUntilStart', () => {
  it('counts down the trip-local calendar days before the trip starts', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe(1);
    expect(daysUntilStart(TRIP, new Date('2026-06-30T12:00:00+09:00'))).toBe(5);
  });

  it('is null on and after startDate — no countdown once the trip has begun', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBeNull();
    expect(daysUntilStart(TRIP, new Date('2026-07-07T18:52:00+09:00'))).toBeNull();
  });

  it('is null after the trip has ended too', () => {
    expect(daysUntilStart(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBeNull();
  });
});
