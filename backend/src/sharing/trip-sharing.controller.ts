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
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { SharingService } from './sharing.service';

class TripShareConfigDto extends createZodDto(tripShareConfigSchema) {}
class UpsertTripShareDto extends createZodDto(upsertTripShareSchema) {}

/**
 * The owner side of the one link. `MembershipGuard` on every route makes non-members
 * invisible to it; `assertTripAdmin` inside each mutation is what separates "may share this"
 * from "may change what the world sees" (see `SharingService` for that asymmetry).
 */
@ApiTags('sharing')
@ApiBearerAuth()
@Controller('trips/:tripId/share')
@UseGuards(MembershipGuard)
export class TripSharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  @ApiOkResponse({ type: TripShareConfigDto })
  @ZodSerializerDto(TripShareConfigDto)
  get(@Param('tripId') tripId: string): Promise<TripShareConfig> {
    return this.sharing.get(tripId);
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

  @Post('rotate')
  @ApiOkResponse({ type: TripShareConfigDto })
  @ZodSerializerDto(TripShareConfigDto)
  rotate(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
  ): Promise<TripShareConfig> {
    return this.sharing.rotate(tripId, user.userId);
  }

  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(@CurrentUser() user: Principal, @Param('tripId') tripId: string): Promise<void> {
    return this.sharing.revoke(tripId, user.userId);
  }
}
