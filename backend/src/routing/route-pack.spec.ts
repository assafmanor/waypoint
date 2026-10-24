// **What a pack covers**, asserted on the pure half (ADR-0206 §V1.8/§AO).
//
// The coordinates are the dev seed's, same as `routing.service.spec.ts` and for the same reason:
// M1b's comment tables in `seed.mjs` say which gate path each pair is the fixture for, so a spec
// that invented its own would be testing a different trip than the one that ships.
import { describe, expect, it } from 'vitest';
import { ROUTE_BATCH_MAX_STOPS, clusterLatLngs, routeLegKey } from '@waypoint/shared';
import { routePackDays, routePackLegKeys, type RoutePackRow } from './route-pack';

const ASAKUSA = { lat: 35.7107, lng: 139.7975 };
const TSUKIJI = { lat: 35.6654, lng: 139.7707 };
const SENSO = { lat: 35.7148, lng: 139.7967 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const HOTEL = { lat: 35.6938, lng: 139.7034 };
const HOFN = { lat: 64.2539, lng: -15.2082 };

const TOKYO = clusterLatLngs([ASAKUSA, TSUKIJI, SENSO, SHINJUKU, HOTEL]);

const row = (date: string, points: RoutePackRow['points'], endDate?: string): RoutePackRow => ({
  date,
  endDate: endDate ?? null,
  points,
});

describe('routePackDays', () => {
  it('buckets a trip into its days and drops a day with one stop', () => {
    const days = routePackDays([
      row('2026-09-01', [ASAKUSA]),
      row('2026-09-01', [SENSO]),
      row('2026-09-02', [SHINJUKU]),
    ]);
    expect(days).toEqual([[ASAKUSA, SENSO]]);
  });

  it('puts a multi-day stay first on every date it covers — the bookend you woke in', () => {
    const days = routePackDays([
      row('2026-09-01', [HOTEL], '2026-09-03'),
      row('2026-09-02', [SENSO]),
      row('2026-09-03', [TSUKIJI]),
    ]);
    expect(days).toEqual([
      [HOTEL, SENSO],
      [HOTEL, TSUKIJI],
    ]);
  });

  it('holds one stop per place however many rows name it', () => {
    const days = routePackDays([
      row('2026-09-01', [ASAKUSA]),
      row('2026-09-01', [ASAKUSA, SENSO]),
      row('2026-09-01', [{ lat: 35.710701, lng: 139.797501 }]),
    ]);
    // The third row is 15 cm away, which is under the cache key's own ~1 m snap.
    expect(days).toEqual([[ASAKUSA, SENSO]]);
  });

  it("caps one day at the batch endpoint's own stop ceiling", () => {
    const many = Array.from({ length: ROUTE_BATCH_MAX_STOPS + 6 }, (_, i) => ({
      lat: 35.7 + i / 1000,
      lng: 139.8,
    }));
    expect(routePackDays([row('2026-09-01', many)])[0]).toHaveLength(ROUTE_BATCH_MAX_STOPS);
  });
});

describe('routePackLegKeys', () => {
  it('carries every ordered pair of a day, in both directions', () => {
    const keys = routePackLegKeys([[ASAKUSA, SENSO]], TOKYO, ['walking']);
    expect(keys).toEqual(
      expect.arrayContaining([
        routeLegKey(ASAKUSA, SENSO, 'walking'),
        routeLegKey(SENSO, ASAKUSA, 'walking'),
      ]),
    );
    expect(keys).toHaveLength(2);
  });

  it('spells its keys with routeLegKey and nothing else', () => {
    // The trap M10's card names: a pack keyed any other way can never hit a row the server
    // stored, and the client's Dexie lookup would miss every entry silently.
    for (const key of routePackLegKeys([[ASAKUSA, TSUKIJI, SENSO]], TOKYO)) {
      expect(key).toMatch(
        /^(walking|driving|cycling):-?\d+\.\d{5},-?\d+\.\d{5}>-?\d+\.\d{5},-?\d+\.\d{5}$/,
      );
    }
  });

  it('never carries a key the gate would refuse', () => {
    // Tokyo → Höfn is a flight: over every ceiling, in no shared cluster.
    const clusters = clusterLatLngs([ASAKUSA, HOFN]);
    expect(routePackLegKeys([[ASAKUSA, HOFN]], clusters)).toEqual([]);
  });

  it('shares one key between two days that walk the same pair', () => {
    const keys = routePackLegKeys(
      [
        [ASAKUSA, SENSO],
        [SENSO, ASAKUSA],
      ],
      TOKYO,
      ['walking'],
    );
    expect(keys).toHaveLength(2);
  });
});
