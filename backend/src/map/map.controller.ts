// The map's PMTiles reads: shared coarse world, live online detail, and the trip extract that
// Phase 3c downloads for offline use (ADR-0186 §3, amended by ADR-0187).
//
// **Both serve Range requests, and that is not an optimisation.** The client reads these
// with the `pmtiles` protocol, which addresses an archive by byte range — so a server that
// answers 200-with-everything makes the renderer download the whole file to draw one tile.
// It is also what lets a paused download resume.
import { Controller, Get, HttpStatus, Logger, Param, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MembershipGuard } from '../trips/membership.guard';
import { MAP_BUILD_RETRY_SECONDS, MapService } from './map.service';
import { planetBuildId, readPlanetRange } from './planet';
import { resolveClosedRange, sendRange } from './range';

/** The archive's own media type. `nosniff` rides along for the same reason documents get
 *  it: these are bytes fetched from a third party, and the browser must not re-interpret
 *  them as something it will execute. */
const PMTILES_MIME = 'application/vnd.pmtiles';

/** A build id names bytes that cannot change, so a client may keep them forever — which is
 *  the point of putting the id in the path at all (ADR-0187 §1). */
const PLANET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@ApiTags('map')
@Controller()
export class MapController {
  private readonly logger = new Logger(MapController.name);

  constructor(private readonly map: MapService) {}

  /** The coarse layer that makes "nowhere is blank" true. Trip-independent, so it is
   *  outside the membership guard — it is the same public OSM ground for everyone, and
   *  gating it would mean a signed-in fetch per trip for one shared file. */
  @Get('map/world.pmtiles')
  async world(@Res() res: Response): Promise<void> {
    const bytes = await this.map.worldIfReady();
    if (!bytes) return notBuiltYet(res, 'the world layer');
    sendRange(res, bytes, PMTILES_MIME);
  }

  /** What this trip covers, without building anything — so a size readout or a
   *  "4 areas · ~16 MB" prompt costs no upstream requests. */
  @Get('trips/:tripId/map/region')
  @UseGuards(MembershipGuard)
  @ApiOkResponse()
  async region(@Param('tripId') tripId: string) {
    const region = await this.map.regionFor(tripId);
    return {
      areas: region?.areas ?? [],
      signature: region?.signature ?? null,
    };
  }

  /** The trip's archive, **if it has been cut**. The first request starts the cut (~10-13s for a
   *  city) and answers 503 rather than holding the connection open for it — see `MapService`. */
  @Get('trips/:tripId/map/extract.pmtiles')
  @UseGuards(MembershipGuard)
  async extract(@Param('tripId') tripId: string, @Res() res: Response): Promise<void> {
    const bytes = await this.map.extractIfReady(tripId);
    if (!bytes) return notBuiltYet(res, "this trip's archive");
    sendRange(res, bytes, PMTILES_MIME);
  }

  /**
   * **Detail anywhere, live** (ADR-0187 §1) — the source the map reads while online, so ground
   * nobody has committed to still draws at street zoom instead of waiting minutes for a cut.
   *
   * Three things this route is deliberately strict about:
   *
   * - **The build id is in the path and is checked**, so a client can never name the upstream
   *   object it wants. Without that this is an open proxy; with it the only reachable bytes are
   *   the archive this server already reads for extracts. A stale bundle asking for yesterday's
   *   build gets a 404 and falls back, which is the loud version of the alternative — directory
   *   pages that silently no longer describe the archive.
   * - **A range is required.** Every `pmtiles` read sends one; a request without one is asking
   *   for 128 GiB, which is never what a tile read wanted.
   * - **Immutable caching**, because a build id names bytes that cannot change. This is what
   *   makes a repeat pan free at the client as well as at us.
   */
  @Get('map/planet-:build.pmtiles')
  async planet(@Param('build') build: string, @Res() res: Response): Promise<void> {
    if (build !== planetBuildId()) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'unknown planet build' });
      return;
    }
    const range = resolveClosedRange(res.req.headers.range);
    if (!range) {
      res
        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
        .json({ message: 'a byte range is required' });
      return;
    }
    try {
      const { body, total } = await readPlanetRange(range);
      res.setHeader('Content-Type', PMTILES_MIME);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', PLANET_CACHE_CONTROL);
      res.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.start + body.length - 1}/${total}`,
      );
      res.setHeader('Content-Length', String(body.length));
      res.status(HttpStatus.PARTIAL_CONTENT).send(body);
    } catch (error) {
      // Upstream refused or is unreachable. Said as a status the renderer surfaces rather than a
      // hang — the distinction four amendments of ADR-0186 were spent learning.
      this.logger.error('live map range failed', error instanceof Error ? error.stack : undefined);
      res.status(HttpStatus.BAD_GATEWAY).json({ message: 'the live map source is unavailable' });
    }
  }
}

/**
 * **"Not yet" is a status code, never an open connection** (2026-08-14).
 *
 * A 503 with `Retry-After` is the whole difference between a map that reports itself and one that
 * hangs: the renderer surfaces the status as an error, the pane shows its retry, and the retry
 * succeeds once the background cut has landed. Holding the socket instead produced `tiles:0` with
 * `err:none` on a real device — no tiles and nothing to say about why.
 */
function notBuiltYet(res: Response, what: string): void {
  res.setHeader('Retry-After', String(MAP_BUILD_RETRY_SECONDS));
  res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
    message: `${what} is still being built; retry shortly`,
    retryAfterSeconds: MAP_BUILD_RETRY_SECONDS,
  });
}
