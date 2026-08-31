import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  tripShareConfigSchema,
  upsertTripShareSchema,
  type TripShareConfig,
} from '@waypoint/shared';
import { z } from 'zod';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { SharingService } from './sharing.service';

class TripShareConfigDto extends createZodDto(tripShareConfigSchema) {}
class TripShareListDto extends createZodDto(z.array(tripShareConfigSchema)) {}
class UpsertTripShareDto extends createZodDto(upsertTripShareSchema) {}

/**
 * The owner side of a trip's links. `MembershipGuard` on every route makes non-members
 * invisible to it; `assertTripAdmin` inside each mutation is what separates "may share this"
 * from "may change what the world sees" (see `SharingService` for that asymmetry).
 *
 * **A trip has one link per policy** (ADR-0213's tenth amendment), so `GET` returns a list
 * and the two per-link verbs address a `code`. `DELETE` on the collection keeps the meaning
 * it has always had — stop sharing this trip — which is exactly the sheet's stop-all.
 */
@ApiTags('sharing')
@ApiBearerAuth()
@Controller('trips/:tripId/share')
@UseGuards(MembershipGuard)
export class TripSharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  @ApiOkResponse({ type: TripShareListDto })
  @ZodSerializerDto(TripShareListDto)
  list(@Param('tripId') tripId: string): Promise<TripShareConfig[]> {
    return this.sharing.list(tripId);
  }

  @Put()
  @ApiOkResponse({ type: TripShareConfigDto })
  @ZodSerializerDto(TripShareConfigDto)
  upsert(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(upsertTripShareSchema)) body: UpsertTripShareDto,
  ): Promise<TripShareConfig> {
    return this.sharing.upsert(tripId, user.userId, body);
  }

  @Post(':code/rotate')
  @ApiOkResponse({ type: TripShareConfigDto })
  @ZodSerializerDto(TripShareConfigDto)
  rotate(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('code') code: string,
  ): Promise<TripShareConfig> {
    return this.sharing.rotate(tripId, code, user.userId);
  }

  /** Stop one link. The others on the trip keep working. */
  @Delete(':code')
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('code') code: string,
  ): Promise<void> {
    return this.sharing.revoke(tripId, code, user.userId);
  }

  /** Stop every link on the trip — the route's meaning before the tenth amendment, kept. */
  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  revokeAll(@CurrentUser() user: Principal, @Param('tripId') tripId: string): Promise<void> {
    return this.sharing.revokeAll(tripId, user.userId);
  }
}
