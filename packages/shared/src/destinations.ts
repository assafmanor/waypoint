// Country flags for the trip icon (ADR-0038 §5, extended). A trip's destination
// is usually a country, and a flag is the most precise "trip icon" — so the
// trip picker offers flags alongside the vibe clusters, and the create form
// auto-suggests one from the free-text destination.
//
// The flag glyph is generated from the ISO-3166 alpha-2 code (two regional-
// indicator symbols), so the list is bounded and principled without hand-typing
// glyphs. This is a CURATED popular-destination list, not all ~250 ISO regions:
// popular destinations cover the overwhelming common case, and appending a
// row later is pure data. `he` is the Hebrew display name; `aliases` feed
// auto-suggest + search (Hebrew variants, abbreviations, English, iconic cities).
//
// Caveat: flag emoji do not render on Windows (they show the letter pair, e.g.
// "IS"). We're phone-primary (ADR-0017), so this affects the desktop graceful
// minimum only.
import { matchesAnyTerm, normalizeSearchTerm } from './search-terms';

/** ISO-3166 alpha-2 code → flag emoji (regional-indicator pair). */
export const flagFromCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));

export interface Destination {
  /** ISO-3166 alpha-2. */
  code: string;
  /** Hebrew display name. */
  he: string;
  /** Match terms for auto-suggest + search: Hebrew variants, abbreviations,
   *  English name, and a few iconic cities for the most-visited spots. */
  aliases: readonly string[];
}

// Ordered by rough popularity so the first alias match wins for ambiguous text.
export const DESTINATIONS: readonly Destination[] = [
  { code: 'JP', he: 'יפן', aliases: ['japan', 'טוקיו', 'tokyo', 'קיוטו', 'kyoto', 'אוסקה'] },
  { code: 'IS', he: 'איסלנד', aliases: ['iceland', 'רייקיאוויק', 'reykjavik'] },
  { code: 'GR', he: 'יוון', aliases: ['greece', 'אתונה', 'athens', 'סנטוריני', 'santorini'] },
  { code: 'IT', he: 'איטליה', aliases: ['italy', 'רומא', 'rome', 'מילאנו', 'milan', 'ונציה'] },
  { code: 'FR', he: 'צרפת', aliases: ['france', 'פריז', 'paris', 'ניס', 'nice'] },
  { code: 'ES', he: 'ספרד', aliases: ['spain', 'ברצלונה', 'barcelona', 'מדריד', 'madrid'] },
  {
    code: 'US',
    he: 'ארצות הברית',
    aliases: ['usa', 'us', 'america', 'ארהב', 'ארה"ב', 'ניו יורק', 'new york', 'nyc'],
  },
  {
    code: 'GB',
    he: 'בריטניה',
    aliases: ['uk', 'britain', 'england', 'לונדון', 'london', 'אנגליה'],
  },
  { code: 'TH', he: 'תאילנד', aliases: ['thailand', 'בנגקוק', 'bangkok', 'פוקט'] },
  { code: 'VN', he: 'וייטנאם', aliases: ['vietnam', 'האנוי', 'hanoi'] },
  { code: 'PT', he: 'פורטוגל', aliases: ['portugal', 'ליסבון', 'lisbon', 'פורטו', 'porto'] },
  { code: 'NL', he: 'הולנד', aliases: ['netherlands', 'holland', 'אמסטרדם', 'amsterdam'] },
  { code: 'DE', he: 'גרמניה', aliases: ['germany', 'ברלין', 'berlin', 'מינכן', 'munich'] },
  { code: 'CH', he: 'שווייץ', aliases: ['switzerland', 'ציריך', 'zurich', 'האלפים', 'alps'] },
  { code: 'AT', he: 'אוסטריה', aliases: ['austria', 'וינה', 'vienna'] },
  { code: 'CZ', he: 'צ׳כיה', aliases: ['czech', 'czechia', 'פראג', 'prague'] },
  { code: 'HU', he: 'הונגריה', aliases: ['hungary', 'בודפשט', 'budapest'] },
  { code: 'HR', he: 'קרואטיה', aliases: ['croatia'] },
  { code: 'TR', he: 'טורקיה', aliases: ['turkey', 'turkiye', 'איסטנבול', 'istanbul'] },
  { code: 'GE', he: 'גאורגיה', aliases: ['georgia', 'טביליסי', 'tbilisi'] },
  { code: 'IN', he: 'הודו', aliases: ['india', 'דלהי', 'delhi'] },
  { code: 'NP', he: 'נפאל', aliases: ['nepal', 'קטמנדו', 'kathmandu', 'הימלאיה', 'himalaya'] },
  { code: 'CN', he: 'סין', aliases: ['china', 'בייג׳ינג', 'beijing', 'שנחאי', 'shanghai'] },
  { code: 'KR', he: 'דרום קוריאה', aliases: ['korea', 'south korea', 'סיאול', 'seoul'] },
  { code: 'ID', he: 'אינדונזיה', aliases: ['indonesia', 'באלי', 'bali'] },
  { code: 'PH', he: 'הפיליפינים', aliases: ['philippines'] },
  { code: 'LK', he: 'סרי לנקה', aliases: ['sri lanka'] },
  { code: 'KH', he: 'קמבודיה', aliases: ['cambodia'] },
  { code: 'SG', he: 'סינגפור', aliases: ['singapore'] },
  { code: 'MY', he: 'מלזיה', aliases: ['malaysia'] },
  { code: 'TW', he: 'טאיוואן', aliases: ['taiwan'] },
  { code: 'AE', he: 'איחוד האמירויות', aliases: ['uae', 'emirates', 'דובאי', 'dubai', 'אבו דאבי'] },
  { code: 'JO', he: 'ירדן', aliases: ['jordan', 'פטרה', 'petra', 'עמאן'] },
  { code: 'EG', he: 'מצרים', aliases: ['egypt', 'קהיר', 'cairo', 'סיני', 'sinai'] },
  { code: 'MA', he: 'מרוקו', aliases: ['morocco', 'מרקש', 'marrakech'] },
  { code: 'ZA', he: 'דרום אפריקה', aliases: ['south africa', 'קייפטאון', 'cape town'] },
  { code: 'KE', he: 'קניה', aliases: ['kenya', 'ספארי', 'safari'] },
  { code: 'TZ', he: 'טנזניה', aliases: ['tanzania', 'זנזיבר', 'zanzibar'] },
  { code: 'AU', he: 'אוסטרליה', aliases: ['australia', 'סידני', 'sydney'] },
  { code: 'NZ', he: 'ניו זילנד', aliases: ['new zealand'] },
  { code: 'CA', he: 'קנדה', aliases: ['canada', 'טורונטו', 'toronto', 'ונקובר'] },
  { code: 'MX', he: 'מקסיקו', aliases: ['mexico', 'קנקון', 'cancun'] },
  { code: 'BR', he: 'ברזיל', aliases: ['brazil', 'ריו', 'rio'] },
  { code: 'AR', he: 'ארגנטינה', aliases: ['argentina', 'בואנוס איירס'] },
  { code: 'PE', he: 'פרו', aliases: ['peru', 'מאצ׳ו פיצ׳ו', 'machu picchu', 'קוסקו'] },
  { code: 'CL', he: 'צ׳ילה', aliases: ['chile'] },
  { code: 'CO', he: 'קולומביה', aliases: ['colombia'] },
  { code: 'CR', he: 'קוסטה ריקה', aliases: ['costa rica'] },
  { code: 'NO', he: 'נורווגיה', aliases: ['norway', 'אוסלו', 'oslo', 'פיורדים', 'fjords'] },
  { code: 'SE', he: 'שוודיה', aliases: ['sweden', 'שטוקהולם', 'stockholm'] },
  { code: 'FI', he: 'פינלנד', aliases: ['finland', 'הלסינקי', 'helsinki'] },
  { code: 'DK', he: 'דנמרק', aliases: ['denmark', 'קופנהגן', 'copenhagen'] },
  { code: 'IE', he: 'אירלנד', aliases: ['ireland', 'דבלין', 'dublin'] },
  { code: 'BE', he: 'בלגיה', aliases: ['belgium', 'בריסל', 'brussels'] },
  { code: 'PL', he: 'פולין', aliases: ['poland', 'ורשה', 'warsaw', 'קרקוב'] },
  { code: 'CY', he: 'קפריסין', aliases: ['cyprus'] },
  { code: 'IL', he: 'ישראל', aliases: ['israel', 'תל אביב', 'tel aviv', 'ירושלים'] },
];

/** Best-effort flag from a free-text destination (auto-suggest, overridable).
 *  Short (≤2-char) aliases match only as whole tokens to avoid false hits
 *  (e.g. "us" inside "australia"); longer aliases match as substrings. */
export const suggestFlagFromDestination = (text: string | undefined): string | undefined => {
  if (!text?.trim()) return undefined;
  const n = normalizeSearchTerm(text);
  const tokens = new Set(n.split(' '));
  for (const d of DESTINATIONS) {
    for (const alias of [...d.aliases, d.he]) {
      const a = normalizeSearchTerm(alias);
      if (!a) continue;
      const hit = a.length <= 2 ? tokens.has(a) : n.includes(a);
      if (hit) return flagFromCode(d.code);
    }
  }
  return undefined;
};

/**
 * Countries whose territory spans several IANA zones, with the zones the app
 * offers for them (ADR-0113 §2). A small **curated** map, not a shipped dataset:
 * a country missing from it, or a real zone missing from a listed country's row,
 * is a miss that degrades — never a wrong answer. Extend as needed.
 *
 * Two readers, which is why it lives here rather than beside either of them
 * (root rule 8): the backend's destination resolve surfaces these as
 * `candidateZones` so creation can show the "spans several zones" note, and
 * `frontend/lib/readiness.ts` uses them to widen ADR-0061's round-trip check —
 * a leg into Los Angeles reaches a New-York-zoned trip to the United States,
 * and the country code is what says so.
 */
export const MULTI_ZONE_COUNTRIES: Record<string, string[]> = {
  US: [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ],
  AU: [
    'Australia/Sydney',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
    'Australia/Darwin',
    'Australia/Hobart',
  ],
  RU: [
    'Europe/Kaliningrad',
    'Europe/Moscow',
    'Asia/Yekaterinburg',
    'Asia/Novosibirsk',
    'Asia/Krasnoyarsk',
    'Asia/Irkutsk',
    'Asia/Vladivostok',
    'Asia/Kamchatka',
  ],
  CA: [
    'America/St_Johns',
    'America/Halifax',
    'America/Toronto',
    'America/Winnipeg',
    'America/Edmonton',
    'America/Vancouver',
  ],
  BR: ['America/Noronha', 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco'],
  MX: ['America/Mexico_City', 'America/Cancun', 'America/Chihuahua', 'America/Tijuana'],
  ID: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
  KZ: ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Aqtau'],
  CL: ['America/Santiago', 'Pacific/Easter'],
  CD: ['Africa/Kinshasa', 'Africa/Lubumbashi'],
};

/** Destinations whose name/aliases match a search query (trip picker search).
 *  A blank query intentionally returns everything (the picker's default
 *  browse list), checked here rather than relying on `matchesAnyTerm`'s
 *  natural blank-matches-something fallthrough, since an empty `DESTINATIONS`
 *  filter would otherwise still need this same early return. */
export const searchDestinations = (query: string): readonly Destination[] => {
  if (!query.trim()) return DESTINATIONS;
  return DESTINATIONS.filter((d) => matchesAnyTerm(query, [d.he, ...d.aliases, d.code]));
};

/**
 * ISO-3166 alpha-2 → ISO-4217, the trip currency's derived default (ADR-0180 §1).
 *
 * Same contract as `MULTI_ZONE_COUNTRIES` above, and stated again because it is
 * the whole reason this is a table rather than a lookup service: **a country
 * missing from here is a miss that DEGRADES, never a wrong answer.** A miss
 * leaves the currency untouched — empty at creation, unchanged in settings —
 * and the field stays editable either way. So extending it is pure data and
 * forgetting to extend it costs nothing but a manual pick.
 *
 * Keyed off `Trip.destinationCountryCode` (ADR-0113), NOT off `Trip.timezone`.
 * A zone is lossy in both directions — `Europe/Zurich` and `Europe/Berlin` are
 * different currencies, `America/New_York` and `America/Chicago` are the same
 * one — and the country code is already stored from the same pick.
 *
 * Two readers, which is why it lives here beside the other cross-layer map
 * rather than in either app: the trip's derived default, and the **home**
 * currency's seed from the device region (ADR-0180 §2).
 *
 * Scope note: this is every country a `DESTINATIONS` entry can produce plus the
 * common rest, not all ~250 ISO regions. Territories that issue their own money
 * are listed; territories that use their parent's currency resolve through their
 * own code (GP/MQ/RE → EUR) rather than being folded into it, because the picker
 * hands us the code Google returned.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  // ── Eurozone ──────────────────────────────────────────────────────────────
  AD: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  CY: 'EUR',
  DE: 'EUR',
  EE: 'EUR',
  ES: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  GF: 'EUR',
  GP: 'EUR',
  GR: 'EUR',
  HR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  LV: 'EUR',
  MC: 'EUR',
  ME: 'EUR',
  MQ: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  RE: 'EUR',
  SI: 'EUR',
  SK: 'EUR',
  SM: 'EUR',
  VA: 'EUR',
  XK: 'EUR',
  YT: 'EUR',
  // ── Rest of Europe ────────────────────────────────────────────────────────
  AL: 'ALL',
  BA: 'BAM',
  BG: 'BGN',
  BY: 'BYN',
  CH: 'CHF',
  CZ: 'CZK',
  DK: 'DKK',
  FO: 'DKK',
  GB: 'GBP',
  GE: 'GEL',
  GG: 'GBP',
  GI: 'GIP',
  HU: 'HUF',
  IM: 'GBP',
  IS: 'ISK',
  JE: 'GBP',
  LI: 'CHF',
  MD: 'MDL',
  MK: 'MKD',
  NO: 'NOK',
  PL: 'PLN',
  RO: 'RON',
  RS: 'RSD',
  RU: 'RUB',
  SE: 'SEK',
  SJ: 'NOK',
  UA: 'UAH',
  // ── Middle East ───────────────────────────────────────────────────────────
  AE: 'AED',
  AM: 'AMD',
  AZ: 'AZN',
  BH: 'BHD',
  IL: 'ILS',
  IQ: 'IQD',
  IR: 'IRR',
  JO: 'JOD',
  KW: 'KWD',
  LB: 'LBP',
  OM: 'OMR',
  PS: 'ILS',
  QA: 'QAR',
  SA: 'SAR',
  SY: 'SYP',
  TR: 'TRY',
  YE: 'YER',
  // ── Asia ──────────────────────────────────────────────────────────────────
  AF: 'AFN',
  BD: 'BDT',
  BN: 'BND',
  BT: 'BTN',
  CN: 'CNY',
  HK: 'HKD',
  ID: 'IDR',
  IN: 'INR',
  JP: 'JPY',
  KG: 'KGS',
  KH: 'KHR',
  KP: 'KPW',
  KR: 'KRW',
  KZ: 'KZT',
  LA: 'LAK',
  LK: 'LKR',
  MM: 'MMK',
  MN: 'MNT',
  MO: 'MOP',
  MV: 'MVR',
  MY: 'MYR',
  NP: 'NPR',
  PH: 'PHP',
  PK: 'PKR',
  SG: 'SGD',
  TH: 'THB',
  TJ: 'TJS',
  TM: 'TMT',
  TW: 'TWD',
  UZ: 'UZS',
  VN: 'VND',
  // ── Africa ────────────────────────────────────────────────────────────────
  AO: 'AOA',
  BF: 'XOF',
  BI: 'BIF',
  BJ: 'XOF',
  BW: 'BWP',
  CD: 'CDF',
  CF: 'XAF',
  CG: 'XAF',
  CI: 'XOF',
  CM: 'XAF',
  CV: 'CVE',
  DJ: 'DJF',
  DZ: 'DZD',
  EG: 'EGP',
  ER: 'ERN',
  ET: 'ETB',
  GA: 'XAF',
  GH: 'GHS',
  GM: 'GMD',
  GN: 'GNF',
  GQ: 'XAF',
  GW: 'XOF',
  KE: 'KES',
  KM: 'KMF',
  LR: 'LRD',
  LS: 'LSL',
  LY: 'LYD',
  MA: 'MAD',
  MG: 'MGA',
  ML: 'XOF',
  MR: 'MRU',
  MU: 'MUR',
  MW: 'MWK',
  MZ: 'MZN',
  NA: 'NAD',
  NE: 'XOF',
  NG: 'NGN',
  RW: 'RWF',
  SC: 'SCR',
  SD: 'SDG',
  SL: 'SLE',
  SN: 'XOF',
  SO: 'SOS',
  SS: 'SSP',
  ST: 'STN',
  SZ: 'SZL',
  TD: 'XAF',
  TG: 'XOF',
  TN: 'TND',
  TZ: 'TZS',
  UG: 'UGX',
  ZA: 'ZAR',
  ZM: 'ZMW',
  ZW: 'ZWG',
  // ── Americas ──────────────────────────────────────────────────────────────
  AG: 'XCD',
  AR: 'ARS',
  AW: 'AWG',
  BB: 'BBD',
  BM: 'BMD',
  BO: 'BOB',
  BR: 'BRL',
  BS: 'BSD',
  BZ: 'BZD',
  CA: 'CAD',
  CL: 'CLP',
  CO: 'COP',
  CR: 'CRC',
  CU: 'CUP',
  CW: 'ANG',
  DM: 'XCD',
  DO: 'DOP',
  EC: 'USD',
  GD: 'XCD',
  GT: 'GTQ',
  GY: 'GYD',
  HN: 'HNL',
  HT: 'HTG',
  JM: 'JMD',
  KN: 'XCD',
  KY: 'KYD',
  LC: 'XCD',
  MX: 'MXN',
  NI: 'NIO',
  PA: 'PAB',
  PE: 'PEN',
  PR: 'USD',
  PY: 'PYG',
  SR: 'SRD',
  SV: 'USD',
  TC: 'USD',
  TT: 'TTD',
  US: 'USD',
  UY: 'UYU',
  VC: 'XCD',
  VE: 'VES',
  VG: 'USD',
  VI: 'USD',
  // ── Oceania ───────────────────────────────────────────────────────────────
  AU: 'AUD',
  FJ: 'FJD',
  FM: 'USD',
  GU: 'USD',
  KI: 'AUD',
  MH: 'USD',
  NC: 'XPF',
  NR: 'AUD',
  NZ: 'NZD',
  PF: 'XPF',
  PG: 'PGK',
  PW: 'USD',
  SB: 'SBD',
  TO: 'TOP',
  TV: 'AUD',
  VU: 'VUV',
  WS: 'WST',
};

/** The trip currency's derived default for a picked destination, or `undefined`
 *  when the country is unknown or absent — the caller then leaves whatever is
 *  already there, which is the whole degrade-don't-guess contract above. */
export const currencyForCountry = (countryCode?: string | null): string | undefined =>
  countryCode ? COUNTRY_CURRENCY[countryCode.toUpperCase()] : undefined;

/** **The countries that use a currency, as search terms** — the reverse of
 *  `COUNTRY_CURRENCY`, joined to the Hebrew names and aliases `DESTINATIONS`
 *  already carries.
 *
 *  It exists because a traveller looking for a currency thinks of the **place**,
 *  not of the currency's name: the CLDR name for ISK is `כתר איסלנדי`, so
 *  searching `איסלנד` happens to work and searching `iceland` or `רייקיאוויק`
 *  did not, and there is no reason a person should have to know which. Every
 *  term here is one the destination search already answers, so the two searches
 *  now agree rather than each knowing a different half.
 *
 *  Built once, at module load: `COUNTRY_CURRENCY` is ~220 entries and this walks
 *  it a single time. A currency used by several countries collects all of them
 *  (EUR gets twenty), which is correct — any of them should find it. */
const CURRENCY_SEARCH_TERMS: Record<string, string[]> = (() => {
  const byCode = new Map(DESTINATIONS.map((d) => [d.code, d]));
  const index: Record<string, string[]> = {};
  for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
    const destination = byCode.get(country);
    if (!destination) continue;
    (index[currency] ??= []).push(destination.he, ...destination.aliases);
  }
  return index;
})();

/** The country names and aliases this currency can be found by — empty for a
 *  currency whose countries are all outside the curated `DESTINATIONS` list,
 *  which is the same "a miss degrades, never a wrong answer" contract as the
 *  table it is built from.
 *
 *  **Terms rather than a `matches` predicate**, so the caller can put them in the
 *  same haystack as the currency's own names and run ONE matching rule over the
 *  lot. A predicate here meant two rules — and the one on this side could not see
 *  a query whose words are split across the two sides. */
export const currencyCountryTerms = (currency: string): readonly string[] =>
  CURRENCY_SEARCH_TERMS[currency] ?? [];
