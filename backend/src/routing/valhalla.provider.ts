// **Valhalla, behind ADR-0205 §2's port** — the one file in the app that knows this provider's
// vocabulary, and the only place `pedestrian`, `error_code` or `sources_to_targets` appears.
//
// Four things here are measurements rather than choices, each with the section that measured it.
// They are written as constants with the number beside them because every one of them fails
// *silently* if it is wrong — a wrong host answers 200, a wrong ferry setting answers a plausible
// duration, a wrong unit answers a plausible distance.
import { z } from 'zod';
import {
  POLYLINE_PRECISION,
  type EncodedShape,
  type LatLng,
  type TravelMode,
} from '@waypoint/shared';
import {
  DEFAULT_ROUTING_BASE_URL,
  DEFAULT_ROUTING_FETCH_TIMEOUT_MS,
  ROUTING_BASE_URL,
  ROUTING_FETCH_TIMEOUT_MS,
  envInt,
} from '../common/env';
import { EnrichmentFetcher, OutboundHttpError } from '../enrichment/outbound-fetch';
import {
  RouteOutOfRangeError,
  type RouteAttribution,
  type RouteMatrixCell,
  type RouteMatrixResult,
  type RouteProvider,
  type RouteShapeAnswer,
} from './route-provider';

/**
 * **The mode names, ours to theirs.** A `Record<TravelMode, …>` rather than a `switch`, so a
 * fourth mode does not compile until somebody has decided what it costs as (ADR-0094/0095).
 */
const COSTING: Record<TravelMode, string> = {
  walking: 'pedestrian',
  driving: 'auto',
  cycling: 'bicycle',
};

/**
 * **`use_ferry: 0`, and it is not a preference** (ADR-0205 §Z7).
 *
 * Left at its default, pedestrian routing **boards scheduled ferries**: Asakusa → Tsukiji comes
 * back as a 7.5 km maneuver at 16.4 km/h inside a walk — the Sumida River tourist boat, on a
 * timetable we do not have — making the default **22.7 minutes optimistic**, and optimistic about
 * catching a boat. Re-measured live on 2026-08-25 against the same pair: **3,671 s / 10.1 km with
 * the default, 4,976 s / 6.7 km without it.**
 *
 * It also fixes something worse than a wrong number. Valhalla silently switches matrix algorithm
 * by batch size (`timedistancematrix` at ≤3 points, `costmatrix` above), and the two disagree by
 * 22.6 minutes wherever a ferry is reachable — while ADR-0205 §4's cache key is `(mode, from, to)`
 * and records nothing about the batch. So without this the cached answer for a leg is **a race
 * between whichever day fetched it first**. With it, the 1×1 and the 6×6 agree exactly.
 *
 * Driving is unaffected on every leg measured, so it is set for the two modes §Z7 names and not
 * globally — a costing option nothing needs is a knob nobody checked.
 */
const FERRY_FREE_MODES: readonly TravelMode[] = ['walking', 'cycling'];

/**
 * **The pace we mean, rather than the pace we would have had to buffer** (ADR-0205 §Z6, and the
 * number is M4's — §Z6 measured the options and left the choice).
 *
 * Valhalla's `walking_speed` defaults to **5.1 km/h**, a brisk solo adult. This app serves groups
 * of ~5 (root `CLAUDE.md`), which do not move at 5.1, and §Z6's finding is that this is a request
 * parameter and not a hedge: Valhalla re-models the crossings around the speed instead of adding
 * a flat lump. Re-measured live 2026-08-25 on Senso-ji → Shinjuku: default **8,054 s**, `4.5`
 * **9,095 s (+12.9%)**, `4.0` **10,206 s (+26.7%)** — matching §Z6's +13% / +27% exactly.
 *
 * **4.5 and not 4.0**, for two reasons. ADR-0206 §D5 forbids stating a confidence we do not have,
 * and it cuts both ways — a pessimistic number is as unearned as an optimistic one, and the five
 * minutes of departure overhead already have their own constant (`TRAVEL_BUFFER_SECONDS`), so
 * this must not absorb a second copy of it. And §Z8's ceilings were reasoned at the ~4.9 km/h the
 * corpus was measured at: at 4.5 the 15 km walking ceiling is a ~3.9-hour walk against the
 * ~3.5 hours §Z8 describes, where 4.0 would make it 4.4 and quietly move a number the owner set.
 */
const GROUP_WALKING_SPEED_KMH = 4.5;

/**
 * **Who we are, which FOSSGIS asks of every client** (ADR-0205 §2) and is a condition of using
 * the server at all. A constant rather than an env var deliberately: it identifies the
 * application to a volunteer operator, and an unset variable would make us anonymous — which is
 * precisely the client they rate-limit first.
 */
const CLIENT_ID = 'waypoint-travelive';

/** Valhalla answers distances in **kilometres** by default and has no metres option (`units` is
 *  `kilometers` or `miles`). Every shape in `@waypoint/shared` is metres, so the conversion
 *  happens here, once, at the boundary — this is the only file that has ever seen a kilometre. */
const KM_TO_M = 1000;

/** `error_code 154` — "Path distance exceeds the max distance limit" (ADR-0205 §Z4, re-measured
 *  2026-08-25). The one 400 that means "this pair, forever" rather than "this request, now". */
const ERROR_CODE_PATH_TOO_LONG = 154;

/** A cell the provider could not answer arrives as explicit `null`s, which is why every numeric
 *  field here is nullable rather than optional — a missing pair is data, not a malformed row. */
const matrixCellSchema = z.object({
  from_index: z.number().int().nonnegative(),
  to_index: z.number().int().nonnegative(),
  time: z.number().nonnegative().nullable(),
  distance: z.number().nonnegative().nullable(),
});

const matrixResponseSchema = z.object({
  sources_to_targets: z.array(z.array(matrixCellSchema)),
});

const routeResponseSchema = z.object({
  trip: z.object({
    summary: z.object({ time: z.number().nonnegative(), length: z.number().nonnegative() }),
    legs: z.array(z.object({ shape: z.string() })).min(1),
  }),
});

const statusResponseSchema = z.object({
  /** Unix seconds, and ADR-0205 §Z5's whole point: the tileset date is the thing an OSM refresh
   *  moves, so it is the invalidation signal a TTL was standing in for. */
  tileset_last_modified: z.number().int().positive().optional(),
});

const errorResponseSchema = z.object({ error_code: z.number().int(), error: z.string() });

/** How long a `/status` answer is reused before it is asked for again. The tileset rolls daily
 *  at most, and this only stamps rows for M12's eviction, so an hour is generous and still means
 *  a long-lived process does not stamp a date from the week it booted. */
const DATA_VERSION_TTL_MS = 60 * 60 * 1000;

export class ValhallaRouteProvider implements RouteProvider {
  readonly id = 'valhalla/fossgis';

  /** **Nothing.** This is the tuned provider (§Z6/§Z7), so a row it wrote is the answer we want
   *  and not a stand-in for one. */
  readonly degradedProviderIds: readonly string[] = [];

  private dataVersionAt = 0;
  private dataVersionValue: Date | null = null;

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  async matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixResult> {
    const locations = points.map(toLocation);
    const parsed = matrixResponseSchema.parse(
      await this.ask('/sources_to_targets', {
        sources: locations,
        targets: locations,
        ...this.costingFor(mode),
      }),
    );

    const cells: RouteMatrixCell[] = [];
    for (const row of parsed.sources_to_targets) {
      for (const cell of row) {
        // The absent cell of §Z4, dropped rather than zeroed — see `RouteProvider.matrix`.
        if (cell.time === null || cell.distance === null) continue;
        cells.push({
          fromIndex: cell.from_index,
          toIndex: cell.to_index,
          durationSeconds: cell.time,
          distanceMeters: cell.distance * KM_TO_M,
        });
      }
    }
    return { cells, attribution: await this.attribution() };
  }

  async shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null> {
    let parsed;
    try {
      parsed = routeResponseSchema.parse(
        await this.ask('/route', {
          locations: [toLocation(from), toLocation(to)],
          ...this.costingFor(mode),
        }),
      );
    } catch (error) {
      // A pair with no path is an ordinary absence here too, and the caller has already had a
      // duration for it from the matrix — so the line is missing, not the leg.
      if (error instanceof RouteOutOfRangeError) return null;
      throw error;
    }

    const encoded: EncodedShape = {
      encoded: joinLegShapes(parsed.trip.legs),
      // **Carried, never assumed** (ADR-0205 §1). Valhalla encodes at 6; the decoder takes the
      // precision off the record, so a move to Geoapify (which encodes at 5) is this line.
      precision: POLYLINE_PRECISION.VALHALLA,
    };
    return {
      durationSeconds: parsed.trip.summary.time,
      distanceMeters: parsed.trip.summary.length * KM_TO_M,
      shape: encoded,
      attribution: await this.attribution(),
    };
  }

  /** This provider's stamp for a row it just authored (§Y6). Cheap on the hot path: the vintage
   *  behind it is the TTL-held `/status` read below, not a request per answer. */
  private async attribution(): Promise<RouteAttribution> {
    return { providerId: this.id, tilesetAt: await this.dataVersion() };
  }

  /** **The provider's data vintage** — ADR-0205 §Z5's invalidation signal, which §4 said a route
   *  has and a clock does not. No longer on the port (§Y6): it reaches a row only through
   *  `attribution()`, so it cannot be asked for apart from the answer it stamps. */
  async dataVersion(): Promise<Date | null> {
    if (Date.now() - this.dataVersionAt < DATA_VERSION_TTL_MS) return this.dataVersionValue;
    this.dataVersionAt = Date.now();
    try {
      const parsed = statusResponseSchema.parse(await this.ask('/status', undefined));
      this.dataVersionValue = parsed.tileset_last_modified
        ? new Date(parsed.tileset_last_modified * 1000)
        : null;
    } catch {
      // A row with no eviction handle beats no row: the estimate is still correct.
      this.dataVersionValue = null;
    }
    return this.dataVersionValue;
  }

  /** The costing name plus the options that make the answer honest — see the two constants. */
  private costingFor(mode: TravelMode): Record<string, unknown> {
    const costing = COSTING[mode];
    if (!FERRY_FREE_MODES.includes(mode)) return { costing };
    return {
      costing,
      costing_options: {
        [costing]: {
          use_ferry: 0,
          ...(mode === 'walking' ? { walking_speed: GROUP_WALKING_SPEED_KMH } : {}),
        },
      },
    };
  }

  /** One request, through the process's single allowlisted, timeboxed, size-capped outbound seat
   *  (ADR-0166 §7 — which already named ETA as a consumer of it). */
  private async ask(path: string, body: unknown): Promise<unknown> {
    const base = process.env[ROUTING_BASE_URL] || DEFAULT_ROUTING_BASE_URL;
    try {
      return await this.fetcher.fetchJson(`${base.replace(/\/+$/, '')}${path}`, {
        ...(body === undefined ? {} : { json: body }),
        timeoutMs: envInt(ROUTING_FETCH_TIMEOUT_MS, DEFAULT_ROUTING_FETCH_TIMEOUT_MS),
        headers: { 'X-Client-Id': CLIENT_ID },
      });
    } catch (error) {
      throw asRouteError(error);
    }
  }
}

/** Valhalla names the longitude `lon`; every shape in this app names it `lng`. One translation,
 *  here, because a `lon`/`lng` slip is another well-formed pair of numbers pointing nowhere. */
const toLocation = (at: LatLng) => ({ lat: at.lat, lon: at.lng });

/** A route is one leg for a two-location request, but the schema allows more and a silently
 *  dropped tail would draw a line that stops halfway. Concatenating encoded strings is valid
 *  because each leg's deltas restart from its own first point, which is the previous leg's last. */
const joinLegShapes = (legs: readonly { shape: string }[]): string =>
  legs.map((leg) => leg.shape).join('');

/** Turn the provider's own "too far" into the port's terminal refusal, and leave everything else
 *  alone — an outage must stay retryable (ADR-0205 §Z4's two failure modes). */
function asRouteError(error: unknown): unknown {
  if (!(error instanceof OutboundHttpError)) return error;
  let parsed;
  try {
    parsed = errorResponseSchema.safeParse(JSON.parse(error.body));
  } catch {
    return error;
  }
  if (parsed.success && parsed.data.error_code === ERROR_CODE_PATH_TOO_LONG) {
    return new RouteOutOfRangeError(parsed.data.error);
  }
  return error;
}
