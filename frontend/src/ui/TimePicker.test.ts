// Pure-logic coverage for the event time picker (T-054, ADR-0036). The repo
// tests behaviour, not React rendering (no testing-library), so the picker's
// two load-bearing rules live in exported helpers and are exercised here:
//   • loose exact-time parsing (the off-grid fallback), and
//   • the same-day guard that keeps multi-day events out of scope.
import { describe, it, expect } from 'vitest';
import { parseLoose, endToDuration, clampSameDay } from './TimePicker';

describe('parseLoose', () => {
  it('parses HH:MM', () => {
    expect(parseLoose('09:07')).toBe(9 * 60 + 7);
    expect(parseLoose('23:59')).toBe(23 * 60 + 59);
    expect(parseLoose('0:00')).toBe(0);
  });

  it('parses digits-only, treating the last two as minutes', () => {
    expect(parseLoose('907')).toBe(9 * 60 + 7);
    expect(parseLoose('0907')).toBe(9 * 60 + 7);
    expect(parseLoose('1430')).toBe(14 * 60 + 30);
  });

  it('treats one or two bare digits as a whole hour', () => {
    expect(parseLoose('9')).toBe(9 * 60);
    expect(parseLoose('14')).toBe(14 * 60);
  });

  it('tolerates a lone hour before the colon', () => {
    expect(parseLoose('9:')).toBe(9 * 60);
  });

  it('rejects out-of-range and empty input', () => {
    expect(parseLoose('24:00')).toBeNull();
    expect(parseLoose('12:60')).toBeNull();
    expect(parseLoose('99')).toBeNull(); // 99 → hour 99
    expect(parseLoose('')).toBeNull();
    expect(parseLoose('abc')).toBeNull();
  });
});

describe('endToDuration (same-day guard)', () => {
  it('returns the gap when the end is later the same day', () => {
    expect(endToDuration(9 * 60 + 30, 10 * 60 + 30)).toBe(60);
    expect(endToDuration(0, 23 * 60 + 59)).toBe(23 * 60 + 59);
  });

  it('rejects an end at or before the start (would be multi-day)', () => {
    expect(endToDuration(9 * 60, 9 * 60)).toBeNull(); // equal
    expect(endToDuration(22 * 60, 1 * 60)).toBeNull(); // wraps past midnight
  });
});

describe('clampSameDay', () => {
  it('caps a span at 23:59 so it never spills into tomorrow', () => {
    expect(clampSameDay(23 * 60 + 30)).toBe(23 * 60 + 30);
    expect(clampSameDay(24 * 60)).toBe(23 * 60 + 59); // start 22:00 + 3h
    expect(clampSameDay(30 * 60)).toBe(23 * 60 + 59);
  });
});
