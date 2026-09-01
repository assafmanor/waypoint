// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeShape,
  POLYLINE_PRECISION,
  routeLegKey,
  TRAVEL_MODE,
  type LatLng,
  type RouteBatch,
  type RoutedLeg,
  type TravelMode,
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

import { DAY_TRAVEL_SETTLE_MAX_MS, DAY_TRAVEL_WARM_ATTEMPTS } from '../constants';
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
/** Deliberately outside `STOPS` and its two neighbours: a leg only ONE stop set holds, which is
 *  what makes "the read that was thrown away" assertable — every pair of `STOPS`/`TOMORROW`
 *  overlaps, so a spec built from those alone passes without the fix. */
const SHIBUYA = { lat: 35.6595, lng: 139.7005 };
const STOPS = [ASAKUSA, TSUKIJI, SENSOJI];
/** `STOPS` with its last stop replaced — same first leg, a second leg nothing else asks about. */
const RESHUFFLED = [ASAKUSA, TSUKIJI, SHIBUYA];
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
/** **A DIFFERENT road between the same two stops**, which is the whole point of §AM8: the drive
 *  does not follow the footpath. Two points is enough to tell the two lines apart, and it is a real
 *  decode rather than a hand-built array. */
const DRIVE_SHAPE = { encoded: 'ikzbcAa_osiGrhBgrE', precision: POLYLINE_PRECISION.VALHALLA };
/** Decoded rather than written out: the decoder is `routing.test.ts`'s subject, and what these
 *  specs are about is which MODE's line comes back — so the expectation must not also be a second
 *  copy of the decoding. The guard below asserts the two roads differ, so it is not vacuous. */
const DRIVE_POINTS = decodeShape(DRIVE_SHAPE);
const drive = { mode: TRAVEL_MODE.DRIVING, durationSeconds: 1268, distanceMeters: 7100 };
const driveWithShape = { ...drive, shape: DRIVE_SHAPE };

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

  /**
   * **THE FIELD REPORT THIS GUARD EXISTS FOR** (owner, 2026-08-28): _"sometimes, I'm not sure
   * when, on plan day/day view, the driving/walking rows don't show up, and it stays that way
   * until I restart the app."_
   *
   * "Until I restart" is the tell: `askedDays` is module state, so only a reload clears it. A day
   * recorded there is never asked again — and it was recorded on `retryAfterSeconds === undefined`
   * ALONE, i.e. on "nothing more is coming", without checking whether anything had actually
   * arrived. A batch that answers with no legs therefore marked the day answered in full while
   * teaching it nothing, and `merge` stores nothing for an empty set, so no estimate reached
   * `sessionKnown` or Dexie either. Every later visit early-returned on a day that held no numbers.
   *
   * The rule was already written for the neighbouring case and simply not applied to this one:
   * a still-warming day is deliberately not recorded, "that is how it gets its numbers at all".
   */
  it('does not record a day as answered when the batch taught it nothing', async () => {
    // The server says nothing more is coming — and hands back no legs at all.
    routes.fetchRoutes.mockResolvedValue({ legs: [] } satisfies RouteBatch);

    const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    expect(first.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
    first.unmount();

    // Re-opening the day must ask again: nothing was learned, so there is nothing to reuse — and
    // this is the only path back to numbers short of restarting the app.
    routes.fetchRoutes.mockResolvedValue(answered);
    const second = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(second.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(
        walk,
      ),
    );
  });

  /** The other half of the pair: a day that DID learn something is still asked only once, so the
   *  guard above cannot be satisfied by simply never recording anything. */
  it('still records a day that learned something, and does not re-ask it', async () => {
    const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() =>
      expect(first.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    first.unmount();

    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
  });

  /**
   * **THE FIELD REPORT THIS TRIO EXISTS FOR** (owner, 2026-09-01, with two screenshots two minutes
   * apart): a peer edits the trip, _"the changes are applied and received with WS, but the
   * calculated fields disappear · the transit rows, time calculations, total duration"_ — and the
   * second screenshot, after a restart, is complete.
   *
   * It is the 2026-08-28 report's defect reached by two further doors, and the same tell: only a
   * reload clears `askedDays`/`readDays`. Both sets said a fingerprint was handled while what
   * would have made that true was thrown away — retention ran inside the `setKnown` UPDATER (never
   * run for a component that has gone) and inside an `if (live)` (skipped when the day's stops
   * moved on), while the `add` calls beside them ran either way. Dexie held every row throughout,
   * which is exactly why restarting fixed it. See `retain`.
   */
  it('keeps what an answer taught it even when the day has already gone', async () => {
    // Held until we release it: a response landing in the window between the day unmounting —
    // a tab switch, a navigation — and its state settling.
    let release!: (batch: RouteBatch) => void;
    routes.fetchRoutes.mockReturnValue(
      new Promise<RouteBatch>((resolve) => {
        release = resolve;
      }),
    );

    const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(1));
    // **Not flushed before the unmount, and that is load-bearing.** React evaluates a `useState`
    // updater eagerly when the fiber has no pending work, which would run the old retention as a
    // side effect and hide the defect. The day still has its local read's re-render queued here,
    // which is the ordinary case and the one the report came from.
    first.unmount();
    release(answered);
    // The row reaches Dexie either way: that write was never inside the state update, which is the
    // asymmetry the whole fix is about.
    await waitFor(async () => expect(await db.routeLegs.get(WALK_KEY)).toBeTruthy());

    // Re-opening the day must have its numbers. Before the fix this was `null` for the rest of the
    // session: the read was skipped (`readDays`) and the ask was skipped (`askedDays`), so neither
    // path could reach the row Dexie was holding.
    const second = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() =>
      expect(second.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(
        walk,
      ),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
  });

  /**
   * **The second door, and the one that needs no unmount at all** — which is what makes it the
   * shape the report describes. Two peer changes in quick succession move the day's stops twice;
   * the first change's local read resolves after the second has superseded it, so `live` is false,
   * the merge was skipped — and `done()` recorded the fingerprint in `readDays` anyway. The legs
   * that stop set holds were then unreachable: never read again, and already answered.
   *
   * `live` says the effect RUN was superseded, never that the data is unwanted: an estimate is
   * keyed per leg, so what the read found is as valid for the new stop set as for the old.
   */
  it('keeps what a superseded read found, for whichever stop set asks next', async () => {
    // Both days are already on the device, from an earlier visit.
    await cacheTravelEstimates(STOPS, [leg([walk])]);
    await cacheTravelEstimates(RESHUFFLED, [
      leg([walk]),
      { ...leg([walk]), fromIndex: 1, toIndex: 2 },
    ]);
    // Offline, so nothing can paper over a skipped local read with a network answer.
    setOnline(false);

    let stops: readonly LatLng[] = STOPS;
    const view = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops }));
    await waitFor(() =>
      expect(view.result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );

    // Peer change #1 → a new stop set, whose read starts; peer change #2 lands before it resolves.
    stops = RESHUFFLED;
    view.rerender();
    stops = STOPS;
    view.rerender();

    // The superseded read is merged all the same — this is the assertion that was red. `SHIBUYA`
    // is reachable from no other stop set, so only that discarded read can have supplied it.
    await waitFor(() =>
      expect(view.result.current.estimateFor(TSUKIJI, SHIBUYA, TRAVEL_MODE.WALKING)).toEqual(walk),
    );

    // And it is still there for the stop set it belongs to, which is where it is read: the peer
    // reverts, or a swipe returns to that day.
    stops = RESHUFFLED;
    view.rerender();
    expect(view.result.current.estimateFor(TSUKIJI, SHIBUYA, TRAVEL_MODE.WALKING)).toEqual(walk);
  });

  /**
   * **A refusal is an answer, so it outlives the mount that learned it** (ADR-0206 §AU1).
   *
   * `askedDays` is module state and the refusal set was the mount's, so every ask after the first
   * put an already-refused leg back into `מחשב…` for the length of the request and then blanked
   * it — a spinner over an answer the gate had already given, which is the state §AU1 exists to
   * prevent. `sessionRefused` is the missing half.
   */
  it('does not re-spin a leg the server has already refused', async () => {
    routes.fetchRoutes.mockResolvedValue({
      legs: [{ ...leg([]), refusedModes: [TRAVEL_MODE.WALKING] }],
    } satisfies RouteBatch);

    const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() =>
      expect(first.result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(false),
    );
    first.unmount();

    // A later day whose stops CONTAIN that leg asks again (a new fingerprint, so `askedDays` does
    // not block it) — and the refused leg must not read as computing while it is in flight.
    let release!: (batch: RouteBatch) => void;
    routes.fetchRoutes.mockReturnValue(
      new Promise<RouteBatch>((resolve) => {
        release = resolve;
      }),
    );
    const second = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: [ASAKUSA, TSUKIJI] }));
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalledTimes(2));
    expect(second.result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(false);
    release({ legs: [] });
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

  /**
   * **THE FIELD REPORT THIS BOUND EXISTS FOR** (ADR-0206 §AU1). It asked once, retried once and
   * gave up — and a cold day's warm is three matrix calls paced ⁦1/s⁩ server-side against a
   * `Retry-After` floored at ⁦2s⁩, so the single retry regularly landed mid-warm and the day sat
   * silent until the app was left and reopened.
   */
  it('keeps re-asking a warming day, and stops at the bound', async () => {
    vi.useFakeTimers();
    routes.fetchRoutes.mockResolvedValue(warming);

    renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);

    // The round the old behaviour stopped at, and the one after it — which is the fix.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(3);

    // **And it terminates.** A provider that never answers must not leave a client polling it
    // forever — past the bound the day is correct with fewer numbers in it (§D4).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(DAY_TRAVEL_WARM_ATTEMPTS);
  });

  /** **The row has to be able to SAY it is computing** (ADR-0206 §AU1) — the second half of the
   *  same report: the number was coming and the day showed nothing at all while it did. */
  it('reports a leg as warming while it asks, and stops when the answer lands', async () => {
    routes.fetchRoutes.mockResolvedValueOnce(warming);
    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() =>
      expect(result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(true),
    );

    routes.fetchRoutes.mockResolvedValue({ legs: [leg([walk])] });
    await waitFor(() =>
      expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(walk),
    );
    expect(result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(false);
  });

  /** A mode the GATE refused is never coming, so it must never read as computing — otherwise the
   *  ⁦127 km⁩ walk spins for the whole bound and then blanks (§AM10 meets §AU1). */
  it('never calls a refused mode warming', async () => {
    routes.fetchRoutes.mockResolvedValue({
      legs: [{ ...leg([]), refusedModes: [TRAVEL_MODE.WALKING], pendingModes: [] }],
      retryAfterSeconds: 2,
    });
    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(false),
    );
  });

  /** Offline there is no ask, so there is nothing to be waiting on — §D4's chip, as before. */
  it('is not warming offline', async () => {
    setOnline(false);
    const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.warmingFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBe(false);
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

  // ── HAS THIS DEVICE SAID WHAT IT HOLDS YET (ADR-0206 §AT) ────────────────────────────────
  //
  // The day surfaces hold their first paint on `settled`, because a journey row and the day's
  // total APPEAR when an estimate lands — so a day painting before its own cache has answered
  // paints twice. Every spec here is about what the flag waits for, and every one of them is
  // about what it must NOT wait for.
  describe('settled', () => {
    it('is false until the local read answers, and true whether or not it found anything', async () => {
      const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

      expect(result.current.settled).toBe(false);
      // Nothing is cached here, so the read comes back empty — which settles the day exactly as a
      // full one does. A hold that only lifts on a hit would never lift on a first visit.
      await waitFor(() => expect(result.current.settled).toBe(true));
    });

    // **The network is not what it waits for**, and this is the boundary rather than an
    // optimisation: an estimate arriving from the server is new information, and holding a whole
    // day's content on a request is what `CLAUDE.md`'s "never assume the network" refuses.
    it('settles before the ask comes back', async () => {
      let answer: (batch: RouteBatch) => void = () => {};
      routes.fetchRoutes.mockReturnValue(
        new Promise<RouteBatch>((resolve) => {
          answer = resolve;
        }),
      );

      const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));

      await waitFor(() => expect(result.current.settled).toBe(true));
      expect(result.current.estimateFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
      answer({ legs: [leg([walk])] });
    });

    // The swipe is what makes this load-bearing rather than a saving: `DayPeek` mounts the two
    // neighbours as real surfaces, so the day a page turn lands on has already read its own legs
    // — and the committed mount must be complete on its FIRST render, not one read later.
    it('is true on the first render of a day this session already read', async () => {
      const first = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
      await waitFor(() => expect(first.result.current.settled).toBe(true));
      first.unmount();

      const second = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
      expect(second.result.current.settled).toBe(true);
    });

    // A peek mounts MID-GESTURE, so a pane that held its paint would slide in blank — and it
    // never fetches, so there is nothing it could be holding for that it has not already got.
    it('never holds a peek', () => {
      preview = true;
      const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
      expect(result.current.settled).toBe(true);
    });

    // A day with no legs has nothing to read and nothing to wait for.
    it('is true for a day with no legs to read', () => {
      const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: [] }));
      expect(result.current.settled).toBe(true);
    });

    // **The one failure the hold could cause rather than cure.** A Dexie read blocked by another
    // tab's upgrade would leave the day laid out and never painted, so the deadline settles it
    // with whatever it has — which is what the day did before the hold existed.
    it('settles on the deadline when the local read never answers', async () => {
      vi.useFakeTimers();
      // Restored by hand: this file registers no `restoreAllMocks`, and a `bulkGet` that never
      // answers would take every spec after this one down with it.
      const stalled = vi
        .spyOn(db.routeLegs, 'bulkGet')
        .mockReturnValue(new Promise(() => {}) as never);
      try {
        const { result } = renderHook(() => useDayTravel({ tripId: TRIP_ID, stops: STOPS }));
        expect(result.current.settled).toBe(false);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(DAY_TRAVEL_SETTLE_MAX_MS);
        });
        expect(result.current.settled).toBe(true);
      } finally {
        stalled.mockRestore();
      }
    });
  });
});

/* ── THE DRAWN LINES (ADR-0206 §D8, §Z5 §M3) ─────────────────────────────────────────────── */

const shaped: RouteBatch = { legs: [leg([walkWithShape])] };

/** **Every mount here is taken down again**, and it is not tidiness: this file registers no
 *  auto-cleanup, so a hook left mounted keeps its own effects and its own in-flight promises
 *  alive inside the NEXT test. */
describe('useDayShapes', () => {
  const render = (stops = STOPS, modes: TravelMode[] = [TRAVEL_MODE.WALKING]) =>
    renderHook(() => useDayShapes({ tripId: TRIP_ID, stops, modes }));

  // **One request for the whole day, and that is the tripwire's own terms.** The card warns that
  // "a day of N legs issuing N shape calls means it was done wrong" — N calls from THIS device.
  // The per-leg `/route` calls are the server's, paced and cached behind one batch.
  it('asks ONCE for the whole day, with shapes and one mode', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = render();

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );
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

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );
    expect(result.current.pathFor(TSUKIJI, SENSOJI, TRAVEL_MODE.WALKING)).toBeNull();
    unmount();
  });

  it('reads stored shapes without asking — offline included', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walkWithShape])]);
    setOnline(false);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );
    expect(routes.fetchRoutes).not.toHaveBeenCalled();
    unmount();
  });

  // A day already drawn in full costs nothing on a revisit — which is what makes swiping back
  // and forth free. The check is on the LINE, not on the estimate.
  it('does not re-ask a day whose every leg already has a line', async () => {
    await cacheTravelEstimates([ASAKUSA, TSUKIJI], [leg([walkWithShape])]);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);
    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );

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

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    unmount();
  });

  /**
   * **THE LEG'S OWN MODE, AND THIS IS THE SPEC THAT WAS MISSING** (ADR-0206 §AM8, reported from a
   * deploy). M8b made the mode per leg and left this hook asking in ONE — so a leg overridden to
   * driving on a walking trip drew the WALK's geometry. Both modes have a line between the same two
   * stops and they are different roads: the owner's report was a drive entering a one-way street
   * from the wrong end, which is exactly what a footpath route looks like when a car is told to
   * follow it. Neither the duration nor the distance was wrong, which is why only the map showed it.
   */
  it('draws each mode its own road between the same two stops', async () => {
    routes.fetchRoutes.mockResolvedValue({
      legs: [leg([walkWithShape, driveWithShape])],
    } satisfies RouteBatch);

    const { result, unmount } = render(
      [ASAKUSA, TSUKIJI],
      [TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING],
    );

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.DRIVING)).toEqual(DRIVE_POINTS),
    );
    // The two lines are different, and the walk's is still its own — asking with the wrong mode is
    // what the report was, so this asserts they cannot be confused rather than that one exists.
    expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS);
    expect(DRIVE_POINTS).not.toEqual(ASAKUSA_POINTS);
    unmount();
  });

  // A mode nobody drew has no line, rather than falling back to another mode's — the failure this
  // family had was a silent substitution, so the absence has to be asserted too.
  it('answers null for a mode it never asked about', async () => {
    routes.fetchRoutes.mockResolvedValue(shaped);

    const { result, unmount } = render([ASAKUSA, TSUKIJI]);

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toEqual(ASAKUSA_POINTS),
    );
    expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.CYCLING)).toBeNull();
    unmount();
  });

  // One request still, with both modes in it — §D8's tripwire is about the number of CALLS from
  // this device, and a day holding an override must not double them.
  it('asks once for a day that holds two modes, naming both', async () => {
    routes.fetchRoutes.mockResolvedValue({
      legs: [leg([walkWithShape, driveWithShape])],
    } satisfies RouteBatch);

    const { result, unmount } = render(
      [ASAKUSA, TSUKIJI],
      [TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING],
    );

    await waitFor(() =>
      expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.DRIVING)).toEqual(DRIVE_POINTS),
    );
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
    expect(routes.fetchRoutes.mock.calls[0]![1].modes).toEqual([
      TRAVEL_MODE.WALKING,
      TRAVEL_MODE.DRIVING,
    ]);
    unmount();
  });

  it('never asks from inside a peek', async () => {
    preview = true;
    const { result, unmount } = render();

    await act(async () => {});
    expect(result.current.pathFor(ASAKUSA, TSUKIJI, TRAVEL_MODE.WALKING)).toBeNull();
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
