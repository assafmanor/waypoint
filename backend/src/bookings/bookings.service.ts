import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Booking as PrismaBooking, Prisma } from '@prisma/client';
import {
  EVENT_KIND,
  type Booking,
  type CreateBookingInput,
  type UpdateBookingInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toBookingDto, toEventDto } from '../trips/trips.mapper';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async list(tripId: string): Promise<Booking[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
    });
    return bookings.map(toBookingDto);
  }

  async create(tripId: string, actorUserId: string, input: CreateBookingInput): Promise<Booking> {
    const id = input.id ?? randomUUID();
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'booking',
      entityId: id,
      action: 'create',
      after: input,
      apply: (tx) =>
        tx.booking.create({
          data: {
            id,
            tripId,
            type: input.type,
            title: input.title,
            confirmationCode: input.confirmationCode,
            provider: input.provider,
            address: input.address,
            placeId: input.placeId,
            startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
            endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
            details: input.details as Prisma.InputJsonValue | undefined,
            updatedBy: actorUserId,
          },
        }),
    });
    return toBookingDto(entity);
  }

  async update(
    tripId: string,
    bookingId: string,
    actorUserId: string,
    input: UpdateBookingInput,
  ): Promise<Booking> {
    const before = await this.requireBooking(tripId, bookingId);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'booking',
      entityId: bookingId,
      action: 'update',
      before: toBookingDto(before),
      after: input,
      apply: (tx) =>
        tx.booking.update({
          where: { id: bookingId },
          data: {
            ...(input.type !== undefined && { type: input.type }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.confirmationCode !== undefined && {
              confirmationCode: input.confirmationCode,
            }),
            ...(input.provider !== undefined && { provider: input.provider }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.placeId !== undefined && { placeId: input.placeId }),
            ...(input.startsAt !== undefined && { startsAt: new Date(input.startsAt) }),
            ...(input.endsAt !== undefined && { endsAt: new Date(input.endsAt) }),
            ...(input.details !== undefined && {
              details: input.details as Prisma.InputJsonValue,
            }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toBookingDto(entity);
  }

  async remove(
    tripId: string,
    bookingId: string,
    actorUserId: string,
    confirm: boolean,
  ): Promise<void> {
    const before = await this.requireBooking(tripId, bookingId);
    await this.assertNoHardEventDependency(tripId, bookingId, confirm);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'booking',
      entityId: bookingId,
      action: 'delete',
      before: toBookingDto(before),
      apply: (tx) => tx.booking.delete({ where: { id: bookingId } }),
    });
  }

  private async requireBooking(tripId: string, bookingId: string): Promise<PrismaBooking> {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, tripId } });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /** Mirrors the hard-event guard (ADR-0011): a hard event losing its booking link via
   *  the FK's onDelete: SetNull is exactly the surprise that guard exists to prevent. */
  private async assertNoHardEventDependency(
    tripId: string,
    bookingId: string,
    confirm: boolean,
  ): Promise<void> {
    if (confirm) return;
    const dependents = await this.prisma.event.findMany({
      where: { tripId, bookingId, kind: EVENT_KIND.HARD },
    });
    if (dependents.length === 0) return;
    throw new ConflictException({
      error: {
        code: 'HARD_EVENT_REQUIRES_CONFIRM',
        message: 'A hard event still references this booking — confirm to proceed.',
        details: { events: dependents.map(toEventDto) },
      },
    });
  }
}
