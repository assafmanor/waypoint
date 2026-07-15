// Pure-logic coverage for the event time picker (T-054, ADR-0036). The repo
// tests behaviour, not React rendering (no testing-library), so the picker's
// load-bearing rules live in exported helpers and are exercised here. Exact
// entry is the native <input type="time"> (ADR-0036 §2c) — its value is always
// a valid HH:MM, so there's no custom parsing left to test.
import { describe, it, expect } from 'vitest';
import { endToDuration, clampSameDay, nearestRoundSlot } from './TimePicker';

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
