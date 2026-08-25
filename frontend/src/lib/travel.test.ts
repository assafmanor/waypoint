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
  useDayTravel,
  useLegShape,
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

/* ── THE DRAWN LINE (ADR-0206 §D8) ───────────────────────────────────────────────────────── */

const LEG = { from: ASAKUSA, to: TSUKIJI };
const shaped: RouteBatch = { legs: [leg([walkWithShape])] };

/** **Every mount here is taken down again**, and it is not tidiness: this file registers no
 *  auto-cleanup, so a hook left mounted keeps its own effects and its own in-flight promises
 *  alive inside the NEXT test — which is how a warming leg was seen re-asking before its timer
 *  had moved at all. */
describe('useLegShape', () => {
  it('asks for ONE two-stop leg with shapes, and decodes what comes back', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );

    await waitFor(() => expect(result.current).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    const [, request] = routes.fetchRoutes.mock.calls[0]!;
    expect(request.stops).toEqual([ASAKUSA, TSUKIJI]);
    expect(request.withShapes).toBe(true);
    // One line is drawn, so one mode's geometry is bought (§Z5 §M5 widens this with M8's control).
    expect(request.modes).toEqual([TRAVEL_MODE.WALKING]);
    unmount();
  });

  // **The tripwire the card names**: a day of N legs issuing N shape calls means the ask was put
  // behind the day rather than behind the drawn line. The day's own hook must stay geometry-free.
  it('does not put a shape call behind a day view — the day asks once, without geometry', async () => {
    const { unmount } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(routes.fetchRoutes.mock.calls[0]![1].withShapes).toBeUndefined();
    unmount();
  });

  it('draws nothing, and asks nothing, with no leg to draw', async () => {
    const { result, unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: null, mode: TRAVEL_MODE.WALKING }),
    );

    await act(async () => {});
    expect(result.current).toBeNull();
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  it('reads a stored shape without asking — offline included', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walkWithShape])]);
    setOnline(false);

    const { result, unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );

    await waitFor(() => expect(result.current).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  it('never asks from inside a peek', async () => {
    preview = true;
    const { result, unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );

    await act(async () => {});
    expect(result.current).toBeNull();
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  // §D4: a leg the gate refused comes back with no estimate at all, which is the crow-flies
  // chip's case and the dashed connector's — never an error, and never a retry loop.
  it('answers null for a leg nothing can route, and never asks about it again', async () => {
    routes.fetchRoutes.mockResolvedValue({ legs: [] } satisfies RouteBatch);

    const first = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeNull();
    first.unmount();

    const second = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );
    await act(async () => {});
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  // **The one case that must stay askable.** A day's matrix carries no geometry, so its write
  // overwrites the row this hook filled — and a leg remembered as "asked" would lose its line for
  // the rest of the session. An answer that came back WITHOUT a shape is therefore not final.
  it('asks again for a leg whose shape the day’s matrix wrote over', async () => {
    routes.fetchRoutes.mockResolvedValue({ legs: [leg([walk])] } satisfies RouteBatch);
    const first = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeNull();
    first.unmount();

    routes.fetchRoutes.mockResolvedValue(shaped);
    const second = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );

    await waitFor(() => expect(second.result.current).toEqual(ASAKUSA_POINTS));
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  // The selection moves while a shape is in flight: the answer belongs to a leg nobody is
  // looking at, and drawing it would put amber between two points the map has stopped naming.
  it('never draws a shape that belongs to the leg before this one', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);
    const { result, rerender, unmount } = renderHook((leg: typeof LEG | null) =>
      useLegShape({ tripId: TRIP_ID, leg, mode: TRAVEL_MODE.WALKING }),
    );

    rerender(LEG);
    await waitFor(() => expect(result.current).toEqual(ASAKUSA_POINTS));

    rerender({ from: TSUKIJI, to: SENSOJI });
    expect(result.current).toBeNull();
    unmount();
  });

  it('re-asks a warming leg once, then gives up quietly', async () => {
    vi.useFakeTimers();
    routes.fetchRoutes.mockResolvedValue({ legs: [leg([walk])], retryAfterSeconds: 2 });

    const { unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );

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

  it('mirrors the shape it bought, so re-selecting the leg draws it with no request', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);
    const { unmount } = renderHook(() =>
      useLegShape({ tripId: TRIP_ID, leg: LEG, mode: TRAVEL_MODE.WALKING }),
    );
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    unmount();

    await waitFor(async () =>
      expect((await readCachedTravelEstimates([WALK_KEY])).get(WALK_KEY)?.shape).toEqual(
        ASAKUSA_SHAPE,
      ),
    );
  });
});
