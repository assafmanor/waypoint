// **The trip's offline map** (ADR-0186 §3/§4). Gathers what the trip covers, cuts one
// archive for it, and keeps it in the byte sink `documents` already uses.
//
// Nothing here proxies tiles. Upstream is touched **once per area, ever** — the planet is
// 127.88 GiB and the slice of it a trip needs is ~16–23 MB, so storing the slice is both
// cheaper and faster than range-proxying the source per tile (§3's 2026-08-13 amendment).
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LatLng } from '@waypoint/shared';
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
export const WORLD_MAXZOOM = 6;
export const WORLD_KEY = `${MAP_KEY_PREFIX}world-z${WORLD_MAXZOOM}.pmtiles`;

@Injectable()
export class MapService {
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

  /** The shared world layer, built once and reused by every trip. */
  async world(): Promise<Buffer> {
    return this.cached(WORLD_KEY, async () => {
      this.logger.log(`cutting the world layer at z${WORLD_MAXZOOM}`);
      const bytes = await buildExtract({ maxZoom: WORLD_MAXZOOM });
      await putObject(WORLD_KEY, bytes);
      return bytes;
    });
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
