// Wikidata — **the identity spine**, and in Phase 1 that is its whole job (ADR-0166 §5).
//
// It supplies no Tier-A field value and is still the provider everything else depends on: it
// settles the QID (an alias the store keeps, §4), the `P625` coordinates a coordless
// Place-lite never had, the `P18` Commons filename Phase 2's image pipeline follows, and the
// sitelinks that tell Wikipedia which article to read — or that there is no Hebrew one.
//
// **The image is not its value to give.** §11.1 is the amendment that would otherwise have
// caused a licensing breach: an image must be resolved through `P18` and then have its own
// license read on Commons before anything is stored, so Wikidata hands over a *pointer* and
// `FIELD_SOURCE_PRECEDENCE.image` names Commons.
//
// CC0, so nothing it contributes carries an attribution obligation.
import { Injectable } from '@nestjs/common';
import {
  MATCH_METHOD,
  SOURCE_POLICY,
  ENRICHMENT_SOURCE,
  type EnrichmentField,
  type EnrichmentSource,
} from '@waypoint/shared';
import type {
  EnrichmentProvider,
  PlaceIdentity,
  ProviderFieldValues,
  ProviderMatch,
} from '../enrichment.provider';
import { granularityRefusals, isMatchConfident, nameProximityConfidence } from '../match';
import { EnrichmentFetcher } from '../outbound-fetch';

const API = 'https://www.wikidata.org/w/api.php';

/** Claims we read. `P18` is the image pointer, `P625` the coordinate, `P31` what the thing
 *  *is* (the granularity check's input), and `P576`/`P3999` say it has ended. */
const CLAIM_IMAGE = 'P18';
const CLAIM_COORDINATE = 'P625';
const CLAIM_INSTANCE_OF = 'P31';

/** Wikipedia editions we ask for sitelinks from — the two languages the summary provider
 *  reads (`he` → `en`, §11.5). Filtered rather than fetched wholesale: an item like Tokyo has
 *  hundreds of sitelinks and we need two. */
const SITE_FILTER = 'hewiki|enwiki';
const SITE_TO_LANG: Readonly<Record<string, string>> = { hewiki: 'he', enwiki: 'en' };

/** Candidates pulled from a name search before scoring. Enough that the right answer is in
 *  the set when the first hit is a disambiguation page or a namesake, few enough that the
 *  follow-up entity read stays one call. */
const SEARCH_LIMIT = 5;

interface WbSearchResponse {
  search?: { id?: string; label?: string; description?: string }[];
}

interface WbEntity {
  id?: string;
  labels?: Record<string, { language?: string; value?: string }>;
  sitelinks?: Record<string, { site?: string; title?: string }>;
  claims?: Record<
    string,
    {
      mainsnak?: {
        snaktype?: string;
        datavalue?: { value?: unknown; type?: string };
      };
    }[]
  >;
}

interface WbEntitiesResponse {
  entities?: Record<string, WbEntity>;
}

@Injectable()
export class WikidataProvider implements EnrichmentProvider {
  readonly id: EnrichmentSource = ENRICHMENT_SOURCE.WIKIDATA;
  /** Empty on purpose — see the file header. Wikidata contributes identity, not a value. */
  readonly provides: readonly EnrichmentField[] = [];
  readonly policy = SOURCE_POLICY.wikidata;

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  /**
   * Match order per §12.3, exact first:
   *
   *  1. **a settled QID** — an alias an earlier pass already established, so this is an
   *     identity join and scores as one;
   *  2. **name + proximity** — the last resort, whose confidence is *computed* and which
   *     refuses below the threshold rather than guessing (§5.5).
   *
   * (`wikidata_tag`, the third route, is an OSM object's own `wikidata=Q…` tag — it fires in
   * the other direction, from a QID to an OSM element, so it belongs to the OSM provider
   * Phase 2 adds.)
   */
  async match(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    if (identity.wikidataQid) {
      const entity = await this.entity(identity.wikidataQid);
      return entity ? this.toMatch(entity, MATCH_METHOD.SETTLED_ID, 1, {}) : null;
    }
    return this.matchByName(identity);
  }

  /** Nothing to fetch: everything this provider learns is settled by `match`, and a field
   *  value is not its to give. */
  async fetch(): Promise<ProviderFieldValues> {
    return {};
  }

  private async matchByName(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    const candidates = await this.search(identity.name);
    if (candidates.length === 0) return null;

    // Score against the LABEL from the search hit first, so the entity read only happens for
    // a candidate worth reading — the search response carries enough to reject a namesake.
    let best: { id: string; confidence: number } | null = null;
    for (const candidate of candidates) {
      if (!candidate.id) continue;
      const { confidence } = nameProximityConfidence(identity, {
        name: candidate.label ?? '',
      });
      if (!best || confidence > best.confidence) best = { id: candidate.id, confidence };
    }
    if (!best || !isMatchConfident(best.confidence)) return null;

    const entity = await this.entity(best.id);
    if (!entity) return null;

    // Re-score with the entity's own coordinate, which the search response does not carry.
    // This is where a same-named place in the wrong city is refused.
    const label = labelOf(entity);
    const point = coordinateOf(entity);
    const scored = nameProximityConfidence(identity, { name: label ?? '', ...point });
    if (!isMatchConfident(scored.confidence)) return null;

    return this.toMatch(entity, MATCH_METHOD.NAME_PROXIMITY, scored.confidence, {
      nameSimilarity: scored.nameSimilarity,
      distanceMeters: scored.distanceMeters,
    });
  }

  private toMatch(
    entity: WbEntity,
    method: ProviderMatch['method'],
    confidence: number,
    evidence: Omit<ProviderMatch['evidence'], 'label' | 'instanceOf'>,
  ): ProviderMatch | null {
    const qid = entity.id;
    if (!qid) return null;
    const instanceOf = instanceOfOf(entity);

    return {
      ref: qid,
      method,
      confidence,
      evidence: { ...evidence, label: labelOf(entity), instanceOf },
      settled: {
        wikidataQid: qid,
        commonsFilename: stringClaim(entity, CLAIM_IMAGE),
        articleTitles: articleTitlesOf(entity),
        ...coordinateOf(entity),
        // **How much this identity is worth downstream.** Wikipedia and Commons both reach
        // their content through an exact join off this item — but if this item was found by
        // name and proximity, its article and its photograph are only that trustworthy, and
        // a confidence-1 photo off a 0.7 match is exactly the "confidently wrong" failure
        // §Context 3 is built to avoid.
        identityConfidence: confidence,
      },
      // The second refusal reason (§11.2): a right match at the wrong granularity. Refuses
      // `summary` and leaves `image` alone, which is the asymmetry per-field precedence
      // exists to express.
      refusedFields: granularityRefusals({
        instanceOf,
        endedProperties: endedPropertiesOf(entity),
      }),
    };
  }

  private async search(name: string) {
    const url = new URL(API);
    url.searchParams.set('action', 'wbsearchentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('search', name);
    // Hebrew first because that is what the saved name usually is (ADR-0108); `uselang`
    // supplies the fallback so a Hebrew query still finds an item labelled only in English.
    url.searchParams.set('language', 'he');
    url.searchParams.set('uselang', 'en');
    url.searchParams.set('type', 'item');
    url.searchParams.set('limit', String(SEARCH_LIMIT));
    const body = await this.fetcher.fetchJson<WbSearchResponse>(url.toString());
    return body.search ?? [];
  }

  private async entity(qid: string): Promise<WbEntity | null> {
    const url = new URL(API);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', qid);
    url.searchParams.set('props', 'labels|claims|sitelinks');
    url.searchParams.set('sitefilter', SITE_FILTER);
    url.searchParams.set('languages', 'he|en');
    const body = await this.fetcher.fetchJson<WbEntitiesResponse>(url.toString());
    return body.entities?.[qid] ?? null;
  }
}

const labelOf = (entity: WbEntity): string | undefined =>
  entity.labels?.he?.value ??
  entity.labels?.en?.value ??
  Object.values(entity.labels ?? {})[0]?.value;

/** A string-valued claim (`P18`'s Commons filename). Skips a `novalue`/`somevalue` snak,
 *  which carries no `datavalue` at all — teamLab Planets has sitelinks and no `P18`, so the
 *  absent case is the normal one, not a fault (§12.5). */
function stringClaim(entity: WbEntity, property: string): string | undefined {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : undefined;
}

/** `P625`'s globe-coordinate value. */
function coordinateOf(entity: WbEntity): { lat?: number; lng?: number } {
  const value = entity.claims?.[CLAIM_COORDINATE]?.[0]?.mainsnak?.datavalue?.value;
  if (!value || typeof value !== 'object') return {};
  const point = value as { latitude?: unknown; longitude?: unknown };
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
    ? { lat: point.latitude, lng: point.longitude }
    : {};
}

/** Every `P31` QID — the granularity check reads all of them, because an entity is often
 *  several things at once and only one of them has to be the broad one. */
function instanceOfOf(entity: WbEntity): string[] {
  return (entity.claims?.[CLAIM_INSTANCE_OF] ?? [])
    .map((claim) => (claim.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((id): id is string => typeof id === 'string');
}

/** Which "this has ended" properties the item carries — the Tsukiji case (§11.2). */
function endedPropertiesOf(entity: WbEntity): string[] {
  return ['P576', 'P3999'].filter((property) => (entity.claims?.[property]?.length ?? 0) > 0);
}

/** Article titles keyed by language, from the filtered sitelinks. An item with no `hewiki`
 *  sitelink has **no Hebrew article** — that is an answer, and it is the answer for 18 of 27
 *  Tokyo places (§11.5). */
function articleTitlesOf(entity: WbEntity): Record<string, string> | undefined {
  const titles: Record<string, string> = {};
  for (const [site, link] of Object.entries(entity.sitelinks ?? {})) {
    const lang = SITE_TO_LANG[site];
    if (lang && link.title) titles[lang] = link.title;
  }
  return Object.keys(titles).length > 0 ? titles : undefined;
}
