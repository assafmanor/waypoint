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
import { Injectable, Logger } from '@nestjs/common';
import {
  ENRICHMENT_FIELD,
  MATCH_METHOD,
  MATCH_METHOD_CONFIDENCE,
  MATCH_MIN_NAME_SIMILARITY,
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
  nameCanRefuse,
  nameProximityConfidence,
  nameSimilarity,
  namesComparable,
  type ProximityConfidence,
} from '../match';
import { nearbyWikidataItems, wikipediaSearchItems } from '../geosearch';
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

/** How many class labels are held. Sized for "a trip's worth of feature types" rather than a
 *  pass's — a waterfall is a waterfall for every waterfall the trip saves (§22). */
const CLASS_NOUN_MEMO_MAX = 256;

/** `wbgetentities` takes 50 ids per call, and every batch here is capped at that so a wide
 *  candidate set can never silently become a 414. */
const ENTITY_IDS_PER_CALL = 50;

const ENTITY_PROPS = 'labels|aliases|claims|sitelinks';

/**
 * **The id is all this response is read for now** (§22).
 *
 * It used to be scored — against `match.text`, `label` and `aliases`, which is how §15 got a
 * Hebrew saved name past a hit labelled `Eiffel Tower` — because scoring here decided which
 * single hit was worth an entity read. Every hit is read now, in the one call that read the
 * winner, so the scoring happens where the coordinates are and the search response has nothing
 * left to contribute. §15's lesson is kept, not dropped: the entity pass scores against every
 * name the item offers, which is a superset of what the hit carried.
 */
interface WbSearchResponse {
  search?: { id?: string }[];
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
   *  2. **name + proximity** — a computed confidence that refuses below the threshold rather
   *     than guessing (§5.5);
   *  3. **the coordinates** (§15) — for the item labelled in no language we asked for;
   *  4. **Wikipedia's full-text search** (§20) — for the item the coordinates could not reach
   *     either, which in practice means an airport: its centroid is kilometres from the
   *     terminal pin, and a transliterated name shares no tokens with its label.
   *
   * Each is tried only when the one before it found nothing, so the strongest evidence
   * available always wins and the weaker routes cost nothing on the common case.
   *
   * (`wikidata_tag`, the remaining method, is an OSM object's own `wikidata=Q…` tag — it fires
   * in the other direction, from a QID to an OSM element, so it belongs to the OSM provider
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
    const trace: RouteTrace = [];
    const found =
      (await this.matchByName(identity, trace)) ??
      (await this.matchByCoordinates(identity, trace)) ??
      (await this.matchByArticleText(identity, trace));
    if (!found) this.logMiss(identity, trace);
    return found;
  }

  /**
   * **Why this place matched nothing, in one line** (field report #41).
   *
   * Two sessions have now been spent reconstructing, by hand and against the live APIs, which
   * route saw which candidate and which guard refused it — evidence the pass itself had and
   * threw away. So a miss records it: every route attempted, every candidate it returned, and
   * the number that killed each one. `debug`, because a miss is a normal outcome for most
   * places (Tokyo restaurants scored 0 of 7) and this is a diagnosis to switch on, not a
   * warning; `ENRICHMENT_LIVE_PROBE` in the specs replays the same routes offline.
   */
  private logMiss(identity: PlaceIdentity, trace: RouteTrace): void {
    if (!this.logger.debug) return;
    this.logger.debug(
      `no wikidata match for ${JSON.stringify(identity.name)} ` +
        `@${identity.lat ?? '-'},${identity.lng ?? '-'} :: ` +
        (trace.length === 0
          ? 'no route returned a candidate'
          : trace
              .map(
                (route) =>
                  `${route.route}[${route.candidates
                    .map(
                      (c) =>
                        `${c.qid} ${JSON.stringify(c.name)} sim=${c.nameSimilarity.toFixed(2)}` +
                        `${c.distanceMeters == null ? '' : ` d=${Math.round(c.distanceMeters)}m`}` +
                        ` conf=${c.confidence.toFixed(2)}${c.refusedBy ? ` ${c.refusedBy}` : ''}`,
                    )
                    .join('; ')}]`,
              )
              .join(' ')),
    );
  }

  private readonly logger = new Logger(WikidataProvider.name);

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

  /**
   * **Every hit the search returned is read and scored, not just the best-named one** (field
   * report #41, ADR-0166 §22).
   *
   * This used to pick one candidate on the name alone and then verify it — so a namesake that
   * scored identically won the tie and, once its coordinates refuted it, the route returned
   * `null` with the right answer sitting untouched at rank 2. Measured on `Brúarfoss`: Wikidata
   * has two waterfalls of that exact name 130km apart plus three ships, the search returns all
   * five, and the first one is the wrong waterfall. **A pre-filter that discards a candidate
   * before its coordinate has been read is deciding on evidence it does not have yet** — §15's
   * own lesson, which is why `nameOnlyConfidence` exists rather than the full scorer, and the
   * honest conclusion is not to decide there at all.
   *
   * It costs nothing: `wbgetentities` takes 50 ids, so five candidates are the same one call the
   * single winner used to take.
   */
  private async matchByName(
    identity: PlaceIdentity,
    trace: RouteTrace,
  ): Promise<ProviderMatch | null> {
    const hits = await this.search(identity.name);
    const ids = hits.map((hit) => hit.id).filter((id): id is string => !!id);
    const seen = note(trace, MATCH_METHOD.NAME_PROXIMITY);
    if (ids.length === 0) return null;

    const entities = await this.entities(ids);
    const classNouns = await this.classNouns(identity, entities);

    let best: { entity: WbEntity; scored: ReturnType<typeof nameProximityConfidence> } | null =
      null;
    for (const entity of entities) {
      // Against ALL of the names the entity offers — labels, aliases and article titles — for
      // the cross-script reason below, and with the entity's own coordinate, which the search
      // response does not carry. This is where a same-named place in the wrong city is refused.
      const scored = bestNameMatch(
        identity,
        namesOfEntity(entity),
        coordinateOf(entity),
        classNouns.get(entity.id ?? ''),
      );
      if (!scored) continue;
      seen(entity, scored);
      if (!best || scored.confidence > best.scored.confidence) best = { entity, scored };
    }
    if (!best || !isMatchConfident(best.scored.confidence)) return null;

    return this.toMatch(best.entity, MATCH_METHOD.NAME_PROXIMITY, best.scored.confidence, {
      nameSimilarity: best.scored.nameSimilarity,
      distanceMeters: best.scored.distanceMeters,
    });
  }

  /**
   * **What each candidate IS, in words** — the labels of its `P31` classes, which is what lets
   * the matcher tell `Brúarfoss Waterfall`/`Brúarfoss` (a type noun our name adds) from
   * `Tsukiji Outer Market`/`Tsukiji` (a different place). ADR-0166 §22 is the policy; this is
   * the one lookup it needs.
   *
   * **Asked only when it could change an answer.** A candidate whose name already clears the
   * floor, or whose extra words are not ours to begin with, is unaffected by a class noun — so
   * the common case makes no request at all and the pass costs exactly what it did before.
   *
   * Memoized process-wide because feature classes are the most repeated data in this pipe: a
   * trip through Iceland asks about `Q34038` (waterfall) a dozen times, and the label of a class
   * does not change. Same evict-oldest shape as `airportEntity`'s memo, with no TTL — a class
   * label is not a fact that goes stale within a process's life.
   */
  private async classNouns(
    identity: PlaceIdentity,
    entities: readonly WbEntity[],
  ): Promise<Map<string, string[]>> {
    const relevant = entities.filter((entity) => descriptorCouldRescue(identity.name, entity));
    const wanted = new Set(relevant.flatMap(instanceOfOf));
    const missing = [...wanted].filter((qid) => !this.classNounMemo.has(qid));
    // In batches of what one call takes, rather than one truncated call: a class we never asked
    // about must not be remembered as having no label, which is what a silent `slice` would do.
    for (let from = 0; from < missing.length; from += ENTITY_IDS_PER_CALL) {
      const batch = missing.slice(from, from + ENTITY_IDS_PER_CALL);
      for (const entity of await this.entities(batch, 'labels')) {
        if (entity.id) this.remember(entity.id, labelsOf(entity));
      }
      // Remembered as "no label" too, so an unlabelled class is asked about once, not per pass.
      for (const qid of batch) if (!this.classNounMemo.has(qid)) this.remember(qid, []);
    }
    const byEntity = new Map<string, string[]>();
    for (const entity of relevant) {
      const nouns = instanceOfOf(entity).flatMap((qid) => this.classNounMemo.get(qid) ?? []);
      if (entity.id && nouns.length > 0) byEntity.set(entity.id, nouns);
    }
    return byEntity;
  }

  private remember(qid: string, labels: string[]): void {
    if (this.classNounMemo.size >= CLASS_NOUN_MEMO_MAX) {
      const oldest = this.classNounMemo.keys().next().value;
      if (oldest) this.classNounMemo.delete(oldest);
    }
    this.classNounMemo.set(qid, labels);
  }

  private readonly classNounMemo = new Map<string, string[]>();

  /**
   * **The coordinates find it and the name checks it** (ADR-0166 §15) — the inverse of
   * `matchByName`, and the answer to its recall hole: `מגדל אייפל` is unreachable by an English
   * label search, while "what is within 500m of this pin" has no language at all.
   *
   * Two rules make it safe, and they are the whole design:
   *
   *  1. **A name that cannot arbitrate is uninformative, not negative** — see `nameCanRefuse`,
   *     which knows two ways to be unable to: disjoint scripts (§15) and a name of ours that
   *     merely says more than theirs (`Kerið Crater` against `Kerið`). When the name can
   *     arbitrate it must corroborate exactly as it does on the name route; when it cannot,
   *     distance answers alone under a lower ceiling, so a coordinate-only identity is always
   *     outranked by a named one.
   *  2. **A broader entity found ONLY by proximity is skipped, not accepted with refusals.**
   *     §11.2's asymmetry — refuse the summary, keep the image — is right when the name matched
   *     and the entity is a broader description of the *right* subject. Here, with the name
   *     uninformative, the nearest article being a district is evidence of the WRONG subject,
   *     and its `P18` on a ramen bar is the "confidently wrong" failure this ADR exists to
   *     prevent. So it is dropped and the next candidate is tried.
   */
  private async matchByCoordinates(
    identity: PlaceIdentity,
    trace: RouteTrace,
  ): Promise<ProviderMatch | null> {
    if (identity.lat == null || identity.lng == null) return null;
    const nearby = await nearbyWikidataItems(this.fetcher, {
      lat: identity.lat,
      lng: identity.lng,
    });
    const seen = note(trace, MATCH_METHOD.GEOSEARCH);
    if (nearby.length === 0) return null;

    // One call for every candidate: `wbgetentities` takes several ids, so the fallback route
    // costs two requests in total however many articles the point had.
    const entities = await this.entities(nearby.map((item) => item.qid));
    const classNouns = await this.classNouns(identity, entities);

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
      const labels = namesOfEntity(entity);
      const nouns = classNouns.get(entity.id ?? '');
      const point = coordinateOf(entity);
      const corroborated = labels.some((label) =>
        nameCanRefuse(identity.name, { name: label, classNouns: nouns }),
      );

      // Rule 2: with no name able to check it, a broader entity is the wrong subject rather
      // than a broader view of the right one. This now also catches the district our own name
      // contains — `Tsukiji` under `Tsukiji Outer Market` — which is the guard that keeps
      // `nameCanRefuse`'s second clause from admitting one.
      const broader = Object.keys(
        granularityRefusals({
          instanceOf: instanceOfOf(entity),
          endedProperties: endedPropertiesOf(entity),
        }) ?? {},
      ).length;
      if (!corroborated && broader > 0) {
        seen(entity, { confidence: 0, nameSimilarity: 0 }, 'skipped: broader type, uncorroborated');
        continue;
      }

      const airport = isAirportEntity(instanceOfOf(entity));
      const scored =
        corroborated && !airport
          ? bestNameMatch(identity, labels, point, nouns)
          : geoProximityConfidence(identity, {
              name: labels[0] ?? '',
              classNouns: nouns,
              ...point,
              // **An airport is allowed to be kilometres from its own door** (§20). Earned by
              // the candidate's `P31`, so nothing that is not an airport gets the allowance.
              isAirport: airport,
            });
      if (!scored) continue;
      seen(entity, scored, corroborated ? undefined : 'distance only');
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
    // **Ambiguity refuses.** Only for a winner no name could corroborate: distance cannot
    // separate two subjects that share a coordinate, so "the nearest" is a coin toss dressed as
    // a match. With a name that agrees, several candidates at the pin are not ambiguous at all.
    if (!best.corroborated && coordinatesAreAmbiguous(scoreable)) {
      seen(best.entity, { confidence: 0, nameSimilarity: 0 }, 'refused: two things at one pin');
      return null;
    }

    const found = nearby.find((item) => item.qid === best!.entity.id);
    return this.toMatch(best.entity, MATCH_METHOD.GEOSEARCH, best.confidence, {
      nameSimilarity: best.nameSimilarity,
      distanceMeters: found?.distanceMeters,
    });
  }

  /**
   * **The words, when neither the label nor the point could find it** (§20, owner report:
   * Bangkok never matched).
   *
   * `wbsearchentities` matches Wikidata LABELS, so a Hebrew query reaches only a Hebrew-labelled
   * item — and `נמל התעופה בנגקוק סוונאפום` against `Suvarnabhumi Airport` is a transliteration,
   * not a translation: it shares no tokens, no script, and no amount of scoring recovers it. The
   * coordinate route could not answer either, because an airport's centroid is kilometres from
   * the terminal pin. Wikipedia's full-text search reaches it, because the Hebrew article says
   * both `סוונאפום` and `בנגקוק` in its own words.
   *
   * **It is the weakest route and it is scored as one.** A text hit means "this article mentions
   * these words" — real evidence, and less than a name that agreed or a point that matched — so
   * it is capped at `MATCH_METHOD_CONFIDENCE.wiki_search` and still has to clear the threshold.
   * The candidate then faces exactly the checks the other routes apply: the name where the
   * scripts allow it, the distance otherwise, and the broader-subject skip when nothing readable
   * corroborated it.
   */
  private async matchByArticleText(
    identity: PlaceIdentity,
    trace: RouteTrace,
  ): Promise<ProviderMatch | null> {
    const hits = await wikipediaSearchItems(this.fetcher, identity.name);
    const seen = note(trace, MATCH_METHOD.WIKI_SEARCH);
    if (hits.length === 0) return null;
    const entities = await this.entities(hits.map((hit) => hit.qid));
    const classNouns = await this.classNouns(identity, entities);

    let best: { entity: WbEntity; confidence: number; nameSimilarity: number } | null = null;
    for (const entity of entities) {
      const labels = namesOfEntity(entity);
      const nouns = classNouns.get(entity.id ?? '');
      const point = coordinateOf(entity);
      const airport = isAirportEntity(instanceOfOf(entity));
      const corroborated = labels.some((label) =>
        nameCanRefuse(identity.name, { name: label, classNouns: nouns }),
      );

      // Same rule the coordinate route follows: with no name able to check it, a broader
      // entity is the wrong subject rather than a broader view of the right one.
      if (
        !corroborated &&
        Object.keys(
          granularityRefusals({
            instanceOf: instanceOfOf(entity),
            endedProperties: endedPropertiesOf(entity),
          }) ?? {},
        ).length > 0
      ) {
        seen(entity, { confidence: 0, nameSimilarity: 0 }, 'skipped: broader type, uncorroborated');
        continue;
      }

      const scored =
        corroborated && !airport
          ? bestNameMatch(identity, labels, point, nouns)
          : geoProximityConfidence(identity, {
              name: labels[0] ?? '',
              classNouns: nouns,
              ...point,
              isAirport: airport,
            });
      if (!scored) continue;
      const capped = Math.min(scored.confidence, MATCH_METHOD_CONFIDENCE.wiki_search);
      seen(entity, { ...scored, confidence: capped });
      if (!best || capped > best.confidence) {
        best = { entity, confidence: capped, nameSimilarity: scored.nameSimilarity };
      }
    }
    if (!best || !isMatchConfident(best.confidence)) return null;

    return this.toMatch(best.entity, MATCH_METHOD.WIKI_SEARCH, best.confidence, {
      nameSimilarity: best.nameSimilarity,
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
   *  Order is not relied on: every candidate is scored and the best wins.
   *
   *  **`aliases` is in the default props** because a candidate's aliases are names it offers and
   *  the scorer was never shown them: `Q185382`'s label is `Trevi Fountain` and `Fontana di
   *  Trevi` — the name Google returns in Italy — is sitting in its aliases. Free: the same call,
   *  one more field. */
  private async entities(qids: readonly string[], props = ENTITY_PROPS): Promise<WbEntity[]> {
    if (qids.length === 0) return [];
    const url = new URL(API);
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', qids.slice(0, ENTITY_IDS_PER_CALL).join('|'));
    url.searchParams.set('props', props);
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

/* ── THE EVIDENCE A MISS LEAVES BEHIND (ADR-0166 §22) ──────────────────────────────────────
   A refusal used to be a `null` with the reasoning discarded, and reconstructing it took a
   session with the live APIs open. These record what each route saw as it goes, cheaply enough
   to run always — it is a few strings per candidate, built only from values the scorer computed
   anyway — and `logMiss` prints them when, and only when, nothing matched. */

type RouteTrace = { route: string; candidates: TracedCandidate[] }[];

interface TracedCandidate {
  qid: string;
  name: string;
  confidence: number;
  nameSimilarity: number;
  distanceMeters?: number;
  refusedBy?: string;
}

/** Opens a route's section of the trace and returns the recorder for its candidates. Capped, so
 *  a dense city's twenty articles cannot turn one miss into a paragraph. */
function note(trace: RouteTrace, route: string) {
  const candidates: TracedCandidate[] = [];
  trace.push({ route, candidates });
  return (
    entity: WbEntity,
    scored: Omit<ProximityConfidence, 'distanceMeters'> & {
      distanceMeters?: number;
    },
    refusedBy?: string,
  ) => {
    if (candidates.length >= TRACED_CANDIDATES_MAX) return;
    candidates.push({
      qid: entity.id ?? '?',
      name: labelOf(entity) ?? '',
      confidence: scored.confidence,
      nameSimilarity: scored.nameSimilarity,
      distanceMeters: scored.distanceMeters,
      refusedBy,
    });
  };
}

const TRACED_CANDIDATES_MAX = 8;

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

/** Every label the entity read returned — `wbgetentities` is asked for `he|en`. */
function labelsOf(entity: WbEntity): string[] {
  return Object.values(entity.labels ?? {})
    .map((label) => label?.value)
    .filter((value): value is string => !!value);
}

/**
 * **Every name this entity offers**, which is more than its labels (field report #41).
 *
 * The scorer used to see two strings — the `he` and `en` labels — and refuse everything the
 * item calls itself by any other name. Two free sources were sitting in the response it had
 * already paid for:
 *
 *  - **aliases**, which is where the name a country actually uses usually lives (`Fontana di
 *    Trevi` against a label of `Trevi Fountain`);
 *  - **the article titles**, which are a language's own name for the subject and routinely
 *    differ from the Wikidata label — Gullfoss's Hebrew label is `גאלפוס` and its Hebrew article
 *    is `גוטלפוס`, two transliterations of one Icelandic word.
 *
 * Additive, like every other name variant here: `nameSimilarity` keeps the best, so an extra
 * name can only raise a candidate's score, and everything it raises still faces the distance
 * veto and the granularity skip.
 */
function namesOfEntity(entity: WbEntity): string[] {
  const aliases = Object.values(entity.aliases ?? {}).flatMap((list) =>
    (list ?? []).map((alias) => alias?.value),
  );
  const titles = Object.values(entity.sitelinks ?? {}).map((link) => link?.title);
  return [...new Set([...labelsOf(entity), ...aliases, ...titles])].filter(
    (value): value is string => !!value,
  );
}

/**
 * **Is this a candidate a feature-type noun could rescue?** (ADR-0166 §22.)
 *
 * The gate in front of the class-label lookup, so the common case still makes no extra request:
 * a class noun can only matter where our name is readable against one of the candidate's, says
 * MORE words than it, and does not already clear the floor. Anything else is answered without
 * knowing what the candidate is.
 */
function descriptorCouldRescue(ourName: string, entity: WbEntity): boolean {
  return namesOfEntity(entity).some(
    (name) =>
      namesComparable(ourName, name) &&
      nameSimilarity(ourName, name) < MATCH_MIN_NAME_SIMILARITY &&
      countWords(ourName) > countWords(name),
  );
}

const countWords = (name: string): number => name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;

/** The best-scoring name WITH the entity's coordinate — the pass that can veto on distance. */
function bestNameMatch(
  identity: PlaceIdentity,
  names: readonly string[],
  point: { lat?: number; lng?: number },
  classNouns?: readonly string[],
): ReturnType<typeof nameProximityConfidence> | undefined {
  let best: ReturnType<typeof nameProximityConfidence> | undefined;
  for (const name of names) {
    const scored = nameProximityConfidence(identity, { name, classNouns, ...point });
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
