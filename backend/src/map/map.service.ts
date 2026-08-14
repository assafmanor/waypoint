// **The trip's offline map** (ADR-0186 §3/§4). Gathers what the trip covers, cuts one
// archive for it, and keeps it in the byte sink `documents` already uses.
//
// Nothing here proxies tiles. Upstream is touched **once per area, ever** — the planet is
// 127.88 GiB and the slice of it a trip needs is ~16–23 MB, so storing the slice is both
// cheaper and faster than range-proxying the source per tile (§3's 2026-08-13 amendment).
import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { MAP_WORLD_MAXZOOM, type LatLng } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { getObject, putObject } from '../common/storage';
import {
  MAP_EXTRACT_MAXZOOM,
  MAP_KEY_PREFIX,
  mapExtractKey,
  mapRegionFor,
  type MapRegion,
} from './map-region';
import { buildExtract } from './pmtiles-extract';

/** The shared coarse layer every trip falls back to, so nowhere is ever blank — including
 *  the ground between a trip's areas and any place it does not cover at all (§4).
 *  **Measured: 42.7 MB at z0–6**, against 525.6 MB at z0–8, which is why the floor is 6. */
export const WORLD_MAXZOOM = MAP_WORLD_MAXZOOM;
export const WORLD_KEY = `${MAP_KEY_PREFIX}world-z${WORLD_MAXZOOM}.pmtiles`;

/** **How long to tell a client to wait for an archive that is still being cut.** A world layer
 *  is ~4s and a city extract ~10-13s measured, both against a good network; this is a hint, and
 *  the client's own retry is what actually re-asks. */
export const MAP_BUILD_RETRY_SECONDS = 15;

/**
 * **NOTHING IS BUILT ON THE REQUEST PATH** (2026-08-14, after four rounds of a map that would
 * not load).
 *
 * The first version awaited the cut inside the handler: `sendRange(res, await map.world(), …)`.
 * That holds the HTTP response open while a Go process downloads and slices 42.7 MB — `execFile`'s
 * own ceiling is **five minutes** — so a range request could sit there for minutes answering
 * neither success nor failure. From the client that is indistinguishable from a hang, and it is
 * exactly what the device reported: `tiles:0` with `err:none`, on every load.
 *
 * The reason it never got better on a restart is the same fact: each attempt was abandoned before
 * the cut finished, so nothing was ever stored, so the next attempt started another one. A cut has
 * to **complete once** and then it is cached forever — which is the whole argument for taking it
 * off the path where a person is waiting.
 *
 * So: serve what is stored, and if nothing is stored, start the build and say **503 with a
 * `Retry-After`** immediately. Every state is then a status code rather than an open socket — the
 * client reports it, the person sees a retry, and the retry lands once the build has finished.
 */
@Injectable()
export class MapService implements OnModuleInit {
  private readonly logger = new Logger(MapService.name);
  /** One build at a time per key. Two members opening the same trip must not each spend
   *  54 upstream requests on the identical archive — they await the same promise. */
  private readonly inFlight = new Map<string, Promise<Buffer>>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * **Every coordinate the trip holds.** Places carry their own; a booking's endpoints are
   * `Place` rows too (`fromPlaceId`/`toPlaceId`), which is exactly why a layover needs no
   * special case — the airport is already in this list (ADR-0186 §4).
   *
   * Queried as one `Place` sweep rather than joined out of bookings, because a place
   * referenced only by a booking is still a row on this trip; the FK direction means the
   * sweep is a superset and the clusterer does not care about provenance.
   */
  async coordinatesFor(tripId: string): Promise<LatLng[]> {
    const places = await this.prisma.place.findMany({
      where: { tripId, lat: { not: null }, lng: { not: null } },
      select: { lat: true, lng: true },
    });
    return places.flatMap((p) =>
      p.lat != null && p.lng != null ? [{ lat: p.lat, lng: p.lng }] : [],
    );
  }

  /** What this trip would download — `null` when it holds no coordinates yet, which is a
   *  real state whose answer is the world layer alone. */
  async regionFor(tripId: string): Promise<MapRegion | null> {
    return mapRegionFor(await this.coordinatesFor(tripId));
  }

  /**
   * The trip's archive, built if it does not exist yet.
   *
   * **The signature is in the key**, so this is idempotent and a rebuild is a new object
   * rather than an overwrite: the archive a phone is midway through downloading stays
   * readable while a newer one is cut beside it.
   */
  async extractFor(tripId: string): Promise<{ bytes: Buffer; region: MapRegion }> {
    const region = await this.regionFor(tripId);
    if (!region) throw new NotFoundException('trip has no mapped coordinates');
    const key = mapExtractKey(tripId, region.signature);
    return { bytes: await this.cached(key, () => this.cut(key, region)), region };
  }

  /**
   * The trip's archive **if it is already stored**, or `null` with a build started in the
   * background. Never waits for a cut — see the class comment.
   */
  async extractIfReady(tripId: string): Promise<Buffer | null> {
    const region = await this.regionFor(tripId);
    if (!region) throw new NotFoundException('trip has no mapped coordinates');
    const key = mapExtractKey(tripId, region.signature);
    return this.readyOrWarm(key, () => this.cut(key, region));
  }

  /** The shared world layer **if it is already stored**, or `null` with a build started. */
  async worldIfReady(): Promise<Buffer | null> {
    return this.readyOrWarm(WORLD_KEY, () => this.cutWorld());
  }

  /**
   * **Cut the world layer at boot, so the common case is never a cold one.** Every trip falls
   * back to this one shared file, so building it once at startup is what makes the first person
   * to open a map on a fresh deploy see a map rather than a retry. Failures are logged and
   * swallowed: a tile archive is a cache (§6), and refusing to boot over one would take the
   * whole app down for the one screen that can degrade.
   */
  onModuleInit(): void {
    void this.worldIfReady().catch((error: unknown) => {
      this.logger.warn(`could not pre-warm the world layer: ${String(error)}`);
    });
  }

  private async cutWorld(): Promise<Buffer> {
    this.logger.log(`cutting the world layer at z${WORLD_MAXZOOM}`);
    const bytes = await buildExtract({ maxZoom: WORLD_MAXZOOM });
    await putObject(WORLD_KEY, bytes);
    return bytes;
  }

  /** The stored bytes, or `null` having started a build nobody waits on. The build still goes
   *  through `inFlight`, so a burst of requests starts exactly one. */
  private async readyOrWarm(key: string, build: () => Promise<Buffer>): Promise<Buffer | null> {
    try {
      return await getObject(key);
    } catch {
      // Not stored yet — the only expected reason.
    }
    if (!this.inFlight.has(key)) {
      const started = build().finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, started);
      // Nobody awaits this, so its rejection has to be handled here or it is unhandled.
      started.catch((error: unknown) => {
        this.logger.error(`build failed for ${key}: ${String(error)}`);
      });
    }
    return null;
  }

  /** The shared world layer, waiting for the cut if it is not stored. **Not for a request
   *  handler** — `worldIfReady` is. Kept for the boot warm and for any deliberate caller. */
  async world(): Promise<Buffer> {
    return this.cached(WORLD_KEY, () => this.cutWorld());
  }

  private async cut(key: string, region: MapRegion): Promise<Buffer> {
    this.logger.log(`cutting ${region.areas.length} area(s) for ${key}`);
    const bytes = await buildExtract({ maxZoom: MAP_EXTRACT_MAXZOOM, region: region.geojson });
    await putObject(key, bytes);
    return bytes;
  }

  /** Stored-then-built, with concurrent callers sharing one build (see `inFlight`). */
  private async cached(key: string, build: () => Promise<Buffer>): Promise<Buffer> {
    try {
      return await getObject(key);
    } catch {
      // Not stored yet — the only expected reason, and the build below is the answer.
    }
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const started = build().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, started);
    return started;
  }
}
