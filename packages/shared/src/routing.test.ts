import { describe, expect, it } from 'vitest';
import { TRAVEL_MODE, TRAVEL_MODES } from './constants';
import { travelModeSchema } from './entities';
import { EARTH_RADIUS_M, clusterLatLngs, haversineMeters, type LatLng } from './geo';
import {
  POLYLINE_PRECISION,
  ROUTE_BATCH_MAX_STOPS,
  TRAVEL_GATE,
  admitsTravelMode,
  admittedTravelModes,
  decodePolyline,
  decodeShape,
  routableLegs,
  routeBatchRequestSchema,
  routeLegKey,
  travelEstimateFor,
  type RoutedLeg,
} from './routing';

/* ── THE MODE VOCABULARY (ADR-0206 §D9, §Z3) ─────────────────────────────────────────────────
   Three modes, and the absence of a fourth is the decision — a mode control that announces
   transit and then answers nothing is the failure ADR-0160 §H named. */
describe('travel modes', () => {
  it('has no transit member — absent, not disabled', () => {
    expect(travelModeSchema.options).not.toContain('transit');
    expect(TRAVEL_MODES).toEqual([TRAVEL_MODE.WALKING, TRAVEL_MODE.DRIVING, TRAVEL_MODE.CYCLING]);
  });

  it('gates every mode there is', () => {
    // Derived from the mode list rather than fixtured, so a fourth mode fails here as well as
    // at the compiler — the gate is what decides whether it may be called at all.
    for (const mode of TRAVEL_MODES) expect(TRAVEL_GATE[mode]).toBeDefined();
  });
});

/* ── THE DECODER (ADR-0205 §1) ───────────────────────────────────────────────────────────────
   The trap fails SILENTLY: decoded at 5, a Valhalla shape is a well-formed pair of numbers ten
   times off. So these assert REAL COORDINATES rather than a round-trip — a round-trip through
   an encoder passes at either precision and would prove nothing. The fixture is the Asakusa
   walk ADR-0205 §1 measured: its first point is the `(35.714757, 139.796481)` whose misread is
   the `(357.14757, 1397.96481)` the ADR quotes. */
describe('decodePolyline', () => {
  const ASAKUSA_SHAPE = 'ikzbcAa_osiG`m@yoDvrAk|DrhBgrE';

  it('decodes a Valhalla shape to real ground at precision 6', () => {
    expect(decodePolyline(ASAKUSA_SHAPE, POLYLINE_PRECISION.VALHALLA)).toEqual([
      { lat: 35.714757, lng: 139.796481 },
      { lat: 35.71402, lng: 139.79931 },
      { lat: 35.71268, lng: 139.80234 },
      { lat: 35.71099, lng: 139.80572 },
    ]);
  });

  it('decodes the SAME shape at precision 5 to the ten-times-off pair the ADR quotes', () => {
    // Pinned deliberately: this is the wrong answer, asserted so that anyone who "tidies" the
    // precision into a default sees which bug they have reintroduced. No error, no exception —
    // a plausible number and a line drawn nowhere.
    expect(decodePolyline(ASAKUSA_SHAPE, POLYLINE_PRECISION.GOOGLE)[0]).toEqual({
      lat: 357.14757,
      lng: 1397.96481,
    });
  });

  it('reads the precision off a shape that carries it', () => {
    expect(
      decodeShape({ encoded: ASAKUSA_SHAPE, precision: POLYLINE_PRECISION.VALHALLA })[0],
    ).toEqual({ lat: 35.714757, lng: 139.796481 });
  });

  it('answers nothing for a shape it cannot finish, rather than a line to nowhere', () => {
    expect(decodePolyline('', POLYLINE_PRECISION.VALHALLA)).toEqual([]);
    // Truncated mid-coordinate: a latitude with no longitude after it.
    expect(decodePolyline('ikzbcA', POLYLINE_PRECISION.VALHALLA)).toEqual([]);
    // A character below the encoding's own offset is not a chunk at all.
    expect(decodePolyline('!!', POLYLINE_PRECISION.VALHALLA)).toEqual([]);
  });
});

/* ── THE CACHE KEY (ADR-0205 §4) ─────────────────────────────────────────────────────────── */
describe('routeLegKey', () => {
  const sensoji: LatLng = { lat: 35.714757, lng: 139.796481 };
  const skytree: LatLng = { lat: 35.71099, lng: 139.80572 };

  it('is directional, because A→B and B→A are different answers', () => {
    expect(routeLegKey(sensoji, skytree, TRAVEL_MODE.DRIVING)).not.toEqual(
      routeLegKey(skytree, sensoji, TRAVEL_MODE.DRIVING),
    );
  });

  it('separates modes', () => {
    expect(routeLegKey(sensoji, skytree, TRAVEL_MODE.WALKING)).not.toEqual(
      routeLegKey(sensoji, skytree, TRAVEL_MODE.DRIVING),
    );
  });

  it('snaps float noise onto the same key, and a real metre onto a different one', () => {
    const noisy = { lat: sensoji.lat + 1e-9, lng: sensoji.lng - 1e-9 };
    expect(routeLegKey(noisy, skytree, TRAVEL_MODE.WALKING)).toEqual(
      routeLegKey(sensoji, skytree, TRAVEL_MODE.WALKING),
    );
    const metreAway = { lat: sensoji.lat + 0.0001, lng: sensoji.lng };
    expect(routeLegKey(metreAway, skytree, TRAVEL_MODE.WALKING)).not.toEqual(
      routeLegKey(sensoji, skytree, TRAVEL_MODE.WALKING),
    );
  });
});

/* ── THE GATE (ADR-0205 §3, as amended by `TRAVEL_GATE`) ─────────────────────────────────────
   Every boundary is derived from the constants rather than written as a literal, so raising a
   ceiling cannot leave a case passing while testing nothing. */
describe('the routing gate', () => {
  /** A point `metres` due north. Along a meridian the haversine is exactly `R · dLat`, which is
   *  what makes a ceiling testable to the metre without a fixture. */
  const northOf = (at: LatLng, metres: number): LatLng => ({
    lat: at.lat + (metres / EARTH_RADIUS_M) * (180 / Math.PI),
    lng: at.lng,
  });
  const tokyo: LatLng = { lat: 35.6812, lng: 139.7671 };
  const kyoto: LatLng = { lat: 35.0116, lng: 135.7681 };

  const clustersOf = (...points: LatLng[]) => clusterLatLngs(points);

  it('admits walking and cycling inside one cluster and refuses them across two', () => {
    const near = northOf(tokyo, 3_000);
    expect(admittedTravelModes(tokyo, near, clustersOf(tokyo, near))).toEqual([
      TRAVEL_MODE.WALKING,
      TRAVEL_MODE.DRIVING,
      TRAVEL_MODE.CYCLING,
    ]);
    // Tokyo→Kyoto is 457km: two clusters, and only driving crosses them. This is the car-hire
    // trip (ADR-0162) working rather than every leg of the ring road reading as unavailable.
    expect(haversineMeters(tokyo, kyoto)).toBeGreaterThan(TRAVEL_GATE.cycling.maxMeters);
    expect(admittedTravelModes(tokyo, kyoto, clustersOf(tokyo, kyoto))).toEqual([
      TRAVEL_MODE.DRIVING,
    ]);
  });

  it('refuses a walk that is merely long even when the whole chain is ONE cluster', () => {
    // The amendment's case. Single-link clustering keeps a chain of stops 35km apart together on
    // purpose, so a ring road is one area — and "same cluster only" alone would admit a 175km
    // walk that the provider would happily answer as a forty-hour journey.
    const chain = [tokyo];
    for (let i = 0; i < 5; i++) chain.push(northOf(chain[i]!, 35_000));
    const clusters = clusterLatLngs(chain);
    expect(clusters).toHaveLength(1);
    const [first, last] = [chain[0]!, chain[chain.length - 1]!];
    expect(admitsTravelMode(TRAVEL_MODE.WALKING, first, last, clusters)).toBe(false);
    expect(admitsTravelMode(TRAVEL_MODE.DRIVING, first, last, clusters)).toBe(true);
  });

  it('holds each mode to its own ceiling', () => {
    // ±1m either side of every ceiling. The boundary itself is float-bound through a haversine,
    // so it is bracketed rather than asserted at the exact metre.
    for (const mode of TRAVEL_MODES) {
      const { maxMeters } = TRAVEL_GATE[mode];
      const under = northOf(tokyo, maxMeters - 1);
      const over = northOf(tokyo, maxMeters + 1);
      // Clustered together so the cluster half of the rule can never be what refuses `under`.
      expect(admitsTravelMode(mode, tokyo, under, [[tokyo, under]])).toBe(true);
      expect(admitsTravelMode(mode, tokyo, over, [[tokyo, over]])).toBe(false);
    }
  });

  it('refuses everything for a pair that is really a flight', () => {
    const paris: LatLng = { lat: 48.8566, lng: 2.3522 };
    expect(admittedTravelModes(tokyo, paris, clustersOf(tokyo, paris))).toEqual([]);
  });

  it('treats a point in no cluster as out of cluster, never as an error', () => {
    const near = northOf(tokyo, 3_000);
    // Clusters built from somewhere else entirely — the pair is under every ceiling, so driving
    // still answers and only the cluster-bound modes fall back to the crow-flies chip.
    expect(admittedTravelModes(tokyo, near, clustersOf(kyoto))).toEqual([TRAVEL_MODE.DRIVING]);
  });

  it('refuses a coordinate that is not a number', () => {
    const nowhere: LatLng = { lat: Number.NaN, lng: 139.7671 };
    expect(admittedTravelModes(tokyo, nowhere, clustersOf(tokyo, nowhere))).toEqual([]);
  });

  it('answers a day as consecutive legs, each with its own admitted set', () => {
    const near = northOf(tokyo, 3_000);
    const legs = routableLegs([tokyo, near, kyoto], clustersOf(tokyo, near, kyoto));
    expect(legs.map((leg) => [leg.fromIndex, leg.toIndex])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(legs[0]!.modes).toContain(TRAVEL_MODE.WALKING);
    expect(legs[1]!.modes).toEqual([TRAVEL_MODE.DRIVING]);
  });

  it('has no legs to answer for a single stop', () => {
    expect(routableLegs([tokyo], clustersOf(tokyo))).toEqual([]);
  });
});

/* ── THE BATCH (ADR-0205 §6, §Y2) ────────────────────────────────────────────────────────── */
describe('the batch request', () => {
  const stops = [
    { lat: 35.714757, lng: 139.796481 },
    { lat: 35.71099, lng: 139.80572 },
  ];

  it('carries a SET of modes, because a switch must not cost a round-trip', () => {
    const parsed = routeBatchRequestSchema.parse({ stops, modes: TRAVEL_MODES });
    expect(parsed.modes).toHaveLength(TRAVEL_MODES.length);
    expect(parsed.withShapes).toBeUndefined();
  });

  it('refuses a request with nothing to route and one that is unbounded', () => {
    expect(() =>
      routeBatchRequestSchema.parse({ stops: [stops[0]], modes: TRAVEL_MODES }),
    ).toThrow();
    expect(() => routeBatchRequestSchema.parse({ stops, modes: [] })).toThrow();
    const tooMany = Array.from({ length: ROUTE_BATCH_MAX_STOPS + 1 }, () => stops[0]!);
    expect(() => routeBatchRequestSchema.parse({ stops: tooMany, modes: TRAVEL_MODES })).toThrow();
  });
});

describe('travelEstimateFor', () => {
  const leg: RoutedLeg = {
    fromIndex: 0,
    toIndex: 1,
    estimates: [{ mode: TRAVEL_MODE.WALKING, durationSeconds: 1_268, distanceMeters: 1_600 }],
    refusedModes: [TRAVEL_MODE.CYCLING],
    pendingModes: [TRAVEL_MODE.DRIVING],
  };

  it('reads a held mode without a fetch, and answers nothing for one it does not hold', () => {
    expect(travelEstimateFor(leg, TRAVEL_MODE.WALKING)?.durationSeconds).toBe(1_268);
    // A refused mode and a pending one are both "nothing to switch to" — the difference is the
    // client's to act on, and the user sees the crow-flies chip either way (ADR-0206 §D4).
    expect(travelEstimateFor(leg, TRAVEL_MODE.CYCLING)).toBeUndefined();
    expect(travelEstimateFor(leg, TRAVEL_MODE.DRIVING)).toBeUndefined();
  });
});
