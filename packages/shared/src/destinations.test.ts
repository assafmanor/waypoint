import { describe, expect, it } from 'vitest';
import {
  COUNTRY_CURRENCY,
  DESTINATIONS,
  currencyForCountry,
  currencyCountryTerms,
  flagForCountry,
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

describe('flagForCountry', () => {
  it('answers the flag for a resolved alpha-2 code, in either case', () => {
    expect(flagForCountry('CY')).toBe('🇨🇾');
    expect(flagForCountry('jp')).toBe('🇯🇵');
  });

  it('degrades to undefined rather than building a glyph out of junk', () => {
    for (const code of [undefined, null, '', '   ', 'C', 'CYP', '12']) {
      expect(flagForCountry(code)).toBeUndefined();
    }
  });
});

describe('suggestFlagFromDestination', () => {
  it('matches an alias inside a sentence', () => {
    expect(suggestFlagFromDestination('a trip to tokyo')).toBe('🇯🇵');
  });

  it('matches a term only as a whole word, not as a substring', () => {
    expect(suggestFlagFromDestination('us')).toBe('🇺🇸');
    expect(suggestFlagFromDestination('australia')).not.toBe('🇺🇸');
  });

  it('matches the Hebrew display name too, through a glued preposition', () => {
    expect(suggestFlagFromDestination('טיול ליפן')).toBe('🇯🇵');
    expect(suggestFlagFromDestination('בקפריסין')).toBe('🇨🇾');
  });

  // The owner-reported miss: סין is literally the last three letters of קפריסין
  // (final nun included), so a substring rule answered China for Cyprus.
  it('does not answer a country whose name merely ENDS the word', () => {
    expect(suggestFlagFromDestination('קפריסין')).toBe('🇨🇾');
    expect(suggestFlagFromDestination('טיול לקפריסין')).toBe('🇨🇾');
  });

  // The guard the Cyprus miss would have tripped: every name the picker offers
  // resolves to its OWN flag, whatever order the list happens to be in.
  it('resolves every curated name and alias to its own country', () => {
    const wrong = DESTINATIONS.flatMap((d) =>
      [d.he, ...d.aliases]
        .filter((term) => suggestFlagFromDestination(term) !== flagFromCode(d.code))
        .map((term) => `${term} (${d.code}) → ${suggestFlagFromDestination(term) ?? 'none'}`),
    );
    expect(wrong).toEqual([]);
  });

  // A city-level pick is nowhere in the curated list, and does not need to be:
  // the pick resolved a country (ADR-0113) and that beats reading the words.
  it('prefers the resolved country code over the text', () => {
    expect(suggestFlagFromDestination('פאפוס', 'CY')).toBe('🇨🇾');
    expect(suggestFlagFromDestination('Kigali', 'RW')).toBe('🇷🇼');
    // …and the text still answers when the code is the thing that's missing.
    expect(suggestFlagFromDestination('פאפוס', undefined)).toBe('🇨🇾');
    expect(suggestFlagFromDestination('טוקיו', '')).toBe('🇯🇵');
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

describe('currencyCountryTerms — a currency is found by its PLACE', () => {
  // The matching itself is the frontend's (it needs `Intl` for the currency's own
  // names, which this package deliberately has no business calling). What lives
  // here is the DATA: which country words belong to which currency.
  const terms = (currency: string) => currencyCountryTerms(currency).join(' | ');

  it('carries every name the destination search knows for Iceland', () => {
    for (const term of ['איסלנד', 'iceland', 'רייקיאוויק', 'reykjavik']) {
      expect(terms('ISK')).toContain(term);
    }
  });

  it('collects ALL of a currency’s countries, not just the first', () => {
    // The euro is the case that would break a first-wins index.
    for (const term of ['france', 'ספרד', 'amsterdam']) {
      expect(terms('EUR')).toContain(term);
    }
  });

  it('keeps a country’s words out of a currency it does not belong to', () => {
    expect(terms('ISK')).not.toContain('japan');
    expect(terms('JPY')).not.toContain('iceland');
  });

  it('answers empty rather than throwing for a currency with no curated country', () => {
    // `DESTINATIONS` is curated, so most of the 152 codes have no entry. The
    // contract is the table's own: a miss degrades, and the caller still has the
    // currency's code, names and symbols to match on.
    expect(currencyCountryTerms('KPW')).toEqual([]);
  });

  it('covers every destination the app offers', () => {
    // The guarantee that matters: if a country is pickable as a destination, its
    // currency carries that country's own name.
    for (const d of DESTINATIONS) {
      const currency = currencyForCountry(d.code);
      expect(currency, `${d.code} has no currency`).toBeDefined();
      expect(currencyCountryTerms(currency!), `${d.code} → ${currency}`).toContain(d.he);
    }
  });
});
