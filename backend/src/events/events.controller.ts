import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createEventSchema,
  eventStatusUpdateSchema,
  moveEventSchema,
  tripEventSchema,
  updateEventSchema,
  type TripEvent,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { EventsService, type MoveEventResult } from './events.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class CreateEventDto extends createZodDto(createEventSchema) {}
class UpdateEventDto extends createZodDto(updateEventSchema) {}
class MoveEventDto extends createZodDto(moveEventSchema) {}
class EventStatusUpdateDto extends createZodDto(eventStatusUpdateSchema) {}
class TripEventDto extends createZodDto(tripEventSchema) {}

type RequestWithBody = { body?: { confirm?: boolean } };

/** updateEventSchema/moveEventSchema aren't .strict(), so zod silently drops an
 *  unrecognized `confirm` key before it reaches the parsed DTO — read it off the
 *  query param and the raw request body instead (T-010 implementation notes). */
function readConfirm(req: RequestWithBody, confirmQuery: string | undefined): boolean {
  return confirmQuery === 'true' || req.body?.confirm === true;
}

@ApiTags('events')
@Controller('trips/:tripId/events')
@UseGuards(DevAuthGuard, MembershipGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOkResponse({ type: [TripEventDto] })
  @ZodSerializerDto([TripEventDto])
  list(@Param('tripId') tripId: string): Promise<TripEvent[]> {
    return this.events.list(tripId);
  }

  @Post()
  @ApiCreatedResponse({ type: TripEventDto })
  @ZodSerializerDto(TripEventDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createEventSchema)) body: CreateEventDto,
  ): Promise<TripEvent> {
    return this.events.create(tripId, user.userId, body);
  }

  @Patch(':eventId')
  @ApiOkResponse({ type: TripEventDto })
  @ZodSerializerDto(TripEventDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(updateEventSchema)) body: UpdateEventDto,
    @Query('confirm') confirmQuery: string | undefined,
    @Req() req: RequestWithBody,
  ): Promise<TripEvent> {
    return this.events.update(tripId, eventId, user.userId, body, readConfirm(req, confirmQuery));
  }

  @Post(':eventId/status')
  @ApiOkResponse({ type: TripEventDto })
  @ZodSerializerDto(TripEventDto)
  setStatus(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(eventStatusUpdateSchema)) body: EventStatusUpdateDto,
  ): Promise<TripEvent> {
    return this.events.setStatus(tripId, eventId, user.userId, body.status);
  }

  // Response is `{ event, rippleSuggestion? }` — no shared schema for rippleSuggestion
  // (it's a local frontend interface too, see events.service.ts), so no @ZodSerializerDto here.
  @Post(':eventId/move')
  @ApiOkResponse({ type: TripEventDto })
  move(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(moveEventSchema)) body: MoveEventDto,
    @Query('confirm') confirmQuery: string | undefined,
    @Req() req: RequestWithBody,
  ): Promise<MoveEventResult> {
    return this.events.move(tripId, eventId, user.userId, body, readConfirm(req, confirmQuery));
  }

  @Delete(':eventId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Query('confirm') confirmQuery: string | undefined,
    @Req() req: RequestWithBody,
  ): Promise<void> {
    return this.events.remove(tripId, eventId, user.userId, readConfirm(req, confirmQuery));
  }
}
