// **The read-through cache in front of the router** (ADR-0205 §4/§6), shaped like
// `MapService.readyOrWarm`: serve what is stored, start what is missing, never hold a socket open
// for a third party.
//
// Three boundaries this service is built around, each of which is a decision somebody else made:
//
//   - **`ChangeService` is not here and must never be.** A route is not data-plane — no `tripId`,
//     one writer, nothing to undo — so it sits outside the change log rather than being an
//     exception to it (ADR-0205 §4; `backend/CLAUDE.md` calls that the one hard boundary in this
//     codebase). Nothing below writes a `Change` row or broadcasts.
//   - **The gate runs here, before the network** (§3). One crow-flies pair over a mode's ceiling
//     returns `400` for an entire matrix (§Z4), so the client must never be able to cause that —
//     which is also why the pre-filter is `@waypoint/shared`'s `routableLegs` and not a rule this
//     file invents.
//   - **An absent answer is ordinary** (ADR-0206 §D4). A refused mode, a null cell, a warm that
//     has not landed and a provider that is down all leave the crow-flies chip standing. There is
//     no error state in this file's vocabulary, only three buckets: answered, refused, pending.
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ROUTE_COORD_DECIMALS,
  admitsTravelMode,
  clusterLatLngs,
  routableLegs,
  routeLegKey,
  type LatLng,
  type RouteBatch,
  type RouteBatchRequest,
  type RoutableLeg,
  type RoutedLeg,
  type TravelEstimate,
  type TravelMode,
} from '@waypoint/shared';
import { ROUTING_DISABLED } from '../common/env';
import { MapService } from '../map/map.service';
import { PrismaService } from '../prisma/prisma.service';
import { matrixBatchesFor } from './matrix-batches';
import { PolitenessLimiter } from './politeness.limiter';
import { ROUTE_PROVIDER, RouteOutOfRangeError, type RouteProvider } from './route-provider';

/** The floor under `Retry-After`, and the number is the provider's own tail: ADR-0205 §Z4
 *  measured a day matrix at **~560 ms median, ~1 s max**, so a client that re-asks sooner than
 *  this is asking before the first call could possibly have landed. */
const RETRY_MIN_SECONDS = 2;

/** The ceiling on it. A warm longer than this is one the client should stop tracking and let the
 *  next natural read pick up — every leg it eventually writes is still there when anyone asks. */
const RETRY_MAX_SECONDS = 30;

/**
 * **How many shape calls one warm pass will make.**
 *
 * A duration is one matrix call for a whole day; a **line is one call per leg** (ADR-0205 §6
 * amendment), so `withShapes` over a 24-stop day in three modes would be 69 upstream calls, paced
 * at 1/s by a limiter that is right to pace them. ADR-0206 §D8 draws at most one line anyway.
 *
 * **Nothing is dropped by this bound** — that is what makes it a pace rather than a silent cap. A
 * leg whose shape was not reached this pass stays in `pendingModes`, so the client's next ask
 * starts the next batch of them, and the cache means no work is ever repeated.
 */
const SHAPE_CALLS_PER_PASS = 8;

/** The stored row, as much of it as a read needs. */
interface RouteLegRow {
  key: string;
  durationSeconds: number;
  distanceMeters: number;
  shapeEncoded: string | null;
  shapePrecision: number | null;
}

/** A row on its way in. Mirrors the Prisma model's writable columns. */
interface RouteLegWrite {
  key: string;
  mode: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  durationSeconds: number;
  distanceMeters: number;
  shapeEncoded: string | null;
  shapePrecision: number | null;
  provider: string;
  tilesetAt: Date | null;
}

/** One `(leg, mode)` we still owe an answer for. */
interface PendingItem {
  fromIndex: number;
  toIndex: number;
  mode: TravelMode;
  /** True when the duration is already cached and only the geometry is missing. */
  shapeOnly: boolean;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  /** One warm at a time per upstream request. Two members opening the same day must not each
   *  spend a matrix call on the identical answer — they await the same promise. `MapService`'s
   *  `inFlight` exactly (ADR-0205 §6's table names it as the shape to copy). */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly map: MapService,
    private readonly limiter: PolitenessLimiter,
    @Inject(ROUTE_PROVIDER) private readonly provider: RouteProvider,
  ) {}

  /**
   * **A day's legs, in every mode asked for, in one answer** (ADR-0205 §Y2).
   *
   * One request per day and not one per day per mode, because ADR-0206 §Z2 requires a mode switch
   * to be instant and a per-mode endpoint puts a ~1 s round-trip behind every switch of the
   * control. The answer is allowed to be partial: `retryAfterSeconds` is set while a warm is
   * running and absent when there is nothing left to wait for.
   */
  async batch(tripId: string, request: RouteBatchRequest): Promise<RouteBatch> {
    const { stops, modes } = request;
    // ADR-0186 §4's clustering, reused rather than re-derived — ADR-0205 §3's "one derivation
    // with two consumers". The TRIP's coordinates and not the day's: single-link membership is
    // decided by the chain, so a stop that links two others is what makes them one area.
    const clusters = clusterLatLngs(await this.map.coordinatesFor(tripId));
    const gated = routableLegs(stops, clusters, modes);

    const cached = await this.readCached(stops, gated);
    const pending: PendingItem[] = [];

    const legs: RoutedLeg[] = gated.map((leg) => {
      const estimates: TravelEstimate[] = [];
      const pendingModes: TravelMode[] = [];
      const from = stops[leg.fromIndex]!;
      const to = stops[leg.toIndex]!;

      for (const mode of leg.modes) {
        const row = cached.get(routeLegKey(from, to, mode));
        if (!row) {
          pendingModes.push(mode);
          pending.push({ fromIndex: leg.fromIndex, toIndex: leg.toIndex, mode, shapeOnly: false });
          continue;
        }
        estimates.push(toEstimate(row, mode));
        // A shape we already hold is returned either way; a shape we do not is only owed when
        // this request asked for one (ADR-0205 §6 amendment).
        if (request.withShapes && !row.shapeEncoded) {
          pendingModes.push(mode);
          pending.push({ fromIndex: leg.fromIndex, toIndex: leg.toIndex, mode, shapeOnly: true });
        }
      }

      return {
        fromIndex: leg.fromIndex,
        toIndex: leg.toIndex,
        estimates,
        // Everything asked for that the gate did not admit. Never coming, whatever anyone waits
        // for — the distinction the client needs and the user must never see (§D4).
        refusedModes: modes.filter((mode) => !leg.modes.includes(mode)),
        pendingModes,
      };
    });

    if (pending.length === 0) return { legs };

    // **The kill switch stops the outbound call, not the endpoint** (`ROUTING_DISABLED`). Every
    // stored leg above is still served; what is missing reads as §D4's absence, and no
    // `retryAfterSeconds` is offered because nothing is coming.
    if (this.isDisabled()) return { legs };

    const plannedCalls = this.warm(stops, clusters, pending);
    return { legs, retryAfterSeconds: retryAfterFor(plannedCalls) };
  }

  /**
   * Await every warm currently in flight.
   *
   * Not scaffolding: a warm is a promise nobody holds, so without this there is no way to state
   * "the matrix landed" — and M4's exit criteria are exactly that a cold call warms and a second
   * one then makes **no** outbound request. A drain on shutdown wants the same handle.
   */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight.values()]);
    }
  }

  private isDisabled(): boolean {
    return Boolean(process.env[ROUTING_DISABLED]);
  }

  /** Every already-answered `(leg, mode)` in one query, keyed the way the client keys it. */
  private async readCached(
    stops: readonly LatLng[],
    gated: readonly RoutableLeg[],
  ): Promise<Map<string, RouteLegRow>> {
    const keys = gated.flatMap((leg) =>
      leg.modes.map((mode) => routeLegKey(stops[leg.fromIndex]!, stops[leg.toIndex]!, mode)),
    );
    if (keys.length === 0) return new Map();
    const rows = await this.prisma.routeLeg.findMany({
      where: { key: { in: keys } },
      select: {
        key: true,
        durationSeconds: true,
        distanceMeters: true,
        shapeEncoded: true,
        shapePrecision: true,
      },
    });
    return new Map(rows.map((row) => [row.key, row]));
  }

  /**
   * Start the upstream work and **do not wait for it** (ADR-0187's flow, which `MapService`'s
   * class comment argues at length: nothing is built on a request path).
   *
   * Returns how many upstream calls were started, which is what makes `Retry-After` a derivation
   * of the limiter's own rate rather than a guess.
   */
  private warm(
    stops: readonly LatLng[],
    clusters: readonly (readonly LatLng[])[],
    pending: readonly PendingItem[],
  ): number {
    let calls = 0;

    // One matrix request per §Z9-safe run of pending legs, per mode.
    const legsByMode = new Map<TravelMode, number[]>();
    for (const item of pending) {
      if (item.shapeOnly) continue;
      const legs = legsByMode.get(item.mode) ?? [];
      legs.push(item.fromIndex);
      legsByMode.set(item.mode, legs);
    }
    for (const [mode, legIndexes] of legsByMode) {
      for (const { stopIndexes } of matrixBatchesFor(stops, legIndexes, mode)) {
        const points = stopIndexes.map((index) => stops[index]!);
        calls++;
        this.once(`matrix:${mode}:${points.map(pointKey).join(';')}`, () =>
          this.runMatrix(points, clusters, mode),
        );
      }
    }

    // One `/route` call per leg that still owes geometry, up to this pass's pace.
    for (const item of pending.filter((p) => p.shapeOnly).slice(0, SHAPE_CALLS_PER_PASS)) {
      const from = stops[item.fromIndex]!;
      const to = stops[item.toIndex]!;
      calls++;
      this.once(`shape:${routeLegKey(from, to, item.mode)}`, () =>
        this.runShape(from, to, item.mode),
      );
    }

    return calls;
  }

  /** `MapService.readyOrWarm`'s dedupe: one pass per key, and its rejection handled here because
   *  nobody awaits it. */
  private once(key: string, work: () => Promise<void>): void {
    if (this.inFlight.has(key)) return;
    const started = work().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, started);
    started.catch((error: unknown) => {
      this.logger.warn(`routing warm failed for ${key}: ${String(error)}`);
    });
  }

  private async runMatrix(
    points: readonly LatLng[],
    clusters: readonly (readonly LatLng[])[],
    mode: TravelMode,
  ): Promise<void> {
    await this.limiter.runQuietly(`matrix ${mode} x${points.length}`, async () => {
      let cells;
      try {
        cells = await this.provider.matrix(points, mode);
      } catch (error) {
        // The provider stating a limit is terminal, not an outage — the same request fails
        // identically forever, so it is logged once and those legs stay absent (§D4). §Z9's
        // batching is what makes this cost the pairs in ONE request rather than the whole day.
        if (error instanceof RouteOutOfRangeError) {
          this.logger.log(`provider refused a ${mode} batch as out of range: ${error.detail}`);
          return;
        }
        throw error;
      }

      const tilesetAt = await this.provider.dataVersion();
      const rows: RouteLegWrite[] = [];
      for (const cell of cells) {
        const from = points[cell.fromIndex];
        const to = points[cell.toIndex];
        if (!from || !to) continue;
        // **Cache every cell the matrix returned, not just the consecutive pairs** (ADR-0205
        // §Z4): the others are already paid for, so a reorder or an inserted stop costs nothing
        // later. Run through the gate first, because a merged run's cross pairs were never gated
        // — the 10 m floor and the cluster rule still decide what is worth a row.
        if (!admitsTravelMode(mode, from, to, clusters)) continue;
        rows.push({
          key: routeLegKey(from, to, mode),
          mode,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          durationSeconds: cell.durationSeconds,
          distanceMeters: cell.distanceMeters,
          shapeEncoded: null,
          shapePrecision: null,
          provider: this.provider.id,
          tilesetAt,
        });
      }
      await this.store(rows);
    });
  }

  private async runShape(from: LatLng, to: LatLng, mode: TravelMode): Promise<void> {
    await this.limiter.runQuietly(`shape ${mode}`, async () => {
      const answer = await this.provider.shape(from, to, mode);
      if (!answer) return;
      await this.store([
        {
          key: routeLegKey(from, to, mode),
          mode,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: to.lat,
          toLng: to.lng,
          durationSeconds: answer.durationSeconds,
          distanceMeters: answer.distanceMeters,
          shapeEncoded: answer.shape.encoded,
          shapePrecision: answer.shape.precision,
          provider: this.provider.id,
          tilesetAt: await this.provider.dataVersion(),
        },
      ]);
    });
  }

  /**
   * Delete-then-create over exactly the keys computed, in one transaction.
   *
   * Not `createMany({ skipDuplicates })`: a re-computation has to be able to replace a row, or a
   * leg fetched before a tileset roll would keep both its old duration and its old vintage stamp,
   * and M12's eviction would then have nothing to find. Not an upsert loop either — a merged
   * matrix returns hundreds of cells, and that is hundreds of database round-trips for work one
   * statement pair does.
   */
  private async store(rows: readonly RouteLegWrite[]): Promise<void> {
    if (rows.length === 0) return;
    const keys = rows.map((row) => row.key);
    await this.prisma.$transaction([
      this.prisma.routeLeg.deleteMany({ where: { key: { in: keys } } }),
      this.prisma.routeLeg.createMany({ data: [...rows] }),
    ]);
  }
}

/** The stored row as one mode's estimate. A shape is returned whenever we hold one, flag or not:
 *  stripping a cached field to honour `withShapes: false` would cost a second request to get it
 *  back (ADR-0205 §6 amendment). */
function toEstimate(row: RouteLegRow, mode: TravelMode): TravelEstimate {
  return {
    mode,
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
    ...(row.shapeEncoded && row.shapePrecision
      ? { shape: { encoded: row.shapeEncoded, precision: row.shapePrecision } }
      : {}),
  };
}

/** One second per started upstream call, which is the limiter's own rate, bounded at both ends.
 *  **Exported for the pack** (ADR-0206 §AO): a warm it starts is paced by the same limiter, so
 *  the wait it offers has to be the same derivation rather than a second guess at it. */
export function retryAfterFor(plannedCalls: number): number {
  return Math.min(RETRY_MAX_SECONDS, Math.max(RETRY_MIN_SECONDS, plannedCalls));
}

/** Identity of a point inside an in-flight key, at the **cache key's own snap**. Two requests
 *  whose coordinates differ below ~1 m describe identical ground and would write the same row, so
 *  they should share one upstream call rather than race to store it twice. */
const pointKey = (at: LatLng) =>
  `${at.lat.toFixed(ROUTE_COORD_DECIMALS)},${at.lng.toFixed(ROUTE_COORD_DECIMALS)}`;
