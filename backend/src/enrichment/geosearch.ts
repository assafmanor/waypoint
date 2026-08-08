// **WHAT IS AT THIS POINT** — the coordinate-first half of identity (ADR-0166 §15).
//
// Every other route starts from the place's NAME, and that has a recall hole with a hard floor:
// a name search only ever reaches an item labelled in a language we thought to ask for. The app
// asks Google with `languageCode=he`, so a famous place is saved as `מגדל אייפל` while its
// Wikidata item may be labelled only in English or Japanese — and the first live run returned
// `not_found` across the board because of it.
//
// Coordinates have no language. Wikipedia's GeoData extension answers "which articles are within
// N metres of this point", and `pageprops.wikibase_item` turns each answer into the QID the rest
// of the pipe already runs on. So the name stops being the finder and becomes the check, which is
// the right order for a place the user picked off a map.
//
// **Why Wikipedia and not Wikidata:** the QID is the same whichever wiki found it, and Wikidata's
// own coordinate search is SPARQL on `query.wikidata.org` — a different host, off §7's allowlist,
// and a query service with its own etiquette. This is one ordinary API call to a host the
// fetcher already trusts.
import { haversineMeters, type LatLng } from '@waypoint/shared';
import { EnrichmentFetcher } from './outbound-fetch';

/** The wikis asked, in order, and only until one answers. English first for **recall**: it has
 *  by far the most geotagged articles, and since we want the QID rather than the prose, the
 *  language of the article that carries it does not matter. Hebrew second because for an
 *  Israeli subject `hewiki` genuinely has articles `enwiki` does not. */
const WIKIS = ['en', 'he'] as const;

/** How far out to look.
 *
 *  **Widened from 500m for one category** (§20, owner report: Bangkok never matched). GeoData
 *  returns the N *nearest*, so a bigger radius never displaces a close candidate — in a dense
 *  city the nearest 20 are all well inside 500m and nothing changes. What it adds is the case
 *  that was structurally unreachable: an airport, whose own `P625` sits 1.1–1.4km from the
 *  terminal pin Google gives us (measured, session 225) and can be further still at a
 *  Suvarnabhumi.
 *
 *  **The scoring did NOT widen with it.** A candidate past 500m still earns nothing unless it
 *  is airport-classed — see `geoProximityConfidence`. So this only makes the airport reachable;
 *  it does not make anything else acceptable. */
const GEOSEARCH_RADIUS_M = 3000;

/** Candidates per wiki.
 *
 *  **Twenty, not five, and the reason is central London** (owner report 2026-08-05). GeoData
 *  returns the N *nearest* articles, and around a pin like Piccadilly Circus there are dozens
 *  within 500m — theatres, statues, streets, the Underground station whose own coordinate sits
 *  exactly on the square's. At five, **the subject itself was outside the set** and the station
 *  won by default. A limit tuned for a quiet suburb silently drops the answer in a dense city.
 *
 *  Still one follow-up call: `wbgetentities` takes up to 50 ids, and scoring is arithmetic. */
const GEOSEARCH_LIMIT = 20;

interface GeoSearchResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        coordinates?: { lat?: number; lon?: number }[];
        pageprops?: { wikibase_item?: string };
      }
    >;
  };
}

/** A Wikidata item that is physically near the point, with the distance to the ARTICLE's own
 *  coordinate — indicative only, for ordering and evidence. The final score uses the item's
 *  `P625`, which is the coordinate the rest of the matcher reasons about. */
export interface NearbyItem {
  qid: string;
  title: string;
  lang: string;
  distanceMeters: number;
}

/**
 * The Wikidata items with an article near `point`, nearest first.
 *
 * One call per wiki, and it **stops at the first wiki that answers** — the fallback exists for
 * coverage, not for completeness, and this route is already the last resort. An article with no
 * `wikibase_item` is dropped: without a QID there is nothing downstream can join on.
 */
export async function nearbyWikidataItems(
  fetcher: EnrichmentFetcher,
  point: LatLng,
): Promise<NearbyItem[]> {
  for (const lang of WIKIS) {
    const found = await search(fetcher, lang, point);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * **The items whose article MENTIONS this name** (§20) — Wikipedia's own full-text search.
 *
 * The last of the three routes, and the answer to the recall hole the other two name routes
 * share. `wbsearchentities` matches Wikidata **labels**, so a Hebrew query can only ever reach
 * an item labelled in Hebrew — and a transliterated name (`סוונאפום` for Suvarnabhumi) is not
 * even the same letters as the label, so no amount of scoring saves it. Wikipedia searches
 * article **text and redirects**, where both the transliteration and the city it is in actually
 * appear.
 *
 * Hebrew first here, which is the opposite of the geosearch order above and for a reason: there
 * the language of the article was irrelevant because only its QID was wanted, while here the
 * query is in the saved name's own language and matching it is the whole point.
 *
 * Same host, same response shape, same `wikibase_item` extraction as the coordinate route — so
 * this is a fourth route and not a fourth mechanism.
 */
export async function wikipediaSearchItems(
  fetcher: EnrichmentFetcher,
  name: string,
): Promise<NearbyItem[]> {
  for (const lang of ['he', 'en'] as const) {
    const found = await textSearch(fetcher, lang, name);
    if (found.length > 0) return found;
  }
  return [];
}

async function textSearch(
  fetcher: EnrichmentFetcher,
  lang: string,
  name: string,
): Promise<NearbyItem[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  // Same generator trick as the coordinate route: the QIDs arrive in the SAME call rather than
  // as titles we would then have to look up. `gsr` is `generator=search`'s own prefix.
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', name);
  url.searchParams.set('gsrlimit', String(TEXT_SEARCH_LIMIT));
  url.searchParams.set('prop', 'pageprops|coordinates');
  url.searchParams.set('ppprop', 'wikibase_item');

  const body = await fetcher.fetchJson<GeoSearchResponse>(url.toString());
  return Object.values(body.query?.pages ?? {}).flatMap((page) => {
    const qid = page.pageprops?.wikibase_item;
    if (!qid) return [];
    // **No distance here, and that is honest rather than missing**: this route found the item
    // by its words, not by where it is. The caller re-derives the distance from the item's own
    // `P625`, which is the coordinate the matcher reasons about everywhere else.
    return [{ qid, title: page.title ?? qid, lang, distanceMeters: Number.NaN }];
  });
}

/** Candidates per wiki for the text route. Small on purpose: a full-text search ranks by
 *  relevance, so the answer is at the top if it is anywhere, and every extra id is weight in
 *  the one `wbgetentities` call that follows. */
const TEXT_SEARCH_LIMIT = 5;

async function search(
  fetcher: EnrichmentFetcher,
  lang: string,
  point: LatLng,
): Promise<NearbyItem[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  // `generator=geosearch` rather than `list=geosearch` so the QIDs arrive in the SAME call:
  // as a list it would return titles we then have to look up, doubling the calls on a route
  // that is already a fallback. The prefix `ggs` is the generator's own.
  url.searchParams.set('generator', 'geosearch');
  url.searchParams.set('ggscoord', `${point.lat}|${point.lng}`);
  url.searchParams.set('ggsradius', String(GEOSEARCH_RADIUS_M));
  url.searchParams.set('ggslimit', String(GEOSEARCH_LIMIT));
  // `coordinates` too, because the generator does not carry GeoData's own `dist` through to the
  // pages — so the distance is computed here, with the same haversine the matcher uses.
  url.searchParams.set('prop', 'pageprops|coordinates');
  url.searchParams.set('ppprop', 'wikibase_item');

  const body = await fetcher.fetchJson<GeoSearchResponse>(url.toString());
  const pages = Object.values(body.query?.pages ?? {});
  return pages
    .flatMap((page) => {
      const qid = page.pageprops?.wikibase_item;
      const at = page.coordinates?.[0];
      if (!qid || at?.lat == null || at?.lon == null) return [];
      return [
        {
          qid,
          title: page.title ?? qid,
          lang,
          distanceMeters: haversineMeters(point, { lat: at.lat, lng: at.lon }),
        },
      ];
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
