// Recorded provider responses, for specs that must not touch the network (ADR-0166 §5.3:
// a provider is pure `(identity) → match → fields`, so it is testable with no DB and no
// socket).
//
// **Every QID, filename, license, article title and coordinate here is real data from the
// coverage spike** — `docs/planning/2026-08-04-enrichment-coverage-spike-data.csv` and
// `…-licenses.json`. The extracts are shortened; nothing else is invented. The four places
// chosen are the ones that carry a measured lesson:
//
//   - **Sensō-ji** — the happy path, and an English-only article (no `hewiki` sitelink).
//   - **Tokyo Skytree** — the one with a Hebrew article, so the `he` branch is exercised.
//   - **Meguro River** — a right match at the wrong *granularity* (§11.2): `P31` is a river,
//     the saved name is identical to the label, and the summary must be refused.
//   - **Tsukiji Outer Market** — the other granularity shape: the item is the *former*
//     wholesale market, so it carries a dissolution date.
//
// **That claim covers everything down to `TSUKIJI`.** The airport fixtures added for §18 are
// marked where they start and say plainly which of their values are measured and which are
// stand-ins — the spike had no airport stratum to draw from.
import type { EnrichmentFetchOptions } from '../outbound-fetch';

/** A fetcher that answers from a recorded map instead of the network, and records what was
 *  asked — so a spec can assert that a provider made no call it should not have. */
export class FixtureFetcher {
  readonly requested: string[] = [];

  constructor(private readonly responses: Record<string, unknown>) {}

  async fetchJson<T>(url: string, _options?: EnrichmentFetchOptions): Promise<T> {
    this.requested.push(url);
    const key = Object.keys(this.responses).find((pattern) => url.includes(pattern));
    if (!key) throw new Error(`no fixture for ${url}`);
    const response = this.responses[key];
    if (response instanceof Error) throw response;
    return response as T;
  }

  /** How many calls hit a given fragment — for asserting a pass did not ask twice. */
  countMatching(fragment: string): number {
    return this.requested.filter((url) => url.includes(fragment)).length;
  }
}

/** `wbsearchentities` hit for a name lookup.
 *
 *  `match` is what the real API returns and what the provider scores against: the string that
 *  actually matched the query, in the query's own script. `label` is the item's name in the
 *  RESPONSE language, which is a different thing — conflating the two is the bug the owner
 *  found on the first live run (see `wikidata.provider.ts`'s scoring note). */
export const search = (
  hits: {
    id: string;
    label: string;
    match?: { language?: string; text?: string };
    aliases?: string[];
  }[],
) => ({ search: hits });

/** A `generator=geosearch` response: the pages near a point, each carrying its own coordinate
 *  and its `wikibase_item`. Keyed by pageid like the real API, and deliberately NOT in distance
 *  order — the provider sorts, and a fixture that arrived pre-sorted would hide it if it stopped.
 *
 *  An empty one is the common case in these specs and means "nothing is there", which is what
 *  keeps a name refusal a refusal (`nearbyWikidataItems` asks `en` then `he`, and one fixture
 *  answers both). */
export const geosearch = (
  hits: { qid: string; title: string; lat: number; lng: number; noQid?: boolean }[],
) => ({
  query: {
    pages: Object.fromEntries(
      hits.map((hit, i) => [
        String(1000 + i),
        {
          pageid: 1000 + i,
          title: hit.title,
          coordinates: [{ lat: hit.lat, lon: hit.lng }],
          ...(hit.noQid ? {} : { pageprops: { wikibase_item: hit.qid } }),
        },
      ]),
    ),
  },
});

interface EntityOptions {
  qid: string;
  labels?: Record<string, string>;
  /** Per-language aliases — where a city's COMMON name usually lives, since the label is the
   *  official form (§18's amendment). */
  aliases?: Record<string, string[]>;
  instanceOf?: string[];
  image?: string;
  lat?: number;
  lng?: number;
  sitelinks?: Record<string, string>;
  ended?: string[];
  /** `P238`, the IATA code (§18). */
  iata?: string;
  /** `P931` ("place served by transport hub"), with each value's rank — because the whole
   *  difficulty of that property is that it is multi-valued and the ranks often do not
   *  separate the values (§18). */
  placeServed?: { qid: string; rank?: string }[];
}

/** A `wbgetentities` response in Wikidata's real claim shape — `mainsnak.datavalue.value`,
 *  with an entity-id value for `P31` and a globe-coordinate for `P625`. */
export function entity(options: EntityOptions) {
  const claims: Record<string, unknown[]> = {};
  if (options.instanceOf?.length) {
    claims.P31 = options.instanceOf.map((id) => ({
      mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid', value: { id } } },
    }));
  }
  if (options.image) {
    claims.P18 = [
      { mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: options.image } } },
    ];
  }
  if (options.lat != null && options.lng != null) {
    claims.P625 = [
      {
        mainsnak: {
          snaktype: 'value',
          datavalue: {
            type: 'globecoordinate',
            value: { latitude: options.lat, longitude: options.lng, precision: 0.0001 },
          },
        },
      },
    ];
  }
  if (options.iata) {
    claims.P238 = [
      { mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: options.iata } } },
    ];
  }
  if (options.placeServed?.length) {
    claims.P931 = options.placeServed.map((served) => ({
      mainsnak: {
        snaktype: 'value',
        datavalue: { type: 'wikibase-entityid', value: { id: served.qid } },
      },
      rank: served.rank ?? 'normal',
    }));
  }
  for (const property of options.ended ?? []) {
    claims[property] = [
      {
        mainsnak: {
          snaktype: 'value',
          datavalue: { type: 'time', value: { time: '+2018-10-06T00:00:00Z' } },
        },
      },
    ];
  }

  return {
    entities: {
      [options.qid]: {
        id: options.qid,
        labels: Object.fromEntries(
          Object.entries(options.labels ?? {}).map(([language, value]) => [
            language,
            { language, value },
          ]),
        ),
        aliases: Object.fromEntries(
          Object.entries(options.aliases ?? {}).map(([language, values]) => [
            language,
            values.map((value) => ({ language, value })),
          ]),
        ),
        sitelinks: Object.fromEntries(
          Object.entries(options.sitelinks ?? {}).map(([site, title]) => [site, { site, title }]),
        ),
        claims,
      },
    },
  };
}

/** A REST summary response. */
export const restSummary = (options: {
  lang: string;
  title: string;
  extract: string;
  type?: string;
}) => ({
  type: options.type ?? 'standard',
  title: options.title,
  lang: options.lang,
  extract: options.extract,
  content_urls: {
    desktop: {
      page: `https://${options.lang}.wikipedia.org/wiki/${encodeURIComponent(options.title)}`,
    },
  },
});

/**
 * A Commons `imageinfo` response.
 *
 * `extmetadata` values arrive as **HTML** from the real API — `Artist` is very often an `<a>`
 * to a user page — so the fixtures wrap the artist that way too. A fixture that handed back
 * clean text would let a provider that forgot to strip tags pass.
 *
 * `thumbwidth` defaults to **840**, not the 800 we ask for: `iiurlwidth` rounds up to
 * MediaWiki's own buckets (§12.1), and a fixture that echoed the requested width would hide
 * any code that assumed it was honoured.
 */
export const imageInfo = (options: {
  filename: string;
  license: string;
  artist?: string;
  credit?: string;
  attributionRequired?: string;
  usageTerms?: string;
  thumbWidth?: number;
  thumbHeight?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  mime?: string;
  missing?: boolean;
  noThumb?: boolean;
}) => {
  const encoded = encodeURIComponent(options.filename.replace(/ /g, '_'));
  const meta: Record<string, { value: string }> = {};
  if (options.license) meta.LicenseShortName = { value: options.license };
  if (options.usageTerms) meta.UsageTerms = { value: options.usageTerms };
  if (options.artist) {
    meta.Artist = { value: `<a href="//commons.wikimedia.org/wiki/User:X">${options.artist}</a>` };
  }
  if (options.credit) meta.Credit = { value: options.credit };
  if (options.attributionRequired) {
    meta.AttributionRequired = { value: options.attributionRequired };
  }

  return {
    query: {
      pages: options.missing
        ? { '-1': { title: `File:${options.filename}`, missing: '' } }
        : {
            '12345': {
              title: `File:${options.filename}`,
              imageinfo: [
                {
                  url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encoded}`,
                  descriptionurl: `https://commons.wikimedia.org/wiki/File:${encoded}`,
                  ...(options.noThumb
                    ? {}
                    : {
                        thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encoded}/840px-${encoded}`,
                        thumbwidth: options.thumbWidth ?? 840,
                        thumbheight: options.thumbHeight ?? 600,
                      }),
                  width: options.width ?? 3466,
                  height: options.height ?? 2476,
                  size: options.sizeBytes ?? 2_910_000,
                  mime: options.mime ?? 'image/jpeg',
                  extmetadata: meta,
                },
              ],
            },
          },
    },
  };
};

/** The nine distinct license strings the spike found across 32 files — including the two that
 *  need no credit and the one we must refuse. Real values from `…-licenses.json`. */
export const COMMONS_LICENSES = {
  /** Sensō-ji. No credit owed: `AttributionRequired` is genuinely `false` for CC0. */
  cc0: { license: 'CC0', artist: 'Akonnchiroll', attributionRequired: 'false' },
  ccBySa3: { license: 'CC BY-SA 3.0', artist: 'Kakidai', attributionRequired: 'true' },
  ccBySa4: { license: 'CC BY-SA 4.0', artist: 'Akonnchiroll', attributionRequired: 'true' },
  ccBy4: { license: 'CC BY 4.0', artist: 'David Kernan', attributionRequired: 'true' },
  /** A regional port — the reason the license is stored as a STRING, not an enum (§12.2). */
  ccBySa3De: { license: 'CC BY-SA 3.0 de', artist: 'Arne Müseler', attributionRequired: 'true' },
  ccBySa25: {
    license: 'CC BY-SA 2.5',
    artist: 'User IgKh on en.wikipedia',
    attributionRequired: 'true',
  },
  publicDomain: {
    license: 'Public domain',
    artist: 'Benh LIEU SONG',
    attributionRequired: 'false',
  },
  /** The Western Wall's `P18`: **GFDL 1.2 only**, with an empty machine-readable `License`
   *  field. Treated as no image at all (§12.2). */
  gfdlOnly: { license: 'GFDL 1.2', artist: 'Ralf Roletschek', attributionRequired: 'true' },
} as const;

/** Sensō-ji: Q615183, `P18` `Sensoji 2023.jpg` (CC0), English article only. */
export const SENSOJI = {
  place: { name: 'Sensō-ji', lat: 35.7148, lng: 139.7967, googlePlaceId: 'ChIJ-sensoji' },
  qid: 'Q615183',
  entity: entity({
    qid: 'Q615183',
    labels: { en: 'Sensō-ji' },
    instanceOf: ['Q44539'], // temple — specific, so no refusal
    image: 'Sensoji 2023.jpg',
    lat: 35.7148,
    lng: 139.7967,
    sitelinks: { enwiki: 'Sensō-ji' },
  }),
  summaryEn: restSummary({
    lang: 'en',
    title: 'Sensō-ji',
    extract: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
  }),
};

/** Tokyo Skytree: Q57965, a Hebrew article (`עץ השמיים`), and the 0.653 portrait image. */
export const SKYTREE = {
  place: { name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107, googlePlaceId: 'ChIJ-skytree' },
  qid: 'Q57965',
  entity: entity({
    qid: 'Q57965',
    labels: { en: 'Tokyo Skytree', he: 'עץ השמיים' },
    instanceOf: ['Q1440476'], // observation tower
    image: 'Tokyo Skytree 2014 Ⅲ.jpg',
    lat: 35.7101,
    lng: 139.8107,
    sitelinks: { enwiki: 'Tokyo Skytree', hewiki: 'עץ השמיים' },
  }),
  summaryHe: restSummary({
    lang: 'he',
    title: 'עץ השמיים',
    extract: 'עץ השמיים הוא מגדל תקשורת ותצפית בטוקיו, והמבנה הגבוה ביותר ביפן.',
  }),
  summaryEn: restSummary({
    lang: 'en',
    title: 'Tokyo Skytree',
    extract: 'Tokyo Skytree is a broadcasting and observation tower in Sumida, Tokyo.',
  }),
};

/** Meguro River: a right match at the wrong granularity — the article is about the whole
 *  river, not the canal-side spot people go to, and the saved name is **identical** to the
 *  label (§11.2). */
export const MEGURO_RIVER = {
  place: { name: 'Meguro River', lat: 35.6415, lng: 139.6983, googlePlaceId: 'ChIJ-meguro' },
  qid: 'Q3852798',
  entity: entity({
    qid: 'Q3852798',
    labels: { en: 'Meguro River' },
    instanceOf: ['Q4022'], // river
    image: 'Meguro River.jpg',
    lat: 35.6415,
    lng: 139.6983,
    sitelinks: { enwiki: 'Meguro River' },
  }),
  summaryEn: restSummary({
    lang: 'en',
    title: 'Meguro River',
    extract: 'The Meguro River is a river in Tokyo, Japan, about 8 km long.',
  }),
};

/** Tsukiji Outer Market: resolves to the former **wholesale** market, closed and moved in
 *  2018 — the same refusal from the other signal (a dissolution date). */
export const TSUKIJI = {
  place: {
    name: 'Tsukiji Outer Market',
    lat: 35.6654,
    lng: 139.7707,
    googlePlaceId: 'ChIJ-tsukiji',
  },
  qid: 'Q859471',
  entity: entity({
    qid: 'Q859471',
    labels: { en: 'Tsukiji fish market' },
    instanceOf: ['Q330284'], // marketplace — not itself broad; the dissolution is the signal
    image: '2018 Tsukiji fish market.jpg',
    lat: 35.6654,
    lng: 139.7707,
    sitelinks: { enwiki: 'Tsukiji fish market' },
    ended: ['P576'],
  }),
  summaryEn: restSummary({
    lang: 'en',
    title: 'Tsukiji fish market',
    extract: 'The Tsukiji fish market was the largest wholesale fish market in the world.',
  }),
};

/* ── THE AIRPORT PAIR (ADR-0166 §18, field reports #7/#23) ──────────────────────────────────
   Unlike everything above, these are **not** rows from the coverage spike — that spike had no
   airport stratum. What is real here is the shape the §18 research measured, and it is the only
   part any of these specs assert on:

     • Ben Gurion's `P931` lists **two cities at equal (normal) rank** — Tel Aviv and Jerusalem
       — which is the finding that made a manual override necessary at all;
     • Keflavík carries a **preferred rank**, which is the case an automatic tie-break DOES
       answer, and the reason "first" is not the whole rule;
     • **London's city entity carries a real metropolitan `P238` and no airport class** — the
       one false positive the research found, and the whole reason for the `P31` guard.

   The class QIDs are from the research note itself (`Q1248784` airport, `Q644371` international
   airport). The item QIDs of the airports and cities are **stand-ins**, deliberately: the note
   recorded the claim shapes rather than the ids, and inventing a precise-looking QID would read
   as verified data. `Q84` is London's, which is the one item id the note does state. */

/** Ben Gurion: an international airport whose served city is genuinely ambiguous. */
export const BEN_GURION = {
  place: { name: 'נמל התעופה בן גוריון', lat: 32.0114, lng: 34.8867, googlePlaceId: 'ChIJ-tlv' },
  qid: 'Q-airport-tlv',
  cityQid: 'Q-city-telaviv',
  entity: entity({
    qid: 'Q-airport-tlv',
    labels: { en: 'Ben Gurion Airport', he: 'נמל התעופה בן גוריון' },
    instanceOf: ['Q644371'], // international airport
    lat: 32.0114,
    lng: 34.8867,
    iata: 'TLV',
    // Both at normal rank: no automatic tie-break exists, and `Place.nickname` is the answer
    // for a trip that disagrees with the one we pick.
    placeServed: [{ qid: 'Q-city-telaviv' }, { qid: 'Q-city-jerusalem' }],
  }),
  // **The label is the OFFICIAL name and the common one is an alias** — the shape the owner
  // reported (`תל אביב-יפו` on a day row). Real: Wikidata's Hebrew label for the city is the
  // hyphenated official form.
  city: entity({
    qid: 'Q-city-telaviv',
    labels: { en: 'Tel Aviv-Yafo', he: 'תל אביב-יפו' },
    aliases: { he: ['תל אביב', 'ת״א'], en: ['Tel Aviv'] },
  }),
};

/** Keflavík: the case Wikidata's own preferred rank does answer. */
export const KEFLAVIK = {
  place: { name: 'Keflavík Airport', lat: 63.985, lng: -22.6056, googlePlaceId: 'ChIJ-kef' },
  qid: 'Q-airport-kef',
  entity: entity({
    qid: 'Q-airport-kef',
    labels: { en: 'Keflavík International Airport' },
    instanceOf: ['Q644371'],
    lat: 63.985,
    lng: -22.6056,
    iata: 'KEF',
    placeServed: [{ qid: 'Q-city-njardvik' }, { qid: 'Q-city-keflavik', rank: 'preferred' }],
  }),
  city: entity({ qid: 'Q-city-keflavik', labels: { en: 'Keflavík' } }),
};

/** **London the city** — `P238 = LON` is a real metropolitan IATA code, and the entity is a
 *  city. The one hazard the research found, and what the `P31` guard is for. */
export const LONDON_CITY = {
  place: { name: 'לונדון', lat: 51.5072, lng: -0.1276, googlePlaceId: 'ChIJ-london' },
  qid: 'Q84',
  entity: entity({
    qid: 'Q84',
    labels: { en: 'London', he: 'לונדון' },
    instanceOf: ['Q515'], // city — no airport class anywhere on it
    lat: 51.5072,
    lng: -0.1276,
    iata: 'LON',
    placeServed: [],
  }),
};
