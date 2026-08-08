// Wikidata — **the identity spine** (ADR-0166 §5), and since §18 a source of two values of
// its own.
//
// Its first job is still identity: it settles the QID (an alias the store keeps, §4), the
// `P625` coordinates a coordless Place-lite never had, the `P18` Commons filename Phase 2's
// image pipeline follows, and the sitelinks that tell Wikipedia which article to read — or
// that there is no Hebrew one.
//
// **And it answers the airport pair** (§18, field reports #7/#23): `P238` is the IATA code and
// `P931` is the city the airport serves, both free off an item this pass already read. Both go
// through `isAirportEntity` first, which is not a formality — London's city entity carries a
// real metropolitan `P238` and no airport class, and labelling a city with a flight code is
// exactly the confidently-wrong failure §Context 3 is about.
//
// **The image is not its value to give.** §11.1 is the amendment that would otherwise have
// caused a licensing breach: an image must be resolved through `P18` and then have its own
// license read on Commons before anything is stored, so Wikidata hands over a *pointer* and
// `FIELD_SOURCE_PRECEDENCE.image` names Commons.
//
// CC0, so nothing it contributes carries an attribution obligation.
import { Injectable } from '@nestjs/common';
import {
  ENRICHMENT_FIELD,
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
  ProviderValue,
} from '../enrichment.provider';
import {
  coordinatesAreAmbiguous,
  geoProximityConfidence,
  granularityRefusals,
  isAirportEntity,
  isMatchConfident,
  nameOnlyConfidence,
  nameProximityConfidence,
  namesComparable,
} from '../match';
import { nearbyWikidataItems } from '../geosearch';
import { EnrichmentFetcher } from '../outbound-fetch';

const API = 'https://www.wikidata.org/w/api.php';

/** Claims we read. `P18` is the image pointer, `P625` the coordinate, `P31` what the thing
 *  *is* (the granularity check's input and the airport guard's), `P576`/`P3999` say it has
 *  ended, and `P238`/`P931` are the airport pair (§18). */
const CLAIM_IMAGE = 'P18';
const CLAIM_COORDINATE = 'P625';
const CLAIM_INSTANCE_OF = 'P31';
const CLAIM_IATA = 'P238';
const CLAIM_PLACE_SERVED = 'P931';

/** Wikipedia editions we ask for sitelinks from — the two languages the summary provider
 *  reads (`he` → `en`, §11.5). Filtered rather than fetched wholesale: an item like Tokyo has
 *  hundreds of sitelinks and we need two. */
const SITE_FILTER = 'hewiki|enwiki';
const SITE_TO_LANG: Readonly<Record<string, string>> = { hewiki: 'he', enwiki: 'en' };

/** Candidates pulled from a name search before scoring. Enough that the right answer is in
 *  the set when the first hit is a disambiguation page or a namesake, few enough that the
 *  follow-up entity read stays one call. */
const SEARCH_LIMIT = 5;

/** Which language the served city is read in, in order (§11.5's `he` → `en`). */
const CITY_LANG_PREFERENCE = ['he', 'en'] as const;

/** How long a memoized item read counts, and how many are held — see `airportEntity`. Both
 *  sized for "the two field resolutions inside one pass", not for traffic. */
const ENTITY_MEMO_TTL_MS = 60_000;
const ENTITY_MEMO_MAX = 16;

interface WbSearchResponse {
  search?: {
    id?: string;
    label?: string;
    description?: string;
    /** **What actually matched the query, and in which language.** The reason this field is
     *  read rather than `label`: `label` is the item's name in the DISPLAY language, which is
     *  not necessarily the language the query hit. Wikidata returns it on every hit. */
    match?: { language?: string; text?: string };
    /** Returned when the hit came through an alias rather than the label. */
    aliases?: string[];
  }[];
}

interface WbEntity {
  id?: string;
  labels?: Record<string, { language?: string; value?: string }>;
  aliases?: Record<string, { language?: string; value?: string }[]>;
  sitelinks?: Record<string, { site?: string; title?: string }>;
  claims?: Record<
    string,
    {
      mainsnak?: {
        snaktype?: string;
        datavalue?: { value?: unknown; type?: string };
      };
      /** `preferred` | `normal` | `deprecated` — the only tie-break Wikidata itself offers
       *  on a multi-valued claim, and the one `P931` sometimes carries (§18). */
      rank?: string;
    }[]
  >;
}

interface WbEntitiesResponse {
  entities?: Record<string, WbEntity>;
}

@Injectable()
export class WikidataProvider implements EnrichmentProvider {
  readonly id: EnrichmentSource = ENRICHMENT_SOURCE.WIKIDATA;
  /** The airport pair (§18). Everything else this provider does is identity, which is
   *  `settlesIdentity` below and not a field. */
  readonly provides: readonly EnrichmentField[] = [
    ENRICHMENT_FIELD.IATA,
    ENRICHMENT_FIELD.SERVED_CITY,
  ];
  /** **Declared, because it is no longer inferable.** The registry used to read "settles
   *  identity" off an empty `provides`; supplying two fields would otherwise have taken
   *  Wikidata out of every summary/image pass silently. */
  readonly settlesIdentity = true;
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
    // Name first, because a name that agrees is stronger evidence than being nearby — half of
    // Tokyo is within 5km of the other half. Coordinates second, and only when the name found
    // nothing: that is the recall hole §15 opened this route for, not a competing answer.
    return (await this.matchByName(identity)) ?? this.matchByCoordinates(identity);
  }

  /**
   * **The airport pair, off the item `match` already found** (§18).
   *
   * Guarded first and unconditionally: `P238` is believed only on an entity whose `P31` says
   * airport. The measured hazard is London's `Q84`, which carries `P238 = LON` (a real
   * metropolitan code) and is a city — so a trip's `לונדון` would otherwise be labelled with a
   * flight code. The guard reads the `P31` this match already recorded as evidence, so it
   * costs nothing.
   *
   * `P931` ("place served by transport hub") is the city, and it is **multi-valued with no
   * reliable winner**: Ben Gurion lists Tel Aviv *and* Jerusalem at equal rank. Wikidata's own
   * preferred rank is taken when it is there (Keflavík has one) and the first normal-rank
   * claim otherwise — an automated default, deliberately, with `Place.nickname` as the way a
   * person overrules it. This is the one place in this pipe where "first" is an answer rather
   * than a refusal, and it is affordable only because a *wrong city* costs a label somebody
   * can correct in two taps, not a wrong photograph on a place.
   */
  async fetch(
    match: ProviderMatch,
    fields: readonly EnrichmentField[],
  ): Promise<ProviderFieldValues> {
    const wanted = fields.filter(
      (field) => field === ENRICHMENT_FIELD.IATA || field === ENRICHMENT_FIELD.SERVED_CITY,
    );
    if (wanted.length === 0) return {};
    if (!isAirportEntity(match.evidence.instanceOf ?? [])) return {};

    const entity = await this.airportEntity(match.ref);
    if (!entity) return {};

    const values: ProviderFieldValues = {};
    if (wanted.includes(ENRICHMENT_FIELD.IATA)) {
      const code = stringClaim(entity, CLAIM_IATA)?.trim().toUpperCase();
      if (code) values[ENRICHMENT_FIELD.IATA] = { value: code };
    }
    if (wanted.includes(ENRICHMENT_FIELD.SERVED_CITY)) {
      const city = await this.servedCity(entity);
      if (city) values[ENRICHMENT_FIELD.SERVED_CITY] = city;
    }
    return values;
  }

  /** The city `P931` names, as a value in the reader's language.
   *
   *  Hebrew first and English second — the same `he` → `en` preference the summary carries
   *  (§11.5), and here it matters more than it does there: the label lands on a day row in a
   *  Hebrew RTL app, so `תל אביב` where Wikidata has a Hebrew label and `Tel Aviv` only where
   *  it does not. */
  private async servedCity(airport: WbEntity): Promise<ProviderValue | undefined> {
    const qid = bestRankedItemClaim(airport, CLAIM_PLACE_SERVED);
    if (!qid) return undefined;
    const city = await this.airportEntity(qid);
    for (const lang of CITY_LANG_PREFERENCE) {
      const label = city?.labels?.[lang]?.value;
      if (!label) continue;
      return { value: commonName(label, aliasesOf(city!, lang)), lang };
    }
    return undefined;
  }

  /**
   * An item read, memoized for the length of one pass.
   *
   * Not a cache tier and deliberately not shaped like one (`blob-cache.ts` is the template for
   * those): the orchestrator resolves fields one at a time, so a single pass asks this provider
   * for `iata` and then for `servedCity` **off the same QID** — without this, one airport is
   * two identical reads of the same item plus two of its city's. Tiny, evict-oldest, and
   * expiring in a minute, because the only hit it is built for happens seconds apart. A miss
   * costs one more request and nothing else, which is why it needs no invalidation story.
   */
  private async airportEntity(qid: string): Promise<WbEntity | null> {
    const held = this.entityMemo.get(qid);
    if (held && Date.now() - held.at < ENTITY_MEMO_TTL_MS) return held.entity;
    const entity = await this.entity(qid);
    if (this.entityMemo.size >= ENTITY_MEMO_MAX) {
      const oldest = this.entityMemo.keys().next().value;
      if (oldest) this.entityMemo.delete(oldest);
    }
    this.entityMemo.set(qid, { entity, at: Date.now() });
    return entity;
  }

  private readonly entityMemo = new Map<string, { entity: WbEntity | null; at: number }>();

  private async matchByName(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    const candidates = await this.search(identity.name);
    if (candidates.length === 0) return null;

    // Score the hit before reading its entity, so the follow-up read only happens for a
    // candidate worth reading — the search response carries enough to reject a namesake.
    //
    // **Scored against every name the hit offers, not just its label** (see `bestName`): the
    // saved name and the item's label are frequently in different scripts, and comparing
    // across scripts scores 0 and refuses a correct match.
    let best: { id: string; confidence: number } | null = null;
    for (const candidate of candidates) {
      if (!candidate.id) continue;
      const confidence = bestNameConfidence(identity, namesOf(candidate));
      if (!best || confidence > best.confidence) best = { id: candidate.id, confidence };
    }
    if (!best || !isMatchConfident(best.confidence)) return null;

    const entity = await this.entity(best.id);
    if (!entity) return null;

    // Re-score with the entity's own coordinate, which the search response does not carry.
    // This is where a same-named place in the wrong city is refused. Against ALL of the
    // entity's labels for the same cross-script reason as above — `wbgetentities` is asked for
    // `he|en`, so a Hebrew saved name meets the Hebrew label here rather than the English one.
    const point = coordinateOf(entity);
    const scored = bestNameMatch(identity, labelsOf(entity), point);
    if (!scored || !isMatchConfident(scored.confidence)) return null;

    return this.toMatch(entity, MATCH_METHOD.NAME_PROXIMITY, scored.confidence, {
      nameSimilarity: scored.nameSimilarity,
      distanceMeters: scored.distanceMeters,
    });
  }

  /**
   * **The coordinates find it and the name checks it** (ADR-0166 §15) — the inverse of
   * `matchByName`, and the answer to its recall hole: `מגדל אייפל` is unreachable by an English
   * label search, while "what is within 500m of this pin" has no language at all.
   *
   * Two rules make it safe, and they are the whole design:
   *
   *  1. **A name comparison across disjoint scripts is uninformative, not negative** — see
   *     `geoProximityConfidence`. When the scripts overlap the name must corroborate exactly as
   *     it does on the name route; when they do not, distance answers alone under a lower
   *     ceiling, so a coordinate-only identity is always outranked by a named one.
   *  2. **A broader entity found ONLY by proximity is skipped, not accepted with refusals.**
   *     §11.2's asymmetry — refuse the summary, keep the image — is right when the name matched
   *     and the entity is a broader description of the *right* subject. Here, with the name
   *     uninformative, the nearest article being a district is evidence of the WRONG subject,
   *     and its `P18` on a ramen bar is the "confidently wrong" failure this ADR exists to
   *     prevent. So it is dropped and the next candidate is tried.
   */
  private async matchByCoordinates(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    if (identity.lat == null || identity.lng == null) return null;
    const nearby = await nearbyWikidataItems(this.fetcher, {
      lat: identity.lat,
      lng: identity.lng,
    });
    if (nearby.length === 0) return null;

    // One call for every candidate: `wbgetentities` takes several ids, so the fallback route
    // costs two requests in total however many articles the point had.
    const entities = await this.entities(nearby.map((item) => item.qid));

    let best: {
      entity: WbEntity;
      confidence: number;
      nameSimilarity: number;
      corroborated: boolean;
    } | null = null;
    // How far away each candidate we were willing to score is — the input to the ambiguity
    // check below, and deliberately measured AFTER the broader-subject skip: a district we
    // already refused is not one of the things competing to be this place.
    const scoreable: number[] = [];
    for (const entity of entities) {
      const labels = labelsOf(entity);
      const point = coordinateOf(entity);
      const corroborated = labels.some((label) => namesComparable(identity.name, label));

      // Rule 2: without a readable name to check it against, a broader entity is the wrong
      // subject rather than a broader view of the right one.
      const broader = Object.keys(
        granularityRefusals({
          instanceOf: instanceOfOf(entity),
          endedProperties: endedPropertiesOf(entity),
        }) ?? {},
      ).length;
      if (!corroborated && broader > 0) continue;

      const scored = corroborated
        ? bestNameMatch(identity, labels, point)
        : geoProximityConfidence(identity, { name: labels[0] ?? '', ...point });
      if (!scored) continue;
      if (scored.distanceMeters != null) scoreable.push(scored.distanceMeters);
      if (!best || scored.confidence > best.confidence) {
        best = {
          entity,
          confidence: scored.confidence,
          nameSimilarity: scored.nameSimilarity,
          corroborated,
        };
      }
    }
    if (!best || !isMatchConfident(best.confidence)) return null;
    // **Ambiguity refuses.** Only for a winner nothing readable corroborated: distance cannot
    // separate two subjects that share a coordinate, so "the nearest" is a coin toss dressed as
    // a match. With a name that agrees, several candidates at the pin are not ambiguous at all.
    if (!best.corroborated && coordinatesAreAmbiguous(scoreable)) return null;

    const found = nearby.find((item) => item.qid === best!.entity.id);
    return this.toMatch(best.entity, MATCH_METHOD.GEOSEARCH, best.confidence, {
      nameSimilarity: best.nameSimilarity,
      distanceMeters: found?.distanceMeters,
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
    // Hebrew first because that is what the saved name usually is: the app asks Google for
    // `languageCode=he`, so a famous place arrives as `מגדל אייפל` (ADR-0108). Wikidata applies
    // its own language fallback to the search, which is why a Latin name like `Stokksnes` — no
    // Hebrew label anywhere — still matches.
    //
    // **`uselang` is NOT a search fallback and setting it to `en` was the bug** (2026-08-05,
    // owner report). It only picks the language of the labels in the RESPONSE, so every hit
    // came back named in English and `matchByName` then compared a Hebrew saved name against
    // `Eiffel Tower` — similarity ~0, refused before the entity was ever read. The search had
    // found the right item; we threw it away. Left unset: the label comes back in the search
    // language, and the comparison uses `match.text` regardless (see `namesOf`).
    url.searchParams.set('language', 'he');
    url.searchParams.set('type', 'item');
    url.searchParams.set('limit', String(SEARCH_LIMIT));
    const body = await this.fetcher.fetchJson<WbSearchResponse>(url.toString());
    return body.search ?? [];
  }

  /** Several items in one call — what makes the coordinate route two requests rather than six.
   *  Order is not relied on: every candidate is scored and the best wins. */
  private async entities(qids: readonly string[]): Promise<WbEntity[]> {
    if (qids.length === 0) return [];
    const url = new URL(API);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', qids.join('|'));
    url.searchParams.set('props', 'labels|claims|sitelinks');
    url.searchParams.set('sitefilter', SITE_FILTER);
    url.searchParams.set('languages', 'he|en');
    const body = await this.fetcher.fetchJson<WbEntitiesResponse>(url.toString());
    return Object.values(body.entities ?? {});
  }

  private async entity(qid: string): Promise<WbEntity | null> {
    const url = new URL(API);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', qid);
    // `aliases` is here for the served city's common name (§18's amendment) — Wikidata's LABEL
    // is the official form (`תל אביב-יפו`, `Frankfurt am Main`) and the name people use is
    // usually an alias. One extra field on a read this pass already makes.
    url.searchParams.set('props', 'labels|aliases|claims|sitelinks');
    url.searchParams.set('sitefilter', SITE_FILTER);
    url.searchParams.set('languages', 'he|en');
    const body = await this.fetcher.fetchJson<WbEntitiesResponse>(url.toString());
    return body.entities?.[qid] ?? null;
  }
}

/** Every alias the item offers in one language. */
function aliasesOf(entity: WbEntity, lang: string): string[] {
  return (entity.aliases?.[lang] ?? [])
    .map((alias) => alias?.value)
    .filter((value): value is string => !!value);
}

/**
 * **What people CALL the city, not what it is officially named** (owner report, 2026-08-08:
 * the label read `תל אביב-יפו`).
 *
 * Wikidata's label is the official form — `תל אביב-יפו`, `Frankfurt am Main` — and the name a
 * traveller uses is usually sitting right there as an alias. There is no "common name"
 * property to read instead, so the rule is structural:
 *
 * > **the LONGEST alias that is a proper prefix of the label, ending at a word boundary.**
 *
 * That is narrow on purpose, and each half of it is load-bearing. **Prefix** keeps it to
 * dropping a trailing qualifier (`-יפו`, ` am Main`) — an alias that is a different word
 * entirely (an abbreviation, a former name, a translation) is not one. **Longest** is what
 * stops a one-word alias winning: shortest would answer `תל` for `תל אביב-יפו` if anyone had
 * ever added it. **Word boundary** stops a prefix landing mid-word.
 *
 * Fails to the label, which is the current behaviour, so a city with no alias is unchanged.
 */
export function commonName(label: string, aliases: readonly string[]): string {
  let best: string | undefined;
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (trimmed.length === 0 || trimmed.length >= label.length) continue;
    if (!label.startsWith(trimmed)) continue;
    // The character the label continues with has to be a separator, or the "prefix" is the
    // first half of a longer word.
    if (/[\p{L}\p{N}]/u.test(label[trimmed.length]!)) continue;
    if (!best || trimmed.length > best.length) best = trimmed;
  }
  return best ?? label;
}

const labelOf = (entity: WbEntity): string | undefined =>
  entity.labels?.he?.value ??
  entity.labels?.en?.value ??
  Object.values(entity.labels ?? {})[0]?.value;

/* ── SCORING ACROSS SCRIPTS ────────────────────────────────────────────────────────────────
   **A saved name and an item's label are routinely in different scripts, and comparing across
   scripts scores 0** — which reads as "wrong place" when it means "different alphabet". This is
   the bug the owner found on the first live run (2026-08-05): `מגדל אייפל` was searched, the
   Eiffel Tower WAS returned, and the match was refused because the hit's label came back as
   `Eiffel Tower`. `Stokksnes` matched on the same day because its saved name is already Latin.

   So a candidate is scored against **every name it offers** and keeps its best. That is not a
   loosening of §5.5's refusal: each comparison still has to clear the confidence gate on its
   own, and the distance veto still applies to whichever name won. What changes is that the
   right name is among the ones tried. */

/** Every string a search hit offers as its own name. `match.text` first because it is what
 *  actually matched the query, so it is in the query's own script by construction. */
function namesOf(hit: NonNullable<WbSearchResponse['search']>[number]): string[] {
  return [hit.match?.text, hit.label, ...(hit.aliases ?? [])].filter(
    (name): name is string => !!name,
  );
}

/** Every label the entity read returned — `wbgetentities` is asked for `he|en`. */
function labelsOf(entity: WbEntity): string[] {
  return Object.values(entity.labels ?? {})
    .map((label) => label?.value)
    .filter((value): value is string => !!value);
}

/** The best confidence any of these names earns, with no coordinate to corroborate it yet.
 *
 *  `nameOnlyConfidence` and not the full scorer, deliberately: the search response has no
 *  coordinates, and the full scorer now REFUSES a candidate that has none when we have ours
 *  (the song-named-after-the-place fix). Applied here that would reject every hit before the
 *  entity carrying the coordinate is read. The veto belongs to the entity pass. */
function bestNameConfidence(identity: PlaceIdentity, names: readonly string[]): number {
  return names.reduce((best, name) => Math.max(best, nameOnlyConfidence(identity, name)), 0);
}

/** The best-scoring name WITH the entity's coordinate — the pass that can veto on distance. */
function bestNameMatch(
  identity: PlaceIdentity,
  names: readonly string[],
  point: { lat?: number; lng?: number },
): ReturnType<typeof nameProximityConfidence> | undefined {
  let best: ReturnType<typeof nameProximityConfidence> | undefined;
  for (const name of names) {
    const scored = nameProximityConfidence(identity, { name, ...point });
    if (!best || scored.confidence > best.confidence) best = scored;
  }
  return best;
}

/** A string-valued claim (`P18`'s Commons filename). Skips a `novalue`/`somevalue` snak,
 *  which carries no `datavalue` at all — teamLab Planets has sitelinks and no `P18`, so the
 *  absent case is the normal one, not a fault (§12.5). */
function stringClaim(entity: WbEntity, property: string): string | undefined {
  const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : undefined;
}

/**
 * The item a multi-valued item-claim points at, **preferred rank first** (§18).
 *
 * Wikidata's own rank is the only tie-break the data offers, and it is not always there:
 * Keflavík marks Keflavík preferred over Njarðvík, while Ben Gurion leaves Tel Aviv and
 * Jerusalem both at normal rank. So this is preferred-when-stated, first-otherwise — an
 * automated default whose wrong answers are what `Place.nickname` exists to overrule.
 * Deprecated claims are skipped outright: that rank means the community has said the value is
 * wrong.
 */
function bestRankedItemClaim(entity: WbEntity, property: string): string | undefined {
  const claims = (entity.claims?.[property] ?? []).filter((claim) => claim.rank !== 'deprecated');
  const chosen = claims.find((claim) => claim.rank === 'preferred') ?? claims[0];
  const id = (chosen?.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
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
