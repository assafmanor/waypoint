// **What do we know about a place the trip does not hold yet** (ADR-0166 §17) — the deciding
// surface's one route.
//
// Everything else this module delivers is *pushed*: the snapshot join carries enrichment for the
// trip's own places and a WS nudge carries it when a pass lands, both keyed by `placeId`. A
// Google search result has no `placeId` and no row anywhere, so it cannot be joined or nudged —
// this is the first (and only) enrichment read a client **addresses**, by the one key a candidate
// does have.
//
// Three things guard it, and none of them is new:
//
//  - **`MembershipGuard`** — the same per-request membership check every trip-scoped route runs.
//    The route is trip-scoped for exactly this reason: a global store read by anyone with a
//    session is a wider door than this app has anywhere else, and the tripId in the path is what
//    makes the existing guard applicable rather than something new.
//  - **`PlacesThrottlerGuard`** — per member·trip windows (ADR-0108 §5). The guard lives under
//    `places/` because that is where a paid proxy first needed it; there is nothing places-
//    specific in it, so the second consumer imports the class rather than minting a second guard
//    (rule 8). What it bounds here is not our bill but **Wikimedia's patience**: this trigger is
//    the least selective of the three (§17), and a tap is cheap to repeat.
//  - **The negative cache**, which is what actually keeps fetch volume proportional to the number
//    of *places* rather than to taps (§6.4). The two guards above bound the pathological case.
import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  deliveredEnrichmentFieldsSchema,
  enrichmentLookupSchema,
  type DeliveredEnrichmentFields,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  DAY_TTL_MS,
  MINUTE_TTL_MS,
  PLACES_THROTTLER,
  PlacesThrottlerGuard,
} from '../places/places-throttler.guard';
import { MembershipGuard } from '../trips/membership.guard';
import { EnrichmentScheduler } from './enrichment.scheduler';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class EnrichmentLookupDto extends createZodDto(enrichmentLookupSchema) {}
class DeliveredEnrichmentFieldsDto extends createZodDto(deliveredEnrichmentFieldsSchema) {}

/**
 * Two windows, like the paid routes, and **not env-tunable** — the same call the scheduler's caps
 * make (nothing has run against the live APIs, so there is no measurement to tune against and an
 * untested knob is worse than a documented constant).
 *
 * The minute cap is generous relative to a person tapping results one at a time and tight enough
 * to stop a scripted sweep of a whole search; the day cap is the drip. A refused lookup is not a
 * failure the surface has to explain — the card simply shows what it shows without enrichment,
 * which is the majority case anyway.
 */
const LOOKUP_THROTTLE = {
  [PLACES_THROTTLER.MINUTE]: { limit: 20, ttl: MINUTE_TTL_MS },
  [PLACES_THROTTLER.DAY]: { limit: 400, ttl: DAY_TTL_MS },
};

@ApiTags('enrichment')
@ApiBearerAuth()
@Controller('trips/:tripId/enrichment')
@UseGuards(MembershipGuard)
export class EnrichmentLookupController {
  constructor(private readonly scheduler: EnrichmentScheduler) {}

  /** A POST rather than a GET because the identity a matcher needs travels in the body, and
   *  because asking can start a pass — this is a question with a side effect. 200, not 201:
   *  nothing was created that the caller can address. */
  @Post('lookup')
  @HttpCode(200)
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(LOOKUP_THROTTLE)
  @ApiOkResponse({ type: DeliveredEnrichmentFieldsDto })
  @ZodSerializerDto(DeliveredEnrichmentFieldsDto)
  lookup(
    @Param('tripId') _tripId: string,
    @Body(new ZodValidationPipe(enrichmentLookupSchema)) body: EnrichmentLookupDto,
  ): Promise<DeliveredEnrichmentFields> {
    // The trip is the guard's business, not the store's: `PlaceEnrichment` has no `tripId` by
    // design (§1), and a candidate is not in this trip — that is the whole point of the route.
    return this.scheduler.enrichNow({
      googlePlaceId: body.googlePlaceId,
      name: body.name,
      lat: body.lat,
      lng: body.lng,
    });
  }
}
