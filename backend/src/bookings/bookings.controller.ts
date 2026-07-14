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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  bookingSchema,
  createBookingSchema,
  updateBookingSchema,
  type Booking,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from '../trips/membership.guard';
import { BookingsService } from './bookings.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas.
class CreateBookingDto extends createZodDto(createBookingSchema) {}
class UpdateBookingDto extends createZodDto(updateBookingSchema) {}
class BookingDto extends createZodDto(bookingSchema) {}

type RequestWithBody = { body?: { confirm?: boolean } };

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('trips/:tripId/bookings')
@UseGuards(MembershipGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOkResponse({ type: [BookingDto] })
  @ZodSerializerDto([BookingDto])
  list(@Param('tripId') tripId: string): Promise<Booking[]> {
    return this.bookings.list(tripId);
  }

  @Post()
  @ApiCreatedResponse({ type: BookingDto })
  @ZodSerializerDto(BookingDto)
  create(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingDto,
  ): Promise<Booking> {
    return this.bookings.create(tripId, user.userId, body);
  }

  @Patch(':bookingId')
  @ApiOkResponse({ type: BookingDto })
  @ZodSerializerDto(BookingDto)
  update(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(updateBookingSchema)) body: UpdateBookingDto,
  ): Promise<Booking> {
    return this.bookings.update(tripId, bookingId, user.userId, body);
  }

  @Delete(':bookingId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('bookingId') bookingId: string,
    @Query('confirm') confirmQuery: string | undefined,
    @Req() req: RequestWithBody,
  ): Promise<void> {
    const confirm = confirmQuery === 'true' || req.body?.confirm === true;
    return this.bookings.remove(tripId, bookingId, user.userId, confirm);
  }
}
