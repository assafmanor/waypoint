// **The one route the feed has: "try again now"** (ADR-0180 §4).
//
// Rates normally arrive *pushed*, on the trip snapshot, and that is still how
// every render gets them — `fx.module.ts` said "no controller" for that reason
// and the reason holds. What it did not account for is the design's refresh
// affordance, which exists precisely for the case the push cannot serve: the
// stored set has lapsed and the background pass has not landed one. Pressing the
// "as of" has to *await* a fetch and answer with what it got, and there is no
// request already in flight to hang that on.
//
// ADR-0004 is untouched by this. What that ADR forbids an integration is a
// **screen**; enrichment's own `lookup` route is the precedent for a pipe owning
// a route (ADR-0166 §17), and this is its second instance, guarded the same way:
//
//  - **Trip-scoped, for `MembershipGuard`.** The store is global and the tripId
//    in the path is not read by anything below — it is there so the existing
//    per-request membership check applies, rather than opening a global write
//    trigger to any session. Copied deliberately from `EnrichmentLookupController`,
//    whose header states the same trade in the same words.
//  - **`PlacesThrottlerGuard`**, the app's one per-member·trip window (ADR-0108
//    §5). What it bounds is not our bill but the source's patience: a tap is
//    cheap to repeat, and this is the only path in the app where a person can
//    ask a third party for something on demand and watch it spin.
//
// The service's own in-flight dedupe does the rest — a second press during a
// fetch joins the first pass rather than starting another.
import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { fxRefreshResultSchema, type FxRefreshResult } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import {
  DAY_TTL_MS,
  MINUTE_TTL_MS,
  PLACES_THROTTLER,
  PlacesThrottlerGuard,
} from '../places/places-throttler.guard';
import { MembershipGuard } from '../trips/membership.guard';
import { FxService } from './fx.service';

class FxRefreshResultDto extends createZodDto(fxRefreshResultSchema) {}

/** Tighter than enrichment's, because the whole install shares **one** document:
 *  a refresh that is not the first in its window has nothing new to fetch, so a
 *  low cap costs a user nothing real. Deliberately not env-tunable, for the same
 *  reason the lookup route's is not — there is no measurement to tune against. */
const FX_REFRESH_THROTTLE = {
  [PLACES_THROTTLER.MINUTE]: { limit: 6, ttl: MINUTE_TTL_MS },
  [PLACES_THROTTLER.DAY]: { limit: 60, ttl: DAY_TTL_MS },
};

@ApiTags('fx')
@ApiBearerAuth()
@Controller('trips/:tripId/fx')
@UseGuards(MembershipGuard)
export class FxController {
  constructor(private readonly fx: FxService) {}

  /** A POST because asking has a side effect, and 200 because nothing was
   *  created that the caller can address — the same call `lookup` makes.
   *
   *  This is the ONE place a fetch is awaited. Everywhere else the read serves
   *  stale and schedules; here a person is watching the mark spin, and answering
   *  before the pass lands would render the same date back and read as a control
   *  that does nothing. `refresh()` never throws, so a source that is down
   *  answers with the previous set and the date simply does not move. */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(FX_REFRESH_THROTTLE)
  @ApiOkResponse({ type: FxRefreshResultDto })
  @ZodSerializerDto(FxRefreshResultDto)
  async refresh(@Param('tripId') _tripId: string): Promise<FxRefreshResult> {
    await this.fx.refresh();
    return { fxRates: await this.fx.read() };
  }
}
