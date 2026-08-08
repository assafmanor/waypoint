// The orchestrator (ADR-0166 §5/§6): resolve each field through its own precedence chain,
// store what may be stored, and remember what wasn't there.
//
// **It is deliberately outside `ChangeService`**, which needs saying because
// `backend/CLAUDE.md` makes routing data-plane mutations through it the one hard boundary in
// this codebase. It does not apply here, for a structural reason rather than a preference
// (§6): `PlaceEnrichment` has **no `tripId`**, is **never mutated by a client**, and needs
// none of the change log's machinery — no LWW (there is one writer, the server), no undo
// (nobody performed an action), no per-trip ordering. Writing a global fact into a
// trip-scoped change log would mean fanning it out as N trip changes. Enrichment is a
// server-owned read model; the trip snapshot joins it (Phase 3).
//
// **And no request ever waits on it.** §6 said `resolvePlace` is untouched; §14 narrowly
// revised that — a pick now *schedules* a pass — while keeping the guarantee that clause was
// protecting: the pick stays exactly as fast and exactly as failable as it was, because
// scheduling is synchronous, returns nothing, and cannot throw. A source being slow can never
// make picking a place slow, and a source being down can never make picking a place fail. See
// `enrichment.scheduler.ts` for who calls this and when.
import { Injectable, Logger } from '@nestjs/common';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  enrichmentFieldsSchema,
  isTextVariantField,
  type EnrichedTextValue,
  type EnrichmentAbsenceReason,
  type EnrichmentField,
  type EnrichmentFields,
  type EnrichmentSource,
  type TextVariants,
  type TripEnrichments,
} from '@waypoint/shared';
import { deleteObject } from '../common/storage';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { toDeliveredEnrichment } from './enrichment.mapper';
import { effectiveLicense, fieldsWantingAttempt, valueRefusal } from './enrichment.policy';
import { EnrichmentImagePipeline, type StoredImage } from './image-pipeline';
import {
  mergeSettled,
  type EnrichmentProvider,
  type PlaceIdentity,
  type ProviderMatch,
  type ProviderValue,
} from './enrichment.provider';
import { EnrichmentRegistry } from './enrichment.registry';

/** The fields of a trip's `Place` row this module reads — enough to build a `PlaceIdentity`
 *  without handing the enrichment module the whole trip-scoped row (§5.3: no trip knowledge). */
export interface SnapshotPlace {
  id: string;
  name: string;
  googlePlaceId: string | null;
  lat: number | null;
  lng: number | null;
}

/** What one snapshot's enrichment read answers: what to send, and what needs a pass. */
export interface TripEnrichmentRead {
  enrichments: TripEnrichments;
  /** Real-world places whose enrichment is missing or past TTL — one entry per place, already
   *  deduped across trip rows that share a Google id. */
  stale: PlaceIdentity[];
}

/** A trip's place, as the matcher sees it. Drops `icon`/`category` on the way through, which is
 *  the trip's opinion and none of a provider's business (§5.3). */
const toIdentity = (place: SnapshotPlace): PlaceIdentity => ({
  name: place.name,
  googlePlaceId: place.googlePlaceId ?? undefined,
  lat: place.lat ?? undefined,
  lng: place.lng ?? undefined,
});

/** A store row, with its payload already validated. */
export interface StoredEnrichment {
  id: string;
  googlePlaceId: string | null;
  wikidataQid: string | null;
  osmRef: string | null;
  fields: EnrichmentFields;
  attemptedAt: Date;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EnrichmentRegistry,
    private readonly images: EnrichmentImagePipeline,
    private readonly gateway: SyncGateway,
  ) {}

  /** What we hold for this place, or null if it has never been looked up. A read never
   *  fetches and never blocks (§6.1) — a stale value is served as-is and the refresh is
   *  somebody else's turn. */
  async read(identity: Pick<PlaceIdentity, 'googlePlaceId' | 'wikidataQid' | 'osmRef'>) {
    const row = await this.findRow(identity);
    return row ? this.toStored(row) : null;
  }

  /**
   * **The join the snapshot needs** (§6), and **the work list the scheduler needs** (§14) —
   * from one query, because they are two questions about the same rows.
   *
   * Answering both here is what makes the read-time trigger free: deciding "these three are
   * stale" needs exactly the rows the read model was already built from, so scheduling costs no
   * extra query on the app's most contended read. The alternative — a second method with its own
   * `SELECT` — would read the same rows twice to keep a boundary that buys nothing.
   *
   * One query for the whole trip rather than one per place — a trip holds a few dozen places,
   * and the alias column is indexed. Places with no `googlePlaceId` (a hand-dropped Place-lite,
   * ADR-0147) are neither read nor scheduled: matching one by name and coordinates is recorded
   * in §10 as permitted by the alias design and built by nothing.
   *
   * A place with no enrichment yields **no key at all** in `enrichments`, which is the normal
   * case and what keeps the payload proportional to what we actually know rather than to the
   * trip's size.
   */
  async readForPlaces(
    places: readonly SnapshotPlace[],
    now: Date = new Date(),
  ): Promise<TripEnrichmentRead> {
    const byGoogleId = new Map<string, SnapshotPlace[]>();
    for (const place of places) {
      if (!place.googlePlaceId) continue;
      const group = byGoogleId.get(place.googlePlaceId);
      if (group) group.push(place);
      else byGoogleId.set(place.googlePlaceId, [place]);
    }
    if (byGoogleId.size === 0) return { enrichments: {}, stale: [] };

    const rows = await this.prisma.placeEnrichment.findMany({
      where: { googlePlaceId: { in: [...byGoogleId.keys()] } },
    });
    const rowsByGoogleId = new Map(rows.map((row) => [row.googlePlaceId!, row]));

    const enrichments: TripEnrichments = {};
    const stale: PlaceIdentity[] = [];

    for (const [googlePlaceId, group] of byGoogleId) {
      const row = rowsByGoogleId.get(googlePlaceId);
      const fields = row ? this.parseFields(row) : {};

      // **No row at all means nobody has ever looked** — the state that backfills every place
      // picked before this pipe existed. Otherwise it is stale only if some field's own TTL (or
      // its miss TTL) has lapsed, which the negative cache is what keeps rare.
      if (!row || fieldsWantingAttempt(fields, now).length > 0) {
        // One identity per real-world place, not per trip row: the store is global, so two
        // places sharing a Google id want one pass between them.
        stale.push(toIdentity(group[0]));
      }

      const delivered = toDeliveredEnrichment(fields);
      // Nothing worth sending: the row exists because a pass ran, but every field came back
      // absent. The client's "we know nothing" state is a missing key, so keep it missing.
      if (Object.keys(delivered).length === 0) continue;
      for (const place of group) enrichments[place.id] = delivered;
    }
    return { enrichments, stale };
  }

  /**
   * Tell every live client holding this place that enrichment landed (§6).
   *
   * **This is the fan-out §6 refused to do in the change log, done where it is cheap.**
   * Writing one global fact into a trip-scoped change log would mean N durable `Change`
   * rows; a transient nudge to the N trips that happen to reference the place costs one
   * query and no storage, and a client that was offline for it simply reads the value in its
   * next snapshot. So the same fan-out that disqualified `ChangeService` is fine here.
   *
   * Best-effort by design: a broadcast failure must not fail the pass that produced the
   * data, which is already safely stored.
   */
  private async notify(googlePlaceId: string | null, fields: EnrichmentFields): Promise<void> {
    if (!googlePlaceId) return;
    const delivered = toDeliveredEnrichment(fields);
    if (Object.keys(delivered).length === 0) return;
    try {
      const places = await this.prisma.place.findMany({
        where: { googlePlaceId },
        select: { id: true, tripId: true },
      });
      for (const place of places) {
        this.gateway.broadcastEnrichment(place.tripId, place.id, delivered);
      }
    } catch (err) {
      this.logger.warn(`could not broadcast enrichment: ${(err as Error).message}`);
    }
  }

  /**
   * One enrichment pass over one place.
   *
   * `now` is injected rather than read so the TTL and negative-cache behaviour is testable
   * without waiting a month.
   */
  async enrich(identity: PlaceIdentity, now: Date = new Date()): Promise<StoredEnrichment> {
    const existing = await this.findRow(identity);
    const fields: EnrichmentFields = existing ? this.parseFields(existing) : {};

    const wanted = fieldsWantingAttempt(fields, now);
    if (wanted.length === 0) {
      // Everything we hold is fresh, and everything we don't is inside its miss TTL. This
      // early return **is** the negative cache: no provider is called at all.
      const held = this.toStored(existing!);
      // **But it still tells whoever holds this place** (§17's live-run fix). A pass runs on a
      // PICK as well as on a stale read, and a picked place very often has nothing to fetch —
      // its enrichment was stored before it was added (the deciding surface asked for it), or
      // another trip already holds it. Returning silently there means the row exists, the
      // client has just created the `Place` that joins to it, and nothing delivers the join
      // until the next snapshot: the owner's report was a place saved off the shelf that
      // "doesn't retain the enrichment. Not even after waiting."
      await this.notify(held.googlePlaceId, held.fields);
      return held;
    }

    // Identity accumulates as it is settled, so a later provider matches on more than the
    // pass started with — which is what makes §12.3's exact routes reachable.
    let running: PlaceIdentity = {
      ...identity,
      wikidataQid: identity.wikidataQid ?? existing?.wikidataQid ?? undefined,
      osmRef: identity.osmRef ?? existing?.osmRef ?? undefined,
    };
    const matches = new Map<EnrichmentSource, ProviderMatch>();

    for (const provider of this.providersToMatch(wanted)) {
      const match = await this.matchSafely(provider, running);
      if (!match) continue;
      matches.set(provider.id, match);
      if (match.settled) running = mergeSettled(running, match.settled);
    }

    const resolved: EnrichmentFields = { ...fields };
    for (const field of wanted) {
      setFieldState(resolved, field, await this.resolveField(field, matches, now));
    }

    const stored = await this.persist(existing?.id, running, resolved, now);
    // Only once the row is safely written: a refresh that replaced the image left the old
    // bytes referenced by nothing, and an immutable-URL scheme means they can never be
    // reached again. Deleting before the write would risk 404ing a live URL if the write
    // then failed.
    await this.dropReplacedImage(fields, resolved);
    // Also after the write, and for the same reason: a nudge that arrived before the row was
    // committed would send clients to a snapshot that does not have it yet.
    await this.notify(stored.googlePlaceId, stored.fields);
    return stored;
  }

  /** Delete the blob an image refresh orphaned. Best-effort by design — a leaked blob costs
   *  storage, while a throw here would fail a pass whose real work already succeeded. */
  private async dropReplacedImage(
    before: EnrichmentFields,
    after: EnrichmentFields,
  ): Promise<void> {
    const previous = imageBlobKey(before);
    if (!previous || previous === imageBlobKey(after)) return;
    await deleteObject(previous).catch((err: unknown) => {
      this.logger.warn(`could not delete replaced enrichment image: ${(err as Error).message}`);
    });
  }

  /**
   * Which providers are worth asking this pass: the ones that supply a wanted field, plus
   * the identity providers they depend on.
   *
   * Identity providers run **whenever anything is wanted**, because what they settle is what
   * turns a downstream fuzzy match into an exact one — asking Wikipedia without the QID
   * Wikidata would have settled is a worse match for no saving.
   */
  private providersToMatch(wanted: readonly EnrichmentField[]): readonly EnrichmentProvider[] {
    const needed = new Set<EnrichmentProvider>(this.registry.identityProviders());
    for (const field of wanted) for (const p of this.registry.providersFor(field)) needed.add(p);
    // Registration order, not Set order: identity has to be settled before it can be used.
    return this.registry.all().filter((provider) => needed.has(provider));
  }

  /** Resolve one field down its precedence chain, and record a miss if nobody had it. */
  private async resolveField(
    field: EnrichmentField,
    matches: Map<EnrichmentSource, ProviderMatch>,
    now: Date,
  ): Promise<FieldState> {
    const asked: EnrichmentSource[] = [];
    let refusal: EnrichmentAbsenceReason = ENRICHMENT_ABSENCE_REASON.NOT_FOUND;

    for (const provider of this.registry.providersFor(field)) {
      const match = matches.get(provider.id);
      if (!match) continue;
      asked.push(provider.id);

      // A per-field refusal on an otherwise good match (§11.2): the entity is right and its
      // content describes something broader or historical. Skip this source for THIS field
      // and keep going down the chain — the same match may still be fine for another field.
      const refused = match.refusedFields?.[field];
      if (refused) {
        refusal = refused;
        continue;
      }

      const value = await this.fetchSafely(provider, match, field);
      if (!value) continue;

      const declined = valueRefusal(field, provider.id, value);
      if (declined) {
        // §2's invariant firing, or an obligation we cannot discharge. Loud, because either
        // is a provider bug rather than a coverage gap.
        this.logger.warn(`refused a ${provider.id} ${field}: ${declined}`);
        refusal = declined;
        continue;
      }

      // A value whose real payload is bytes has to become bytes WE hold before it can be
      // stored (§7). This is the one step that can still fail after a value looked fine —
      // an off-allowlist host, an oversized body, or bytes that are not the image they
      // claim — and every one of those means **fall through to the next candidate**, which
      // is exactly the behaviour §12.2 asks for on a file we must refuse.
      const materialized = value.binary ? await this.materialize(value) : value;
      if (!materialized) {
        refusal = ENRICHMENT_ABSENCE_REASON.UNSTORABLE;
        continue;
      }

      // `wrap` branches on `field` at runtime to produce the variant that field's slot
      // accepts — a correspondence the compiler cannot follow through a union key. The real
      // check is `enrichmentFieldsSchema.parse` on the way into the column.
      return {
        state: 'present',
        value: this.wrap(field, provider.id, match, materialized, now),
      } as FieldState;
    }

    // "We looked and there is nothing" — stored, per §6.4, with which sources were asked so
    // a later pass can tell "Wikipedia has no article" from "Wikipedia was down".
    return {
      state: 'absent',
      attemptedAt: now.toISOString(),
      sources: asked,
      reason: refusal,
    };
  }

  /**
   * Turn a pointer into bytes we own, through the subject-agnostic image pipeline.
   *
   * Here rather than inside the provider because a provider stays pure — no storage, no DB
   * (§5.3) — which is what keeps it testable against recorded fixtures. Returns `null` when
   * the bytes cannot be trusted, so the caller falls through.
   */
  private async materialize(value: ProviderValue): Promise<MaterializedValue | null> {
    const stored = await this.images.store(value.binary!.url);
    return stored ? { ...value, stored } : null;
  }

  /** Wrap a provider's raw value in the provenance every stored value carries (§4). */
  private wrap(
    field: EnrichmentField,
    source: EnrichmentSource,
    match: ProviderMatch,
    value: MaterializedValue,
    now: Date,
  ) {
    const provenance = {
      source,
      license: effectiveLicense(source, value),
      attribution: value.attribution,
      fetchedAt: now.toISOString(),
      confidence: match.confidence,
      method: match.method,
      ref: match.ref,
    };

    if (field === ENRICHMENT_FIELD.IMAGE && value.stored && value.binary) {
      return {
        ...provenance,
        ...value.stored,
        // The dimensions of the bytes we hold, which carry the aspect ratio a bounded
        // container needs to survive a 0.54 portrait (§11.4).
        width: value.binary.width,
        height: value.binary.height,
        // The file page, so the credit line has somewhere to point (ADR-0167 §4).
        sourceFile: value.value,
      };
    }

    if (isTextVariantField(field)) {
      // A text field holds localized VARIANTS keyed by language (§11.6) — so a second
      // language, or a translation, is one more entry rather than a migration.
      const variant: EnrichedTextValue = { ...provenance, value: value.value, lang: value.lang! };
      return { [variant.lang]: variant } satisfies TextVariants;
    }
    return { ...provenance, value: value.value };
  }

  /** Providers are **independently failable** (§5.4): one source being down, slow or
   *  rate-limited degrades that field and nothing else. */
  private async matchSafely(
    provider: EnrichmentProvider,
    identity: PlaceIdentity,
  ): Promise<ProviderMatch | null> {
    try {
      return await provider.match(identity);
    } catch (err) {
      this.logger.warn(`${provider.id} match failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async fetchSafely(
    provider: EnrichmentProvider,
    match: ProviderMatch,
    field: EnrichmentField,
  ): Promise<ProviderValue | null> {
    try {
      const values = await provider.fetch(match, [field]);
      return values[field] ?? null;
    } catch (err) {
      this.logger.warn(`${provider.id} fetch failed for ${field}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Look the row up by any alias it might already be known under (§4). */
  private async findRow(identity: Pick<PlaceIdentity, 'googlePlaceId' | 'wikidataQid' | 'osmRef'>) {
    const aliases = [
      identity.googlePlaceId && { googlePlaceId: identity.googlePlaceId },
      identity.wikidataQid && { wikidataQid: identity.wikidataQid },
      identity.osmRef && { osmRef: identity.osmRef },
    ].filter(Boolean) as { googlePlaceId?: string; wikidataQid?: string; osmRef?: string }[];
    if (aliases.length === 0) return null;
    return this.prisma.placeEnrichment.findFirst({ where: { OR: aliases } });
  }

  private async persist(
    id: string | undefined,
    identity: PlaceIdentity,
    fields: EnrichmentFields,
    now: Date,
  ): Promise<StoredEnrichment> {
    const data = {
      googlePlaceId: identity.googlePlaceId ?? null,
      wikidataQid: identity.wikidataQid ?? null,
      osmRef: identity.osmRef ?? null,
      // Validated on the way in as well as the way out: this column is the contract, and a
      // payload that cannot be re-read is worse than no payload.
      fields: enrichmentFieldsSchema.parse(fields),
      attemptedAt: now,
    };

    // A row already existing for an alias this pass just settled means two Google entries
    // resolved to one real-world place — legitimate, and it collides with the unique alias
    // columns. Keep this row and drop the contested alias rather than losing the pass's work;
    // merging the two rows is a decision this phase does not need to take.
    const existingForAlias = id ? null : await this.findRow(identity);
    if (existingForAlias) {
      return this.write(existingForAlias.id, data);
    }
    try {
      return id ? await this.write(id, data) : await this.create(data);
    } catch (err) {
      this.logger.warn(
        `enrichment alias conflict, storing without aliases: ${(err as Error).message}`,
      );
      const withoutContested = { ...data, wikidataQid: null, osmRef: null };
      return id ? this.write(id, withoutContested) : this.create(withoutContested);
    }
  }

  private async write(id: string, data: EnrichmentRowData): Promise<StoredEnrichment> {
    return this.toStored(await this.prisma.placeEnrichment.update({ where: { id }, data }));
  }

  private async create(data: EnrichmentRowData): Promise<StoredEnrichment> {
    return this.toStored(await this.prisma.placeEnrichment.create({ data }));
  }

  /** A payload that no longer parses is treated as empty rather than fatal: the shape can
   *  gain a field between deploys, and a read must not 500 because a row predates it. The
   *  next pass rewrites it. */
  private parseFields(row: { id: string; fields: unknown }): EnrichmentFields {
    const parsed = enrichmentFieldsSchema.safeParse(row.fields);
    if (parsed.success) return parsed.data;
    this.logger.warn(`unreadable enrichment payload on ${row.id}, re-attempting from empty`);
    return {};
  }

  private toStored(row: EnrichmentRow): StoredEnrichment {
    return {
      id: row.id,
      googlePlaceId: row.googlePlaceId,
      wikidataQid: row.wikidataQid,
      osmRef: row.osmRef,
      fields: this.parseFields(row),
      attemptedAt: row.attemptedAt,
    };
  }
}

interface EnrichmentRow {
  id: string;
  googlePlaceId: string | null;
  wikidataQid: string | null;
  osmRef: string | null;
  fields: unknown;
  attemptedAt: Date;
}

interface EnrichmentRowData {
  googlePlaceId: string | null;
  wikidataQid: string | null;
  osmRef: string | null;
  fields: EnrichmentFields;
  attemptedAt: Date;
}

/** One field's stored state, across all three fields. */
type FieldState = NonNullable<EnrichmentFields[EnrichmentField]>;

/** A provider value once its bytes (if it had any) are ours. */
type MaterializedValue = ProviderValue & { stored?: StoredImage };

/** The blob a payload's image points at, if it has one. */
function imageBlobKey(fields: EnrichmentFields): string | undefined {
  const state = fields.image;
  return state?.state === 'present' ? state.value.blobKey : undefined;
}

/** Write a field's state into the payload. A plain `fields[field] = state` does not
 *  typecheck when `field` is the union: TypeScript requires the value to satisfy *every*
 *  field's slot at once, and `summary`'s slot holds a variants map where the others hold a
 *  single value. */
function setFieldState(fields: EnrichmentFields, field: EnrichmentField, state: FieldState): void {
  (fields as Record<EnrichmentField, FieldState>)[field] = state;
}
