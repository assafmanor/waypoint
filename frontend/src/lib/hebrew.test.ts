import { describe, expect, it } from 'vitest';
import { dayCount, dayPhrase } from './hebrew';

describe('dayCount', () => {
  it('has no numeral for 1 (dual/singular forms replace it)', () => {
    expect(dayCount(1)).toEqual({ value: '', unit: 'יום' });
  });

  it('has no numeral for 2', () => {
    expect(dayCount(2)).toEqual({ value: '', unit: 'יומיים' });
  });

  it('shows a numeral from 3 up', () => {
    expect(dayCount(3)).toEqual({ value: '3', unit: 'ימים' });
    expect(dayCount(12)).toEqual({ value: '12', unit: 'ימים' });
  });
});

describe('dayPhrase', () => {
  it('combines into a single string', () => {
    expect(dayPhrase(1)).toBe('יום');
    expect(dayPhrase(2)).toBe('יומיים');
    expect(dayPhrase(5)).toBe('5 ימים');
  });
});
