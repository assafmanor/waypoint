// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  POLYLINE_PRECISION,
  routeLegKey,
  TRAVEL_MODE,
  type RouteBatch,
  type RoutedLeg,
} from '@waypoint/shared';

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
  useDayShapes,
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
/** The Asakusa walk ADR-0205 §1 measured, at Valhalla's precision — the same fixture
 *  `routing.test.ts` decodes, so the coordinates below are real ground rather than a round-trip. */
const ASAKUSA_SHAPE = {
  encoded: 'ikzbcAa_osiG`m@yoDvrAk|DrhBgrE',
  precision: POLYLINE_PRECISION.VALHALLA,
};
const ASAKUSA_POINTS = [
  { lat: 35.714757, lng: 139.796481 },
  { lat: 35.71402, lng: 139.79931 },
  { lat: 35.71268, lng: 139.80234 },
  { lat: 35.71099, lng: 139.80572 },
];
const walkWithShape = { ...walk, shape: ASAKUSA_SHAPE };
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
    await waitFor(
      () =>
        expect(second.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(
          walk,
        ),
      { timeout: 6000 },
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

/* ── THE DRAWN LINES (ADR-0206 §D8, §Z5 §M3) ─────────────────────────────────────────────── */

const shaped: RouteBatch = { legs: [leg([walkWithShape])] };

/** **Every mount here is taken down again**, and it is not tidiness: this file registers no
 *  auto-cleanup, so a hook left mounted keeps its own effects and its own in-flight promises
 *  alive inside the NEXT test. */
describe('useDayShapes', () => {
  const render = (stops = STOPS) =>
    renderHook(() => useDayShapes({ tripId: TRIP_ID, stops, mode: TRAVEL_MODE.WALKING }));

  // **One request for the whole day, and that is the tripwire's own terms.** The card warns that
  // "a day of N legs issuing N shape calls means it was done wrong" — N calls from THIS device.
  // The per-leg `/route` calls are the server's, paced and cached behind one batch.
  it('asks ONCE for the whole day, with shapes and one mode', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = render();

    await waitFor(() => expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    const [, request] = routes.fetchRoutes.mock.calls[0]!;
    expect(request.stops).toEqual(STOPS);
    expect(request.withShapes).toBe(true);
    expect(request.modes).toEqual([TRAVEL_MODE.WALKING]);
    unmount();
  });

  // The day LIST reads `useDayTravel`, which draws nothing — so it must never buy geometry.
  it('leaves the day’s own numbers geometry-free', async () => {
    const { unmount } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(routes.fetchRoutes.mock.calls[0]![1].withShapes).toBeUndefined();
    unmount();
  });

  // §D4's floor: a leg with no geometry answers `null` and the caller draws the straight segment.
  // Nobody sees an error, and the other legs still draw their real paths.
  it('answers null for a leg with no shape, while its neighbours still draw', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = render();

    await waitFor(() => expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toEqual(ASAKUSA_POINTS));
    expect(result.current.pathFor(TSUKIJI, SENSOJI)).toBeNull();
    unmount();
  });

  it('reads stored shapes without asking — offline included', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walkWithShape])]);
    setOnline(false);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);

    await waitFor(() => expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  // A day already drawn in full costs nothing on a revisit — which is what makes swiping back
  // and forth free. The check is on the LINE, not on the estimate.
  it('does not re-ask a day whose every leg already has a line', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walkWithShape])]);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);
    await waitFor(() => expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toEqual(ASAKUSA_POINTS));

    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  // **The counterpart, and the reason the check is on the line.** A day whose estimates are all
  // cached but whose SHAPES are not is exactly what `useDayTravel` leaves behind — asking again
  // is how the map gets its lines at all.
  it('asks when the estimates are cached but the lines are not', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walk])]);
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);

    await waitFor(() => expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('never asks from inside a peek', async () => {
    preview = true;
    const { result, unmount } = render();

    await act(async () => {});
    expect(result.current.pathFor(ASAKUSA, TSUKIJI)).toBeNull();
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  // Shapes arrive in passes (`SHAPE_CALLS_PER_PASS`), so a warming answer is the ORDINARY case
  // for a long day. One wait, then the next natural read finishes it.
  it('re-asks a warming day once, then lets the next read finish it', async () => {
    vi.useFakeTimers();
    routes.fetchRoutes.mockResolvedValue({ legs: [leg([walk])], retryAfterSeconds: 2 });

    const { unmount } = render();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('mirrors the shapes it bought, so the next visit draws with no request', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);
    const { unmount } = render();
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    unmount();

    await waitFor(async () =>
      expect((await readCachedTravelEstimates([WALK_KEY])).get(WALK_KEY)?.shape).toEqual(
        ASAKUSA_SHAPE,
      ),
    );
  });
});
