import { describe, expect, it } from 'vitest';
import { flagFromCode, searchDestinations, suggestFlagFromDestination } from './destinations';

describe('flagFromCode', () => {
  it('builds a flag emoji from an ISO-3166 alpha-2 code', () => {
    expect(flagFromCode('JP')).toBe('🇯🇵');
    expect(flagFromCode('il')).toBe('🇮🇱');
  });
});

describe('suggestFlagFromDestination', () => {
  it('matches a long alias as a substring', () => {
    expect(suggestFlagFromDestination('a trip to tokyo')).toBe('🇯🇵');
  });

  it('matches a short (≤2-char) alias only as a whole token, not a substring', () => {
    expect(suggestFlagFromDestination('us')).toBe('🇺🇸');
    expect(suggestFlagFromDestination('australia')).not.toBe('🇺🇸');
  });

  it('matches the Hebrew display name too', () => {
    expect(suggestFlagFromDestination('טיול ליפן')).toBe('🇯🇵');
  });

  it('is undefined for blank or unmatched text', () => {
    expect(suggestFlagFromDestination(undefined)).toBeUndefined();
    expect(suggestFlagFromDestination('   ')).toBeUndefined();
    expect(suggestFlagFromDestination('nowhereland')).toBeUndefined();
  });
});

describe('searchDestinations', () => {
  it('returns every destination for a blank query', () => {
    expect(searchDestinations('').length).toBeGreaterThan(1);
    expect(searchDestinations('   ').length).toBeGreaterThan(1);
  });

  it('matches by Hebrew name, alias, or ISO code, case/punctuation-insensitively', () => {
    expect(searchDestinations('יפן').map((d) => d.code)).toContain('JP');
    expect(searchDestinations('TOKYO').map((d) => d.code)).toContain('JP');
    expect(searchDestinations('jp').map((d) => d.code)).toContain('JP');
  });

  it('excludes non-matching destinations', () => {
    expect(searchDestinations('nowhereland')).toHaveLength(0);
  });
});
