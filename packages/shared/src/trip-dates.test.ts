import { describe, expect, it } from 'vitest';
import { tripRangeShape } from './trip-dates';

/** The four cases the range's shape has to tell apart, and they are the same four
 *  `frontend/src/lib/time.test.ts` asserts the Hebrew for — that pairing is the point of
 *  the discriminant (ADR-0220 §4): one decision here, the words in each renderer. */
describe('tripRangeShape', () => {
  it('is same-day when both ends are the one calendar day', () => {
    expect(tripRangeShape('2026-09-11', '2026-09-11')).toBe('same-day');
  });

  it('is same-month when the month and year are shared', () => {
    expect(tripRangeShape('2026-09-11', '2026-09-22')).toBe('same-month');
  });

  it('is same-year when the months differ', () => {
    expect(tripRangeShape('2026-09-27', '2026-10-03')).toBe('same-year');
  });

  it('is cross-year when the years differ', () => {
    expect(tripRangeShape('2026-12-27', '2027-01-03')).toBe('cross-year');
  });

  /** Same day-of-month in different months is NOT same-day, and getting that wrong is a
   *  one-character bug that only a date like this catches — the naive check compares the
   *  day number before the month. */
  it('does not read the same day number in two months as one day', () => {
    expect(tripRangeShape('2026-09-11', '2026-10-11')).toBe('same-year');
  });

  /** Calendar dates are read in UTC (a trip's span is not an instant), so the shape must
   *  not depend on the runtime's zone — this is the assertion that keeps it honest. */
  it('reads the dates in UTC, not the ambient zone', () => {
    expect(tripRangeShape('2026-03-01', '2026-03-31')).toBe('same-month');
    expect(tripRangeShape('2026-01-01', '2026-01-01')).toBe('same-day');
  });
});
