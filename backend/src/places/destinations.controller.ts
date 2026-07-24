import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  destinationResultSchema,
  placePredictionSchema,
  resolveDestinationSchema,
  searchPlacesSchema,
  type DestinationResult,
  type PlacePrediction,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import * as env from '../common/env';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DestinationsService } from './destinations.service';
import {
  DAY_TTL_MS,
  MINUTE_TTL_MS,
  PLACES_THROTTLER,
  PlacesThrottlerGuard,
} from './places-throttler.guard';

class SearchPlacesDto extends createZodDto(searchPlacesSchema) {}
class ResolveDestinationDto extends createZodDto(resolveDestinationSchema) {}
class PlacePredictionDto extends createZodDto(placePredictionSchema) {}
class DestinationResultDto extends createZodDto(destinationResultSchema) {}

// Same Google cost profile as the trip-scoped proxy, so reuse its per-min/per-day
// limits — the throttler guard keys per-user here (no tripId), not per member·trip.
const SEARCH_THROTTLE = {
  [PLACES_THROTTLER.MINUTE]: {
    limit: env.envInt(env.PLACES_SEARCH_LIMIT_PER_MIN, env.DEFAULT_PLACES_SEARCH_LIMIT_PER_MIN),
    ttl: MINUTE_TTL_MS,
  },
  [PLACES_THROTTLER.DAY]: {
    limit: env.envInt(env.PLACES_SEARCH_LIMIT_PER_DAY, env.DEFAULT_PLACES_SEARCH_LIMIT_PER_DAY),
    ttl: DAY_TTL_MS,
  },
};
const RESOLVE_THROTTLE = {
  [PLACES_THROTTLER.MINUTE]: {
    limit: env.envInt(env.PLACES_RESOLVE_LIMIT_PER_MIN, env.DEFAULT_PLACES_RESOLVE_LIMIT_PER_MIN),
    ttl: MINUTE_TTL_MS,
  },
  [PLACES_THROTTLER.DAY]: {
    limit: env.envInt(env.PLACES_RESOLVE_LIMIT_PER_DAY, env.DEFAULT_PLACES_RESOLVE_LIMIT_PER_DAY),
    ttl: DAY_TTL_MS,
  },
};

/**
 * Trip-agnostic destination endpoints for trip creation (ADR-0113 §4): no `tripId`
 * yet, authed by the global `JwtAuthGuard`, per-user throttled, no persistence.
 * Distinct from the trip-scoped `trips/:tripId/places` proxy but shares the Google
 * client + throttler guard.
 */
@ApiTags('destinations')
@ApiBearerAuth()
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Post('search')
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(SEARCH_THROTTLE)
  @ApiOkResponse({ type: [PlacePredictionDto] })
  @ZodSerializerDto([PlacePredictionDto])
  search(
    @Body(new ZodValidationPipe(searchPlacesSchema)) body: SearchPlacesDto,
  ): Promise<PlacePrediction[]> {
    return this.destinations.search(body);
  }

  @Post('resolve')
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(RESOLVE_THROTTLE)
  @ApiCreatedResponse({ type: DestinationResultDto })
  @ZodSerializerDto(DestinationResultDto)
  resolve(
    @Body(new ZodValidationPipe(resolveDestinationSchema)) body: ResolveDestinationDto,
  ): Promise<DestinationResult> {
    return this.destinations.resolve(body);
  }
}
