// **What keeps one long leg from taking a whole day's matrix down with it** (ADR-0205 §Z4/§Z9).
//
// Every case below uses the dev seed's own coordinates, because M1b made those a contract rather
// than a side effect: `seed.mjs` carries two comment tables naming which gate path each pair is
// the fixture for, and a spec that invents its own coordinates is testing a different day than
// the one the app will actually be asked about.
import { describe, expect, it } from 'vitest';
import { TRAVEL_GATE, haversineMeters, type LatLng } from '@waypoint/shared';
import { matrixBatchesFor } from './matrix-batches';

/** The Tokyo walkable day, exactly as `PLACES` and the day's `sortOrder` give it — including the
 *  two repeats of Shinjuku, which are four events sharing one place and not a seed bug. */
const TOKYO: LatLng[] = [
  { lat: 35.7107, lng: 139.7975 }, // Asakusa
  { lat: 35.6654, lng: 139.7707 }, // Tsukiji
  { lat: 35.7148, lng: 139.7967 }, // Senso-ji
  { lat: 35.6896, lng: 139.7006 }, // Shinjuku
  { lat: 35.6939, lng: 139.7048 }, // Golden Gai
  { lat: 35.6896, lng: 139.7006 }, // Shinjuku again
];

/** The Iceland ring road's four stops in trip order, which is the fixture the driving ceiling was
 *  argued against by name (ADR-0205 §Z9). */
const ICELAND: LatLng[] = [
  { lat: 63.8804, lng: -22.4495 }, // Blue Lagoon
  { lat: 64.1466, lng: -21.9426 }, // Reykjavík
  { lat: 63.4187, lng: -19.006 }, // Vík
  { lat: 64.2539, lng: -15.2082 }, // Höfn
];

describe('matrixBatchesFor', () => {
  it('merges a whole walkable day into ONE request', () => {
    // Five consecutive legs, all inside walking's 15 km, and every cross pair inside it too — so
    // the day costs one upstream call and the other 25 cells are free (ADR-0205 §Z4).
    const batches = matrixBatchesFor(TOKYO, [0, 1, 2, 3, 4], 'walking');
    expect(batches).toEqual([{ stopIndexes: [0, 1, 2, 3, 4, 5] }]);
  });

  it('splits a run the moment a CROSS pair would exceed the ceiling', () => {
    // The pair that proves the rule is not about consecutive legs. Reykjavík→Vík (165 km) and
    // Vík→Höfn (208 km) are each admitted, but Reykjavík→Höfn is 326 km — over driving's 300 km —
    // and `sources_to_targets` answers EVERY pair among the points it is sent. Merged, that one
    // cell is a `400` and both good legs are lost with it.
    expect(haversineMeters(ICELAND[1]!, ICELAND[3]!)).toBeGreaterThan(
      TRAVEL_GATE.driving.maxMeters,
    );

    const batches = matrixBatchesFor(ICELAND, [1, 2], 'driving');
    expect(batches).toEqual([{ stopIndexes: [1, 2] }, { stopIndexes: [2, 3] }]);
  });

  it('sends an isolated leg in its own request — ADR-0205 §Z9 point 1', () => {
    // Non-adjacent pending legs never share a request, whatever their distance: there is no run
    // to merge. This is the shape §Z9 names as the one cheap way to move the driving limit — a
    // refusal costs only the pair it was asked about.
    const batches = matrixBatchesFor(ICELAND, [0, 2], 'driving');
    expect(batches).toEqual([{ stopIndexes: [0, 1] }, { stopIndexes: [2, 3] }]);
  });

  it('never emits a request carrying a pair the mode would refuse on distance', () => {
    // The invariant, stated over the whole seed at once rather than per case: whatever the input,
    // every pair inside every emitted request is under the mode's ceiling. This is the property
    // that makes the `400` unreachable.
    for (const [stops, legs] of [
      [TOKYO, [0, 1, 2, 3, 4]],
      [ICELAND, [0, 1, 2]],
    ] as const) {
      for (const mode of ['walking', 'driving', 'cycling'] as const) {
        for (const { stopIndexes } of matrixBatchesFor(stops, legs, mode)) {
          for (const a of stopIndexes) {
            for (const b of stopIndexes) {
              expect(haversineMeters(stops[a]!, stops[b]!)).toBeLessThanOrEqual(
                TRAVEL_GATE[mode].maxMeters,
              );
            }
          }
        }
      }
    }
  });

  it('carries at least two stops in every request, and none at all for no legs', () => {
    expect(matrixBatchesFor(TOKYO, [], 'walking')).toEqual([]);
    for (const batch of matrixBatchesFor(TOKYO, [0, 2, 4], 'walking')) {
      expect(batch.stopIndexes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('is order-independent — the caller may hand pending legs in any order', () => {
    expect(matrixBatchesFor(TOKYO, [4, 0, 2, 1, 3], 'walking')).toEqual(
      matrixBatchesFor(TOKYO, [0, 1, 2, 3, 4], 'walking'),
    );
  });
});
