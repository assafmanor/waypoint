import { describe, expect, it } from 'vitest';
import { TIME_FACT, TIME_FACT_ATTR, claimClock, parseTimeFacts, timeFacts } from './time-claim';

const AT = Date.parse('2026-08-03T12:37:00.000Z');
const ZONE = 'Europe/Rome';

describe('timeFacts — the encoding', () => {
  it('writes one claim as kind, instant, zone and subject', () => {
    const attrs = timeFacts({ kind: TIME_FACT.LEAVE_BY, atMs: AT, zone: ZONE, of: 'ev-dinner' });
    expect(attrs[TIME_FACT_ATTR]).toBe('leave-by|2026-08-03T12:37:00.000Z|Europe/Rome|ev-dinner');
  });

  /** The case the attribute exists for: `journeyMetaLine` returns ONE text run carrying both a
   *  departure and an arrival, so a per-element tag would mean splitting a rendered sentence
   *  into spans for the test's benefit. */
  it('carries several claims on one element', () => {
    const attrs = timeFacts(
      { kind: TIME_FACT.LEAVE_BY, atMs: AT, zone: ZONE, of: 'ev-dinner' },
      { kind: TIME_FACT.ARRIVE_AT, atMs: AT + 60_000, zone: ZONE, of: 'ev-dinner' },
    );
    expect(parseTimeFacts(attrs[TIME_FACT_ATTR])).toEqual([
      { kind: 'leave-by', atMs: AT, zone: ZONE, of: 'ev-dinner' },
      { kind: 'arrive-at', atMs: AT + 60_000, zone: ZONE, of: 'ev-dinner' },
    ]);
  });

  /** Absence is a first-class answer on every surface that states these (ADR-0206 §D4), so a
   *  caller must be able to pass a conditional claim without branching around the spread. */
  it('drops absent claims, and emits no attribute when they all are', () => {
    expect(timeFacts(null, undefined)).toEqual({});
    const attrs = timeFacts(null, { kind: TIME_FACT.FREE_UNTIL, atMs: AT, zone: ZONE });
    expect(parseTimeFacts(attrs[TIME_FACT_ATTR])).toHaveLength(1);
  });

  /** A non-finite instant is not a claim. It reaches here from `leaveByMs` on arms that answer
   *  `null`, and an `Invalid Date` in the DOM would fail the suite as a disagreement rather
   *  than as the absence it is. */
  it('refuses an instant that is not a number', () => {
    expect(timeFacts({ kind: TIME_FACT.LEAVE_BY, atMs: Number.NaN, zone: ZONE })).toEqual({});
  });

  it('round-trips a claim with no subject', () => {
    const attrs = timeFacts({ kind: TIME_FACT.FREE_UNTIL, atMs: AT, zone: ZONE });
    expect(parseTimeFacts(attrs[TIME_FACT_ATTR])).toEqual([
      { kind: 'free-until', atMs: AT, zone: ZONE },
    ]);
  });

  it('reads nothing out of an absent or malformed attribute', () => {
    expect(parseTimeFacts(null)).toEqual([]);
    expect(parseTimeFacts('')).toEqual([]);
    expect(parseTimeFacts('leave-by|not-an-instant|Europe/Rome|x')).toEqual([]);
    expect(parseTimeFacts('|||')).toEqual([]);
  });
});

describe('claimClock — the zone half of the contract', () => {
  /** §BD's shape: the same instant, two zones, two clocks. This is what lets the suite catch a
   *  surface that agrees about the moment and prints it against the wrong wall. */
  it('reads one instant differently in two zones', () => {
    expect(claimClock({ kind: TIME_FACT.LEAVE_BY, atMs: AT, zone: 'Europe/Rome' })).toBe('14:37');
    expect(claimClock({ kind: TIME_FACT.LEAVE_BY, atMs: AT, zone: 'Atlantic/Reykjavik' })).toBe(
      '12:37',
    );
  });
});
