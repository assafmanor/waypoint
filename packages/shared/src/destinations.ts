// Country flags for the trip icon (ADR-0038 §5, extended). A trip's destination
// is usually a country, and a flag is the most precise "trip icon" — so the
// trip picker offers flags alongside the vibe clusters, and the create form
// auto-suggests one from the free-text destination.
//
// The flag glyph is generated from the ISO-3166 alpha-2 code (two regional-
// indicator symbols), so the list is bounded and principled without hand-typing
// glyphs. This is a CURATED popular-destination list, not all ~250 ISO regions:
// for a small-group travel app the long tail is never exercised, and appending a
// row later is pure data. `he` is the Hebrew display name; `aliases` feed
// auto-suggest + search (Hebrew variants, abbreviations, English, iconic cities).
//
// Caveat: flag emoji do not render on Windows (they show the letter pair, e.g.
// "IS"). We're phone-primary (ADR-0017), so this affects the desktop graceful
// minimum only.

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

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/["'`.׳״]/g, '') // strip quotes incl. Hebrew geresh/gershayim
    .replace(/\s+/g, ' ')
    .trim();

/** Best-effort flag from a free-text destination (auto-suggest, overridable).
 *  Short (≤2-char) aliases match only as whole tokens to avoid false hits
 *  (e.g. "us" inside "australia"); longer aliases match as substrings. */
export const suggestFlagFromDestination = (text: string | undefined): string | undefined => {
  if (!text?.trim()) return undefined;
  const n = normalize(text);
  const tokens = new Set(n.split(' '));
  for (const d of DESTINATIONS) {
    for (const alias of [...d.aliases, d.he]) {
      const a = normalize(alias);
      if (!a) continue;
      const hit = a.length <= 2 ? tokens.has(a) : n.includes(a);
      if (hit) return flagFromCode(d.code);
    }
  }
  return undefined;
};

/** Destinations whose name/aliases match a search query (trip picker search). */
export const searchDestinations = (query: string): readonly Destination[] => {
  const q = normalize(query);
  if (!q) return DESTINATIONS;
  return DESTINATIONS.filter((d) =>
    [d.he, ...d.aliases, d.code].some((term) => normalize(term).includes(q)),
  );
};
