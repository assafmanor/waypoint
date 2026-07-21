import { describe, expect, it } from 'vitest';
import { matchesAnyTerm, normalizeSearchTerm } from './search-terms';

describe('normalizeSearchTerm', () => {
  it('lowercases', () => {
    expect(normalizeSearchTerm('RAMEN')).toBe('ramen');
  });

  it('strips quotes, backticks, periods, and Hebrew geresh/gershayim', () => {
    expect(normalizeSearchTerm(`ארה"ב`)).toBe('ארהב');
    expect(normalizeSearchTerm('צ׳כיה')).toBe('צכיה');
    expect(normalizeSearchTerm("d'italia")).toBe('ditalia');
    expect(normalizeSearchTerm('u.s.a.')).toBe('usa');
  });

  it('collapses internal whitespace and trims the ends', () => {
    expect(normalizeSearchTerm('  new   york  ')).toBe('new york');
  });
});

describe('matchesAnyTerm', () => {
  it('matches case/punctuation-insensitively against any term in the list', () => {
    expect(matchesAnyTerm('ramen', ['Ichiran Ramen', 'NA832'])).toBe(true);
    expect(matchesAnyTerm('RAMEN', ['Ichiran Ramen'])).toBe(true);
    expect(matchesAnyTerm('sushi', ['Ichiran Ramen'])).toBe(false);
  });

  it('skips undefined terms without throwing', () => {
    expect(matchesAnyTerm('x', [undefined, 'xyz'])).toBe(true);
    expect(matchesAnyTerm('zz', [undefined])).toBe(false);
  });

  it('a blank query matches whenever at least one term is present (no built-in empty special case)', () => {
    expect(matchesAnyTerm('', ['anything'])).toBe(true);
    expect(matchesAnyTerm('', [])).toBe(false);
  });
});
