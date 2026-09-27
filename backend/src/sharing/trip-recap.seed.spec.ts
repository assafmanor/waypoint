// **The recap over the dev seed's real trip** (ADR-0239 §9; epic Phase 2's "the seed trip is one
// fixture"). Integration test against the seeded dev Postgres (`backend/prisma/seed.mjs`), like
// `route-pack.seed.spec.ts` — run `pnpm --filter @waypoint/backend prisma:seed` first on a fresh DB.
//
// What it pins is the adapter, not the arithmetic (`packages/shared/src/trip-recap.test.ts` owns
// that): that Prisma rows reach `tripRecap` as the shared shapes, so a `Date` in `date` or a
// `null` place never reads as "nothing happened". The seed has three soft rows marked done, two
// hard rows that stand, six still unresolved, one flight TLV → NRT and four ideas.
import 'reflect-metadata';
import { afterAll, describe, expect, it } from 'vitest';
import { RECAP_ABSENT } from '@waypoint/shared';
import type { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripRecapService } from './trip-recap.service';

const SEEDED_TRIP = 'trip-japan-26';

const prisma = new PrismaService();
const service = new TripRecapService(prisma, {
  readForPlaces: async () => ({ enrichments: {}, stale: [] }),
} as unknown as EnrichmentService);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the trip recap over the seeded trip', () => {
  it('counts what happened, and says how much is unresolved', async () => {
    const { figures, stragglers, nextTime } = await service.recapFor(SEEDED_TRIP);
    expect(figures.days).toEqual({ state: 'present', value: 10 });
    expect(figures.nights).toEqual({ state: 'present', value: 9 });
    expect(figures.beds).toEqual({ state: 'present', value: 1 });
    // Tsukiji, the day tour's Asakusa and Senso-ji (done), and the booked Ichiran (hard).
    expect(figures.places).toEqual({ state: 'present', value: 4, unresolved: 6 });
    expect(stragglers).toHaveLength(6);
    expect(stragglers[0]).toBe('ev-shinjuku');
    expect(nextTime).toEqual({
      skipped: [],
      ideas: ['mb-skytree', 'mb-catcafe', 'mb-uniqlo', 'mb-ameyoko'],
    });
  });

  it('flies TLV → NRT once, exactly, and crosses one zone', async () => {
    const { figures, superlatives } = await service.recapFor(SEEDED_TRIP);
    expect(figures.airMeters.state === 'present' && figures.airMeters.value).toBeCloseTo(
      9_203_024,
      -2,
    );
    expect(figures.airMeters).not.toHaveProperty('estimate');
    expect(figures.airMinutes).toEqual({ state: 'present', value: 595 });
    expect(figures.zonesCrossed).toEqual({ state: 'present', value: 1 });
    // Tel Aviv is +03:00 in September and Tokyo +09:00.
    expect(figures.zoneShiftMinutes).toEqual({ state: 'present', value: 360 });
    expect(superlatives.longestFlight).toMatchObject({ value: { bookingId: 'bk-flight' } });
  });

  it('with no enrichment, kinds, regions and the cover are absent rather than empty', async () => {
    const recap = await service.recapFor(SEEDED_TRIP);
    expect(recap.figures.kinds).toEqual(RECAP_ABSENT);
    expect(recap.figures.regions).toEqual(RECAP_ABSENT);
    expect(recap.cover).toBeUndefined();
  });
});
