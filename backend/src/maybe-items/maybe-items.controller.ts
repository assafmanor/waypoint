import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createMaybeItemSchema,
  maybeItemSchema,
  updateMaybeItemSchema,
  type MaybeItem,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { MaybeItemsService } from './maybe-items.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class MaybeItemDto extends createZodDto(maybeItemSchema) {}
class CreateMaybeItemDto extends createZodDto(createMaybeItemSchema) {}
class UpdateMaybeItemDto extends createZodDto(updateMaybeItemSchema) {}

@ApiTags('maybe-items')
@ApiBearerAuth()
@Controller('trips/:tripId/maybe-items')
@UseGuards(MembershipGuard)
export class MaybeItemsController {
  constructor(private readonly maybeItems: MaybeItemsService) {}

  @Post()
  @ApiCreatedResponse({ type: MaybeItemDto })
  @ZodSerializerDto(MaybeItemDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createMaybeItemSchema)) body: CreateMaybeItemDto,
  ): Promise<MaybeItem> {
    return this.maybeItems.create(tripId, user.userId, body);
  }

  @Delete(':maybeItemId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('maybeItemId') maybeItemId: string,
  ): Promise<void> {
    return this.maybeItems.remove(tripId, maybeItemId, user.userId);
  }

  /** Re-aim an idea at a day, or back to "someday" (ADR-0116 §1). */
  @Patch(':maybeItemId')
  @ApiOkResponse({ type: MaybeItemDto })
  @ZodSerializerDto(MaybeItemDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('maybeItemId') maybeItemId: string,
    @Body(new ZodValidationPipe(updateMaybeItemSchema)) body: UpdateMaybeItemDto,
  ): Promise<MaybeItem> {
    return this.maybeItems.update(tripId, maybeItemId, body, user.userId);
  }

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

  /** Put a consumed idea back on the shelf — the compensating write an undone schedule owes
   *  the server (see the service). Named `restore` because that is already this app's word for
   *  "put it back": it is what un-skipping an event is called. */
  @Post(':maybeItemId/restore')
  @ApiOkResponse({ type: MaybeItemDto })
  @ZodSerializerDto(MaybeItemDto)
  restore(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('maybeItemId') maybeItemId: string,
  ): Promise<MaybeItem> {
    return this.maybeItems.restore(tripId, maybeItemId, user.userId);
  }
}
