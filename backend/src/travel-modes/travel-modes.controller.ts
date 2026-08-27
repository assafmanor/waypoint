import { Body, Controller, Delete, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  setTravelModeOverrideSchema,
  travelModeOverrideSchema,
  type TravelModeOverride,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { TravelModesService } from './travel-modes.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class TravelModeOverrideDto extends createZodDto(travelModeOverrideSchema) {}
class SetTravelModeOverrideDto extends createZodDto(setTravelModeOverrideSchema) {}

/**
 * **Declaring how a pair of places is travelled** (ADR-0206 §V1.6/§Z2, keyed per §AM).
 *
 * `PUT` rather than `POST`, and that is the shape rather than a preference: the row is identified
 * by the pair in the body, the write is idempotent, and stating the same thing twice is stating it
 * once (§AM2). There is no `PATCH` because there is nothing partial to send — an override carries
 * one field.
 *
 * There is no `GET`: the overrides ride the trip snapshot like every other syncable entity, so a
 * reader already has them and an offline reader still does.
 */
@ApiTags('travel-modes')
@ApiBearerAuth()
@Controller('trips/:tripId/travel-modes')
@UseGuards(MembershipGuard)
export class TravelModesController {
  constructor(private readonly travelModes: TravelModesService) {}

  @Put()
  @ApiOkResponse({ type: TravelModeOverrideDto })
  @ZodSerializerDto(TravelModeOverrideDto)
  set(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(setTravelModeOverrideSchema)) body: SetTravelModeOverrideDto,
  ): Promise<TravelModeOverride> {
    return this.travelModes.set(tripId, user.userId, body);
  }

  @Delete(':overrideId')
  @HttpCode(204)
  @ApiNoContentResponse()
  clear(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('overrideId') overrideId: string,
  ): Promise<void> {
    return this.travelModes.clear(tripId, overrideId, user.userId);
  }
}
