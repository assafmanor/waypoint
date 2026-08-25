// Where a route comes from, as shapes and pure arithmetic (ADR-0205). The companion half —
// what a travel time SAYS — is `travel-time.ts` (ADR-0206), and the split is the ADRs' own.
//
// Everything here runs before the network or after it, never during: the gate decides what may
// be asked (§3), the shapes decide what an answer looks like (§4/§6), and the decoder turns a
// provider's geometry into coordinates the renderer already draws (§1). No provider vocabulary
// leaks in — Valhalla's costing names, its error codes and its wire format live behind
// ADR-0205 §2's port, in `backend/src/routing/`.
import { z } from 'zod';
import { TRAVEL_MODES } from './constants';
import { travelModeSchema, type TravelMode } from './entities';
import { haversineMeters, latLngSchema, type LatLng } from './geo';

/* ── THE GEOMETRY (ADR-0205 §1) ──────────────────────────────────────────────────────────── */

/**
 * **The precisions a polyline can be written at, and the trap is that both are valid.**
 *
 * Valhalla encodes at **6**; Google, OSRM and every copy-pasted decoder assume **5**. Decoded at
 * the wrong one there is no error and no exception — the Tokyo walk measured for ADR-0205 comes
 * back as `(357.14757, 1397.96481)`, a well-formed pair of numbers ten times off, and the line is
 * drawn nowhere. Which is why the number is never a default anywhere in this file.
 */
export const POLYLINE_PRECISION = {
  /** The provider ADR-0205 §2 adopts. */
  VALHALLA: 6,
  /** Google, OSRM — and **Geoapify**, which §2 names as the paid-tier fallback behind the same
   *  port. That is what makes carrying the precision (below) concrete rather than defensive:
   *  the switch §Y1 keeps cheap is exactly the switch that changes this number. */
  GOOGLE: 5,
} as const;

/**
 * **An encoded polyline and the precision it was written at, in one object.**
 *
 * The two travel together and cannot be separated, which is the whole point: a bare string plus
 * a decoder that assumes a precision is the failure above, and no runtime check can catch it
 * because the wrong answer is well-formed. Carried rather than assumed, a provider swap is a
 * different number in a stored record instead of every drawn line silently moving off the map.
 */
export const encodedShapeSchema = z.object({
  encoded: z.string(),
  precision: z.number().int().positive(),
});
export type EncodedShape = z.infer<typeof encodedShapeSchema>;

const ASCII_OFFSET = 63;
const CHUNK_BITS = 5;
const CONTINUATION_BIT = 0x20;
const CHUNK_MASK = 0x1f;

/**
 * **The encoded-polyline algorithm, with precision as an argument and no default.**
 *
 * A malformed or truncated string yields `[]` rather than the coordinates that did parse: a
 * partial line is a line drawn to somewhere the route does not go, and ADR-0206 §D4 makes
 * "no line" free — the dashed connector stands and nobody sees an error.
 *
 * **There is deliberately no encoder here.** The one test that would prove this function wrong
 * is a decoded coordinate asserted against a real place; a round-trip through an encoder passes
 * at the wrong precision and would hide exactly the bug ADR-0205 §1 wrote itself around.
 */
export function decodePolyline(encoded: string, precision: number): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const nextDelta = (): number | null => {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - ASCII_OFFSET;
      if (byte < 0) return null;
      result |= (byte & CHUNK_MASK) << shift;
      shift += CHUNK_BITS;
    } while (byte >= CONTINUATION_BIT);
    // Zigzag: the low bit carries the sign, so an odd value is a negative delta.
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = nextDelta();
    const dLng = nextDelta();
    if (dLat === null || dLng === null) return [];
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** The coordinates of a shape that carries its own precision — the call the renderer makes, and
 *  the reason nothing outside this file has to know a precision at all. */
export function decodeShape(shape: EncodedShape): LatLng[] {
  return decodePolyline(shape.encoded, shape.precision);
}

/* ── WHAT AN ANSWER IS (ADR-0205 §4, §6) ─────────────────────────────────────────────────── */

/** **What one surface reads for one leg in one mode** — the shape the day, the hero and the map
 *  all import (ADR-0206 §V1.1–1.5). Seconds and metres, never a formatted string: the ladder
 *  that rounds them and the words around them are the frontend's (§D3, and this package's
 *  "no UI copy" rule). */
export const travelEstimateSchema = z.object({
  mode: travelModeSchema,
  durationSeconds: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  /** **Optional because the matrix has no geometry.** `sources_to_targets` answers a whole day's
   *  durations in one ~1 s call and returns no shape at all; a drawable line is a second call
   *  per leg. So a duration is nearly always cheaper than a line, ADR-0206 §D8 draws at most one
   *  line anyway, and `routeBatchRequest.withShapes` is how a caller says it wants one. */
  shape: encodedShapeSchema.optional(),
});
export type TravelEstimate = z.infer<typeof travelEstimateSchema>;

/** **One cached answer from outside** (ADR-0205 §4) — an estimate plus where it came from and
 *  when. The row `RouteLeg` in Prisma mirrors this; the coordinates are the key (never a
 *  `placeId`, because a `Place` is trip-scoped and would never hit across trips), and nothing a
 *  person authored lives here, which is what licenses evicting it freely.
 *
 *  `computedAt` is provenance, **not an expiry**: a walking route between two fixed points is
 *  invalidated by an OSM refresh and by nothing else, so there is no TTL to compare it against. */
export const routeLegSchema = travelEstimateSchema.extend({
  from: latLngSchema,
  to: latLngSchema,
  provider: z.string(),
  computedAt: z.string(),
});
export type RouteLeg = z.infer<typeof routeLegSchema>;

/** **How precisely a coordinate is snapped before it becomes a cache key** — five places, ~1 m,
 *  the same rounding `map-region.ts` applies for the same reason: float noise must not invalidate
 *  an entry describing identical ground.
 *
 *  **Measured and confirmed unchanged (ADR-0205 §Z1).** Coarsening was the wrong instrument, not
 *  merely the wrong value: 4 and 3 decimals buy *zero* extra hits (32/40 same-place pairs at all
 *  three, the distribution being bimodal with an empty middle), and Valhalla's own road-graph snap
 *  already collapses everything within ~10 m. If a hand-dropped pin ever has to meet the same place
 *  picked from search, the instrument is a ~10 m proximity lookup — never a coarser grid. */
export const ROUTE_COORD_DECIMALS = 5;

const coordKey = (at: LatLng) =>
  `${at.lat.toFixed(ROUTE_COORD_DECIMALS)},${at.lng.toFixed(ROUTE_COORD_DECIMALS)}`;

/**
 * **The cache key for one leg**, and it is **directional on purpose**: one-way streets, turn
 * restrictions and toll geometry make A→B and B→A different answers, so canonicalising the pair
 * would return a route nobody can drive.
 *
 * One spelling of this, here, because the server writes it and the client's own Dexie table reads
 * it (ADR-0205 §7) — two spellings is a client that can never hit a row the server stored.
 */
export function routeLegKey(from: LatLng, to: LatLng, mode: TravelMode): string {
  return `${mode}:${coordKey(from)}>${coordKey(to)}`;
}

/* ── THE GATE (ADR-0205 §3) ──────────────────────────────────────────────────────────────── */

/** What has to be true of a pair before a mode may be asked about it at all. */
export interface TravelGateRule {
  /** Whether the pair must sit inside ONE of ADR-0186 §4's download clusters. False for driving:
   *  a road trip crosses clusters by definition, and Reykjavík→Vík is what a road trip IS.
   *
   *  **Inert since the ceilings were measured, and kept deliberately (ADR-0205 §Z2).** Every
   *  `maxMeters` below now sits under ADR-0186 §4's 40 km link radius, and single-link clustering
   *  puts any two points inside that radius in one area by direct link — verified over 2,500+
   *  random global pairs at ≤20 km, every one co-clusters. So this flag can no longer *reject*
   *  anything; the one outcome it can still change is the false negative §Z2 describes (a point
   *  missing from the cluster input), which costs a walking estimate and never an error. It looked
   *  load-bearing only while the ceilings were M2's placeholders, above the link radius. */
  sameClusterOnly: boolean;
  /** The distance past which we never call, whatever the clusters say. Crow-flies, because the
   *  gate runs before the network and a road distance is what the network would answer. */
  maxMeters: number;
}

/**
 * **The gate, one rule per mode** (ADR-0205 §3). A record rather than a `switch`, so a fourth
 * mode does not compile until somebody has decided what it admits (ADR-0094/0095, and this
 * package's `Record<EnumType, T>` convention).
 *
 * **Amends ADR-0205 §3: a cluster is not a ceiling, so walking and cycling need both.** §3 reads
 * as "same cluster only" for those two, and single-link clustering at `MAP_AREA_LINK_RADIUS_M`
 * (40 km) chains a coastline into ONE area on purpose — so a ring road whose stops are each under
 * 40 km apart is one cluster, and "same cluster" alone would happily admit a 175 km walk. Under
 * the provider's own 200 km pedestrian refusal, so it would even answer: a forty-hour walk,
 * rendered as a travel time. §3's own rule 3 is what forbids that, and a per-mode ceiling is
 * where it lives.
 *
 * **Every number below is M1's, measured against real trips (ADR-0205 §Z2)** — they replaced M2's
 * deliberately-absurd placeholders (25 km / 800 km / 100 km) on 2026-08-25. Do not tune them from
 * taste, and do not let a caller pass its own — one gate, so Plan mode and Trip mode cannot
 * disagree about what is routable.
 *
 * A crow-flies gate is fuzzy at its edge: road/crow is 1.08–1.32 (median 1.16) ferry-free, so a
 * 60-minute walk can be rejected while a 67-minute one is admitted. That is the price of checking
 * before the network, and ADR-0206 §D4's chip covers the rejects. Do not "fix" it by routing first.
 */
export const TRAVEL_GATE = {
  /** Admits 9 of 16 measured within-cluster pairs; **worst walk admitted 67 min**, first genuinely
   *  absurd reject 127 min (Senso-ji → Shinjuku, 8.58 km, a real seed pair). Walking measures
   *  4.9 km/h on road (ADR-0205 §Z2), which with §Z7's ratios makes ~4 km ≈ an hour on foot. */
  walking: { sameClusterOnly: true, maxMeters: 5_000 },
  /** **The provider's own `auto` limit is 400 km of _path_**, server-stated (§Z4), and measured
   *  `auto` road/crow is 1.23–1.34 — so 400 km road ÷ 1.34 ≈ 298 km crow. Admits every real
   *  Iceland ring-road leg (longest 209.7 km crow) and rejects only Tokyo→Kyoto and the flight,
   *  neither of which this provider can answer anyway (ADR-0205 §Z2). */
  driving: { sameClusterOnly: false, maxMeters: 300_000 },
  /** Admits 13 of 16; **worst ride admitted 91 min** (19.7 km), rejects 94, 145, 154 and
   *  192-minute rides. Cycling runs ~3.5× walking on the same pairs, which is why it gets its own
   *  number rather than sharing walking's (ADR-0205 §Z2). */
  cycling: { sameClusterOnly: true, maxMeters: 20_000 },
} as const satisfies Record<TravelMode, TravelGateRule>;

/**
 * **The floor the gate had no equivalent of** (ADR-0205 §Z2, new in M1's measurements).
 *
 * Two of the seed's nine day-adjacent pairs are 0.00 km — four events share one place, and
 * Place-lite granularity (ADR-0147) makes that ordinary rather than a seed bug. Measured at
 * separations of 0/1/5/10 m the provider answers **0 s, 0 s, 2 s, 5 s**; at 25 m it jumps to 65 s.
 * Below 10 m there is no answer worth a matrix cell or a cache row, so the pair reads as ADR-0206
 * §D4's absence — which is exactly right: these two stops are the same place.
 */
export const ROUTE_MIN_CROW_M = 10;

/**
 * **Are these two points in one of the trip's download clusters?**
 *
 * `clusters` is `clusterLatLngs`' own output — ADR-0186 §4's clustering, reused rather than
 * re-derived, which is the whole of ADR-0205 §3's "one derivation with two consumers". Pass the
 * clusters of every coordinate the TRIP holds, not just the day's: single-link membership is
 * decided by the chain, so a stop that links two others is what makes them one area.
 *
 * Membership is matched on the **rounded** coordinate — the same snap the cache key uses, and for
 * the same reason: the day's stop and the trip's point are the same place and must not miss each
 * other over float noise. A point in no cluster at all answers `false`, which costs a walking
 * estimate and never an error (ADR-0206 §D4).
 */
export function sameTravelCluster(
  from: LatLng,
  to: LatLng,
  clusters: readonly (readonly LatLng[])[],
): boolean {
  const fromKey = coordKey(from);
  const toKey = coordKey(to);
  return clusters.some((cluster) => {
    let hasFrom = false;
    let hasTo = false;
    for (const point of cluster) {
      const key = coordKey(point);
      if (key === fromKey) hasFrom = true;
      if (key === toKey) hasTo = true;
      if (hasFrom && hasTo) return true;
    }
    return false;
  });
}

/** Whether one mode may be asked about one pair. Runs on `haversineMeters` **before the
 *  network**, because one out-of-range pair returns HTTP 400 for an entire Valhalla matrix
 *  (ADR-0205 §2, §Z4) — a round-trip spent learning what arithmetic knows for free. Bounded at
 *  both ends: `ROUTE_MIN_CROW_M` below, the mode's own ceiling above. */
export function admitsTravelMode(
  mode: TravelMode,
  from: LatLng,
  to: LatLng,
  clusters: readonly (readonly LatLng[])[],
): boolean {
  const rule = TRAVEL_GATE[mode];
  const metres = haversineMeters(from, to);
  if (!Number.isFinite(metres) || metres < ROUTE_MIN_CROW_M || metres > rule.maxMeters)
    return false;
  return rule.sameClusterOnly ? sameTravelCluster(from, to, clusters) : true;
}

/** **Which modes this pair can be asked about at all**, in `TRAVEL_MODES` order. An empty answer
 *  is a legitimate one and not a failure: Tokyo→Paris is a flight, and ADR-0011 already says
 *  nobody is estimating a hard commitment. */
export function admittedTravelModes(
  from: LatLng,
  to: LatLng,
  clusters: readonly (readonly LatLng[])[],
  modes: readonly TravelMode[] = TRAVEL_MODES,
): TravelMode[] {
  return modes.filter((mode) => admitsTravelMode(mode, from, to, clusters));
}

/** One consecutive pair of a day's ordered stops, and what may be asked about it. */
export interface RoutableLeg {
  fromIndex: number;
  toIndex: number;
  modes: TravelMode[];
}

/**
 * **The pre-filter, over a whole day at once** (ADR-0205 §3, §6). The endpoint is batch-shaped
 * because the matrix is, so the gate is too — and it runs server-side, because §6 is explicit
 * that the pre-filter must not be a client concern.
 *
 * Consecutive pairs only. A day is a sequence and every read in ADR-0206 §V1 is about the leg
 * between two adjacent stops; the provider's matrix answering all 25 pairs of a five-stop day is
 * an efficiency of the call, not a shape of the question.
 */
export function routableLegs(
  stops: readonly LatLng[],
  clusters: readonly (readonly LatLng[])[],
  modes: readonly TravelMode[] = TRAVEL_MODES,
): RoutableLeg[] {
  const legs: RoutableLeg[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    legs.push({
      fromIndex: i,
      toIndex: i + 1,
      modes: admittedTravelModes(stops[i]!, stops[i + 1]!, clusters, modes),
    });
  }
  return legs;
}

/* ── THE BATCH (ADR-0205 §6, §Y2) ────────────────────────────────────────────────────────── */

/** A bound on what one request may ask about, so a broken or hostile client cannot ask for a
 *  matrix of thousands of pairs. Well above any real day; **provisional, and M1 measures what a
 *  day actually holds.** */
export const ROUTE_BATCH_MAX_STOPS = 24;

/** **One request carries the day's ordered stops and every mode wanted for them** (ADR-0205 §6,
 *  amended by §Y2). A per-leg endpoint would turn one 1-second call into five; a per-MODE
 *  endpoint would put a round-trip behind every switch of the mode control, which ADR-0206 §Z2
 *  forbids by name. So: one request per day, not one per day per mode. */
export const routeBatchRequestSchema = z.object({
  stops: z.array(latLngSchema).min(2).max(ROUTE_BATCH_MAX_STOPS),
  modes: z.array(travelModeSchema).min(1),
  /** **Compute the geometry too**, for the legs that do not already have it. Off by default: a
   *  day's durations are one matrix call and a line is a call per leg (see `travelEstimate.shape`),
   *  and ADR-0206 §D8 draws one line at a time. A shape we already hold is returned either way —
   *  stripping a cached field to honour a flag would cost a second request to get it back. */
  withShapes: z.boolean().optional(),
});
export type RouteBatchRequest = z.infer<typeof routeBatchRequestSchema>;

/**
 * **What came back for one leg, in three buckets that together cover every mode asked for.**
 *
 * The split is what lets a client tell "this will never have an answer" from "this is still
 * warming" — a distinction the USER must never see (ADR-0206 §D4: absent is absent, never an
 * error) but a client that cannot make it either polls forever for a refused pair or gives up on
 * a pending one.
 */
export const routedLegSchema = z.object({
  fromIndex: z.number().int().nonnegative(),
  toIndex: z.number().int().nonnegative(),
  /** Every mode we can answer now — which is what makes ADR-0206 §Z2's instant switch a read
   *  from what the client already holds rather than a fetch. */
  estimates: z.array(travelEstimateSchema),
  /** Refused by the gate (ADR-0205 §3). Never coming, whatever anyone waits for. */
  refusedModes: z.array(travelModeSchema),
  /** Admitted, not computed yet. `retryAfterSeconds` on the envelope says when to ask again. */
  pendingModes: z.array(travelModeSchema),
});
export type RoutedLeg = z.infer<typeof routedLegSchema>;

/** **The batch answer, which is allowed to be partial.** ADR-0187's flow exactly: a cold request
 *  returns what it has, plus how long to wait for the rest, and never holds a socket open while
 *  it warms. `retryAfterSeconds` is absent when there is nothing left to wait for. */
export const routeBatchSchema = z.object({
  legs: z.array(routedLegSchema),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
});
export type RouteBatch = z.infer<typeof routeBatchSchema>;

/** The estimate for one mode of one leg, or `undefined` when there is none — a refused mode, a
 *  pending one, or a leg nobody asked about. Every consumer of ADR-0206 §Z2's mode switch reads
 *  it through here, so "switching lands on the crow-flies chip" is one behaviour rather than
 *  three surfaces each deciding what an absent mode means. */
export function travelEstimateFor(leg: RoutedLeg, mode: TravelMode): TravelEstimate | undefined {
  return leg.estimates.find((estimate) => estimate.mode === mode);
}
