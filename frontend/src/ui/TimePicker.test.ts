// Pure-logic coverage for the event time picker (T-054, ADR-0036). The repo
// tests behaviour, not React rendering (no testing-library), so the picker's
// load-bearing rules live in exported helpers and are exercised here. Exact
// entry is the native <input type="time"> (ADR-0036 §2c) — its value is always
// a valid HH:MM, so there's no custom parsing left to test.
import { describe, it, expect } from 'vitest';
import { endToDuration, clampToLatestEnd, nearestRoundSlot } from './TimePicker';

describe('endToDuration', () => {
  it('returns the gap when the end is later the same day', () => {
    expect(endToDuration(9 * 60 + 30, 10 * 60 + 30)).toBe(60);
    expect(endToDuration(0, 23 * 60 + 59)).toBe(23 * 60 + 59);
  });

  it('reads an earlier end from an evening start as an overnight span (ADR-0037)', () => {
    expect(endToDuration(23 * 60, 2 * 60)).toBe(3 * 60); // 23:00 → 02:00 = 3h
    expect(endToDuration(22 * 60, 7 * 60)).toBe(9 * 60); // 22:00 → 07:00 (cutoff) = 9h
  });

  it('rejects an end past the overnight cutoff or from a morning start', () => {
    expect(endToDuration(9 * 60, 9 * 60)).toBeNull(); // equal
    expect(endToDuration(23 * 60, 8 * 60)).toBeNull(); // 08:00 is past the 07:00 cutoff
    expect(endToDuration(5 * 60, 4 * 60)).toBeNull(); // morning start → not an overnight, a typo
  });
});

describe('clampToLatestEnd', () => {
  it('caps an evening start at the overnight cutoff (31:00 = 07:00 next day)', () => {
    expect(clampToLatestEnd(22 * 60, 24 * 60)).toBe(24 * 60); // 00:00, within window
    expect(clampToLatestEnd(22 * 60, 40 * 60)).toBe(31 * 60); // clamps to 07:00 next day
  });

  it('caps a morning start at the same day (23:59)', () => {
    expect(clampToLatestEnd(9 * 60, 30 * 60)).toBe(23 * 60 + 59);
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
