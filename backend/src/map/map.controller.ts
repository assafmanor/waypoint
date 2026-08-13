// The offline map's two reads (ADR-0186 §3): a trip's own archive, and the shared world
// layer under it.
//
// **Both serve Range requests, and that is not an optimisation.** The client reads these
// with the `pmtiles` protocol, which addresses an archive by byte range — so a server that
// answers 200-with-everything makes the renderer download the whole file to draw one tile.
// It is also what lets a paused download resume.
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MembershipGuard } from '../trips/membership.guard';
import { MapService } from './map.service';
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
    sendRange(res, await this.map.world(), PMTILES_MIME);
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

  /** The trip's archive. First call cuts it (~10s for two areas); later calls are stored. */
  @Get('trips/:tripId/map/extract.pmtiles')
  @UseGuards(MembershipGuard)
  async extract(@Param('tripId') tripId: string, @Res() res: Response): Promise<void> {
    const { bytes } = await this.map.extractFor(tripId);
    sendRange(res, bytes, PMTILES_MIME);
  }
}
