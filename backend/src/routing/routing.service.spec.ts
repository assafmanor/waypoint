// **M4's exit criteria, asserted rather than observed by hand** (ADR-0205 §6; the milestone
// board's M4 card).
//
// The coordinates are the dev seed's, and that is deliberate: M1b's two comment tables in
// `seed.mjs` say which gate path each consecutive pair is the fixture for, so a spec that made up
// its own would be testing a different day than the one that ships. Three of them are named cases
// and **all three are features, not error paths** (ADR-0206 §D4): Shinjuku → Shinjuku at 0.00 km
// is `ROUTE_MIN_CROW_M`'s floor, Höfn → Reykjavík at 325.98 km is over the driving ceiling, and
// Blue Lagoon → Reykjavík at 38.55 km is inside ONE cluster and still driving-only.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clusterLatLngs, haversineMeters, routeLegKey, type LatLng } from '@waypoint/shared';
import { ROUTING_DISABLED } from '../common/env';
import type { MapService } from '../map/map.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PolitenessLimiter, ROUTING_BREAKER_COOLDOWN_MS } from './politeness.limiter';
import { RouteOutOfRangeError, type RouteProvider } from './route-provider';
import { RoutingService } from './routing.service';

/* ── the seed, as coordinates ─────────────────────────────────────────────────────────────── */

const ASAKUSA = { lat: 35.7107, lng: 139.7975 };
const TSUKIJI = { lat: 35.6654, lng: 139.7707 };
const SENSO = { lat: 35.7148, lng: 139.7967 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const GOLDEN_GAI = { lat: 35.6939, lng: 139.7048 };
const NRT = { lat: 35.772, lng: 140.3929 };

const BLUE_LAGOON = { lat: 63.8804, lng: -22.4495 };
const REYKJAVIK = { lat: 64.1466, lng: -21.9426 };
const VIK = { lat: 63.4187, lng: -19.006 };
const HOFN = { lat: 64.2539, lng: -15.2082 };

const TOKYO_TRIP = [ASAKUSA, TSUKIJI, SENSO, SHINJUKU, GOLDEN_GAI, NRT];
const ICELAND_TRIP = [BLUE_LAGOON, REYKJAVIK, VIK, HOFN];

/* ── fakes ────────────────────────────────────────────────────────────────────────────────── */

interface StoredRow {
  key: string;
  durationSeconds: number;
  distanceMeters: number;
  shapeEncoded: string | null;
  shapePrecision: number | null;
}

/** An in-memory stand-in for the one table this service touches. Small enough to be obviously
 *  right, which matters because the assertion "the cache was hit" is an assertion about it. */
function fakePrisma() {
  const rows = new Map<string, StoredRow>();
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
    $transaction: (ops: { run: () => void }[]) => {
      ops.forEach((op) => op.run());
      return Promise.resolve([]);
    },
  } as unknown as PrismaService;
  return { prisma, rows };
}

/** A provider that answers a fixed pace, and counts every call — which is how "no outbound
 *  request" becomes an assertion instead of an observation. */
function fakeProvider(overrides: Partial<RouteProvider> = {}) {
  const matrix = vi.fn((points: readonly LatLng[], _mode: string) => {
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
  });
  const shape = vi.fn(() =>
    Promise.resolve({
      durationSeconds: 100,
      distanceMeters: 200,
      shape: { encoded: 'abc', precision: 6 },
    }),
  );
  const provider = {
    id: 'fake',
    matrix,
    shape,
    dataVersion: () => Promise.resolve(new Date('2026-08-24T00:00:00Z')),
    ...overrides,
  } as unknown as RouteProvider;
  return { provider, matrix, shape };
}

function build(tripCoordinates: LatLng[], provider: RouteProvider, prisma: PrismaService) {
  const map = { coordinatesFor: () => Promise.resolve(tripCoordinates) } as unknown as MapService;
  // Zero gap: this suite is about what leaves the process, not about the rate. The rate has its
  // own spec (`politeness.limiter.spec.ts`), which is where §2's 1 call/s is asserted.
  return new RoutingService(prisma, map, new PolitenessLimiter(0), provider);
}

beforeEach(() => {
  delete process.env[ROUTING_DISABLED];
});

/* ── the criteria ─────────────────────────────────────────────────────────────────────────── */

describe('RoutingService', () => {
  it('answers a cold day with nothing, warms it, and then serves it with NO outbound request', async () => {
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);
    const stops = [ASAKUSA, TSUKIJI, SENSO];

    const cold = await service.batch('trip', { stops, modes: ['walking'] });
    expect(cold.legs[0]!.estimates).toEqual([]);
    expect(cold.legs[0]!.pendingModes).toEqual(['walking']);
    // ADR-0187's flow: a cold batch says how long to wait and never holds a socket open.
    expect(cold.retryAfterSeconds).toBeGreaterThan(0);

    await service.settled();
    const callsAfterWarm = matrix.mock.calls.length;
    expect(callsAfterWarm).toBeGreaterThan(0);

    const warm = await service.batch('trip', { stops, modes: ['walking'] });
    expect(warm.legs[0]!.estimates[0]!.mode).toBe('walking');
    expect(warm.legs[0]!.pendingModes).toEqual([]);
    expect(warm.retryAfterSeconds).toBeUndefined();
    // The criterion, stated as a number rather than as a hope.
    expect(matrix.mock.calls.length).toBe(callsAfterWarm);
  });

  it('answers a whole walkable day in ONE upstream call per mode', async () => {
    // ADR-0205 §Z4: one matrix answers every ordered pair, so the day costs one call and the
    // other cells are already paid for. §Y2: three modes is three calls, not one per leg per mode.
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);

    await service.batch('trip', {
      stops: [ASAKUSA, TSUKIJI, SENSO, SHINJUKU, GOLDEN_GAI],
      modes: ['walking', 'driving', 'cycling'],
    });
    await service.settled();

    expect(matrix.mock.calls.length).toBe(3);
    expect(matrix.mock.calls.map((call) => call[1]).sort()).toEqual([
      'cycling',
      'driving',
      'walking',
    ]);
  });

  it('caches every cell the matrix returned, not just the consecutive pairs', async () => {
    // ADR-0205 §Z4 again: a reorder or an inserted stop then costs nothing, because the
    // non-adjacent pairs were paid for by the same call.
    const { prisma, rows } = fakePrisma();
    const { provider } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);

    await service.batch('trip', { stops: [ASAKUSA, TSUKIJI, SENSO], modes: ['walking'] });
    await service.settled();

    // Asakusa → Senso-ji was never a consecutive pair of this day, and is stored anyway.
    expect(rows.has(routeLegKey(ASAKUSA, SENSO, 'walking'))).toBe(true);
    // Directional on purpose (one-way streets, turn restrictions): the reverse is its own row.
    expect(rows.has(routeLegKey(SENSO, ASAKUSA, 'walking'))).toBe(true);
  });

  it('returns the other modes when the gate refuses ONE — Blue Lagoon → Reykjavík', async () => {
    // M1b's named case, and the pair that separates the gate's two halves: 38.55 km sits inside
    // ONE cluster and is still driving-only, because it is over walking's 15 km and cycling's
    // 20 km. So the cluster test admits it and the distance ceiling refuses it.
    expect(
      clusterLatLngs(ICELAND_TRIP).some((c) => c.includes(BLUE_LAGOON) && c.includes(REYKJAVIK)),
    ).toBe(true);

    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(ICELAND_TRIP, provider, prisma);

    const batch = await service.batch('trip', {
      stops: [BLUE_LAGOON, REYKJAVIK],
      modes: ['walking', 'driving', 'cycling'],
    });
    await service.settled();

    expect(batch.legs[0]!.refusedModes.sort()).toEqual(['cycling', 'walking']);
    expect(batch.legs[0]!.pendingModes).toEqual(['driving']);
    // And the refusal cost no request: driving is the only mode that reached the network.
    expect(matrix.mock.calls.map((call) => call[1])).toEqual(['driving']);
  });

  it('refuses a 0.00 km pair without calling out — Shinjuku → Shinjuku', async () => {
    // Four seed events share `pl-shinjuku`, which Place-lite granularity (ADR-0147) makes
    // ordinary. `ROUTE_MIN_CROW_M` is why there is no matrix cell and no cache row for it: the
    // two stops ARE one place, and an empty admitted set is §D4's absence rather than an error.
    const { prisma, rows } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);

    const batch = await service.batch('trip', {
      stops: [SHINJUKU, SHINJUKU],
      modes: ['walking', 'driving', 'cycling'],
    });
    await service.settled();

    expect(batch.legs[0]!.estimates).toEqual([]);
    expect(batch.legs[0]!.pendingModes).toEqual([]);
    expect(batch.legs[0]!.refusedModes.sort()).toEqual(['cycling', 'driving', 'walking']);
    expect(batch.retryAfterSeconds).toBeUndefined();
    expect(matrix).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });

  it('refuses a pair over the driving ceiling without calling out — Höfn → Reykjavík', async () => {
    // 325.98 km, and ADR-0205 §Z9 asked this exact drive whether the ceiling could be raised and
    // answered no: the provider's own 400 km path limit cannot route it either, and one such pair
    // `400`s the whole day matrix (§Z4). The gate is only declining to spend a request on that.
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(ICELAND_TRIP, provider, prisma);

    const batch = await service.batch('trip', {
      stops: [HOFN, REYKJAVIK],
      modes: ['walking', 'driving', 'cycling'],
    });
    await service.settled();

    expect(batch.legs[0]!.refusedModes.sort()).toEqual(['cycling', 'driving', 'walking']);
    expect(matrix).not.toHaveBeenCalled();
  });

  it('keeps a refused pair from taking the rest of the day down with it', async () => {
    // The whole Iceland trip as one request. Reykjavík→Vík and Vík→Höfn are admitted for driving
    // and Höfn→Reykjavík is not — and because §Z9's batching sends the two admitted legs in
    // separate requests (their cross pair is 326 km), neither can be lost to the other's refusal.
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(ICELAND_TRIP, provider, prisma);

    await service.batch('trip', {
      stops: [REYKJAVIK, VIK, HOFN, REYKJAVIK],
      modes: ['driving'],
    });
    await service.settled();

    expect(matrix.mock.calls.map((call) => call[0]!.length)).toEqual([2, 2]);
  });

  it('a provider refusal is terminal and quiet — the day still answers', async () => {
    // §Z4's harsher failure: `error_code 154` fails identically forever, so it is logged once and
    // those legs stay absent. It must not become an exception on the request path.
    const { prisma } = fakePrisma();
    const { provider } = fakeProvider({
      matrix: () => Promise.reject(new RouteOutOfRangeError('Path distance exceeds the max')),
    });
    const service = build(TOKYO_TRIP, provider, prisma);

    const batch = await service.batch('trip', { stops: [ASAKUSA, TSUKIJI], modes: ['walking'] });
    await expect(service.settled()).resolves.toBeUndefined();
    expect(batch.legs).toHaveLength(1);
  });

  it('the kill switch stops every outbound call and the endpoint still answers from cache', async () => {
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);
    const stops = [ASAKUSA, TSUKIJI];

    await service.batch('trip', { stops, modes: ['walking'] });
    await service.settled();
    const before = matrix.mock.calls.length;

    process.env[ROUTING_DISABLED] = '1';

    // The stored leg is still served…
    const cached = await service.batch('trip', { stops, modes: ['walking'] });
    expect(cached.legs[0]!.estimates[0]!.mode).toBe('walking');

    // …and a leg we do not hold reads as §D4's absence, with nothing promised and nothing sent.
    const cold = await service.batch('trip', { stops: [SENSO, SHINJUKU], modes: ['walking'] });
    expect(cold.legs[0]!.estimates).toEqual([]);
    expect(cold.retryAfterSeconds).toBeUndefined();
    expect(matrix.mock.calls.length).toBe(before);
  });

  it('stops calling out once the breaker opens, and promises nothing while it is', async () => {
    // The 2026-09-02 outage: FOSSGIS reset every connection, `TypeError: fetch failed`. Without a
    // breaker every mounted day kept spending the single seat on calls that could not succeed
    // (ADR-0205 §Y3).
    const { prisma } = fakePrisma();
    const failing = vi.fn(() => Promise.reject(new Error('fetch failed')));
    const { provider } = fakeProvider({
      matrix: failing as unknown as RouteProvider['matrix'],
    });
    const service = build(TOKYO_TRIP, provider, prisma);

    // Three cold legs against a dead provider is the default threshold.
    for (const stops of [
      [ASAKUSA, TSUKIJI],
      [SENSO, SHINJUKU],
      [TSUKIJI, SHINJUKU],
    ]) {
      await service.batch('trip', { stops, modes: ['walking'] });
      await service.settled();
    }
    expect(failing.mock.calls.length).toBe(3);

    // The fourth spends no call: the seat and its 15 s timeout are the saving, and they are made
    // one level down, inside the limiter.
    const cold = await service.batch('trip', { stops: [ASAKUSA, SHINJUKU], modes: ['walking'] });
    await service.settled();
    expect(cold.legs[0]!.estimates).toEqual([]);
    expect(failing.mock.calls.length).toBe(3);

    // **And it still PROMISES a retry, which §Y3 got wrong** (§Y4). Withholding it was meant to
    // spare the reader a spinner; what it actually did was skip `warm()` — the only path that
    // ever reaches `limiter.run()` — so the breaker could never close and routing stayed dead
    // until the process restarted. The endpoint keeps saying "ask again", because asking again
    // is what carries the probe that reopens the seat.
    expect(cold.retryAfterSeconds).toBeDefined();
  });

  it('RECOVERS through the endpoint once the provider answers again', async () => {
    // **The §Y3 latch (2026-09-02, owner: _"added a new event and it didn't even try"_).**
    //
    // `batch` returned early on `limiter.isOpen` BEFORE calling `warm()` — and `warm()` is the
    // only caller of `limiter.runQuietly`, so it was the only path that ever reached `run()`.
    // Three failures therefore made `batch` stop calling `warm()` for good: nothing called
    // `run()`, so nothing called `record()`, so `failures` never reset and the half-open probe in
    // `admit()` was unreachable. The breaker latched open for the life of the process and only a
    // restart cleared it. A breaker that cannot close is not a breaker, it is an outage we caused.
    vi.useFakeTimers();
    const { prisma } = fakePrisma();
    let down = true;
    const flaky = vi.fn((points: readonly LatLng[], _mode: string) =>
      down
        ? Promise.reject(new Error('fetch failed'))
        : Promise.resolve(
            points.flatMap((_, from) =>
              points.flatMap((__, to) =>
                from === to
                  ? []
                  : [
                      {
                        fromIndex: from,
                        toIndex: to,
                        durationSeconds: haversineMeters(points[from]!, points[to]!),
                        distanceMeters: haversineMeters(points[from]!, points[to]!),
                      },
                    ],
              ),
            ),
          ),
    );
    const { provider } = fakeProvider({
      matrix: flaky as unknown as RouteProvider['matrix'],
    });
    const service = build(TOKYO_TRIP, provider, prisma);

    // Open it: three cold legs against a dead provider.
    for (const stops of [
      [ASAKUSA, TSUKIJI],
      [SENSO, SHINJUKU],
      [TSUKIJI, SHINJUKU],
    ]) {
      await service.batch('trip', { stops, modes: ['walking'] });
      await service.settled();
    }
    const spentWhileDown = flaky.mock.calls.length;

    // The provider comes back, and the cooldown elapses. Nobody restarts anything.
    down = false;
    await vi.advanceTimersByTimeAsync(ROUTING_BREAKER_COOLDOWN_MS);

    // A brand-new pair — the owner's "added a new event" — must get a real attempt.
    await service.batch('trip', { stops: [ASAKUSA, SHINJUKU], modes: ['walking'] });
    await service.settled();
    expect(flaky.mock.calls.length).toBeGreaterThan(spentWhileDown);

    // …and the estimate is then actually served, which is the whole point.
    const warm = await service.batch('trip', { stops: [ASAKUSA, SHINJUKU], modes: ['walking'] });
    expect(warm.legs[0]!.estimates[0]!.mode).toBe('walking');
  });

  it('a SHAPE refused as out of range does not count toward the breaker', async () => {
    // §Y4's second half. The gate admits on crow distance, the provider refuses on PATH distance
    // (§Z9), so an admitted leg can legitimately answer `RouteOutOfRangeError` — and `runShape`
    // was the one caller with no handling for it, so each one counted as a failure. Three, which
    // is a single ring-road day asking for its map lines, would have tripped the breaker and
    // suppressed routing for every trip on the server.
    const { prisma } = fakePrisma();
    const refusing = vi.fn(() => Promise.reject(new RouteOutOfRangeError('Path distance exceeds')));
    const { provider, matrix } = fakeProvider({
      shape: refusing as unknown as RouteProvider['shape'],
    });
    const service = build(ICELAND_TRIP, provider, prisma);
    const legs: [LatLng, LatLng][] = [
      [REYKJAVIK, VIK],
      [VIK, HOFN],
      [REYKJAVIK, BLUE_LAGOON],
    ];

    // **Durations first**, so the refusals below land CONSECUTIVELY. A successful matrix call
    // between them resets the count, which is exactly how the first draft of this test passed
    // against the defect: the run has to look like a day whose numbers are already cached and
    // is now asking only for its lines.
    for (const [from, to] of legs) {
      await service.batch('trip', { stops: [from, to], modes: ['driving'] });
      await service.settled();
    }

    // Now only shapes are owed, and every one is refused — three in a row, nothing in between.
    for (const [from, to] of legs) {
      await service.batch('trip', { stops: [from, to], modes: ['driving'], withShapes: true });
      await service.settled();
    }
    expect(refusing.mock.calls.length).toBe(3);

    // The breaker must still be closed: a fresh pair gets a real matrix call and an estimate.
    const spent = matrix.mock.calls.length;
    await service.batch('trip', { stops: [BLUE_LAGOON, VIK], modes: ['driving'] });
    await service.settled();
    expect(matrix.mock.calls.length).toBeGreaterThan(spent);
    const warm = await service.batch('trip', { stops: [BLUE_LAGOON, VIK], modes: ['driving'] });
    expect(warm.legs[0]!.estimates[0]!.mode).toBe('driving');
  });

  it('dedupes concurrent warms — two members opening the same day cost one call', async () => {
    const { prisma } = fakePrisma();
    const { provider, matrix } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);
    const request = { stops: [ASAKUSA, TSUKIJI], modes: ['walking' as const] };

    await Promise.all([service.batch('trip', request), service.batch('trip', request)]);
    await service.settled();

    expect(matrix.mock.calls.length).toBe(1);
  });

  it('fetches a shape only when asked, and returns one it already holds either way', async () => {
    // ADR-0205 §6 amendment: the matrix has no geometry, so a line is a call per leg — and
    // stripping a cached shape to honour `withShapes: false` would cost a request to get it back.
    const { prisma } = fakePrisma();
    const { provider, shape } = fakeProvider();
    const service = build(TOKYO_TRIP, provider, prisma);
    const stops = [ASAKUSA, TSUKIJI];

    await service.batch('trip', { stops, modes: ['walking'] });
    await service.settled();
    expect(shape).not.toHaveBeenCalled();

    await service.batch('trip', { stops, modes: ['walking'], withShapes: true });
    await service.settled();
    expect(shape).toHaveBeenCalledTimes(1);

    const without = await service.batch('trip', { stops, modes: ['walking'] });
    expect(without.legs[0]!.estimates[0]!.shape).toEqual({ encoded: 'abc', precision: 6 });
  });

  it('refuses walking for a stop the trip does not hold, and still answers driving', async () => {
    // The one thing `sameClusterOnly` can still change since the ceilings were measured
    // (ADR-0205 §Z2): a point in NO cluster answers "not same cluster". It costs a walking
    // estimate and never an error — and driving, which sets the flag false because a road trip
    // crosses clusters by definition, is unaffected.
    const { prisma } = fakePrisma();
    const { provider } = fakeProvider();
    // A trip whose clusters know nothing about these two stops.
    const service = build([NRT], provider, prisma);

    const batch = await service.batch('trip', {
      stops: [ASAKUSA, TSUKIJI],
      modes: ['walking', 'driving'],
    });
    expect(batch.legs[0]!.refusedModes).toEqual(['walking']);
    expect(batch.legs[0]!.pendingModes).toEqual(['driving']);
  });
});
