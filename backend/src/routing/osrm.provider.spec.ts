// **The fallback provider's own translation layer** (ADR-0205 §Y5) — and it is worth a spec for
// the same reason `valhalla.provider.spec.ts` is: every way this file goes wrong produces a
// well-formed number pointing at the wrong place. A swapped `lon`/`lat`, a precision read as 6
// instead of 5, a metre read as a kilometre, a diagonal cell read as a real `0 s` leg — none of
// them throws, and each one draws a line somewhere nobody went.
//
// The URLs asserted here were verified against the live host on 2026-09-02 before this file
// existed: `routed-car/table/v1/driving/...` answered a 3×3 matrix, `routed-foot/route/v1/...`
// answered geometry, and `routed-bike` answered both.
import { describe, expect, it, vi } from 'vitest';
import { POLYLINE_PRECISION, type LatLng } from '@waypoint/shared';
import type { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { OsrmRouteProvider } from './osrm.provider';

const BASE = 'https://routing.openstreetmap.de';

const ARLOZOROV: LatLng = { lat: 32.0853, lng: 34.7818 };
const KNESSET: LatLng = { lat: 32.0723, lng: 34.8121 };

function fakeFetcher(answer: unknown) {
  const fetchJson = vi.fn(() => Promise.resolve(answer));
  return { fetcher: { fetchJson } as unknown as EnrichmentFetcher, fetchJson };
}

const urlOf = (fetchJson: ReturnType<typeof vi.fn>): string => String(fetchJson.mock.calls[0]![0]);

describe('OsrmRouteProvider', () => {
  it('asks the per-mode instance, with `driving` as the service on every one of them', async () => {
    // The profile is chosen by the INSTANCE; the segment after `/v1/` is OSRM's URL grammar and
    // is `driving` even for a walk. Substituting the mode there is a 400, and it is exactly the
    // plausible-looking edit somebody makes while tidying.
    for (const [mode, instance] of [
      ['driving', 'routed-car'],
      ['walking', 'routed-foot'],
      ['cycling', 'routed-bike'],
    ] as const) {
      const { fetcher, fetchJson } = fakeFetcher({ code: 'Ok', durations: [], distances: [] });
      await new OsrmRouteProvider(fetcher, BASE).matrix([ARLOZOROV, KNESSET], mode);
      expect(urlOf(fetchJson)).toContain(`/${instance}/table/v1/driving/`);
    }
  });

  it('sends lon,lat — not lat,lng — and asks for distances explicitly', async () => {
    // Reversed from every other coordinate in this app. And without `annotations` OSRM returns
    // durations only, which would store a leg with no distance and render `0 ק״מ`.
    const { fetcher, fetchJson } = fakeFetcher({ code: 'Ok', durations: [], distances: [] });
    await new OsrmRouteProvider(fetcher, BASE).matrix([ARLOZOROV, KNESSET], 'driving');
    const url = urlOf(fetchJson);
    expect(url).toContain('34.7818,32.0853;34.8121,32.0723');
    expect(url).toContain('annotations=duration,distance');
  });

  it('reads the two matrices into ordered pairs, and drops the diagonal', async () => {
    // The live 3×3 from 2026-09-02, trimmed to 2×2. The diagonal is a real `0` in OSRM's answer
    // and must never become a leg — `RouteProvider` forbids rendering "no route" as "you are
    // already there", and `0 s` between two different places is the same lie.
    const { fetcher } = fakeFetcher({
      code: 'Ok',
      durations: [
        [0, 462.7],
        [491.9, 0],
      ],
      distances: [
        [0, 4567.2],
        [3733.6, 0],
      ],
    });
    const { cells } = await new OsrmRouteProvider(fetcher, BASE).matrix(
      [ARLOZOROV, KNESSET],
      'driving',
    );
    expect(cells).toEqual([
      { fromIndex: 0, toIndex: 1, durationSeconds: 462.7, distanceMeters: 4567.2 },
      { fromIndex: 1, toIndex: 0, durationSeconds: 491.9, distanceMeters: 3733.6 },
    ]);
  });

  it('drops an unreachable cell rather than zeroing it', async () => {
    const { fetcher } = fakeFetcher({
      code: 'Ok',
      durations: [
        [0, null],
        [491.9, 0],
      ],
      distances: [
        [0, null],
        [3733.6, 0],
      ],
    });
    const { cells } = await new OsrmRouteProvider(fetcher, BASE).matrix(
      [ARLOZOROV, KNESSET],
      'driving',
    );
    expect(cells).toEqual([
      { fromIndex: 1, toIndex: 0, durationSeconds: 491.9, distanceMeters: 3733.6 },
    ]);
  });

  it('answers nothing for a non-Ok code, which is an absence and not a throw', async () => {
    // `NoTable`/`NoSegment` is OSRM saying it cannot connect these points. Retrying changes
    // nothing, and a throw here would count against the breaker (§Y4) for a real answer.
    const { fetcher } = fakeFetcher({ code: 'NoSegment' });
    await expect(
      new OsrmRouteProvider(fetcher, BASE).matrix([ARLOZOROV, KNESSET], 'driving'),
    ).resolves.toMatchObject({ cells: [] });
  });

  it('carries precision 5 on a shape, because OSRM is not Valhalla', async () => {
    // ADR-0205 §1: decoded at 6 this line lands nowhere, with no error. The number travels with
    // the string, and this is the assertion that keeps it true across the two providers.
    const { fetcher, fetchJson } = fakeFetcher({
      code: 'Ok',
      routes: [{ duration: 2981, distance: 3712.3, geometry: 'ktybEiihsEBQ@GFe@b@qD' }],
    });
    const answer = await new OsrmRouteProvider(fetcher, BASE).shape(ARLOZOROV, KNESSET, 'walking');
    expect(answer).toMatchObject({
      durationSeconds: 2981,
      distanceMeters: 3712.3,
      shape: { encoded: 'ktybEiihsEBQ@GFe@b@qD', precision: POLYLINE_PRECISION.GOOGLE },
    });
    expect(answer!.shape.precision).not.toBe(POLYLINE_PRECISION.VALHALLA);
    expect(urlOf(fetchJson)).toContain('geometries=polyline');
  });

  it('answers null for a route it has no path for', async () => {
    const { fetcher } = fakeFetcher({ code: 'NoRoute' });
    await expect(
      new OsrmRouteProvider(fetcher, BASE).shape(ARLOZOROV, KNESSET, 'driving'),
    ).resolves.toBeNull();
  });

  it('states no vintage rather than inventing one, and says so on the answer itself', async () => {
    // `RouteLeg.tilesetAt` is what M12's eviction sweep runs on (§Z5). A guessed date would make
    // these rows look invalidatable on a tileset roll they were never part of.
    //
    // **It now rides on the answer** (§Y6). While the vintage was a port method the composition
    // answered it for both providers, so this `null` never reached the rows it was written for:
    // an OSRM estimate went into the table stamped with Valhalla's tileset date.
    const { fetcher } = fakeFetcher({ code: 'Ok', durations: [], distances: [] });
    const { attribution } = await new OsrmRouteProvider(fetcher, BASE).matrix(
      [ARLOZOROV, KNESSET],
      'driving',
    );
    expect(attribution).toEqual({ providerId: 'osrm/fossgis', tilesetAt: null });
  });

  it('does not double a slash when the configured origin carries a trailing one', async () => {
    const { fetcher, fetchJson } = fakeFetcher({ code: 'Ok', durations: [], distances: [] });
    await new OsrmRouteProvider(fetcher, `${BASE}/`).matrix([ARLOZOROV, KNESSET], 'driving');
    expect(urlOf(fetchJson)).toContain(`${BASE}/routed-car/`);
    expect(urlOf(fetchJson)).not.toContain('//routed-car');
  });
});
