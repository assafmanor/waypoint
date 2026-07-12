import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { maybeItemSchema, type MaybeItem } from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { MembershipGuard } from '../trips/membership.guard';
import { MaybeItemsService } from './maybe-items.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class MaybeItemDto extends createZodDto(maybeItemSchema) {}

@ApiTags('maybe-items')
@Controller('trips/:tripId/maybe-items')
@UseGuards(MembershipGuard)
export class MaybeItemsController {
  constructor(private readonly maybeItems: MaybeItemsService) {}

  @Post(':maybeItemId/consume')
  @ApiOkResponse({ type: MaybeItemDto })
  @ZodSerializerDto(MaybeItemDto)
  consume(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('maybeItemId') maybeItemId: string,
  ): Promise<MaybeItem> {
    return this.maybeItems.consume(tripId, maybeItemId, user.userId);
  }
}
