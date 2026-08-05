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
// **And it never touches the pick.** `resolvePlace` is untouched and stays exactly as fast
// and exactly as failable as it is today (§6). A source being slow can never make picking a
// place slow, and a source being down can never make picking a place fail — which is why
// nothing calls this on the request path.
import { Injectable, Logger } from '@nestjs/common';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  enrichmentFieldsSchema,
  type EnrichedTextValue,
  type EnrichmentAbsenceReason,
  type EnrichmentField,
  type EnrichmentFields,
  type EnrichmentSource,
  type TextVariants,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveLicense, fieldsWantingAttempt, valueRefusal } from './enrichment.policy';
import {
  mergeSettled,
  type EnrichmentProvider,
  type PlaceIdentity,
  type ProviderMatch,
  type ProviderValue,
} from './enrichment.provider';
import { EnrichmentRegistry } from './enrichment.registry';

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
  ) {}

  /** What we hold for this place, or null if it has never been looked up. A read never
   *  fetches and never blocks (§6.1) — a stale value is served as-is and the refresh is
   *  somebody else's turn. */
  async read(identity: Pick<PlaceIdentity, 'googlePlaceId' | 'wikidataQid' | 'osmRef'>) {
    const row = await this.findRow(identity);
    return row ? this.toStored(row) : null;
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
      return this.toStored(existing!);
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

    return this.persist(existing?.id, running, resolved, now);
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

      // `wrap` branches on `field` at runtime to produce the variant that field's slot
      // accepts — a correspondence the compiler cannot follow through a union key. The real
      // check is `enrichmentFieldsSchema.parse` on the way into the column.
      return {
        state: 'present',
        value: this.wrap(field, provider.id, match, value, now),
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

  /** Wrap a provider's raw value in the provenance every stored value carries (§4). */
  private wrap(
    field: EnrichmentField,
    source: EnrichmentSource,
    match: ProviderMatch,
    value: ProviderValue,
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

    if (field === ENRICHMENT_FIELD.SUMMARY) {
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

/** Write a field's state into the payload. A plain `fields[field] = state` does not
 *  typecheck when `field` is the union: TypeScript requires the value to satisfy *every*
 *  field's slot at once, and `summary`'s slot holds a variants map where the others hold a
 *  single value. */
function setFieldState(fields: EnrichmentFields, field: EnrichmentField, state: FieldState): void {
  (fields as Record<EnrichmentField, FieldState>)[field] = state;
}
