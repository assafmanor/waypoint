import { describe, expect, it } from 'vitest';
import { COUNTRY_CURRENCY, DESTINATIONS } from '@waypoint/shared';
import { ALIASES, currencyMatchesQuery, engineIndependentTerms } from './currency-search';

const hits = (q: string): string[] =>
  Intl.supportedValuesOf('currency').filter((c) => currencyMatchesQuery(c, q));
const finds = (q: string, code: string): boolean => hits(q).includes(code);

// The reported miss, from both ends: a currency the user needed and could not
// reach, and a spelling the list silently refused.
describe('the two reports', () => {
  it('finds the Icelandic króna by anything a person would type', () => {
    // Before: only `ISK` and the exact CLDR string `כתר איסלנדי` worked, and
    // there was nothing on screen to say so.
    for (const q of [
      'ISK',
      'isk',
      'iceland',
      'Icelandic',
      'krona', // the English name is `króna` — folded
      'איסלנד',
      'כתר',
      'רייקיאוויק',
      'reykjavik',
    ]) {
      expect(finds(q, 'ISK'), `"${q}" should find ISK`).toBe(true);
    }
  });

  it('finds the pound by every spelling of it, single word or phrase', () => {
    // `לירה סטרלינג` is the one that proves the WORD-WISE rule: CLDR spells it
    // `לירה שטרלינג` with a shin, so the samekh phrase exists in no single term —
    // `לירה` comes from CLDR and `סטרלינג` from the alias table.
    for (const q of ['סטרלינג', 'שטרלינג', 'פאונד', 'לירה', 'לירה סטרלינג', 'לירה שטרלינג']) {
      expect(finds(q, 'GBP'), `"${q}" should find GBP`).toBe(true);
    }
  });

  it('finds the yen by one yod and by two', () => {
    for (const q of ['ין', 'יין', 'ין יפני', 'JPY', 'japan', 'יפן']) {
      expect(finds(q, 'JPY'), `"${q}" should find JPY`).toBe(true);
    }
  });

  it('finds the shekel by every name it goes by', () => {
    // The full reported list. `שקל`/`שקלים` are inside CLDR's `שקלים חדשים` and
    // `shekel` inside the English name; `שח` and `nis` are the two that are not.
    // `שקל חדש` is the word-wise case: neither word is whole in `שקלים חדשים`.
    for (const q of [
      'שקל',
      'שקלים',
      'ש״ח',
      'ש"ח',
      'שח',
      'nis',
      'NIS',
      'ils',
      'shekel',
      'שקל חדש',
    ]) {
      expect(finds(q, 'ILS'), `"${q}" should find ILS`).toBe(true);
    }
  });

  it('finds the euro as יורו, which CLDR spells אירו', () => {
    // The reported spelling. CLDR carries exactly one, and half the country
    // types the other.
    for (const q of ['יורו', 'אירו', 'euro', 'EUR', '€', 'france', 'ספרד']) {
      expect(finds(q, 'EUR'), `"${q}" should find EUR`).toBe(true);
    }
  });
});

describe('every name a currency has', () => {
  it('matches the ENGLISH name, which the first version never asked for', () => {
    expect(finds('Japanese', 'JPY')).toBe(true);
    expect(finds('swiss', 'CHF')).toBe(true);
    expect(finds('rupees', 'INR')).toBe(true);
  });

  it('matches BOTH symbol forms, which genuinely differ', () => {
    // Narrow vs wide is not cosmetic: `$` vs `A$`, `kr` vs `ISK`, `¥` vs `CN¥`.
    expect(finds('A$', 'AUD')).toBe(true);
    expect(finds('NT$', 'TWD')).toBe(true);
    expect(finds('₪', 'ILS')).toBe(true);
    expect(finds('Kč', 'CZK')).toBe(true);
  });

  it('matches the country, in either language', () => {
    expect(finds('vietnam', 'VND')).toBe(true);
    expect(finds('קמבודיה', 'KHR')).toBe(true);
    expect(finds('טוקיו', 'JPY')).toBe(true);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(finds('ILS', 'ILS')).toBe(true);
    expect(finds('ils', 'ILS')).toBe(true);
    expect(finds('ש״ח', 'ILS')).toBe(true);
  });

  it('matches a phrase word by word, across DIFFERENT names', () => {
    // The rule the first version lacked. Each of these takes one word from the
    // CLDR name and one from somewhere else, so no single term contains it.
    expect(finds('לירה סטרלינג', 'GBP')).toBe(true);
    expect(finds('שקל חדש', 'ILS')).toBe(true);
    expect(finds('לירה טורקית', 'TRY')).toBe(true);
    // Multi-word country names keep working, from the country terms.
    expect(finds('new zealand', 'NZD')).toBe(true);
    expect(finds('costa rica', 'CRC')).toBe(true);
  });

  it('AND-s the words, so a second word narrows rather than widens', () => {
    // `dollar` is a family; `dollar canadian` is one currency. If words were
    // OR-ed, adding a word could only ever return MORE rows.
    expect(hits('dollar').length).toBeGreaterThan(hits('dollar canadian').length);
    expect(hits('dollar canadian')).toEqual(['CAD']);
  });
});

describe('lenient, but still a search', () => {
  it('returns a family for a family word, which is the right answer to it', () => {
    // "dollar" SHOULD return twenty rows. The list is short enough to scan, and
    // narrowing this is how the original door got so narrow.
    expect(hits('dollar').length).toBeGreaterThan(10);
    expect(hits('dollar')).toContain('USD');
    expect(hits('dollar')).toContain('CAD');
  });

  it('does not match a currency that has nothing to do with the query', () => {
    expect(finds('iceland', 'JPY')).toBe(false);
    expect(finds('יורו', 'ILS')).toBe(false);
    expect(hits('zzzzz')).toHaveLength(0);
  });

  it('matches everything on a blank query — the at-rest list', () => {
    expect(hits('').length).toBe(Intl.supportedValuesOf('currency').length);
  });

  it('answers for every currency the picker offers, without throwing', () => {
    // The picker offers the runtime's whole ISO-4217 set, including codes with
    // no CLDR name and no curated country. None of them may throw mid-keystroke.
    for (const code of Intl.supportedValuesOf('currency')) {
      expect(() => currencyMatchesQuery(code, 'x')).not.toThrow();
      expect(currencyMatchesQuery(code, code), `${code} finds itself`).toBe(true);
    }
  });
});

// The two rules `ALIASES` states about itself, enforced. A table of hand-typed
// spellings goes stale silently otherwise — the first draft of it carried two
// spellings nobody writes and three that CLDR already answered, and every test
// still passed because a redundant alias changes no result.
describe('the alias table keeps its own rules', () => {
  it('duplicates nothing the engine cannot take away', () => {
    // Narrowed deliberately (rule 2). Duplicating a CLDR name is legitimate —
    // that is what keeps ISK findable by `כתר` on an engine missing its data —
    // but duplicating the code or a country name buys nothing on any engine.
    for (const [currency, aliases] of Object.entries(ALIASES)) {
      const owned = engineIndependentTerms(currency).join(' | ');
      for (const alias of aliases) {
        expect(owned.includes(alias), `${currency}: "${alias}" is already ours`).toBe(false);
      }
    }
  });

  it('keeps the four krónur one family, on any engine', () => {
    // The reported symptom, as a rule rather than a case: `כתר` and `קרונה` must
    // each return all four, and ISK must not depend on CLDR to be one of them.
    for (const krona of ['ISK', 'DKK', 'NOK', 'SEK']) {
      expect(finds('קרונה', krona), `קרונה should find ${krona}`).toBe(true);
      expect(finds('כתר', krona), `כתר should find ${krona}`).toBe(true);
    }
  });

  it('names only currencies that exist', () => {
    const all = new Set(Intl.supportedValuesOf('currency'));
    for (const currency of Object.keys(ALIASES)) expect(all.has(currency)).toBe(true);
  });
});

// The coverage claim, stated as a test rather than as a sentence: if the app can
// send you somewhere, you can find what you will be paying in — by the country,
// in either language, without knowing the currency's name or code at all.
describe('every destination the app offers reaches its currency', () => {
  for (const destination of DESTINATIONS) {
    const currency = COUNTRY_CURRENCY[destination.code];
    it(`${destination.he} → ${currency}`, () => {
      expect(finds(destination.he, currency)).toBe(true);
      for (const alias of destination.aliases) {
        expect(finds(alias, currency), `"${alias}" should find ${currency}`).toBe(true);
      }
    });
  }
});
