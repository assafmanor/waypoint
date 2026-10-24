// **M10's exit criteria, asserted rather than observed** (ADR-0206 §V1.8/§AO; the board's M10
// card). Three of them live here — the pack carries every day-adjacent leg, it is keyed the one
// way the client reads, and a trip whose places changed rebuilds it off the EXISTING region
// signature. The two that are about bytes on a device are `map-archive-cache.test.ts`'s.
//
// The coordinates are the dev seed's, for `routing.service.spec.ts`'s reason: M1b's comment
// tables say which gate path each pair is the fixture for.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { haversineMeters, routeLegKey, type LatLng } from '@waypoint/shared';
import { ROUTING_DISABLED } from '../common/env';
import type { MapService } from '../map/map.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PolitenessLimiter } from './politeness.limiter';
import type { RouteProvider } from './route-provider';
import { RoutePackService } from './route-pack.service';
import { RoutingService } from './routing.service';

const ASAKUSA = { lat: 35.7107, lng: 139.7975 };
const TSUKIJI = { lat: 35.6654, lng: 139.7707 };
const SENSO = { lat: 35.7148, lng: 139.7967 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const HOTEL = { lat: 35.6938, lng: 139.7034 };

interface StoredRow {
  key: string;
  mode: string;
  durationSeconds: number;
  distanceMeters: number;
  shapeEncoded: string | null;
  shapePrecision: number | null;
}

/** One row of the fake schedule: a date, an optional span end, and the places it names. */
interface SeedEvent {
  date: string;
  endDate?: string;
  place?: LatLng;
  from?: LatLng;
  to?: LatLng;
}

function fakePrisma(schedule: { events: SeedEvent[] }) {
  const rows = new Map<string, StoredRow>();
  const asPlace = (at?: LatLng) => (at ? { lat: at.lat, lng: at.lng } : null);
  const prisma = {
    routeLeg: {
      findMany: ({ where }: { where: { key: { in: string[] } } }) =>
        Promise.resolve(where.key.in.flatMap((key) => (rows.has(key) ? [rows.get(key)!] : []))),
      deleteMany: ({ where }: { where: { key: { in: string[] } } }) => ({
        run: () => where.key.in.forEach((key) => rows.delete(key)),
      }),
      createMany: ({ data }: { data: StoredRow[] }) => ({
        run: () => data.forEach((row) => rows.set(row.key, row)),
      }),
    },
    event: {
      findMany: () =>
        Promise.resolve(
          schedule.events.map((event) => ({
            date: new Date(`${event.date}T00:00:00Z`),
            endDate: event.endDate ? new Date(`${event.endDate}T00:00:00Z`) : null,
            place: asPlace(event.place),
            booking:
              event.from || event.to
                ? { place: null, fromPlace: asPlace(event.from), toPlace: asPlace(event.to) }
                : null,
          })),
        ),
    },
    $transaction: (ops: { run: () => void }[]) => {
      ops.forEach((op) => op.run());
      return Promise.resolve([]);
    },
  } as unknown as PrismaService;
  return { prisma, rows };
}

/** Answers every cell at its crow-flies metres, and counts the calls — which is how "precomputed
 *  once, not once per download" becomes an assertion. */
function fakeProvider() {
  const matrix = vi.fn((points: readonly LatLng[]) => {
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
    return Promise.resolve({
      cells,
      attribution: { providerId: 'fake', tilesetAt: new Date('2026-08-24T00:00:00Z') },
    });
  });
  const provider = {
    id: 'fake',
    degradedProviderIds: [],
    matrix,
    shape: vi.fn(() => Promise.resolve(null)),
  } as unknown as RouteProvider;
  return { provider, matrix };
}

/** A map service that answers the two things a pack asks it: what ground the trip covers, and
 *  what its signature is. `signature` is mutable so a spec can change the trip's places. */
function fakeMap(coordinates: LatLng[], signature = 'sig-1') {
  const state = { coordinates, signature };
  const map = {
    coordinatesFor: () => Promise.resolve(state.coordinates),
    regionFor: () =>
      Promise.resolve(
        state.coordinates.length ? { areas: [], geojson: null, signature: state.signature } : null,
      ),
  } as unknown as MapService;
  return { map, state };
}

function build(events: SeedEvent[], coordinates: LatLng[], signature?: string) {
  const schedule = { events };
  const { prisma, rows } = fakePrisma(schedule);
  const { provider, matrix } = fakeProvider();
  const { map, state } = fakeMap(coordinates, signature);
  const routing = new RoutingService(prisma, map, new PolitenessLimiter(0), provider);
  return { pack: new RoutePackService(prisma, map, routing), rows, matrix, state, schedule };
}

const TOKYO_DAY: SeedEvent[] = [
  { date: '2026-09-01', place: ASAKUSA },
  { date: '2026-09-01', place: SENSO },
  { date: '2026-09-01', place: TSUKIJI },
];
const TOKYO_COORDS = [ASAKUSA, SENSO, TSUKIJI, SHINJUKU, HOTEL];

beforeEach(() => {
  delete process.env[ROUTING_DISABLED];
});

describe('RoutePackService', () => {
  it('precomputes the trip and then carries every day-adjacent leg, keyed the way the client reads', async () => {
    const { pack } = build([...TOKYO_DAY], TOKYO_COORDS);

    const cold = await pack.packFor('trip');
    // ADR-0187's flow: nothing is built on the request path, so the first ask says how long.
    expect(cold.retryAfterSeconds).toBeGreaterThan(0);
    expect(cold.legs).toEqual([]);
    await pack.settled();

    const warm = await pack.packFor('trip');
    expect(warm.retryAfterSeconds).toBeUndefined();
    const keys = new Set(warm.legs.map((leg) => leg.key));
    for (const mode of ['walking', 'driving', 'cycling'] as const) {
      expect(keys.has(routeLegKey(ASAKUSA, SENSO, mode))).toBe(true);
      expect(keys.has(routeLegKey(SENSO, TSUKIJI, mode))).toBe(true);
      // Directional on purpose — the reverse is a different answer and a different row.
      expect(keys.has(routeLegKey(SENSO, ASAKUSA, mode))).toBe(true);
    }
  });

  it('is precomputed once per signature, not once per download', async () => {
    const { pack, matrix } = build([...TOKYO_DAY], TOKYO_COORDS);
    await pack.packFor('trip');
    await pack.settled();
    const afterFirst = matrix.mock.calls.length;

    await pack.packFor('trip');
    await pack.packFor('trip');
    await pack.settled();
    expect(matrix.mock.calls.length).toBe(afterFirst);
  });

  it("rebuilds when the trip's places changed — off the EXISTING region signature", async () => {
    const { pack, state, schedule } = build([...TOKYO_DAY], TOKYO_COORDS);
    await pack.packFor('trip');
    await pack.settled();
    expect(
      new Set((await pack.packFor('trip')).legs.map((leg) => leg.key)).has(
        routeLegKey(TSUKIJI, SHINJUKU, 'walking'),
      ),
    ).toBe(false);

    // Somebody added a place to the day. `map-region.ts` already answers that the covered ground
    // changed — a new signature, and the pack rebuilds off it rather than off a hash of its own.
    schedule.events.push({ date: '2026-09-01', place: SHINJUKU });
    state.signature = 'sig-2';

    const again = await pack.packFor('trip');
    expect(again.signature).toBe('sig-2');
    expect(again.retryAfterSeconds).toBeGreaterThan(0);
    await pack.settled();
    const keys = new Set((await pack.packFor('trip')).legs.map((leg) => leg.key));
    expect(keys.has(routeLegKey(TSUKIJI, SHINJUKU, 'walking'))).toBe(true);
  });

  it('does not rebuild when the trip changed in a way the signature does not see', async () => {
    const { pack, matrix } = build([...TOKYO_DAY], TOKYO_COORDS);
    await pack.packFor('trip');
    await pack.settled();
    const afterFirst = matrix.mock.calls.length;

    // A rename is not a new signature, and it must not cost a re-warm (ADR-0186 §4).
    await pack.packFor('trip');
    await pack.settled();
    expect(matrix.mock.calls.length).toBe(afterFirst);
  });

  it('covers the stay you woke in, on every day of the stay', async () => {
    const { pack } = build(
      [
        { date: '2026-09-01', endDate: '2026-09-03', place: HOTEL },
        { date: '2026-09-02', place: SHINJUKU },
      ],
      [HOTEL, SHINJUKU],
    );
    await pack.packFor('trip');
    await pack.settled();
    const keys = new Set((await pack.packFor('trip')).legs.map((leg) => leg.key));
    expect(keys.has(routeLegKey(HOTEL, SHINJUKU, 'walking'))).toBe(true);
  });

  it('covers both ends of a transport row, because which end a leg leaves from is the client’s call', async () => {
    const { pack } = build(
      [
        { date: '2026-09-01', from: ASAKUSA, to: SHINJUKU },
        { date: '2026-09-01', place: HOTEL },
      ],
      [ASAKUSA, SHINJUKU, HOTEL],
    );
    await pack.packFor('trip');
    await pack.settled();
    const keys = new Set((await pack.packFor('trip')).legs.map((leg) => leg.key));
    expect(keys.has(routeLegKey(SHINJUKU, HOTEL, 'walking'))).toBe(true);
    expect(keys.has(routeLegKey(ASAKUSA, HOTEL, 'walking'))).toBe(true);
  });

  it('answers an empty pack for a trip with no mapped coordinates, and never throws', async () => {
    const { pack } = build([], []);
    await expect(pack.packFor('trip')).resolves.toEqual({ signature: '', legs: [] });
  });

  it('answers what it holds with the kill switch on, and offers no wait', async () => {
    const { pack, matrix } = build([...TOKYO_DAY], TOKYO_COORDS);
    process.env[ROUTING_DISABLED] = '1';
    const disabled = await pack.packFor('trip');
    await pack.settled();
    expect(disabled.legs).toEqual([]);
    expect(matrix).not.toHaveBeenCalled();
  });
});
