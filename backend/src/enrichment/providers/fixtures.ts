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

/** `wbsearchentities` hit for a name lookup. */
export const search = (hits: { id: string; label: string }[]) => ({ search: hits });

interface EntityOptions {
  qid: string;
  labels?: Record<string, string>;
  instanceOf?: string[];
  image?: string;
  lat?: number;
  lng?: number;
  sitelinks?: Record<string, string>;
  ended?: string[];
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
