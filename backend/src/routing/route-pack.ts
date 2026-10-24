// **What an offline route pack covers** (ADR-0206 §V1.8) — the pure half, so the part that
// decides WHICH legs a trip would take on the plane is testable without a database, a provider
// or a trip.
//
// The shape of the question is ADR-0186 §4's, one level up: that decides which GROUND a trip
// downloads, this decides which LEGS. Both are answered from what the trip has committed to, and
// both are cheap for the same reason — the stops are known in advance.
//
// **Two decisions live here rather than in the service, because they are the whole of the file:**
//
//   - **A day is a SET of places, not an ordering.** The server does not re-derive the day
//     surface's row order (`lib/day-travel.ts` owns that, with the place-authority rule and the
//     transport inversion inside it) — a second answer to "which stop comes next" is exactly the
//     divergence rule 8 exists to prevent. So a day contributes every coordinate it touches and
//     the pack carries **every ordered pair among them**, which is a superset of whatever
//     adjacency the client derives.
//   - **Every ordered pair, and ADR-0205 §Z4 is the argument.** _"Cache every cell the matrix
//     returned, not just the consecutive pairs — the others are already paid for, so a reorder or
//     an inserted stop costs nothing later."_ On a device with no network that reasoning is
//     stronger, not weaker: a reorder mid-flight has nothing to re-ask.
import {
  ROUTE_BATCH_MAX_STOPS,
  ROUTE_COORD_DECIMALS,
  TRAVEL_MODES,
  admittedTravelModes,
  routeLegKey,
  type LatLng,
  type TravelMode,
} from '@waypoint/shared';

/**
 * **The ceiling on one pack**, and it is a pace rather than a silent cap: a trip past it keeps
 * the days it reached and the service logs what it dropped, because a truncated pack that says
 * nothing reads as "covered everything" when it did not.
 *
 * 4,000 legs is ~1.6 MB at §V1.8's ~410 bytes — under 8% of a city extract's 22.7 MB, which is
 * the budget this rides on (ADR-0186 §5). No real trip approaches it: a fortnight of six-stop
 * days is ~1,260.
 */
export const ROUTE_PACK_MAX_LEGS = 4_000;

/** One row of the trip's schedule, reduced to what a pack needs: the day(s) it occupies and the
 *  coordinates it puts on them. A booking's two endpoints both count — which end of a transport
 *  row a leg leaves from is the client's derivation to make (`endpointPlaceId`), and carrying
 *  both is how the pack covers either answer. */
export interface RoutePackRow {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The far end of a multi-day ambient span (ADR-0018), inclusive. */
  endDate?: string | null;
  points: readonly LatLng[];
}

/** The coordinate at the cache key's own snap, so a day cannot hold the same place twice under
 *  float noise — the identity `routeLegKey` will use anyway. */
const snap = (at: LatLng) =>
  `${at.lat.toFixed(ROUTE_COORD_DECIMALS)},${at.lng.toFixed(ROUTE_COORD_DECIMALS)}`;

function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let at = new Date(`${from}T00:00:00Z`); ; at = new Date(at.getTime() + 86_400_000)) {
    const iso = at.toISOString().slice(0, 10);
    dates.push(iso);
    if (iso >= to || dates.length > 366) break;
  }
  return dates;
}

/**
 * **The trip's days, each as its ordered, deduped stop list.**
 *
 * A multi-day span contributes its places to **every** date it covers, and first — that is the
 * bookend ADR-0206 §AD names: the stay you woke in is where the day's first leg leaves from, and
 * its own row sits days earlier.
 *
 * `rows` come in schedule order; the order is kept only because the warm pairs stops
 * consecutively, never because the pack depends on it.
 */
export function routePackDays(rows: readonly RoutePackRow[]): LatLng[][] {
  const spans = rows.filter((row) => row.endDate && row.endDate > row.date);
  const byDate = new Map<string, LatLng[]>();
  const seen = new Map<string, Set<string>>();

  const add = (date: string, points: readonly LatLng[]): void => {
    const stops = byDate.get(date) ?? [];
    const taken = seen.get(date) ?? new Set<string>();
    for (const point of points) {
      const id = snap(point);
      if (taken.has(id) || stops.length >= ROUTE_BATCH_MAX_STOPS) continue;
      taken.add(id);
      stops.push(point);
    }
    byDate.set(date, stops);
    seen.set(date, taken);
  };

  for (const row of rows) {
    for (const date of eachDate(row.date, row.endDate ?? row.date)) {
      // The span's own places first on every date it covers, then the day's rows.
      for (const span of spans) {
        if (span.date <= date && (span.endDate ?? span.date) >= date) add(date, span.points);
      }
      add(date, row.points);
    }
  }

  return [...byDate.values()].filter((stops) => stops.length > 1);
}

/**
 * **Every leg key the pack would carry** — each day's ordered pairs, in every mode the gate
 * admits, deduped across days (two days that share a pair share its row).
 *
 * The gate is `admittedTravelModes`, unchanged and not re-implemented: the pack must not contain
 * a key the endpoint would refuse to compute, or the client would hold a permanent hole it keeps
 * expecting to fill.
 */
export function routePackLegKeys(
  days: readonly (readonly LatLng[])[],
  clusters: readonly (readonly LatLng[])[],
  modes: readonly TravelMode[] = TRAVEL_MODES,
): string[] {
  const keys = new Set<string>();
  for (const stops of days) {
    for (const from of stops) {
      for (const to of stops) {
        if (snap(from) === snap(to)) continue;
        for (const mode of admittedTravelModes(from, to, clusters, modes)) {
          keys.add(routeLegKey(from, to, mode));
        }
      }
    }
  }
  return [...keys];
}
