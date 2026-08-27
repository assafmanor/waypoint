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

const stored = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./map-archive-cache', () => ({ readLocalMapArchive: stored.read }));

import { db } from '../db';
import { hydrateRoutePack, resetRoutePackHydrationForTests } from './route-pack';
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
  resetAskedDaysForTests();
  routes.fetchRoutes.mockReset().mockRejectedValue(new Error('offline'));
  stored.read.mockReset();
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
