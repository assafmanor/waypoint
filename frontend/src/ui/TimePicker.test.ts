// Pure-logic coverage for the event time picker (T-054, ADR-0036). The repo
// tests behaviour, not React rendering (no testing-library), so the picker's
// two load-bearing rules live in exported helpers and are exercised here:
//   • loose exact-time parsing (the off-grid fallback), and
//   • the same-day guard that keeps multi-day events out of scope.
import { describe, it, expect } from 'vitest';
import { parseLoose, endToDuration, clampSameDay, nearestRoundSlot, maskTime } from './TimePicker';

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

describe('maskTime (auto-insert the colon)', () => {
  it('leaves one or two digits as the bare hour', () => {
    expect(maskTime('1')).toBe('1');
    expect(maskTime('14')).toBe('14');
  });

  it('inserts the colon before the last two digits', () => {
    expect(maskTime('930')).toBe('9:30');
    expect(maskTime('907')).toBe('9:07');
    expect(maskTime('1430')).toBe('14:30');
    expect(maskTime('0907')).toBe('09:07');
  });

  it('strips a colon the user typed and re-derives it', () => {
    expect(maskTime('9:30')).toBe('9:30');
    expect(maskTime('09:07')).toBe('09:07');
  });

  it('ignores non-digits and caps at four digits', () => {
    expect(maskTime('9a3b0')).toBe('9:30');
    expect(maskTime('12345')).toBe('12:34');
    expect(maskTime('')).toBe('');
  });

  it('round-trips through parseLoose', () => {
    expect(parseLoose(maskTime('907'))).toBe(9 * 60 + 7);
    expect(parseLoose(maskTime('1430'))).toBe(14 * 60 + 30);
  });
});

describe('nearestRoundSlot (reopen suggestion)', () => {
  it('rounds to the nearest quarter-hour', () => {
    expect(nearestRoundSlot(11 * 60 + 47)).toBe(11 * 60 + 45); // 11:47 → 11:45
    expect(nearestRoundSlot(11 * 60 + 57)).toBe(12 * 60); // 11:57 → 12:00
    expect(nearestRoundSlot(9 * 60 + 7)).toBe(9 * 60); // 09:07 → 09:00
    expect(nearestRoundSlot(9 * 60 + 8)).toBe(9 * 60 + 15); // 09:08 → 09:15
  });

  it('leaves an already-round slot unchanged', () => {
    expect(nearestRoundSlot(9 * 60 + 30)).toBe(9 * 60 + 30);
  });

  it('caps at the last slot (23:45) so it is always a real list row', () => {
    expect(nearestRoundSlot(23 * 60 + 58)).toBe(23 * 60 + 45); // not 24:00
  });
});
