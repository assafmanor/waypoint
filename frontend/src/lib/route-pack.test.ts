// @vitest-environment jsdom
//
// **M10's first exit criterion, end to end on the device** (ADR-0206 §V1.8): aeroplane mode on a
// downloaded trip shows a travel time for every day-adjacent leg. The pack is the only thing this
// device has ever been told about those legs — no request is made, and none could succeed.
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVEL_MODE, routeLegKey, type RoutePack } from '@waypoint/shared';

const routes = vi.hoisted(() => ({ fetchRoutes: vi.fn() }));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchRoutes: routes.fetchRoutes };
});
vi.mock('../state/day-preview', () => ({ useIsDayPreview: () => false }));

const stored = vi.hoisted(() => ({ read: vi.fn(), list: vi.fn(), download: vi.fn() }));
vi.mock('./map-archive-cache', () => ({
  readLocalMapArchive: stored.read,
  listMapArchives: stored.list,
  downloadMapArchive: stored.download,
}));

import { db } from '../db';
import {
  hydrateRoutePack,
  resetRoutePackFetchForTests,
  resetRoutePackHydrationForTests,
  useTripRoutePack,
} from './route-pack';
import { resetAskedDaysForTests, useDayTravel } from './travel';

const ASAKUSA = { lat: 35.7148, lng: 139.7967 };
const TSUKIJI = { lat: 35.6654, lng: 139.7707 };
const SENSOJI = { lat: 35.7107, lng: 139.7975 };
const PACK_URL = '/trips/t1/routes/pack';

const leg = (from: typeof ASAKUSA, to: typeof ASAKUSA, seconds: number) => ({
  key: routeLegKey(from, to, TRAVEL_MODE.WALKING),
  estimate: {
    mode: TRAVEL_MODE.WALKING,
    durationSeconds: seconds,
    distanceMeters: seconds,
  },
});

const pack = (legs: RoutePack['legs']): RoutePack => ({ signature: 'sig-1', legs });

/** The byte cache's own answer shape.
 *
 *  **`blob.text` is supplied rather than a real `Blob`**, and the suite says so rather than
 *  depending on it: jsdom 25 implements neither `Blob.text()` nor `Blob.arrayBuffer()`, so a real
 *  one here would fail on the environment rather than on the code. Everything downstream of the
 *  read — the JSON, the schema, the write — is the real thing. */
const asBlob = (value: unknown) => ({
  blob: { text: () => Promise.resolve(JSON.stringify(value)) } as unknown as Blob,
  meta: { key: PACK_URL, sizeBytes: 1, lastUsedAt: 0 },
});

beforeEach(async () => {
  resetRoutePackHydrationForTests();
  resetRoutePackFetchForTests();
  resetAskedDaysForTests();
  routes.fetchRoutes.mockReset().mockRejectedValue(new Error('offline'));
  stored.read.mockReset();
  stored.list.mockReset().mockResolvedValue([]);
  stored.download.mockReset().mockResolvedValue({ status: 'stored', sizeBytes: 1 });
  await db.routeLegs.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('hydrateRoutePack', () => {
  it('puts a stored pack where the day reads it, and answers how many were new', async () => {
    stored.read.mockResolvedValue(
      asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208), leg(TSUKIJI, SENSOJI, 4100)])),
    );
    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(2);

    resetRoutePackHydrationForTests();
    // Idempotent: a second pass over the same pack writes nothing new.
    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(0);
  });

  it('reads a pack once per session, because the blob is not free', async () => {
    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208)])));
    await hydrateRoutePack(PACK_URL);
    await hydrateRoutePack(PACK_URL);
    expect(stored.read).toHaveBeenCalledTimes(1);
  });

  it('never overwrites a leg this device already holds — a pack is a floor, not an update', async () => {
    // A shape fetched online, which the pack does not carry (§AO). A plain `bulkPut` would wipe
    // it, and a device on a plane cannot ask for it again.
    const key = routeLegKey(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING);
    await db.routeLegs.put({
      key,
      estimate: {
        mode: TRAVEL_MODE.WALKING,
        durationSeconds: 5208,
        distanceMeters: 6230,
        shape: { encoded: 'abc', precision: 6 },
      },
      cachedAt: 1,
    });
    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 9999)])));

    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(0);
    const held = await db.routeLegs.get(key);
    expect(held?.estimate.shape).toEqual({ encoded: 'abc', precision: 6 });
    expect(held?.estimate.durationSeconds).toBe(5208);
  });

  it('is silent about a missing pack, an unreadable one and a malformed one', async () => {
    stored.read.mockResolvedValue(null);
    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(0);

    resetRoutePackHydrationForTests();
    stored.read.mockRejectedValue(new Error('cache gone'));
    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(0);

    resetRoutePackHydrationForTests();
    stored.read.mockResolvedValue({
      blob: { text: () => Promise.resolve('not json') } as unknown as Blob,
      meta: { key: PACK_URL, sizeBytes: 1, lastUsedAt: 0 },
    });
    await expect(hydrateRoutePack(PACK_URL)).resolves.toBe(0);
    await expect(db.routeLegs.count()).resolves.toBe(0);
  });
});

describe('aeroplane mode on a downloaded trip', () => {
  it('reads a travel time for every day-adjacent leg, with no request', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    stored.read.mockResolvedValue(
      asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208), leg(TSUKIJI, SENSOJI, 4100)])),
    );
    await hydrateRoutePack(PACK_URL);

    const view = renderHook(() =>
      useDayTravel({ tripId: 't1', stops: [ASAKUSA, TSUKIJI, SENSOJI] }),
    );

    await waitFor(() =>
      expect(
        view.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)?.durationSeconds,
      ).toBe(5208),
    );
    expect(
      view.result.current.estimateFor(TSUKIJI, SENSOJI, TRAVEL_MODE.WALKING)?.durationSeconds,
    ).toBe(4100);
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
  });

  it('reads the reverse of a leg as a different answer, because the key is directional', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    stored.read.mockResolvedValue(
      asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208), leg(TSUKIJI, ASAKUSA, 5400)])),
    );
    await hydrateRoutePack(PACK_URL);

    // A day that goes out and comes back — the case the directional key exists for.
    const view = renderHook(() =>
      useDayTravel({ tripId: 't1', stops: [ASAKUSA, TSUKIJI, ASAKUSA] }),
    );
    await waitFor(() =>
      expect(
        view.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)?.durationSeconds,
      ).toBe(5208),
    );
    expect(
      view.result.current.estimateFor(TSUKIJI, ASAKUSA, TRAVEL_MODE.WALKING)?.durationSeconds,
    ).toBe(5400);
  });
});

/**
 * **THE PACK REACHES THE DEVICE WITHOUT A 42 MB MAP IN FRONT OF IT** (ADR-0206 §AZ5).
 *
 * §V1.8 hung the download and the hydration off the Map's archive flow, which is behind
 * ADR-0186 §5's prompt — so the artefact built to make every day of the trip warm was reaching
 * only the groups who accepted a world layer, and reaching them only once they opened the Map.
 */
describe('useTripRoutePack', () => {
  const run = (over: Partial<Parameters<typeof useTripRoutePack>[0]> = {}) =>
    renderHook(() => useTripRoutePack({ tripId: 't1', offline: false, ended: false, ...over }));

  it('fetches the trip’s pack and puts its legs where the day reads them', async () => {
    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208)])));
    run();
    await waitFor(() => expect(stored.download).toHaveBeenCalledTimes(1));
    expect(stored.download.mock.calls[0]![0]).toMatchObject({ url: PACK_URL, kind: 'routes' });
    await waitFor(async () =>
      expect(
        await db.routeLegs.get(routeLegKey(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)),
      ).toBeTruthy(),
    );
  });

  it('spends no bytes on a pack this device already holds', async () => {
    stored.list.mockResolvedValue([{ key: PACK_URL, sizeBytes: 1, lastUsedAt: 0 }]);
    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208)])));
    run();
    await waitFor(() => expect(stored.read).toHaveBeenCalled());
    expect(stored.download).not.toHaveBeenCalled();
  });

  /** Hydration runs whatever the network is doing — the byte store and Dexie are evicted by
   *  different rules, and the one that matters on a plane is the one holding the legs. */
  it('still hydrates what is on the device when offline, and asks for nothing', async () => {
    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208)])));
    run({ offline: true });
    await waitFor(() => expect(stored.read).toHaveBeenCalled());
    expect(stored.download).not.toHaveBeenCalled();
  });

  /** A finished trip is swept rather than stocked (ADR-0186 §6). */
  it('does not stock a trip that has ended', async () => {
    stored.read.mockResolvedValue(null);
    run({ ended: true });
    await waitFor(() => expect(stored.read).toHaveBeenCalled());
    expect(stored.download).not.toHaveBeenCalled();
  });

  /** `202` — still precomputing. Nothing is stored and nothing is remembered, so the next mount
   *  asks again rather than the trip going without a pack for the session. */
  it('re-asks after a pack that was not ready', async () => {
    stored.read.mockResolvedValue(null);
    stored.download.mockResolvedValue({ status: 'preparing', retryAfterSeconds: 5 });
    const first = run();
    await waitFor(() => expect(stored.download).toHaveBeenCalledTimes(1));
    first.unmount();

    run();
    await waitFor(() => expect(stored.download).toHaveBeenCalledTimes(2));
  });
});

/**
 * **A PACK LANDING AFTER A DAY WAS OPENED STILL REACHES IT** (ADR-0206 §AZ5).
 *
 * `readDays` is module state that stops a mount re-reading Dexie for legs it has already read, so
 * before this the pack could fill the table under a day that would never look again — the numbers
 * were on the device and unreachable until a reload.
 */
describe('a pack that arrives after the day did', () => {
  it('lets a day that has already read its cache read it again', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const stops = [ASAKUSA, TSUKIJI];

    const first = renderHook(() => useDayTravel({ tripId: 't1', stops }));
    await waitFor(() => expect(first.result.current.settled).toBe(true));
    expect(first.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
    first.unmount();

    stored.read.mockResolvedValue(asBlob(pack([leg(ASAKUSA, TSUKIJI, 5208)])));
    await hydrateRoutePack(PACK_URL);

    const second = renderHook(() => useDayTravel({ tripId: 't1', stops }));
    await waitFor(() =>
      expect(
        second.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)?.durationSeconds,
      ).toBe(5208),
    );
  });
});
