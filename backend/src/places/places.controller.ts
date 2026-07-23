import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createPlaceSchema,
  placePredictionSchema,
  placeSchema,
  resolvePlaceSchema,
  searchPlacesSchema,
  updatePlaceSchema,
  type Place,
  type PlacePrediction,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import * as env from '../common/env';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import {
  DAY_TTL_MS,
  MINUTE_TTL_MS,
  PLACES_THROTTLER,
  PlacesThrottlerGuard,
} from './places-throttler.guard';
import { PlacesService } from './places.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class CreatePlaceDto extends createZodDto(createPlaceSchema) {}
class UpdatePlaceDto extends createZodDto(updatePlaceSchema) {}
class PlaceDto extends createZodDto(placeSchema) {}
class SearchPlacesDto extends createZodDto(searchPlacesSchema) {}
class ResolvePlaceDto extends createZodDto(resolvePlaceSchema) {}
class PlacePredictionDto extends createZodDto(placePredictionSchema) {}

// Per-member·trip rate-limit windows for the paid proxy routes (ADR-0108 §5), read
// once from env with the named defaults so they're tunable without a deploy.
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

@ApiTags('places')
@ApiBearerAuth()
@Controller('trips/:tripId/places')
@UseGuards(MembershipGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @ApiOkResponse({ type: [PlaceDto] })
  @ZodSerializerDto([PlaceDto])
  list(@Param('tripId') tripId: string): Promise<Place[]> {
    return this.places.list(tripId);
  }

  @Post()
  @ApiCreatedResponse({ type: PlaceDto })
  @ZodSerializerDto(PlaceDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createPlaceSchema)) body: CreatePlaceDto,
  ): Promise<Place> {
    return this.places.create(tripId, user.userId, body);
  }

  /** Debounced Autocomplete relay (ADR-0108 §1). Rate-limited per member·trip; the
   *  session token bills these at $0 when the session ends in a pick. */
  @Post('search')
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(SEARCH_THROTTLE)
  @ApiOkResponse({ type: [PlacePredictionDto] })
  @ZodSerializerDto([PlacePredictionDto])
  search(
    @Param('tripId') _tripId: string,
    @Body(new ZodValidationPipe(searchPlacesSchema)) body: SearchPlacesDto,
  ): Promise<PlacePrediction[]> {
    return this.places.searchPlaces(body);
  }

  /** Enrich-on-pick / create-or-link (ADR-0108 §3). Dedup-before-spend on
   *  (tripId, googlePlaceId); one paid Place Details call only on a miss. */
  @Post('resolve')
  @UseGuards(PlacesThrottlerGuard)
  @Throttle(RESOLVE_THROTTLE)
  @ApiCreatedResponse({ type: PlaceDto })
  @ZodSerializerDto(PlaceDto)
  resolve(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(resolvePlaceSchema)) body: ResolvePlaceDto,
  ): Promise<Place> {
    return this.places.resolvePlace(tripId, user.userId, body);
  }

  @Patch(':placeId')
  @ApiOkResponse({ type: PlaceDto })
  @ZodSerializerDto(PlaceDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('placeId') placeId: string,
    @Body(new ZodValidationPipe(updatePlaceSchema)) body: UpdatePlaceDto,
  ): Promise<Place> {
    return this.places.update(tripId, placeId, user.userId, body);
  }
}
