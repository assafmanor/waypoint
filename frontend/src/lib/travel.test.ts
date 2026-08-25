// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeLegKey, TRAVEL_MODE, type RouteBatch, type RoutedLeg } from '@waypoint/shared';

const routes = vi.hoisted(() => ({ fetchRoutes: vi.fn() }));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchRoutes: routes.fetchRoutes };
});

// The peek's own flag (ADR-0200 §7). Mocked rather than wrapped in the real provider, which
// would need a whole `TripContext` to say one boolean.
let preview = false;
vi.mock('../state/day-preview', () => ({ useIsDayPreview: () => preview }));

import { db } from '../db';
import {
  cacheTravelEstimates,
  readCachedTravelEstimates,
  resetAskedDaysForTests,
  useDayTravel,
} from './travel';

const ASAKUSA = { lat: 35.7148, lng: 139.7967 };
const TSUKIJI = { lat: 35.6654, lng: 139.7707 };
const SENSOJI = { lat: 35.7147, lng: 139.7966 };
const STOPS = [ASAKUSA, TSUKIJI, SENSOJI];
/** The two days a swipe mounts beside the visible one (ADR-0200 §7). */
const YESTERDAY = [SENSOJI, ASAKUSA];
const TOMORROW = [TSUKIJI, SENSOJI];
const TRIP_ID = 't1';

const WALK_KEY = routeLegKey(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING);

const walk = { mode: TRAVEL_MODE.WALKING, durationSeconds: 5208, distanceMeters: 6230 };
const drive = { mode: TRAVEL_MODE.DRIVING, durationSeconds: 1268, distanceMeters: 7100 };

const leg = (estimates: RoutedLeg['estimates']): RoutedLeg => ({
  fromIndex: 0,
  toIndex: 1,
  estimates,
  refusedModes: [],
  pendingModes: [],
});

const answered: RouteBatch = { legs: [leg([walk, drive])] };
const warming: RouteBatch = { legs: [leg([walk])], retryAfterSeconds: 2 };

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(async () => {
  preview = false;
  setOnline(true);
  resetAskedDaysForTests();
  routes.fetchRoutes.mockReset().mockResolvedValue(answered);
  await db.routeLegs.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the Dexie mirror', () => {
  it('stores what came back under the server’s own key spelling', async () => {
    await cacheTravelEstimates(STOPS, [leg([walk, drive])]);

    const found = await readCachedTravelEstimates([
      WALK_KEY,
      routeLegKey(ASAKUSA, TSUKIJI, TRAVEL_MODE.DRIVING),
    ]);
    expect(found.get(WALK_KEY)).toEqual(walk);
    expect(found.size).toBe(2);
  });

  it('is directional — B→A is not the row A→B stored', async () => {
    await cacheTravelEstimates(STOPS, [leg([walk])]);

    const back = await readCachedTravelEstimates([
      routeLegKey(TSUKIJI, ASAKUSA, TRAVEL_MODE.WALKING),
    ]);
    expect(back.size).toBe(0);
  });

  it('answers nothing for keys it does not hold, rather than failing', async () => {
    expect((await readCachedTravelEstimates([WALK_KEY])).size).toBe(0);
  });
});

describe('useDayTravel', () => {
  it('answers null on a cold read, and does not throw when the ask fails', async () => {
    routes.fetchRoutes.mockRejectedValue(new Error('offline blip'));

    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
  });

  it('asks once for the day, carrying every mode', async () => {
    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() =>
      expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    const [, request] = routes.fetchRoutes.mock.calls[0]!;
    expect(request.stops).toEqual(STOPS);
    expect(request.modes).toEqual([TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING, TRAVEL_MODE.CYCLING]);
  });

  it('reads a stored estimate offline, without asking', async () => {
    await cacheTravelEstimates(STOPS, [leg([walk])]);
    setOnline(false);

    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() =>
      expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
  });

  it('re-asks a warming day once, then gives up quietly', async () => {
    vi.useFakeTimers();
    routes.fetchRoutes.mockResolvedValue(warming);

    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);

    // The second answer is warming too, and nothing follows it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);
  });

  it('does not re-ask a day it already answered in full', async () => {
    const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    // Waited on the SECOND mount having done its work — its answer coming back out of Dexie —
    // rather than on the call count, which is already 1 and would pass before either effect ran.
    await waitFor(() =>
      expect(second.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(
        walk,
      ),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
  });

  // ADR-0200 §7: `DayPeek` mounts both neighbours as REAL surfaces, so without this a swipe
  // fires three matrices for two days nobody is reading.
  it('never asks from inside a peek, but still reads what the device holds', async () => {
    await cacheTravelEstimates(STOPS, [leg([walk])]);
    preview = true;

    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() =>
      expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
  });

  it('asks for the visible day only, with both neighbours mounted beside it', async () => {
    await cacheTravelEstimates(YESTERDAY, [leg([walk])]);

    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));

    preview = true;
    const peek = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: YESTERDAY }));
    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: TOMORROW }));

    // Again the wait is on the peek having run — the cached leg of the day it draws.
    await waitFor(() =>
      expect(peek.result.current.estimateFor(SENSOJI, ASAKUSA, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    expect(routes.fetchRoutes.mock.calls[0]![1].stops).toEqual(STOPS);
  });

  it('mirrors an answer, so the next visit reads it without the network', async () => {
    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));

    await waitFor(async () =>
      expect((await readCachedTravelEstimates([WALK_KEY])).get(WALK_KEY)).toEqual(walk),
    );
  });
});
