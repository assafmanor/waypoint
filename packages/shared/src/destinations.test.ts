import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CURRENCY,
  DESTINATIONS,
  currencyForCountry,
  flagFromCode,
  searchDestinations,
  suggestFlagFromDestination,
} from './destinations';

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

describe('COUNTRY_CURRENCY / currencyForCountry', () => {
  it('resolves a country to its ISO-4217 currency', () => {
    expect(currencyForCountry('JP')).toBe('JPY');
    expect(currencyForCountry('IL')).toBe('ILS');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('resolves the whole Eurozone to EUR, including the small states', () => {
    for (const code of ['DE', 'FR', 'IT', 'PT', 'GR', 'MC', 'ME', 'XK']) {
      expect(currencyForCountry(code)).toBe('EUR');
    }
  });

  it('is case-insensitive, because the code arrives from a third party', () => {
    expect(currencyForCountry('jp')).toBe('JPY');
  });

  // The contract in the table's own doc comment, and the reason a miss is safe:
  // the caller leaves whatever is already there rather than guessing.
  it('degrades to undefined rather than guessing', () => {
    expect(currencyForCountry('ZZ')).toBeUndefined();
    expect(currencyForCountry('')).toBeUndefined();
    expect(currencyForCountry(undefined)).toBeUndefined();
    expect(currencyForCountry(null)).toBeUndefined();
  });

  // The table is only useful if it covers the destinations the app itself
  // offers — a picker entry that derives nothing is the miss a user would
  // actually hit. Iceland is the second entry, and it is also the country that
  // exposed the rate source's coverage gap (ADR-0180 §7).
  it('covers every country in DESTINATIONS', () => {
    const unresolved = DESTINATIONS.filter((d) => !currencyForCountry(d.code)).map((d) => d.code);
    expect(unresolved).toEqual([]);
  });

  // A typo here is invisible: a bad code still "resolves", and only blows up
  // later inside Intl at a render site. Checked against the runtime's own set.
  it('holds only currencies the runtime recognises', () => {
    const known = new Set(
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : [],
    );
    if (known.size === 0) return; // engine without supportedValuesOf — nothing to check
    const unknown = [...new Set(Object.values(COUNTRY_CURRENCY))].filter((c) => !known.has(c));
    expect(unknown).toEqual([]);
  });

  it('keys on ISO-3166 alpha-2 throughout', () => {
    const malformed = Object.keys(COUNTRY_CURRENCY).filter((k) => !/^[A-Z]{2}$/.test(k));
    expect(malformed).toEqual([]);
  });
});
