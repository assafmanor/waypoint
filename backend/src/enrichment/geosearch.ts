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

/** How far out to look. Matched to where `geoProximityConfidence`'s distance credit reaches
 *  zero, so a candidate this returns can never be too far to score — anything further is not a
 *  near miss, it is a different place. */
const GEOSEARCH_RADIUS_M = 500;

/** Candidates per wiki. Same reasoning as the name search's limit: enough that the right answer
 *  is in the set when the nearest article is the district rather than the shop, few enough that
 *  the follow-up entity read stays **one** `wbgetentities` call. */
const GEOSEARCH_LIMIT = 5;

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
