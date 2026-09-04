// **The second implementation of ADR-0205 §2's port** (§Y5) — OSRM, on FOSSGIS's own
// `routing.openstreetmap.de`, which is the host the openstreetmap.org website routes with.
//
// §2 said the port existed so that "a self-host or a move to Geoapify has to be a file rather
// than a rewrite", and §Y1 left the provider question open on purpose. This is that file, and it
// was written because the bet behind leaving it open came due: `valhalla1.openstreetmap.de`
// answered `503` for the better part of a day and one community host with no alternative meant
// no travel times at all (§Y5).
//
// **Nothing here is a preference for OSRM.** It is a different engine with different tuning, and
// §Y5 records the fidelity it costs — no ferry avoidance, no group walking speed, no tileset
// vintage. It is the answer to "we have nothing", not to "we want better numbers".
//
//   - **`table` is the matrix** and `route` is the geometry, so the two calls the port needs map
//     one-to-one onto two OSRM services. No emulation, no N+1.
//   - **One instance per profile**, which is how FOSSGIS deploys it: `routed-car`, `routed-foot`,
//     `routed-bike`. The service name inside the path stays `driving` for all three — that is
//     OSRM's URL grammar, not a mode, and getting it "right" by substituting the profile there
//     is a 400.
//   - **Precision 5, and it is already named.** `POLYLINE_PRECISION.GOOGLE`'s docblock lists OSRM
//     explicitly, so ADR-0205 §1's carried-precision rule needs nothing new to survive this.
import { z } from 'zod';
import {
  POLYLINE_PRECISION,
  TRAVEL_MODE,
  type EncodedShape,
  type LatLng,
  type TravelMode,
} from '@waypoint/shared';
import { DEFAULT_ROUTING_FETCH_TIMEOUT_MS, ROUTING_FETCH_TIMEOUT_MS, envInt } from '../common/env';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import {
  RouteOutOfRangeError,
  type RouteAttribution,
  type RouteMatrixCell,
  type RouteMatrixResult,
  type RouteProvider,
  type RouteShapeAnswer,
} from './route-provider';

/** **One OSRM instance per travel mode**, which is FOSSGIS's deployment and not a detail we chose.
 *  A `Record<TravelMode, …>` rather than a `switch` for this package's stated reason: a fourth
 *  mode must not compile until somebody has decided which instance answers it. */
const PROFILE_PATH = {
  [TRAVEL_MODE.DRIVING]: 'routed-car',
  [TRAVEL_MODE.WALKING]: 'routed-foot',
  [TRAVEL_MODE.CYCLING]: 'routed-bike',
} as const satisfies Record<TravelMode, string>;

/** **OSRM's own word for the service, and it is `driving` on every profile.** The profile is
 *  chosen by the INSTANCE (`routed-foot`), so this segment is URL grammar — substituting `foot`
 *  or `walking` here is a `400 InvalidQuery`, which is exactly the kind of plausible-looking
 *  mistake `toLocation`'s `lon`/`lng` note exists for next door. */
const OSRM_SERVICE_PROFILE = 'driving';

/** An unreachable cell arrives as an explicit `null`, so every number is nullable rather than
 *  optional — a missing pair is data (ADR-0206 §D4), not a malformed row. */
const nullableMatrix = z.array(z.array(z.number().nonnegative().nullable()));

const tableResponseSchema = z.object({
  code: z.string(),
  durations: nullableMatrix.optional(),
  distances: nullableMatrix.optional(),
});

const routeResponseSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        duration: z.number().nonnegative(),
        distance: z.number().nonnegative(),
        geometry: z.string(),
      }),
    )
    .optional(),
});

/** **`Ok` is the only code that carries an answer.** Everything else — `NoRoute`, `NoSegment`,
 *  `NoTable` — is OSRM saying it cannot connect these points, which is §D4's absence and not an
 *  outage: retrying changes nothing and the reader already has a crow-flies chip. Distinguishing
 *  them matters for the breaker, which must count only calls that got NO answer (§Y4). */
const OSRM_OK = 'Ok';

/** `lon,lat` pairs, semicolon-separated — **and the order is reversed from every other coordinate
 *  in this app**, which is the same trap `toLocation` guards in `valhalla.provider.ts`: a swapped
 *  pair is another well-formed number pointing into the sea. */
const toCoordinates = (points: readonly LatLng[]): string =>
  points.map((at) => `${at.lng},${at.lat}`).join(';');

export class OsrmRouteProvider implements RouteProvider {
  readonly id = 'osrm/fossgis';

  /** **Nothing**, and it is not this class's place to say otherwise. Asked directly, OSRM is
   *  simply the provider; it is degraded only *relative to a primary*, which is a fact the
   *  composition knows and a lone provider does not (see `FailoverRouteProvider`). */
  readonly degradedProviderIds: readonly string[] = [];

  constructor(
    private readonly fetcher: EnrichmentFetcher,
    private readonly baseUrl: string,
  ) {}

  async matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixResult> {
    // `annotations` is not optional for us: OSRM returns durations ONLY by default, and a leg
    // with no distance would render as `0 ק״מ` — "you are already there" (see `RouteProvider`).
    const parsed = tableResponseSchema.parse(
      await this.ask(mode, 'table', toCoordinates(points), 'annotations=duration,distance'),
    );
    if (parsed.code !== OSRM_OK || !parsed.durations || !parsed.distances)
      return { cells: [], attribution: this.attribution() };

    const cells: RouteMatrixCell[] = [];
    for (const [fromIndex, durations] of parsed.durations.entries()) {
      for (const [toIndex, duration] of durations.entries()) {
        const distance = parsed.distances[fromIndex]?.[toIndex];
        // Dropped rather than zeroed, and the diagonal goes with them: a pair with itself is the
        // `0 s` this table is required never to invent.
        if (duration === null || distance === null || distance === undefined) continue;
        if (fromIndex === toIndex) continue;
        cells.push({ fromIndex, toIndex, durationSeconds: duration, distanceMeters: distance });
      }
    }
    return { cells, attribution: this.attribution() };
  }

  async shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null> {
    let parsed;
    try {
      parsed = routeResponseSchema.parse(
        await this.ask(
          mode,
          'route',
          toCoordinates([from, to]),
          'overview=full&geometries=polyline',
        ),
      );
    } catch (error) {
      // Same reading as the Valhalla provider's: the caller already has a duration from the
      // matrix, so a refused pair is a missing LINE rather than a missing leg.
      if (error instanceof RouteOutOfRangeError) return null;
      throw error;
    }

    const route = parsed.code === OSRM_OK ? parsed.routes?.[0] : undefined;
    if (!route) return null;

    const encoded: EncodedShape = {
      encoded: route.geometry,
      // **Carried, never assumed** (ADR-0205 §1). OSRM encodes at 5 where Valhalla encodes at 6,
      // and this is the exact line that docblock was written for — the two providers' rows sit in
      // one table and each says what it was written at.
      precision: POLYLINE_PRECISION.GOOGLE,
    };
    return {
      durationSeconds: route.duration,
      distanceMeters: route.distance,
      shape: encoded,
      attribution: this.attribution(),
    };
  }

  /**
   * **OSRM states no vintage, so `tilesetAt` is `null` — a row with no eviction handle**
   * (ADR-0205 §Z5, and `RouteAttribution`'s own note that `null` is legitimate here).
   *
   * Deliberately not guessed from the process clock: `RouteLeg.tilesetAt` is what M12's sweep
   * evicts on, and a made-up date would make these rows look invalidatable on a roll they were
   * never part of. Missing is honest; the estimate in the row is still correct.
   *
   * **And it is now reached only through an answer** (§Y6). While the vintage was a port method
   * the composition answered it for both providers, so an OSRM-authored row was stamped with
   * Valhalla's date and this `null` never reached the table it was written for.
   */
  private attribution(): RouteAttribution {
    return { providerId: this.id, tilesetAt: null };
  }

  /** One request, through the process's single allowlisted, timeboxed, size-capped outbound seat
   *  (ADR-0166 §7) — the same seat the Valhalla provider uses, for rule 8's reason. */
  private async ask(
    mode: TravelMode,
    service: 'table' | 'route',
    coordinates: string,
    query: string,
  ): Promise<unknown> {
    const base = this.baseUrl.replace(/\/+$/, '');
    const path = `/${PROFILE_PATH[mode]}/${service}/v1/${OSRM_SERVICE_PROFILE}/${coordinates}`;
    return this.fetcher.fetchJson(`${base}${path}?${query}`, {
      timeoutMs: envInt(ROUTING_FETCH_TIMEOUT_MS, DEFAULT_ROUTING_FETCH_TIMEOUT_MS),
    });
  }
}
