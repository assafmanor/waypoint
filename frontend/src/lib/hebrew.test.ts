import { describe, expect, it } from 'vitest';
import {
  dayCount,
  dayPhrase,
  monthCount,
  monthPhrase,
  nightPhrase,
  weekPhrase,
  yearPhrase,
} from './hebrew';

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

describe('monthCount', () => {
  it('uses the same dual/plural rule as days', () => {
    expect(monthCount(1)).toEqual({ value: '', unit: 'חודש' });
    expect(monthCount(2)).toEqual({ value: '', unit: 'חודשיים' });
    expect(monthCount(4)).toEqual({ value: '4', unit: 'חודשים' });
  });
});

describe('monthPhrase', () => {
  it('combines into a single string', () => {
    expect(monthPhrase(1)).toBe('חודש');
    expect(monthPhrase(2)).toBe('חודשיים');
    expect(monthPhrase(4)).toBe('4 חודשים');
  });
});

describe('weekPhrase', () => {
  it('uses the same dual/plural rule', () => {
    expect(weekPhrase(1)).toBe('שבוע');
    expect(weekPhrase(2)).toBe('שבועיים');
    expect(weekPhrase(5)).toBe('5 שבועות');
  });
});

describe('yearPhrase', () => {
  it('uses the same dual/plural rule', () => {
    expect(yearPhrase(1)).toBe('שנה');
    expect(yearPhrase(2)).toBe('שנתיים');
    expect(yearPhrase(5)).toBe('5 שנים');
  });
});

describe('nightPhrase', () => {
  it('spells out one night ("לילה אחד") but counts from two up', () => {
    expect(nightPhrase(1)).toBe('לילה אחד');
    expect(nightPhrase(2)).toBe('2 לילות');
    expect(nightPhrase(5)).toBe('5 לילות');
  });
});
