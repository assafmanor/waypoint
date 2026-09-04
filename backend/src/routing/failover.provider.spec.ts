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

/** Each stub answers with **its own** attribution, which is what the real providers do (§Y6) —
 *  the point of every assertion below is that the composition passes that through untouched
 *  rather than substituting one of its own. */
const attributionOf = (id: string, tilesetAt: Date | null = null) => ({
  providerId: id,
  tilesetAt,
});

function provider(id: string, over: Partial<RouteProvider> = {}) {
  const base: RouteProvider = {
    id,
    degradedProviderIds: [],
    matrix: vi.fn(() => Promise.resolve({ cells: [CELL], attribution: attributionOf(id) })),
    shape: vi.fn(() => Promise.resolve(null)),
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
    const answer = await new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving');
    expect(answer.cells).toEqual([CELL]);
    expect(answer.attribution.providerId).toBe('valhalla/fossgis');
    expect(secondary.matrix).not.toHaveBeenCalled();
  });

  it('falls over to the secondary when the primary cannot answer at all', async () => {
    // The 2026-09-02 outage: `valhalla1` served 503 for the better part of a day.
    const primary = provider('valhalla/fossgis', dead());
    const secondary = provider('osrm/fossgis');
    const answer = await new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving');
    expect(answer.cells).toEqual([CELL]);
    // **The row will say OSRM wrote it**, which §Y5's composite id could not say and is the
    // whole of §Y6: a permanent cache row that cannot name its author cannot be re-asked.
    expect(answer.attribution.providerId).toBe('osrm/fossgis');
    expect(secondary.matrix).toHaveBeenCalledOnce();
  });

  it('does NOT fail over on an empty matrix — that is an answer', async () => {
    // Otherwise every gate-admitted pair the provider cannot connect costs two outbound seats
    // instead of one, forever, and the politeness limiter paces one call a second.
    const primary = provider('valhalla/fossgis', {
      matrix: vi.fn(() =>
        Promise.resolve({ cells: [], attribution: attributionOf('valhalla/fossgis') }),
      ),
    });
    const secondary = provider('osrm/fossgis');
    const answer = await new FailoverRouteProvider(primary, secondary).matrix([A, B], 'driving');
    expect(answer.cells).toEqual([]);
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

  it('keeps naming both candidates in its id, because rows already carry that string', async () => {
    // It is no longer what a row records (§Y6) and it must not drift: rows written while it WAS
    // the stamp are in the table, and `degradedProviderIds` names this exact string to find them.
    const composite = new FailoverRouteProvider(
      provider('valhalla/fossgis'),
      provider('osrm/fossgis'),
    );
    expect(composite.id).toBe('failover(valhalla/fossgis,osrm/fossgis)');
  });

  it('carries the ANSWERING provider vintage, never the primary — the §Y5 clause the code broke', async () => {
    // §Y5 said an OSRM row carries no eviction handle. The composed `dataVersion()` returned the
    // primary's date whoever answered, so a fallback row was stamped with Valhalla's tileset
    // vintage and M12's sweep would read it as fresh. There is now no vintage to ask for apart
    // from the answer.
    const stamped = new Date('2026-08-24T00:00:00Z');
    const composite = new FailoverRouteProvider(
      provider('valhalla/fossgis', {
        ...dead(),
        matrix: vi.fn(() => Promise.reject(new Error('503 Service Unavailable'))),
      }),
      provider('osrm/fossgis'),
    );
    const answer = await composite.matrix([A, B], 'driving');
    expect(answer.attribution).toEqual({ providerId: 'osrm/fossgis', tilesetAt: null });

    // And the healthy primary's own vintage reaches the row unchanged.
    const healthy = new FailoverRouteProvider(
      provider('valhalla/fossgis', {
        matrix: vi.fn(() =>
          Promise.resolve({
            cells: [CELL],
            attribution: attributionOf('valhalla/fossgis', stamped),
          }),
        ),
      }),
      provider('osrm/fossgis'),
    );
    expect((await healthy.matrix([A, B], 'driving')).attribution.tilesetAt).toEqual(stamped);
  });

  it('names the secondary AND its own composite id as degraded, and nothing else', async () => {
    // The secondary because §Y5 took its numbers only against "no number at all" (measured on the
    // deploy: OSRM answers Tokyo Station→Shibuya in 7.7 min against Valhalla's 15.6 over the
    // identical 7.67 km). The composite because a row stamped with it cannot say which host
    // replied, so it has to be treated as though the worse one did.
    //
    // **And the primary is deliberately absent.** A set of "anything that is not me" would read
    // the whole table as stale on the provider swap §Y1 leaves open, and re-fetch every leg of
    // every trip.
    const composite = new FailoverRouteProvider(
      provider('valhalla/fossgis'),
      provider('osrm/fossgis'),
    );
    expect(composite.degradedProviderIds).toEqual([
      'osrm/fossgis',
      'failover(valhalla/fossgis,osrm/fossgis)',
    ]);
    expect(composite.degradedProviderIds).not.toContain('valhalla/fossgis');
  });

  it('is empty for a lone provider, so asking one directly never marks its own rows stale', () => {
    expect(provider('valhalla/fossgis').degradedProviderIds).toEqual([]);
  });
});
