// **How a day's pending legs are split into requests** — and this file is ADR-0205 §Z9's
// "isolate the long pairs", which §Z9 says is M4's shape rather than a number.
//
// The problem it solves is not efficiency. `sources_to_targets` answers **every** ordered pair
// among the points it is sent, so a request built from a day's stops carries pairs the gate never
// admitted — and §Z4 measured that ONE crow-flies pair over the mode's limit returns `400` and
// **kills the whole matrix**, every good leg in it included. A day of five walkable stops plus one
// long drive is not a day with one missing leg; it is a day with none.
//
// So the rule here is: **a request may only contain pairs the mode's ceiling admits.** Consecutive
// pending legs are merged into one request while every pair among the merged stops stays under the
// ceiling, and split into their own the moment one does not. Two consequences fall out of that one
// rule, and both are what §Z9 asked for:
//
//   - a long leg is sent **alone**, so a refusal costs only that pair and the rest of the day
//     still answers — which is the cheap way to route past the crow-flies proxy the ceiling is;
//   - every extra cell a merged request returns is **already paid for** (§Z4), so the caller
//     caches all of them and a reorder or an inserted stop costs nothing later.
import { TRAVEL_GATE, haversineMeters, type LatLng, type TravelMode } from '@waypoint/shared';

/** One upstream request: the stop indices it carries, in order. Never fewer than two. */
export interface MatrixBatch {
  /** Indices into the caller's `stops` array — kept as indices, not points, because the caller
   *  maps cells back onto its own legs and a duplicated coordinate (a day that returns to the
   *  same place) must not collapse two different stops into one. */
  stopIndexes: number[];
}

/**
 * Group `pendingLegs` (leg `i` is the pair `stops[i] → stops[i + 1]`) into requests.
 *
 * Callers pass legs the gate has already admitted. **A leg over the ceiling is dropped here
 * anyway**, and that belt-and-braces is deliberate: the property this file exists to guarantee —
 * that no emitted request contains a pair which would `400` — is worth having unconditionally
 * rather than only for callers who did their part. It costs one comparison, and it is what lets
 * the invariant be specced over any input rather than over well-behaved input.
 */
export function matrixBatchesFor(
  stops: readonly LatLng[],
  pendingLegs: readonly number[],
  mode: TravelMode,
): MatrixBatch[] {
  const ceiling = TRAVEL_GATE[mode].maxMeters;
  const batches: MatrixBatch[] = [];
  let current: number[] = [];

  const fits = (next: number): boolean =>
    current.every((index) => haversineMeters(stops[index]!, stops[next]!) <= ceiling);

  for (const leg of [...pendingLegs].sort((a, b) => a - b)) {
    if (haversineMeters(stops[leg]!, stops[leg + 1]!) > ceiling) continue;
    // Extend the run only when this leg starts where the last one ended AND adding its far stop
    // keeps every pair in the request under the ceiling. Either failure starts a new request.
    if (current.length > 0 && current[current.length - 1] === leg && fits(leg + 1)) {
      current.push(leg + 1);
      continue;
    }
    if (current.length > 0) batches.push({ stopIndexes: current });
    current = [leg, leg + 1];
  }
  if (current.length > 0) batches.push({ stopIndexes: current });

  return batches;
}
