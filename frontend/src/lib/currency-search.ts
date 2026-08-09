// **How a person finds a currency** (ADR-0180 §6).
//
// The first version matched three things — the code, the CLDR name in the app
// locale, and the narrow symbol — and that turned out to be a much narrower door
// than it reads like, because CLDR's Hebrew name is *one* spelling of many:
//
//   - `אירו` is the euro's CLDR name, and half the country types `יורו`.
//   - ISK is `כתר איסלנדי`, so `איסלנד` worked and `iceland` did not.
//   - `kr` is the narrow symbol for ISK, SEK, NOK and DKK alike, while the thing
//     actually printed on an Icelandic price tag is `ISK`.
//
// So the search now asks **every name the currency has**, and the list is built
// per currency rather than per language:
//
//  1. the ISO code
//  2. the CLDR name in the app locale (`כתר איסלנדי`)
//  3. **the CLDR name in English** (`Icelandic króna`) — this alone answers
//     `iceland`, `dollar`, `franc`, `peso`, and it costs one extra `Intl` call
//  4. **both** symbol forms, which genuinely differ: narrow `kr` vs wide `ISK`,
//     narrow `$` vs wide `A$`/`CA$`/`NT$`/`MX$`
//  5. the **countries** that use it, via `@waypoint/shared` — the destination
//     search's own terms, so the two searches agree instead of each knowing a
//     different half (`רייקיאוויק` finds ISK)
//  6. a short alias table for spellings CLDR simply does not carry
//
// **The query is matched word by word, against all of them at once**, and that is
// the second thing the first version got wrong. It asked "does one term contain
// the whole query", so every name had to be typed exactly as its source spells
// it: `לירה סטרלינג` failed because CLDR spells it `לירה שטרלינג` and the samekh
// lives in the alias table, and `שקל חדש` failed against `שקלים חדשים` because
// neither word is a whole one there. Requiring each WORD to appear somewhere,
// rather than the whole phrase in one place, is what lets a person type what
// they call it instead of what CLDR calls it.
//
// Matching stays substring per word, and deliberately so: `dollar` returning
// twenty rows is the right answer to `dollar`, and the words are AND-ed, so a
// second word narrows rather than widens.
import { currencyCountryTerms, normalizeSearchTerm } from '@waypoint/shared';
import { APP_LOCALE } from '../constants';
import { currencyName, currencySymbol } from './money';

/**
 * **Real alternative spellings CLDR does not carry.** Two rules, and the first
 * draft of this table broke both — it listed `יאן` for the yen and `אייסלנד` for
 * the króna, which are not spellings anyone uses, they are spellings I guessed:
 *
 *  1. **Every entry is a word people actually write.** Not a typo, not a
 *     transliteration invented to be safe. When in doubt, leave it out and add
 *     it when someone reports it — a wrong entry is worse than a missing one,
 *     because it makes the table look like it was checked.
 *  2. **Nothing here may already be covered.** CLDR's Hebrew name, its English
 *     name and the country terms answer most of the language: `פרנק` is inside
 *     `פרנק שוויצרי`, `איסלנד` is inside `כתר איסלנדי`, `דולר` is inside every
 *     dollar. `currency-search.test.ts` asserts this for the whole table, so a
 *     redundant entry fails the build rather than sitting here looking useful.
 *
 * The list is short **because** those two rules hold — the gap is narrow, and it
 * is nearly all one shape: a currency whose Hebrew name has one settled spelling
 * in CLDR and a different settled spelling in use.
 */
export const ALIASES: Record<string, readonly string[]> = {
  // The reported one: CLDR says `אירו`, and half the country writes `יורו`.
  EUR: ['יורו'],
  // CLDR gives `לירה שטרלינג` — so `שטרלינג` and `לירה` already work, and the
  // two that do not are the samekh spelling and the English word in Hebrew.
  GBP: ['סטרלינג', 'פאונד'],
  // `שקל` is inside `שקלים חדשים`; the abbreviation is not. `normalizeSearchTerm`
  // strips the gershayim, so `ש״ח` and `שח` arrive here as the same string.
  // `שקל` and `שקלים` are inside `שקלים חדשים` and `shekel` is inside the English
  // name, so what is genuinely missing is the abbreviation and the initialism.
  // `normalizeSearchTerm` strips the gershayim, so `ש״ח` and `שח` arrive as one.
  ILS: ['שח', 'nis'],
  // CLDR's `ין יפני` covers `ין`. The double-yod spelling is the common one.
  JPY: ['יין'],
  // CLDR spells the Czech koruna `קורונה` and the Scandinavian ones `כתר`. The
  // word people reach for in both cases is `קרונה`, which matches neither.
  CZK: ['קרונה'],
  SEK: ['קרונה', 'קרונור'],
  NOK: ['קרונה', 'קרונר'],
  DKK: ['קרונה', 'קרונר'],
  // `לירות טורקיות` is plural, so the singular a person types misses it.
  TRY: ['לירה טורקית'],
  // The currency's other real name, used at least as often as `יואן`.
  CNY: ['רנמינבי'],
  // CLDR: `הריבנה אוקראיני`. The gimel spelling is the common Hebrew one.
  UAH: ['גריבנה'],
  // CLDR: `ראנד דרום אפריקאי`.
  ZAR: ['רנד'],
  // CLDR: `לאו רומני` / `לאו מולדובני` — the plural is what appears on a price.
  RON: ['ליי'],
  MDL: ['ליי'],
  // CLDR: `מאנאט אזרבייג׳ני`.
  AZN: ['מנאט'],
};

/** Latin diacritics folded, so `krona` finds `Icelandic króna` and `colons`
 *  finds `Costa Rican colóns`. Local rather than pushed into
 *  `normalizeSearchTerm`: that helper is shared by the destination, icon and
 *  bookings searches, and widening all of them is not this change's to make. */
const fold = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Fold, then the shared normalize every other search in the app uses — one
 *  function so a term and a query can never be prepared differently. */
const prepare = (s: string): string => normalizeSearchTerm(fold(s));

/** Every string this currency can be found by, as one normalized haystack.
 *  Computed on demand and cached — a picker keystroke asks all ~160 currencies,
 *  and the `Intl` calls behind names and symbols are the expensive part. */
const TERMS = new Map<string, string>();

/** Everything `Intl` and the country table already answer for this currency —
 *  i.e. the terms an `ALIASES` entry would be REDUNDANT against. Exported so the
 *  test can enforce the table's second rule; nothing else calls it. */
export function termsWithoutAliases(currency: string): string[] {
  return [
    currency,
    currencyName(currency),
    nameIn(currency, 'en'),
    currencySymbol(currency),
    wideSymbol(currency),
    ...currencyCountryTerms(currency),
  ]
    .filter(Boolean)
    .map(prepare);
}

/** One haystack per currency: every name it has, normalized, joined. Joined
 *  rather than kept as a list because a person's words legitimately come from
 *  DIFFERENT names — `לירה` from CLDR and `סטרלינג` from the alias table are one
 *  query — so the words must be looked for across the whole set, not within one
 *  entry each. */
function haystack(currency: string): string {
  const cached = TERMS.get(currency);
  if (cached) return cached;
  const built = [...termsWithoutAliases(currency), ...(ALIASES[currency] ?? []).map(prepare)].join(
    ' | ',
  );
  TERMS.set(currency, built);
  return built;
}

/** The CLDR name in a named locale — `currencyName`'s app-locale version, one
 *  argument over. English is asked for because it is the language the codes
 *  themselves are mnemonic in, and because a Hebrew speaker searching a currency
 *  very often types the English country. */
function nameIn(currency: string, locale: string): string {
  try {
    return (
      new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'name' })
        .formatToParts(1)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** The **wide** symbol, which is a different string from the narrow one often
 *  enough to matter: `A$` vs `$`, `ISK` vs `kr`, `CN¥` vs `¥`. This is the half
 *  the first version dropped, and it is the half printed on a price tag. */
function wideSymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency, currencyDisplay: 'symbol' })
        .formatToParts(1)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** Does this currency answer to what was typed? Every word must appear somewhere
 *  in its names; a blank query has no words and so matches everything, which is
 *  what the picker's at-rest list wants. */
export function currencyMatchesQuery(currency: string, query: string): boolean {
  const words = prepare(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const terms = haystack(currency);
  return words.every((word) => terms.includes(word));
}
