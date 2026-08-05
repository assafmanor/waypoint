import 'reflect-metadata';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  ENRICHMENT_MISS_TTL_MS,
  ENRICHMENT_SOURCE,
  isEnrichmentBlobKey,
  MATCH_METHOD,
  MATCH_REFUSAL,
  SOURCE_POLICY,
  type EnrichedImageValue,
  type EnrichedTextValue,
  type TextVariants,
} from '@waypoint/shared';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { getObject } from '../common/storage';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { EnrichmentImagePipeline } from './image-pipeline';
import type { EnrichmentFetcher } from './outbound-fetch';
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

/** Real JPEG signature bytes — the pipeline sniffs, so a placeholder would be rejected. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

const THUMB_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/840px-Sensoji_2023.jpg';

/** A fetcher stub for the image pipeline. */
function fetcherReturning(result: Buffer | Error): EnrichmentFetcher {
  return {
    async fetch(url: string) {
      if (result instanceof Error) throw result;
      return { url, status: 200, contentType: 'image/jpeg', body: result };
    },
  } as unknown as EnrichmentFetcher;
}

/** A stub image provider, standing in for Commons: hands over a pointer, never stores. */
function imageProvider(
  options: { license?: string; attribution?: string; attributionRequired?: boolean } = {},
): EnrichmentProvider {
  return {
    id: ENRICHMENT_SOURCE.COMMONS,
    provides: [ENRICHMENT_FIELD.IMAGE],
    policy: SOURCE_POLICY.commons,
    match: vi.fn(async (identity: PlaceIdentity) => ({
      ref: identity.commonsFilename ?? 'Sensoji 2023.jpg',
      method: MATCH_METHOD.SETTLED_ID,
      confidence: identity.identityConfidence ?? 1,
      evidence: {},
      settled: {},
    })),
    fetch: vi.fn(async () => ({
      image: {
        value: 'https://commons.wikimedia.org/wiki/File:Sensoji_2023.jpg',
        license: options.license ?? 'CC0',
        attribution: options.attribution,
        attributionRequired: options.attributionRequired ?? false,
        binary: { url: THUMB_URL, width: 840, height: 600 },
      },
    })),
  };
}

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

  /** A real gateway with no connected clients, so the enrichment nudge is a no-op — the
   *  broadcast itself is covered in `sync.gateway.spec.ts`. */
  const gateway = new SyncGateway(prisma);

  const serviceWith = (...providers: EnrichmentProvider[]) =>
    new EnrichmentService(
      prisma,
      new EnrichmentRegistry(providers),
      new EnrichmentImagePipeline(fetcherReturning(JPEG)),
      gateway,
    );

  /** The orchestrator with an image pipeline whose fetches are controlled by the test. */
  const serviceWithImages = (
    result: Buffer | Error,
    ...providers: EnrichmentProvider[]
  ): EnrichmentService =>
    new EnrichmentService(
      prisma,
      new EnrichmentRegistry(providers),
      new EnrichmentImagePipeline(fetcherReturning(result)),
      gateway,
    );

  async function track<T extends { id: string }>(row: T): Promise<T> {
    createdIds.push(row.id);
    return row;
  }

  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'enrichment-service-'));
    vi.stubEnv(DOC_LOCAL_STORAGE_DIR, storageDir);
  });

  afterEach(async () => {
    await prisma.placeEnrichment.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
    vi.unstubAllEnvs();
    await rm(storageDir, { recursive: true, force: true });
  });

  afterAll(() => prisma.$disconnect());

  const imageOf = (fields: { image?: unknown }): EnrichedImageValue => {
    const state = fields.image as { state: string; value: EnrichedImageValue };
    expect(state?.state).toBe('present');
    return state.value;
  };

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

    // `hours` names OSM, and Phase 2 of ADR-0166 is still blocked on the restaurant fill
    // rate (§12.4) — so the field records an honest empty attempt rather than erroring.
    expect(stored.fields.hours).toMatchObject({ state: 'absent', sources: [] });
  });

  describe('the image pipeline (Phase 2)', () => {
    it('materializes a provider pointer into bytes we own', async () => {
      const service = serviceWith(identityProvider(), imageProvider());
      const stored = await track(await service.enrich(nextPlace(), NOW));

      const image = imageOf(stored.fields);
      expect(isEnrichmentBlobKey(image.blobKey)).toBe(true);
      expect(image.mimeType).toBe('image/jpeg');
      expect(image.sizeBytes).toBe(JPEG.byteLength);
      // Ours, at our own origin — the whole reason §2 refused to hotlink.
      await expect(getObject(image.blobKey)).resolves.toEqual(JPEG);
    });

    it('stores the dimensions the layout needs and the file the credit points at', async () => {
      const service = serviceWith(identityProvider(), imageProvider());
      const stored = await track(await service.enrich(nextPlace(), NOW));

      const image = imageOf(stored.fields);
      expect(image.width).toBe(840);
      expect(image.height).toBe(600);
      expect(image.sourceFile).toContain('commons.wikimedia.org/wiki/File:');
    });

    it('stores the per-file license string with the value (§12.2)', async () => {
      const service = serviceWith(
        identityProvider(),
        imageProvider({
          license: 'CC BY-SA 3.0 de',
          attribution: 'Arne Müseler',
          attributionRequired: true,
        }),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));

      const image = imageOf(stored.fields);
      expect(image.license).toBe('CC BY-SA 3.0 de');
      expect(image.attribution).toBe('Arne Müseler');
    });

    it('treats a GFDL-only file as no image (§12.2)', async () => {
      const service = serviceWith(
        identityProvider(),
        imageProvider({
          license: 'GFDL 1.2',
          attribution: 'Ralf Roletschek',
          attributionRequired: true,
        }),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));

      // One file in 32, and its attribution terms are heavier than a thumbnail caption can
      // discharge — so it falls through to the no-image state rather than shipping a breach.
      expect(stored.fields.image).toMatchObject({
        state: 'absent',
        reason: ENRICHMENT_ABSENCE_REASON.UNSTORABLE,
      });
    });

    it('never fetches bytes for a file it has already refused', async () => {
      // The refusal is a licensing decision, so it must land before we spend a request on it.
      const brokenFetch = new Error('should not have been fetched');
      const service = serviceWithImages(
        brokenFetch,
        identityProvider(),
        imageProvider({ license: 'GFDL 1.2', attribution: 'x', attributionRequired: true }),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));
      expect(stored.fields.image?.state).toBe('absent');
    });

    it('records no image when the bytes cannot be trusted', async () => {
      const service = serviceWithImages(
        Buffer.from('this is not an image'),
        identityProvider(),
        imageProvider(),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));

      // The sniffer refused, so the pass keeps its summary and simply has no photo.
      expect(stored.fields.image).toMatchObject({
        state: 'absent',
        reason: ENRICHMENT_ABSENCE_REASON.UNSTORABLE,
      });
    });

    it('records no image when the fetch itself fails, without failing the pass', async () => {
      const service = serviceWithImages(
        new Error('upload.wikimedia.org is down'),
        identityProvider(),
        summaryProvider(),
        imageProvider(),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));

      expect(stored.fields.image?.state).toBe('absent');
      // One source being down degrades that field and nothing else (§5.4).
      expect(stored.fields.summary?.state).toBe('present');
    });

    it('refuses to store an image that owes credit and has none', async () => {
      const service = serviceWith(
        identityProvider(),
        imageProvider({ license: 'CC BY-SA 4.0', attributionRequired: true }),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));
      expect(stored.fields.image).toMatchObject({
        state: 'absent',
        reason: ENRICHMENT_ABSENCE_REASON.ATTRIBUTION_MISSING,
      });
    });

    it('keeps a CC0 image that owes nobody a credit line', async () => {
      // 5 of 32 files genuinely require no attribution; refusing those would throw away a
      // usable photograph for an obligation that does not exist.
      const service = serviceWith(
        identityProvider(),
        imageProvider({ license: 'CC0', attributionRequired: false }),
      );
      const stored = await track(await service.enrich(nextPlace(), NOW));
      expect(imageOf(stored.fields).attribution).toBeUndefined();
    });

    it('deletes the blob a refresh replaced, rather than orphaning it', async () => {
      const service = serviceWith(identityProvider(), imageProvider());
      const place = nextPlace();
      const first = await track(await service.enrich(place, NOW));
      const firstKey = imageOf(first.fields).blobKey;

      const later = new Date(NOW.getTime() + 200 * 24 * 3600_000);
      const second = await service.enrich(place, later);
      const secondKey = imageOf(second.fields).blobKey;

      expect(secondKey).not.toBe(firstKey);
      // The old URL was immutable and is now unreachable, so its bytes are dead weight.
      await expect(getObject(firstKey)).rejects.toBeTruthy();
      await expect(getObject(secondKey)).resolves.toEqual(JPEG);
    });

    it('inherits the identity confidence rather than claiming its own hop is exact', async () => {
      const fuzzy: EnrichmentProvider = {
        ...identityProvider(),
        match: vi.fn(async () => ({
          ref: 'Q615183',
          method: MATCH_METHOD.NAME_PROXIMITY,
          confidence: 0.71,
          evidence: {},
          settled: { wikidataQid: 'Q615183', identityConfidence: 0.71 },
        })),
      };
      const service = serviceWith(fuzzy, imageProvider());
      const stored = await track(await service.enrich(nextPlace(), NOW));

      // A photo reached through a fuzzy Wikidata match must not record as certain.
      expect(imageOf(stored.fields).confidence).toBe(0.71);
    });
  });

  describe('readForPlaces — the snapshot join (Phase 3)', () => {
    /** A trip's place row as the snapshot read sees it. */
    const snapshotPlace = (id: string, googlePlaceId: string | null) => ({
      id,
      name: 'Sensō-ji',
      googlePlaceId,
      lat: 35.7148,
      lng: 139.7967,
    });

    it('keys the global store by the trip’s own place ids', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const place = nextPlace();
      await track(await service.enrich(place, NOW));

      // The store has no placeId and no tripId (§1); resolving that is the join the server
      // owes the client.
      const { enrichments } = await service.readForPlaces([
        snapshotPlace('place-local-1', place.googlePlaceId!),
      ]);
      expect(Object.keys(enrichments)).toEqual(['place-local-1']);
      expect(enrichments['place-local-1']?.summary?.en?.value).toContain('Buddhist temple');
    });

    it('serves the same global row to two places that share a Google id', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const place = nextPlace();
      await track(await service.enrich(place, NOW));

      // Two trips referencing the same real-world place read one row (§1) — here expressed as
      // two place ids in one call.
      const { enrichments } = await service.readForPlaces([
        snapshotPlace('trip-a-place', place.googlePlaceId!),
        snapshotPlace('trip-b-place', place.googlePlaceId!),
      ]);
      expect(enrichments['trip-a-place']).toEqual(enrichments['trip-b-place']);
    });

    it('delivers the image as a URL, never a blobKey', async () => {
      const service = serviceWith(identityProvider(), imageProvider());
      const place = nextPlace();
      await track(await service.enrich(place, NOW));

      const { enrichments } = await service.readForPlaces([
        snapshotPlace('p1', place.googlePlaceId!),
      ]);
      expect(enrichments.p1?.image?.url).toContain('/enrichment/images/enr_');
      expect(enrichments.p1?.image).not.toHaveProperty('blobKey');
    });

    it('omits a place we know nothing about rather than sending an empty entry', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const { enrichments } = await service.readForPlaces([
        snapshotPlace('never-looked-up', 'ChIJ-nothing-here'),
      ]);
      // A missing key IS the "we know nothing" state, and it is the common one.
      expect(enrichments).toEqual({});
    });

    it('never asks about a coordless Place-lite with no Google id', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      // Matching one by name + coords is permitted by the alias design and built by nothing
      // (§10), so there is nothing to look up.
      expect(await service.readForPlaces([snapshotPlace('lite', null)])).toEqual({
        enrichments: {},
        stale: [],
      });
    });

    it('costs no query at all for a trip with no Google-picked places', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      expect(await service.readForPlaces([])).toEqual({ enrichments: {}, stale: [] });
    });

    it('reports a never-looked-up place as stale — this is what backfills (§14)', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const { stale } = await service.readForPlaces([snapshotPlace('p1', 'ChIJ-never-enriched')]);
      // Every place picked before this pipe existed is in exactly this state.
      expect(stale).toEqual([
        expect.objectContaining({ googlePlaceId: 'ChIJ-never-enriched', name: 'Sensō-ji' }),
      ]);
    });

    it('reports nothing stale while what we hold is fresh', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const place = nextPlace();
      await track(await service.enrich(place, NOW));

      const { stale } = await service.readForPlaces(
        [snapshotPlace('p1', place.googlePlaceId!)],
        NOW,
      );
      // The negative cache is what keeps a read from scheduling work: hours and image recorded
      // misses, and their TTLs have not lapsed.
      expect(stale).toEqual([]);
    });

    it('reports a place stale again once a TTL lapses', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const place = nextPlace();
      await track(await service.enrich(place, NOW));

      const muchLater = new Date(NOW.getTime() + 400 * 24 * 3600_000);
      const { stale } = await service.readForPlaces(
        [snapshotPlace('p1', place.googlePlaceId!)],
        muchLater,
      );
      expect(stale).toHaveLength(1);
    });

    it('wants one pass for two trip rows that share a Google id', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const { stale } = await service.readForPlaces([
        snapshotPlace('trip-a-place', 'ChIJ-shared'),
        snapshotPlace('trip-b-place', 'ChIJ-shared'),
      ]);
      // The store is global, so the two rows want one pass between them.
      expect(stale).toHaveLength(1);
    });

    it('never schedules a Place-lite it cannot match', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const { stale } = await service.readForPlaces([snapshotPlace('lite', null)]);
      expect(stale).toEqual([]);
    });

    it('hands the scheduler an identity with no trip opinion in it (§5.3)', async () => {
      const service = serviceWith(identityProvider(), summaryProvider());
      const { stale } = await service.readForPlaces([snapshotPlace('p1', 'ChIJ-fresh')]);
      // `icon`/`category` are the trip's view and none of a provider's business.
      expect(Object.keys(stale[0]).sort()).toEqual(['googlePlaceId', 'lat', 'lng', 'name']);
    });

    it('omits a row whose every field came back absent', async () => {
      const service = serviceWith(identityProvider(), emptySummaryProvider());
      const place = nextPlace();
      const stored = await track(await service.enrich(place, NOW));
      // The row exists — a pass ran and recorded misses — but there is nothing to render.
      expect(stored.fields.summary?.state).toBe('absent');

      const { enrichments } = await service.readForPlaces([
        snapshotPlace('p1', place.googlePlaceId!),
      ]);
      expect(enrichments).toEqual({});
    });
  });
});
