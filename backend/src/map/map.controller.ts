// The offline map's two reads (ADR-0186 §3): a trip's own archive, and the shared world
// layer under it.
//
// **Both serve Range requests, and that is not an optimisation.** The client reads these
// with the `pmtiles` protocol, which addresses an archive by byte range — so a server that
// answers 200-with-everything makes the renderer download the whole file to draw one tile.
// It is also what lets a paused download resume.
import { Controller, Get, HttpStatus, Param, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MembershipGuard } from '../trips/membership.guard';
import { MAP_BUILD_RETRY_SECONDS, MapService } from './map.service';
import { sendRange } from './range';

/** The archive's own media type. `nosniff` rides along for the same reason documents get
 *  it: these are bytes fetched from a third party, and the browser must not re-interpret
 *  them as something it will execute. */
const PMTILES_MIME = 'application/vnd.pmtiles';

@ApiTags('map')
@Controller()
export class MapController {
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
