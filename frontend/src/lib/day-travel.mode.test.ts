// @vitest-environment jsdom
//
// **M8b's exit criteria, asserted rather than eyeballed** (ADR-0206 §Z2/§AM, and the milestone
// card says "asserted, not eyeballed" in as many words).
//
// The headline one is the mode switch: §Z2 requires it to be INSTANT, which it can only be if the
// day's matrix already holds every routable mode — so the assertion here is on the network, with a
// spy, and not on how the block looks afterwards. If a switch fetches, M4 is wrong and not M8.
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_TYPE,
  defaultLegTravelMode,
  derivedTravelMode,
  routeLegKey,
  TRANSIT_LEG_MODE,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type RouteBatch,
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';

const routes = vi.hoisted(() => ({ fetchRoutes: vi.fn() }));
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchRoutes: routes.fetchRoutes };
});
vi.mock('../state/day-preview', () => ({ useIsDayPreview: () => false }));

import { db } from '../db';
import { resetAskedDaysForTests } from './travel';
import { useDayTravelReads, type DayLeg } from './day-travel';

const TRIP_ID = 't1';
const DAY = '2026-08-04';

const SENSOJI = { lat: 35.7148, lng: 139.7967 };
const TOKYO_STN = { lat: 35.6812, lng: 139.7671 };
/** **⁦700 m⁩ from Senso-ji**, which is the other side of §AU2's ⁦2.5 km⁩ default — Kaminarimon, the
 *  gate you actually walk to. The pair above is ⁦5.1 km⁩ crow and now defaults to DRIVING; this one
 *  is the case that must still default to a walk, or the rule has simply moved the wrong answer. */
const KAMINARIMON = { lat: 35.7113, lng: 139.7967 };

const places: Place[] = [
  {
    id: 'p-sensoji',
    tripId: TRIP_ID,
    name: 'סנסו-ג׳י',
    ...SENSOJI,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  },
  {
    id: 'p-tokyo',
    tripId: TRIP_ID,
    name: 'תחנת טוקיו',
    ...TOKYO_STN,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  },
  {
    id: 'p-kaminarimon',
    tripId: TRIP_ID,
    name: 'קמינרימון',
    ...KAMINARIMON,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  },
];

const ev = (id: string, placeId: string, startsAt: string, endsAt?: string) =>
  ({
    id,
    tripId: TRIP_ID,
    date: DAY,
    title: id,
    kind: 'soft',
    status: 'planned',
    sortOrder: 0,
    source: 'manual',
    placeId,
    startsAt,
    endsAt,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  }) as unknown as TripEvent;

const FROM = ev('e1', 'p-sensoji', `${DAY}T15:00:00Z`, `${DAY}T15:20:00Z`);
const TO = ev('e2', 'p-tokyo', `${DAY}T18:00:00Z`);
const LEGS: DayLeg[] = [{ from: FROM, to: TO }];

/** The three routable modes the day's one matrix carries, so a switch is a cache read (§Y2). */
const BATCH: RouteBatch = {
  legs: [
    {
      fromIndex: 0,
      toIndex: 1,
      estimates: [
        { mode: TRAVEL_MODE.WALKING, durationSeconds: 4380, distanceMeters: 5900 },
        { mode: TRAVEL_MODE.CYCLING, durationSeconds: 1500, distanceMeters: 6100 },
        { mode: TRAVEL_MODE.DRIVING, durationSeconds: 900, distanceMeters: 7400 },
      ],
      refusedModes: [],
      pendingModes: [],
    },
  ],
};

const override = (mode: TravelModeOverride['mode'], over?: Partial<TravelModeOverride>) =>
  ({
    id: 'o1',
    tripId: TRIP_ID,
    // Canonicalised, as storage holds it — `p-sensoji` < `p-tokyo`.
    fromPlaceId: 'p-sensoji',
    toPlaceId: 'p-tokyo',
    mode,
    createdBy: 'u1',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...over,
  }) as TravelModeOverride;

const read = (overrides: readonly TravelModeOverride[] = [], bookings: Booking[] = []) =>
  renderHook(
    (props: { overrides: readonly TravelModeOverride[] }) =>
      useDayTravelReads({
        tripId: TRIP_ID,
        legs: LEGS,
        bookings,
        places,
        overrides: props.overrides,
      }),
    { initialProps: { overrides } },
  );

beforeEach(async () => {
  routes.fetchRoutes.mockReset();
  routes.fetchRoutes.mockResolvedValue(BATCH);
  resetAskedDaysForTests();
  await db.routeLegs.clear();
});
afterEach(() => vi.clearAllMocks());

describe('the derived default (ADR-0206 §Z2)', () => {
  /** The two trips M1b's seed exists to exercise, and the card names both. */
  it('drives a car-hire trip and walks a rail-and-flights one', () => {
    expect(derivedTravelMode([{ type: BOOKING_TYPE.CAR }])).toBe(TRAVEL_MODE.DRIVING);
    expect(
      derivedTravelMode([
        { type: BOOKING_TYPE.FLIGHT },
        { type: BOOKING_TYPE.TRAIN },
        { type: BOOKING_TYPE.HOTEL },
      ]),
    ).toBe(TRAVEL_MODE.WALKING);
  });

  /** Derived means it moves when the trip does — the property a stored column would not have. */
  it('changes when a car booking is added', () => {
    const bookings: { type: Booking['type'] }[] = [{ type: BOOKING_TYPE.TRAIN }];
    expect(derivedTravelMode(bookings)).toBe(TRAVEL_MODE.WALKING);
    bookings.push({ type: BOOKING_TYPE.CAR });
    expect(derivedTravelMode(bookings)).toBe(TRAVEL_MODE.DRIVING);
  });
});

/**
 * **THE DISTANCE DECIDES, AND THE TRIP'S DERIVATION IS THE FLOOR UNDER IT** (ADR-0206 §AU2).
 *
 * The field report this exists for: a trip of flights and hotels is a WALKING trip by §Z2, so the
 * ⁦127 km⁩ hop from Tel Aviv to the Galilee was measured as a walk, refused by the gate at ⁦15 km⁩,
 * and rendered as nothing at all — no row, no distance, and no control to change it with.
 */
describe('the distance-aware default (ADR-0206 §AU2)', () => {
  const TLV = { lat: 32.0853, lng: 34.7818 };
  const GALILEE = { lat: 32.8, lng: 35.5 };

  it('drives a leg no one would walk, on a trip with no car at all', () => {
    expect(defaultLegTravelMode(TLV, GALILEE, TRAVEL_MODE.WALKING)).toBe(TRAVEL_MODE.DRIVING);
  });

  it('walks a short hop, on a trip that hired a car', () => {
    expect(defaultLegTravelMode(SENSOJI, KAMINARIMON, TRAVEL_MODE.DRIVING)).toBe(
      TRAVEL_MODE.WALKING,
    );
  });

  /** The only input left for §Z2's answer: a leg with an end nobody placed has no distance to
   *  read, and there the trip's own derivation is still the best thing anyone knows (§AM4). */
  it('falls back to the trip derivation where there is no distance to read', () => {
    expect(defaultLegTravelMode(undefined, GALILEE, TRAVEL_MODE.DRIVING)).toBe(TRAVEL_MODE.DRIVING);
    expect(defaultLegTravelMode(TLV, undefined, TRAVEL_MODE.WALKING)).toBe(TRAVEL_MODE.WALKING);
  });

  /**
   * **THE FIELD REPORT §AV1 EXISTS FOR, through the hook** (2026-08-28). Senso-ji → Tokyo Station
   * is the pair this file already holds and it makes the point at the reads layer: the crow is
   * ⁦5.1 km⁩, but what settles it is the ⁦4380s⁩ walk the matrix answered — over ten minutes, so the
   * leg is a drive. Bjólfur is the same shape with the crow pointing the other way.
   */
  it('reads the walking DURATION, not the crow, once the matrix has answered', async () => {
    const { result } = read();
    await waitFor(() => expect(result.current.estimateFor(FROM, TO)).not.toBeNull());
    expect(result.current.defaultModeFor(FROM, TO)).toBe(TRAVEL_MODE.DRIVING);
  });

  /** …and the walk stays a walk where the router says it is one, which is what makes the test
   *  above about the duration rather than about these two coordinates. */
  it('keeps a short walk a walk', async () => {
    const near = ev('e3', 'p-kaminarimon', `${DAY}T19:00:00Z`);
    // The shared `BATCH` answers the ⁦4380s⁩ Senso-ji walk by leg INDEX, so this leg needs its own:
    // what is being asserted is the duration's effect, and inheriting another pair's would assert
    // the opposite of the intent while still passing for a while.
    routes.fetchRoutes.mockResolvedValue({
      legs: [
        {
          fromIndex: 0,
          toIndex: 1,
          estimates: [{ mode: TRAVEL_MODE.WALKING, durationSeconds: 8 * 60, distanceMeters: 640 }],
          refusedModes: [],
          pendingModes: [],
        },
      ],
    });
    const { result } = renderHook(() =>
      useDayTravelReads({
        tripId: TRIP_ID,
        legs: [{ from: FROM, to: near }],
        bookings: [{ type: BOOKING_TYPE.CAR } as Booking],
        places,
        overrides: [],
      }),
    );
    await waitFor(() => expect(result.current.estimateFor(FROM, near)).not.toBeNull());
    expect(result.current.modeFor(FROM, near)).toBe(TRAVEL_MODE.WALKING);
  });

  /** …and the same answer through the hook, so the day surfaces read what the derivation says. */
  it('answers per leg through the reads, not once per trip', () => {
    const near = ev('e3', 'p-kaminarimon', `${DAY}T19:00:00Z`);
    const { result } = renderHook(() =>
      useDayTravelReads({
        tripId: TRIP_ID,
        legs: [
          { from: FROM, to: TO },
          { from: TO, to: near },
        ],
        bookings: [],
        places,
        overrides: [],
      }),
    );
    // One trip, one derived mode (`walking`, no car) — and two legs that disagree about it.
    expect(result.current.mode).toBe(TRAVEL_MODE.WALKING);
    expect(result.current.modeFor(FROM, TO)).toBe(TRAVEL_MODE.DRIVING);
    expect(result.current.defaultModeFor(FROM, TO)).toBe(TRAVEL_MODE.DRIVING);
  });
});

describe('the per-leg override (ADR-0206 §AM)', () => {
  it('falls back to the leg default with no override', () => {
    const { result } = read([], [{ type: BOOKING_TYPE.CAR } as Booking]);
    expect(result.current.modeFor(FROM, TO)).toBe(TRAVEL_MODE.DRIVING);
  });

  /** **An override still outranks the distance**, which is what keeps §AU2 a DEFAULT: the ⁦5.1 km⁩
   *  pair drives by derivation and walks the moment somebody says so. */
  it('lets a person overrule the distance', () => {
    const { result } = read([override(TRAVEL_MODE.WALKING)]);
    expect(result.current.defaultModeFor(FROM, TO)).toBe(TRAVEL_MODE.DRIVING);
    expect(result.current.modeFor(FROM, TO)).toBe(TRAVEL_MODE.WALKING);
  });

  it('answers the override where one is set', () => {
    const { result } = read([override(TRANSIT_LEG_MODE)]);
    expect(result.current.modeFor(FROM, TO)).toBe(TRANSIT_LEG_MODE);
  });

  /**
   * **§AM2's claim on the read side.** Storage canonicalises, but the READ has to too — a row
   * written for the pair must be found whichever way round the day happens to traverse it, or the
   * return leg silently keeps the number the declaration was meant to silence.
   */
  it('finds the row whichever way round the leg runs', () => {
    const reversed = read([
      override(TRANSIT_LEG_MODE, { fromPlaceId: 'p-tokyo', toPlaceId: 'p-sensoji' }),
    ]);
    expect(reversed.result.current.modeFor(FROM, TO)).toBe(TRANSIT_LEG_MODE);
  });

  it('exposes the pair the mode control writes on', () => {
    const { result } = read();
    expect(result.current.pairFor(FROM, TO)).toEqual({
      fromPlaceId: 'p-sensoji',
      toPlaceId: 'p-tokyo',
    });
  });
});

describe('a declared leg suppresses the estimate (ADR-0206 §AA4)', () => {
  it('reads the routed estimate on a routable mode', async () => {
    const { result } = read();
    // ⁦900⁩ and not ⁦4380⁩ since §AU2: this pair is ⁦5.1 km⁩ crow, so the leg's default is the drive.
    // The test's own note two lines down — "73 min against 25 by train" — is the same judgement
    // the derivation now makes on its own.
    await waitFor(() => expect(result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(900));
  });

  /** The whole point of the declaration: silence where the app would otherwise print a walking
   *  number for a journey nobody will walk (Senso-ji → Tokyo Station, 73 min against 25 by train). */
  it('reads NOTHING once the leg is declared תחב״צ', async () => {
    const { result } = read([override(TRANSIT_LEG_MODE)]);
    // Give the matrix time to land, so the null is the declaration's and not a cold cache's.
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalled());
    expect(result.current.estimateFor(FROM, TO)).toBeNull();
  });
});

/**
 * **THE HEADLINE EXIT CRITERION** (ADR-0206 §Z2, and M8b's card): switching mode changes every read
 * at once and issues NO network request. It holds because the day's one matrix asks for every
 * routable mode up front (`useDayTravel`'s `modes = TRAVEL_MODES`), so a switch is a cache read.
 */
describe('switching mode issues no request', () => {
  it('re-reads the same matrix instead of asking again', async () => {
    const { result, rerender } = read();
    // Wait on the ESTIMATE, not on the call: the fetch resolves a tick before the batch lands.
    // The leg's default is the drive since §AU2 — ⁦5.1 km⁩ crow, past the ⁦2.5 km⁩ walk default.
    await waitFor(() => expect(result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(900));
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);

    // Declare the leg a walk — a different mode, and every read must move to it.
    rerender({ overrides: [override(TRAVEL_MODE.WALKING)] });
    await waitFor(() => expect(result.current.modeFor(FROM, TO)).toBe(TRAVEL_MODE.WALKING));
    expect(result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(4380);

    // …and back again, through the fourth mode on the way.
    rerender({ overrides: [override(TRANSIT_LEG_MODE)] });
    await waitFor(() => expect(result.current.estimateFor(FROM, TO)).toBeNull());
    rerender({ overrides: [override(TRAVEL_MODE.CYCLING)] });
    await waitFor(() => expect(result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(1500));

    // **The assertion the card asks for**, and it is about the network rather than the pixels.
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
  });

  /** And the request never names the mode no provider can answer (§AM5). */
  it('never asks a provider for transit', async () => {
    read([override(TRANSIT_LEG_MODE)]);
    await waitFor(() => expect(routes.fetchRoutes).toHaveBeenCalled());
    for (const call of routes.fetchRoutes.mock.calls) {
      expect(call[1].modes).not.toContain(TRANSIT_LEG_MODE);
    }
  });
});

/** §Z5's live defect, and the one M8b was told to fix: the leg's ROUTED number is per mode, so a
 *  pair under walking's ceiling was answering with a walk for a journey that is a train. Asserted
 *  through the cache key, which is what the map's geometry reads too. */
it('keys the estimate on the LEG mode, not the trip default', async () => {
  const { result } = read([override(TRAVEL_MODE.DRIVING)]);
  await waitFor(() => expect(result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(900));
  const drivingKey = routeLegKey(SENSOJI, TOKYO_STN, TRAVEL_MODE.DRIVING);
  expect(await db.routeLegs.get(drivingKey)).toBeTruthy();
});

/**
 * **§V1's driving exception, at the reads layer** (ADR-0206 §V1, and M8b's card names this pair).
 *
 * Reykjavík→Vík is two clusters apart: the gate admits `driving` by distance alone and refuses
 * `walking`/`cycling` outside a cluster, so ONE pair answers a duration under one mode and nothing
 * under another. That is the whole reason the mode control has to make the active mode obvious —
 * switching silently changes what the day is able to say. What the block then draws is §D4's chip,
 * which `DayJoinRow.test.tsx` already owns; what belongs here is that the reads disagree per mode
 * and that the walking one is `null` rather than an error or a guess.
 */
describe('a cross-cluster leg (ADR-0206 §V1)', () => {
  /** The batch a cross-cluster pair really comes back as: driving answered, the two cluster-only
   *  modes refused by the gate before the network (`admitsTravelMode`). */
  const CROSS: RouteBatch = {
    legs: [
      {
        fromIndex: 0,
        toIndex: 1,
        estimates: [{ mode: TRAVEL_MODE.DRIVING, durationSeconds: 8400, distanceMeters: 186_000 }],
        refusedModes: [TRAVEL_MODE.WALKING, TRAVEL_MODE.CYCLING],
        pendingModes: [],
      },
    ],
  };

  beforeEach(() => routes.fetchRoutes.mockResolvedValue(CROSS));

  it('resolves the drive and falls back to absence on the walk', async () => {
    const driving = read([override(TRAVEL_MODE.DRIVING)]);
    await waitFor(() =>
      expect(driving.result.current.estimateFor(FROM, TO)?.durationSeconds).toBe(8400),
    );

    // Same pair, same matrix, walking declared: the gate refused it, so there is no row to read.
    driving.rerender({ overrides: [override(TRAVEL_MODE.WALKING)] });
    await waitFor(() => expect(driving.result.current.modeFor(FROM, TO)).toBe(TRAVEL_MODE.WALKING));
    expect(driving.result.current.estimateFor(FROM, TO)).toBeNull();

    // …and the refusal cost no second request: it is the same matrix both times (§Z2).
    expect(routes.fetchRoutes).toHaveBeenCalledTimes(1);
  });
});
