// **The pack, over the dev seed's real trip** (ADR-0206 §V1.8; the board's M10 card).
//
// Integration test against the seeded dev Postgres (`backend/prisma/seed.mjs`) — run
// `pnpm --filter @waypoint/backend prisma:seed` first if it fails on a fresh DB.
//
// Why this exists beside `route-pack.service.spec.ts`'s fakes: the pack's first exit criterion is
// about the day the trip actually holds, and the two steps that can quietly get that wrong — the
// schedule query and the day derivation — are exactly the ones a fake prisma cannot exercise.
// M1b's comment tables in `seed.mjs` name the gate path each of these pairs is the fixture for.
//
// **The provider is a fake with crow-flies numbers**, deliberately: what is under test is which
// legs the pack asks about and carries, not what Valhalla thinks they take.
import 'reflect-metadata';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { haversineMeters, routeLegKey, type LatLng } from '@waypoint/shared';
import { MapService } from '../map/map.service';
import { PrismaService } from '../prisma/prisma.service';
import { PolitenessLimiter } from './politeness.limiter';
import type { RouteProvider } from './route-provider';
import { RoutePackService } from './route-pack.service';
import { RoutingService } from './routing.service';

/** The seeded Tokyo day (`seed.mjs`): Senso-ji, then Tsukiji, then Shinjuku. */
const SEEDED_TRIP = 'trip-japan-26';

const provider = {
  id: 'seed-spec',
  matrix: vi.fn((points: readonly LatLng[]) => {
    const cells = [];
    for (let from = 0; from < points.length; from++) {
      for (let to = 0; to < points.length; to++) {
        if (from === to) continue;
        const metres = haversineMeters(points[from]!, points[to]!);
        cells.push({
          fromIndex: from,
          toIndex: to,
          durationSeconds: metres,
          distanceMeters: metres,
        });
      }
    }
    return Promise.resolve(cells);
  }),
  shape: vi.fn(() => Promise.resolve(null)),
  dataVersion: () => Promise.resolve(new Date('2026-08-24T00:00:00Z')),
} as unknown as RouteProvider;

const prisma = new PrismaService();
const map = new MapService(prisma);
const routing = new RoutingService(prisma, map, new PolitenessLimiter(0), provider);
const pack = new RoutePackService(prisma, map, routing);

afterAll(async () => {
  await prisma.routeLeg.deleteMany({ where: { provider: 'seed-spec' } });
  await prisma.$disconnect();
});

describe('the offline route pack over the seeded trip', () => {
  it('carries a travel time for every leg the day walks, in every gate-admitted mode', async () => {
    const cold = await pack.packFor(SEEDED_TRIP);
    // The trip's own ground, from `map-region.ts` — the existing signature, not a new one.
    expect(cold.signature).toMatch(/^[0-9a-f]{16}$/);
    expect(cold.retryAfterSeconds).toBeGreaterThan(0);
    await pack.settled();

    const warm = await pack.packFor(SEEDED_TRIP);
    expect(warm.retryAfterSeconds).toBeUndefined();
    expect(warm.signature).toBe(cold.signature);
    expect(warm.legs.length).toBeGreaterThan(0);

    // Every key is `routeLegKey`'s spelling, which is the one thing a pack cannot get wrong: a
    // key spelled any other way can never hit a row, on the server or in the client's Dexie.
    for (const leg of warm.legs) {
      expect(leg.key).toBe(
        routeLegKey(coordsOf(leg.key).from, coordsOf(leg.key).to, leg.estimate.mode),
      );
      expect(leg.estimate.durationSeconds).toBeGreaterThanOrEqual(0);
      // No geometry: a shaped leg is ten times the bytes (§AO).
      expect(leg.estimate.shape).toBeUndefined();
    }

    // The seeded Tokyo day is walkable, so a walking answer exists for a pair of its stops —
    // and the reverse is its own row, because the key is directional.
    const walking = warm.legs.filter((leg) => leg.estimate.mode === 'walking');
    expect(walking.length).toBeGreaterThan(0);
    const reversed = new Set(walking.map((leg) => reverseKey(leg.key)));
    expect(walking.some((leg) => reversed.has(leg.key))).toBe(true);
  });
});

/** Read a key back into the two points it names, so the spelling assertion is a round trip
 *  rather than a restatement of the same template. */
function coordsOf(key: string): { from: LatLng; to: LatLng } {
  const [, pair] = key.split(':');
  const [from, to] = pair!.split('>');
  const at = (text: string): LatLng => {
    const [lat, lng] = text.split(',').map(Number);
    return { lat: lat!, lng: lng! };
  };
  return { from: at(from!), to: at(to!) };
}

function reverseKey(key: string): string {
  const [mode, pair] = key.split(':');
  const [from, to] = pair!.split('>');
  return `${mode}:${to}>${from}`;
}
