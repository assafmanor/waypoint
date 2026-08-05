import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  ENRICHMENT_MISS_TTL_MS,
  ENRICHMENT_SOURCE,
  MATCH_METHOD,
  MATCH_REFUSAL,
  type EnrichedTextValue,
  type TextVariants,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  EnrichmentProvider,
  PlaceIdentity,
  ProviderFieldValues,
  ProviderMatch,
} from './enrichment.provider';
import { EnrichmentRegistry } from './enrichment.registry';
import { EnrichmentService } from './enrichment.service';

// Integration test against the seeded dev Postgres, like the other backend service specs.
// The PROVIDERS are stubs — the point of §5.3's pure-provider rule is that the orchestrator's
// behaviour (precedence, refusals, negative caching, the storability invariant) is testable
// with no network at all.

const NOW = new Date('2026-08-05T10:00:00.000Z');
const SENSOJI: PlaceIdentity = { name: 'Sensō-ji', lat: 35.7148, lng: 139.7967 };

/** A stub identity provider, standing in for Wikidata: settles aliases, supplies no value. */
function identityProvider(
  options: {
    match?: ProviderMatch | null;
    onMatch?: () => void;
  } = {},
): EnrichmentProvider {
  return {
    id: ENRICHMENT_SOURCE.WIKIDATA,
    provides: [],
    policy: { license: 'CC0', storable: true, attributionRequired: false, defaultTtlMs: 1e12 },
    match: vi.fn(async () => {
      options.onMatch?.();
      return options.match === undefined
        ? {
            ref: 'Q615183',
            method: MATCH_METHOD.SETTLED_ID,
            confidence: 1,
            evidence: {},
            settled: { wikidataQid: 'Q615183', articleTitles: { en: 'Sensō-ji' } },
          }
        : options.match;
    }),
    fetch: vi.fn(async () => ({})),
  };
}

/** A stub summary provider, standing in for Wikipedia. */
function summaryProvider(
  options: {
    value?: ProviderFieldValues['summary'];
    refuse?: ProviderMatch['refusedFields'];
    matchNull?: boolean;
    throwOnFetch?: boolean;
    source?: EnrichmentProvider['id'];
    policy?: EnrichmentProvider['policy'];
    onFetch?: () => void;
  } = {},
): EnrichmentProvider {
  return {
    id: options.source ?? ENRICHMENT_SOURCE.WIKIPEDIA,
    provides: [ENRICHMENT_FIELD.SUMMARY],
    policy:
      options.policy ??
      ({
        license: 'CC BY-SA 4.0',
        storable: true,
        attributionRequired: true,
        defaultTtlMs: 1e12,
      } as const),
    match: vi.fn(async (identity: PlaceIdentity) =>
      options.matchNull
        ? null
        : ({
            ref: identity.wikidataQid ?? 'Q615183',
            method: MATCH_METHOD.SETTLED_ID,
            confidence: 1,
            evidence: {},
            refusedFields: options.refuse,
          } as ProviderMatch),
    ),
    fetch: vi.fn(async () => {
      options.onFetch?.();
      if (options.throwOnFetch) throw new Error('upstream is down');
      return {
        summary: options.value ?? {
          value: 'Sensō-ji is an ancient Buddhist temple in Asakusa, Tokyo, Japan.',
          lang: 'en',
          license: 'CC BY-SA 4.0',
          attribution: 'https://en.wikipedia.org/wiki/Sens%C5%8D-ji',
        },
      };
    }),
  };
}

describe('EnrichmentService', () => {
  const prisma = new PrismaService();
  const createdIds: string[] = [];
  let placeSeq = 0;

  /** A fresh googlePlaceId per test, so the unique alias columns never collide across them. */
  const nextPlace = (): PlaceIdentity => ({
    ...SENSOJI,
    googlePlaceId: `ChIJ-test-${Date.now()}-${placeSeq++}`,
  });

  const serviceWith = (...providers: EnrichmentProvider[]) =>
    new EnrichmentService(prisma, new EnrichmentRegistry(providers));

  async function track<T extends { id: string }>(row: T): Promise<T> {
    createdIds.push(row.id);
    return row;
  }

  afterEach(async () => {
    await prisma.placeEnrichment.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  const variantsOf = (fields: { summary?: unknown }): TextVariants => {
    const state = fields.summary as { state: string; value: TextVariants };
    expect(state?.state).toBe('present');
    return state.value;
  };

  it('stores a summary as a localized variant with full provenance', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const stored = await track(await service.enrich(nextPlace(), NOW));

    const variant: EnrichedTextValue = variantsOf(stored.fields).en!;
    expect(variant.lang).toBe('en');
    expect(variant.source).toBe(ENRICHMENT_SOURCE.WIKIPEDIA);
    expect(variant.license).toBe('CC BY-SA 4.0');
    expect(variant.attribution).toContain('en.wikipedia.org');
    expect(variant.fetchedAt).toBe(NOW.toISOString());
    expect(variant.confidence).toBe(1);
    expect(variant.method).toBe(MATCH_METHOD.SETTLED_ID);
  });

  it('persists the alias an identity provider settled (§4)', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const stored = await track(await service.enrich(nextPlace(), NOW));
    expect(stored.wikidataQid).toBe('Q615183');
  });

  it('has no tripId to write and never touches the change log (§6)', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const stored = await track(await service.enrich(nextPlace(), NOW));

    const row = await prisma.placeEnrichment.findUnique({ where: { id: stored.id } });
    // A global row: no trip owns it, and no Change row exists for it to be undone through.
    expect(row).not.toBeNull();
    expect(Object.keys(row!)).not.toContain('tripId');
  });

  it('feeds an identity provider a richer identity than the pass started with (§12.3)', async () => {
    const summary = summaryProvider();
    const service = serviceWith(identityProvider(), summary);
    await track(await service.enrich(nextPlace(), NOW));

    // Wikipedia matched on the QID and the article title Wikidata settled — the exact route,
    // not a second fuzzy name search.
    const seen = vi.mocked(summary.match).mock.calls[0]?.[0];
    expect(seen?.wikidataQid).toBe('Q615183');
    expect(seen?.articleTitles).toEqual({ en: 'Sensō-ji' });
  });

  /** A provider that matches but has nothing for the field — the 0-of-7 restaurant case. */
  const emptySummaryProvider = (): EnrichmentProvider => ({
    ...summaryProvider(),
    fetch: vi.fn(async () => ({})),
  });

  it('records a miss when nobody has a summary, with the sources it asked (§6.4)', async () => {
    const service = serviceWith(identityProvider(), emptySummaryProvider());
    const stored = await track(await service.enrich(nextPlace(), NOW));

    expect(stored.fields.summary).toEqual({
      state: 'absent',
      attemptedAt: NOW.toISOString(),
      sources: [ENRICHMENT_SOURCE.WIKIPEDIA],
      reason: ENRICHMENT_ABSENCE_REASON.NOT_FOUND,
    });
  });

  it('does not re-attempt a miss inside its TTL — the negative cache (§6.4)', async () => {
    const empty = emptySummaryProvider();
    const service = serviceWith(identityProvider(), empty);
    const place = nextPlace();

    const first = await track(await service.enrich(place, NOW));
    expect(first.fields.summary?.state).toBe('absent');

    const soon = new Date(NOW.getTime() + ENRICHMENT_MISS_TTL_MS.summary - 1000);
    await service.enrich(place, soon);
    // Without this, the majority of places re-attempt every provider on every cold read.
    expect(vi.mocked(empty.fetch).mock.calls.length).toBe(1);
  });

  it('re-attempts a miss once its TTL lapses', async () => {
    const empty = emptySummaryProvider();
    const service = serviceWith(identityProvider(), empty);
    const place = nextPlace();

    await track(await service.enrich(place, NOW));
    const later = new Date(NOW.getTime() + ENRICHMENT_MISS_TTL_MS.summary + 1000);
    await service.enrich(place, later);
    expect(vi.mocked(empty.fetch).mock.calls.length).toBe(2);
  });

  it('calls no provider at all when everything held is fresh', async () => {
    const provider = summaryProvider();
    const service = serviceWith(identityProvider(), provider);
    const place = nextPlace();

    await track(await service.enrich(place, NOW));
    const callsAfterFirst = vi.mocked(provider.fetch).mock.calls.length;

    // Hours is unasked (no OSM provider), and image likewise — so a second pass an hour later
    // has nothing to want and must not hit the network.
    await service.enrich(place, new Date(NOW.getTime() + 3600_000));
    expect(vi.mocked(provider.fetch).mock.calls.length).toBe(callsAfterFirst);
  });

  it('honours a per-field refusal while keeping the match (§11.2)', async () => {
    const refusing = summaryProvider({
      refuse: { [ENRICHMENT_FIELD.SUMMARY]: MATCH_REFUSAL.BROADER_TYPE },
    });
    const service = serviceWith(identityProvider(), refusing);
    const stored = await track(await service.enrich(nextPlace(), NOW));

    expect(stored.fields.summary).toMatchObject({
      state: 'absent',
      reason: MATCH_REFUSAL.BROADER_TYPE,
    });
    // Refused for this field, so the value was never even fetched — but the alias the match
    // settled is still stored, because the entity WAS the right one.
    expect(vi.mocked(refusing.fetch)).not.toHaveBeenCalled();
    expect(stored.wikidataQid).toBe('Q615183');
  });

  it('refuses to store a value whose source policy forbids it — §2 as a guard', async () => {
    const googleish = summaryProvider({
      source: ENRICHMENT_SOURCE.GOOGLE,
      policy: {
        license: 'proprietary',
        storable: false,
        attributionRequired: true,
        defaultTtlMs: 0,
      },
    });
    // Google is not in `FIELD_SOURCE_PRECEDENCE.summary`, so reaching the guard needs it
    // registered under a source that IS — which is the shape of the mistake being guarded.
    const smuggled: EnrichmentProvider = { ...googleish, id: ENRICHMENT_SOURCE.WIKIPEDIA };
    const service = serviceWith(identityProvider(), {
      ...smuggled,
      fetch: vi.fn(async () => ({
        summary: { value: 'Live Google content.', lang: 'en', license: 'proprietary' },
      })),
    });
    const stored = await track(await service.enrich(nextPlace(), NOW));

    // No attribution on the value + a source that requires it: refused rather than stored as
    // an obligation we cannot discharge.
    expect(stored.fields.summary).toMatchObject({
      state: 'absent',
      reason: ENRICHMENT_ABSENCE_REASON.ATTRIBUTION_MISSING,
    });
  });

  it('refuses prose that arrives with no language (§11.6)', async () => {
    const langless = summaryProvider({
      value: {
        value: 'A sentence in no particular language.',
        license: 'CC BY-SA 4.0',
        attribution: 'x',
      },
    });
    const service = serviceWith(identityProvider(), langless);
    const stored = await track(await service.enrich(nextPlace(), NOW));

    expect(stored.fields.summary).toMatchObject({
      state: 'absent',
      reason: ENRICHMENT_ABSENCE_REASON.UNSTORABLE,
    });
  });

  it('degrades one field and keeps the pass when a provider throws (§5.4)', async () => {
    const broken = summaryProvider({ throwOnFetch: true });
    const service = serviceWith(identityProvider(), broken);
    const stored = await track(await service.enrich(nextPlace(), NOW));

    // A source being down is not an error the caller sees; it is a field with nothing in it.
    expect(stored.fields.summary?.state).toBe('absent');
    expect(stored.wikidataQid).toBe('Q615183');
  });

  it('keeps going when the identity provider itself fails', async () => {
    const service = serviceWith(
      {
        ...identityProvider(),
        match: vi.fn(async () => {
          throw new Error('wikidata down');
        }),
      },
      summaryProvider(),
    );
    const stored = await track(await service.enrich(nextPlace(), NOW));
    // Wikipedia's own match still ran; it just had less to go on.
    expect(stored.fields.summary?.state).toBe('present');
  });

  it('reads back what it stored, and reads nothing for an unknown place', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const place = nextPlace();
    await track(await service.enrich(place, NOW));

    const read = await service.read({ googlePlaceId: place.googlePlaceId });
    expect(variantsOf(read!.fields).en?.value).toContain('Buddhist temple');
    expect(await service.read({ googlePlaceId: 'ChIJ-never-seen' })).toBeNull();
  });

  it('finds the same row through any of its aliases (§4)', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const place = nextPlace();
    const stored = await track(await service.enrich(place, NOW));

    const byQid = await service.read({ wikidataQid: 'Q615183' });
    expect(byQid?.id).toBe(stored.id);
  });

  it('one global row serves every trip that references the place (§1)', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const place = nextPlace();
    const first = await track(await service.enrich(place, NOW));
    // A second trip picking the same place enriches the same row rather than a copy of it.
    const second = await service.enrich(place, new Date(NOW.getTime() + 1000));
    expect(second.id).toBe(first.id);
    expect(await prisma.placeEnrichment.count({ where: { wikidataQid: 'Q615183' } })).toBe(1);
  });

  it('treats an unreadable stored payload as empty rather than throwing', async () => {
    const row = await track(
      await prisma.placeEnrichment.create({
        data: {
          googlePlaceId: `ChIJ-corrupt-${Date.now()}`,
          fields: { summary: { state: 'not-a-state' } },
          attemptedAt: NOW,
        },
      }),
    );

    const service = serviceWith(identityProvider(), summaryProvider());
    // A payload can gain a field between deploys; a read must not 500 because a row predates it.
    const read = await service.read({ googlePlaceId: row.googlePlaceId! });
    expect(read?.fields).toEqual({});

    const reenriched = await service.enrich({ ...SENSOJI, googlePlaceId: row.googlePlaceId! }, NOW);
    expect(variantsOf(reenriched.fields).en).toBeDefined();
  });

  it('leaves a field with no registered provider unasked rather than failing', async () => {
    const service = serviceWith(identityProvider(), summaryProvider());
    const stored = await track(await service.enrich(nextPlace(), NOW));

    // `hours` names OSM and Phase 2 is blocked on the restaurant fill rate (§12.4); `image`
    // names Commons, which Phase 2 adds. Both record an honest empty attempt.
    expect(stored.fields.hours).toMatchObject({ state: 'absent', sources: [] });
    expect(stored.fields.image).toMatchObject({ state: 'absent', sources: [] });
  });
});
