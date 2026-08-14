// **THE REQUEST PATH NEVER WAITS FOR A CUT** (ADR-0186, after 2026-08-14).
//
// Four rounds of "the map does not load" ended here. The handler used to `await` the archive
// build: `sendRange(res, await map.world(), …)`. A cut downloads and slices 42.7 MB through a Go
// binary whose own ceiling is five minutes, so the HTTP response could stay open for minutes
// answering neither success nor failure — and from the client that is indistinguishable from a
// hang. The device reported it precisely: `tiles:0` with `err:none`, every load, and no better on
// a restart, because each attempt was abandoned before the cut finished so nothing was ever stored.
//
// A cut has to **complete once** and it is cached forever. That is the whole argument for taking it
// off the path where a person is waiting, and these are the assertions that keep it off.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getObject = vi.fn<(key: string) => Promise<Buffer>>();
const putObject = vi.fn<(key: string, bytes: Buffer) => Promise<void>>();
vi.mock('../common/storage', () => ({
  getObject: (key: string) => getObject(key),
  putObject: (key: string, bytes: Buffer) => putObject(key, bytes),
}));

const buildExtract = vi.fn<() => Promise<Buffer>>();
vi.mock('./pmtiles-extract', () => ({ buildExtract: () => buildExtract() }));

import { MapService, WORLD_KEY } from './map.service';

/** `worldIfReady` touches no database, so the one dependency is a stub rather than a fake. */
const service = () => new MapService({} as never);

/** A cut that has started and not finished — the state the old code waited inside. */
function pendingBuild(): { resolve: (bytes: Buffer) => void; reject: (error: Error) => void } {
  let resolve!: (bytes: Buffer) => void;
  let reject!: (error: Error) => void;
  buildExtract.mockReturnValue(
    new Promise<Buffer>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { resolve, reject };
}

beforeEach(() => {
  getObject.mockReset();
  putObject.mockReset();
  buildExtract.mockReset();
  putObject.mockResolvedValue(undefined);
});

describe('MapService.worldIfReady', () => {
  it('returns the stored archive when there is one', async () => {
    getObject.mockResolvedValue(Buffer.from('an archive'));
    await expect(service().worldIfReady()).resolves.toEqual(Buffer.from('an archive'));
    expect(buildExtract).not.toHaveBeenCalled();
  });

  // **The assertion the outage is about.** The build is deliberately left unresolved: if this
  // method awaited it, this test would time out — which is what the deployed handler did to a real
  // request, for minutes, with nothing to report.
  it('answers null WITHOUT waiting for a build that has not finished', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    pendingBuild();
    await expect(service().worldIfReady()).resolves.toBeNull();
    expect(buildExtract).toHaveBeenCalledTimes(1);
  });

  it('starts exactly one build for a burst of requests', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    pendingBuild();
    const map = service();
    await Promise.all([map.worldIfReady(), map.worldIfReady(), map.worldIfReady()]);
    expect(buildExtract).toHaveBeenCalledTimes(1);
  });

  it('stores the bytes when the build does finish, so the next read is instant', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    const build = pendingBuild();
    const map = service();
    expect(await map.worldIfReady()).toBeNull();
    build.resolve(Buffer.from('cut'));
    await vi.waitFor(() => expect(putObject).toHaveBeenCalledWith(WORLD_KEY, Buffer.from('cut')));
  });

  // A failed cut must not wedge the key forever: the next request is what retries it. The old
  // `inFlight` map cleared on rejection and that property is preserved here deliberately.
  it('lets a later request retry after a build fails', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    const first = pendingBuild();
    const map = service();
    expect(await map.worldIfReady()).toBeNull();
    first.reject(new Error('tls: certificate signed by unknown authority'));
    await vi.waitFor(() => expect(buildExtract).toHaveBeenCalledTimes(1));

    pendingBuild();
    expect(await map.worldIfReady()).toBeNull();
    expect(buildExtract).toHaveBeenCalledTimes(2);
  });

  // The world layer is shared by every trip, so cutting it at boot is what stops the first person
  // on a fresh deploy from being the one who waits.
  it('pre-warms at boot rather than on someone’s first map', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    pendingBuild();
    service().onModuleInit();
    await vi.waitFor(() => expect(buildExtract).toHaveBeenCalledTimes(1));
  });

  it('does not take the app down when the boot warm fails', async () => {
    getObject.mockRejectedValue(new Error('not stored'));
    buildExtract.mockRejectedValue(new Error('no CA store'));
    // A tile archive is a cache (§6); refusing to boot over one would take down the whole app for
    // the one screen that can degrade.
    expect(() => service().onModuleInit()).not.toThrow();
  });
});

// ── AN EXTRACT COVERS WHAT THE TRIP COMMITTED TO, NOT WHAT SOMEONE LOOKED AT (ADR-0187 §3) ──
//
// A `Place` row exists the moment it is picked, because it doubles as the dedup/enrichment cache
// (ADR-0112). The first version swept every row on the trip, so merely RESEARCHING a place changed
// the coordinate set, minted a new `mapExtractKey` and re-cut the whole archive — minutes of 503 on
// the research path, an extract grown to cover somewhere nobody saved, and a good one binned.
//
// Asserted on the QUERY rather than on rows, because the filter is the behaviour: prisma is a fake
// here, so what this can honestly check is that the sweep asks for referenced places at all. The
// regression it catches is precisely the one that shipped — a `where` with no reference condition.
describe('MapService.coordinatesFor (ADR-0187 §3)', () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const withPrisma = () => new MapService({ place: { findMany } } as never);

  beforeEach(() => findMany.mockClear());

  it('asks only for places a saved entity references', async () => {
    await withPrisma().coordinatesFor('t1');
    const { where } = findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where.tripId).toBe('t1');
    // The five relations `referencedPlaceIds` counts, and no sixth: `notes` is a relation on
    // `Place` and is deliberately not one of them (ADR-0112 owns what "in the trip" means).
    expect(where.OR).toEqual([
      { events: { some: {} } },
      { bookings: { some: {} } },
      { bookingsFrom: { some: {} } },
      { bookingsTo: { some: {} } },
      { maybeItems: { some: {} } },
    ]);
  });

  it('still refuses a place with no coordinates', async () => {
    await withPrisma().coordinatesFor('t1');
    const { where } = findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(where.lat).toEqual({ not: null });
    expect(where.lng).toEqual({ not: null });
  });
});
