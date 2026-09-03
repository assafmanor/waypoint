// **That a dead primary does not mean a dead feature** (ADR-0205 §Y5), and that the failover
// does not fire on an answer it dislikes.
//
// The second half is the one worth a spec. §Y4's defect was a caller treating "the provider is
// unhealthy" as "do not call" and thereby starving recovery; the mirror-image mistake here is
// treating "the provider answered nothing" as "the provider is down" and spending a second
// outbound seat, on every empty matrix, forever. Only a THROW means no answer.
import { describe, expect, it, vi } from 'vitest';
import type { LatLng } from '@waypoint/shared';
import { FailoverRouteProvider } from './failover.provider';
import { RouteOutOfRangeError, type RouteProvider } from './route-provider';

const A: LatLng = { lat: 32.0853, lng: 34.7818 };
const B: LatLng = { lat: 32.0723, lng: 34.8121 };

const CELL = { fromIndex: 0, toIndex: 1, durationSeconds: 462.7, distanceMeters: 4567.2 };

function provider(id: string, over: Partial<RouteProvider> = {}) {
  const base: RouteProvider = {
    id,
    matrix: vi.fn(() => Promise.resolve([CELL])),
    shape: vi.fn(() => Promise.resolve(null)),
    dataVersion: vi.fn(() => Promise.resolve(null)),
  };
  return { ...base, ...over };
}

const dead = (): Partial<RouteProvider> => ({
  matrix: vi.fn(() => Promise.reject(new Error('503 Service Unavailable'))),
  shape: vi.fn(() => Promise.reject(new Error('503 Service Unavailable'))),
});

describe('FailoverRouteProvider', () => {
  it('uses the primary and never touches the secondary while the primary answers', async () => {
    const primary = provider('valhalla/fossgis');
    const secondary = provider('osrm/fossgis');
    const cells = await new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving');
    expect(cells).toEqual([CELL]);
    expect(secondary.matrix).not.toHaveBeenCalled();
  });

  it('falls over to the secondary when the primary cannot answer at all', async () => {
    // The 2026-09-02 outage: `valhalla1` served 503 for the better part of a day.
    const primary = provider('valhalla/fossgis', dead());
    const secondary = provider('osrm/fossgis');
    const cells = await new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving');
    expect(cells).toEqual([CELL]);
    expect(secondary.matrix).toHaveBeenCalledOnce();
  });

  it('does NOT fail over on an empty matrix — that is an answer', async () => {
    // Otherwise every gate-admitted pair the provider cannot connect costs two outbound seats
    // instead of one, forever, and the politeness limiter paces one call a second.
    const primary = provider('valhalla/fossgis', { matrix: vi.fn(() => Promise.resolve([])) });
    const secondary = provider('osrm/fossgis');
    await expect(
      new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving'),
    ).resolves.toEqual([]);
    expect(secondary.matrix).not.toHaveBeenCalled();
  });

  it('does NOT fail over on a null shape — also an answer', async () => {
    const primary = provider('valhalla/fossgis');
    const secondary = provider('osrm/fossgis');
    await expect(
      new FailoverRouteProvider(primary, secondary).shape(A, B, 'driving'),
    ).resolves.toBeNull();
    expect(secondary.shape).not.toHaveBeenCalled();
  });

  it('does NOT fail over on a range refusal, and re-throws it for the service to read', async () => {
    // Terminal by construction (see `RouteProvider`), and `RoutingService.askProvider` reads it as
    // "the provider is ALIVE and this pair is answered" (§Y4). Failing over would ask a second
    // host about a pair that is too far for any of them.
    const primary = provider('valhalla/fossgis', {
      matrix: vi.fn(() => Promise.reject(new RouteOutOfRangeError('Path distance exceeds'))),
    });
    const secondary = provider('osrm/fossgis');
    await expect(
      new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving'),
    ).rejects.toBeInstanceOf(RouteOutOfRangeError);
    expect(secondary.matrix).not.toHaveBeenCalled();
  });

  it('throws when BOTH fail, so the breaker still counts the failure', async () => {
    // Swallowing both and answering `[]` would tell the breaker every call succeeds, so it would
    // never trip and we would hammer two dead hosts instead of one (§Y3/§Y4).
    const primary = provider('valhalla/fossgis', dead());
    const secondary = provider('osrm/fossgis', {
      matrix: vi.fn(() => Promise.reject(new Error('also down'))),
    });
    await expect(
      new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving'),
    ).rejects.toThrow('also down');
  });

  it('names both candidates in its id, so a failed-over row is not attributed to the primary', async () => {
    // `RouteLeg.provider` exists so a mixed table is legible (§4). Claiming the primary wrote a
    // row the secondary answered is exactly the silence that column was added to prevent.
    const composite = new FailoverRouteProvider(
      provider('valhalla/fossgis'),
      provider('osrm/fossgis'),
    );
    expect(composite.id).toContain('valhalla/fossgis');
    expect(composite.id).toContain('osrm/fossgis');
    expect(composite.id).not.toBe('valhalla/fossgis');
  });

  it('takes its vintage from the primary only, and survives the primary refusing to say', async () => {
    const stamped = new Date('2026-08-24T00:00:00Z');
    const withVintage = new FailoverRouteProvider(
      provider('valhalla/fossgis', { dataVersion: vi.fn(() => Promise.resolve(stamped)) }),
      provider('osrm/fossgis'),
    );
    await expect(withVintage.dataVersion()).resolves.toEqual(stamped);

    // A vintage stamps the rows it authored (§Z5); borrowing the secondary's would be worse than
    // the `null` the port explicitly allows.
    const noVintage = new FailoverRouteProvider(
      provider('valhalla/fossgis', { dataVersion: vi.fn(() => Promise.reject(new Error('503'))) }),
      provider('osrm/fossgis', { dataVersion: vi.fn(() => Promise.resolve(new Date())) }),
    );
    await expect(noVintage.dataVersion()).resolves.toBeNull();
  });
});
