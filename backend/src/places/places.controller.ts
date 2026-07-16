import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createPlaceSchema, placeSchema, updatePlaceSchema, type Place } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { PlacesService } from './places.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class CreatePlaceDto extends createZodDto(createPlaceSchema) {}
class UpdatePlaceDto extends createZodDto(updatePlaceSchema) {}
class PlaceDto extends createZodDto(placeSchema) {}

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
