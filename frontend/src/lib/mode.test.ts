import { describe, expect, it } from 'vitest';
import type { ZoneEvidence } from '@waypoint/shared';
import { daysUntilStart, deriveMode, tripPhase } from './mode';
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

describe('tripPhase', () => {
  it('is pre before the trip starts', () => {
    expect(tripPhase(TRIP, new Date('2026-07-04T23:00:00+09:00'))).toBe('pre');
  });

  it('is live from startDate through endDate inclusive', () => {
    expect(tripPhase(TRIP, new Date('2026-07-05T00:00:01+09:00'))).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T23:59:00+09:00'))).toBe('live');
  });

  it('is past after the trip ends', () => {
    expect(tripPhase(TRIP, new Date('2026-07-15T00:30:00+09:00'))).toBe('past');
  });

  it('reads the calendar day in the trip timezone, not UTC', () => {
    expect(tripPhase(TRIP, new Date('2026-07-14T14:30:00Z'))).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T15:30:00Z'))).toBe('past');
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

describe('with zone evidence — "today" is the itinerary\'s, not the destination\'s (ADR-0107 §4)', () => {
  const JLM = 'Asia/Jerusalem';
  const evidence = (crossings: ZoneEvidence['crossings'], primaryZone: string): ZoneEvidence => ({
    events: [],
    bookings: [],
    places: [],
    crossings,
    primaryZone,
  });

  it('counts the days to departure from home before the outbound flight (field report, 2026-09-09)', () => {
    // Iceland trip, 11–22 September; the outbound flight leaves Tel Aviv on the 11th.
    const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: 'Atlantic/Reykjavik' };
    const ev = evidence(
      [{ at: Date.parse('2026-09-11T05:00:00Z'), fromZone: JLM, toZone: 'Atlantic/Reykjavik' }],
      trip.timezone,
    );
    // 00:58 at home on the 9th — 21:58 on the 8th in Reykjavík. The hero said 3; it is 2.
    const at = new Date('2026-09-08T21:58:00Z');
    expect(daysUntilStart(trip, at)).toBe(3); // the primary-zone fallback, kept for the trip list
    expect(daysUntilStart(trip, at, ev)).toBe(2);
    expect(tripPhase(trip, at, ev)).toBe('pre');
  });

  it('starts the trip on the home midnight of startDate, before the flight leaves', () => {
    const ev = evidence(
      [{ at: Date.parse('2026-07-05T05:00:00Z'), fromZone: JLM, toZone: TRIP.timezone }],
      TRIP.timezone,
    );
    // 19:00 at home on the 4th is already 01:00 on the 5th in Tokyo — still the day before.
    const eve = new Date('2026-07-04T16:00:00Z');
    expect(tripPhase(TRIP, eve, ev)).toBe('pre');
    expect(daysUntilStart(TRIP, eve, ev)).toBe(1);
    expect(deriveMode(TRIP, eve, ev)).toBe('plan');
    // 00:30 at home on the 5th: the flight is today, so it is Trip mode.
    const morning = new Date('2026-07-04T21:30:00Z');
    expect(tripPhase(TRIP, morning, ev)).toBe('live');
    expect(daysUntilStart(TRIP, morning, ev)).toBeNull();
    expect(deriveMode(TRIP, morning, ev)).toBe('trip');
  });

  // The Tokyo case above passes for the wrong reason on a WESTWARD trip: Tokyo's midnight
  // comes before home's, so by home midnight the far side is already on day 1. Reykjavík's
  // comes three hours after, and `liveZone` read the departure day's ambient (the far side),
  // so Trip mode opened at 03:00 at home (owner's device, 2026-09-10: `26:59:48` to מחר).
  it("starts a westward trip on the home midnight too, not the far side's (field report, 2026-09-10)", () => {
    const trip = { startDate: '2026-09-11', endDate: '2026-09-22', timezone: 'Atlantic/Reykjavik' };
    const ev = evidence(
      [{ at: Date.parse('2026-09-11T05:00:00Z'), fromZone: JLM, toZone: 'Atlantic/Reykjavik' }],
      trip.timezone,
    );
    const homeMidnight = Date.parse('2026-09-10T21:00:00Z');
    expect(deriveMode(trip, new Date(homeMidnight - 1), ev)).toBe('plan');
    expect(daysUntilStart(trip, new Date(homeMidnight - 1), ev)).toBe(1);
    expect(deriveMode(trip, new Date(homeMidnight), ev)).toBe('trip');
    expect(daysUntilStart(trip, new Date(homeMidnight), ev)).toBeNull();
  });

  it('reads the destination once the crossing has departed, as the day view does', () => {
    const ev = evidence(
      [{ at: Date.parse('2026-07-05T05:00:00Z'), fromZone: JLM, toZone: TRIP.timezone }],
      TRIP.timezone,
    );
    // 23:30 JST on the last day is 17:30 at home — the trip is still live where you are.
    expect(tripPhase(TRIP, new Date('2026-07-14T14:30:00Z'), ev)).toBe('live');
    expect(tripPhase(TRIP, new Date('2026-07-14T15:30:00Z'), ev)).toBe('past');
  });

  it('falls back to the trip primary zone when no crossing anchors the itinerary', () => {
    const ev = evidence([], TRIP.timezone);
    expect(tripPhase(TRIP, new Date('2026-07-04T16:00:00Z'), ev)).toBe('live');
    expect(daysUntilStart(TRIP, new Date('2026-07-04T16:00:00Z'), ev)).toBeNull();
  });
});
