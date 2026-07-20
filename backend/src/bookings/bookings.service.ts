import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Booking as PrismaBooking } from '@prisma/client';
import {
  BOOKING_TYPE,
  ENTITY_TYPE,
  EVENT_KIND,
  bookingEventFields,
  type Booking,
  type BookingEventSeed,
  type BookingType,
  type CreateBookingInput,
  type UpdateBookingInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService, type ChangeOp } from '../sync/change.service';
import { assertPlacesInTrip } from '../common/trip-scope.util';
import { toBookingDto, toEventDto } from '../trips/trips.mapper';

const isTransport = (type: BookingType): boolean =>
  type === BOOKING_TYPE.FLIGHT || type === BOOKING_TYPE.TRAIN;

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
    this.assertPlaceShape(input.type, input);
    await assertPlacesInTrip(this.prisma, tripId, [
      input.placeId,
      input.fromPlaceId,
      input.toPlaceId,
    ]);
    const id = input.id ?? randomUUID();

    // Untimed booking (index-only, ADR-0047): a single Change, no Event.
    if (!input.event) {
      try {
        const { entity } = await this.changes.mutate({
          tripId,
          actorUserId,
          entityType: ENTITY_TYPE.BOOKING,
          entityId: id,
          action: 'create',
          after: input,
          apply: (tx) =>
            tx.booking.create({ data: this.bookingCreateData(id, tripId, actorUserId, input) }),
        });
        return toBookingDto(entity);
      } catch (err) {
        return this.recoverFromDuplicate(tripId, id, err);
      }
    }

    // Timed booking: auto-create its Event atomically (ADR-0047 §1) — booking + event
    // are two Change rows in one transaction (ADR-0048).
    const eventId = input.event.id ?? randomUUID();
    try {
      const { entity } = await this.changes.mutateMany({
        tripId,
        actorUserId,
        apply: async (tx) => {
          const booking = await tx.booking.create({
            data: this.bookingCreateData(id, tripId, actorUserId, input),
          });
          const event = await tx.event.create({
            data: this.eventDataFromBooking(tripId, actorUserId, booking, input.event!, eventId),
          });
          return {
            entity: booking,
            ops: [
              {
                entityType: ENTITY_TYPE.BOOKING,
                entityId: booking.id,
                action: 'create',
                after: toBookingDto(booking),
              },
              {
                entityType: ENTITY_TYPE.EVENT,
                entityId: event.id,
                action: 'create',
                after: toEventDto(event),
              },
            ] satisfies ChangeOp[],
          };
        },
      });
      return toBookingDto(entity);
    } catch (err) {
      return this.recoverFromDuplicate(tripId, id, err);
    }
  }

  async update(
    tripId: string,
    bookingId: string,
    actorUserId: string,
    input: UpdateBookingInput,
  ): Promise<Booking> {
    const before = await this.requireBooking(tripId, bookingId);
    const type = input.type ?? before.type;
    this.assertPlaceShape(type, {
      placeId: 'placeId' in input ? input.placeId : (before.placeId ?? undefined),
      fromPlaceId: 'fromPlaceId' in input ? input.fromPlaceId : (before.fromPlaceId ?? undefined),
      toPlaceId: 'toPlaceId' in input ? input.toPlaceId : (before.toPlaceId ?? undefined),
    });
    await assertPlacesInTrip(this.prisma, tripId, [
      input.placeId,
      input.fromPlaceId,
      input.toPlaceId,
    ]);

    // Booking-only update (no event touched) → single Change.
    if (!input.event) {
      const { entity } = await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        action: 'update',
        before: toBookingDto(before),
        after: input,
        apply: (tx) =>
          tx.booking.update({
            where: { id: bookingId },
            data: this.bookingUpdateData(actorUserId, input),
          }),
      });
      return toBookingDto(entity);
    }

    // Merged edit surface (ADR-0047): update booking and upsert its linked event atomically.
    const existingEvent = await this.prisma.event.findUnique({ where: { bookingId } });
    const { entity } = await this.changes.mutateMany({
      tripId,
      actorUserId,
      apply: async (tx) => {
        const booking = await tx.booking.update({
          where: { id: bookingId },
          data: this.bookingUpdateData(actorUserId, input),
        });
        const ops: ChangeOp[] = [
          {
            entityType: ENTITY_TYPE.BOOKING,
            entityId: bookingId,
            action: 'update',
            before: toBookingDto(before),
            after: toBookingDto(booking),
          },
        ];
        if (existingEvent) {
          const event = await tx.event.update({
            where: { id: existingEvent.id },
            // A booking-linked event's title mirrors the booking (ADR-0053) — keep the
            // invariant on update as the create path does, not just its date/times/icon.
            data: { title: booking.title, ...this.eventUpdateFromSeed(actorUserId, input.event!) },
          });
          ops.push({
            entityType: ENTITY_TYPE.EVENT,
            entityId: event.id,
            action: 'update',
            before: toEventDto(existingEvent),
            after: toEventDto(event),
          });
        } else {
          const eventId = input.event!.id ?? randomUUID();
          const event = await tx.event.create({
            data: this.eventDataFromBooking(tripId, actorUserId, booking, input.event!, eventId),
          });
          ops.push({
            entityType: ENTITY_TYPE.EVENT,
            entityId: event.id,
            action: 'create',
            after: toEventDto(event),
          });
        }
        return { entity: booking, ops };
      },
    });
    return toBookingDto(entity);
  }

  /** Delete/unlink (ADR-0047 §3). `deleteEvents=false` keeps the linked Event but
   *  clears its `bookingId` and records that as its own Change (the FK's silent
   *  onDelete:SetNull would leave peers thinking the event is still linked). */
  async remove(
    tripId: string,
    bookingId: string,
    actorUserId: string,
    confirm: boolean,
    deleteEvents: boolean,
  ): Promise<void> {
    const before = await this.requireBooking(tripId, bookingId);
    await this.assertNoHardEventDependency(tripId, bookingId, confirm);
    const linkedEvent = await this.prisma.event.findUnique({ where: { bookingId } });

    if (!linkedEvent) {
      await this.changes.mutate({
        tripId,
        actorUserId,
        entityType: ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        action: 'delete',
        before: toBookingDto(before),
        apply: (tx) => tx.booking.delete({ where: { id: bookingId } }),
      });
      return;
    }

    await this.changes.mutateMany<null>({
      tripId,
      actorUserId,
      apply: async (tx) => {
        const ops: ChangeOp[] = [];
        if (deleteEvents) {
          await tx.event.delete({ where: { id: linkedEvent.id } });
          ops.push({
            entityType: ENTITY_TYPE.EVENT,
            entityId: linkedEvent.id,
            action: 'delete',
            before: toEventDto(linkedEvent),
          });
        } else {
          const event = await tx.event.update({
            where: { id: linkedEvent.id },
            data: { bookingId: null, updatedBy: actorUserId },
          });
          ops.push({
            entityType: ENTITY_TYPE.EVENT,
            entityId: event.id,
            action: 'update',
            before: toEventDto(linkedEvent),
            after: toEventDto(event),
          });
        }
        await tx.booking.delete({ where: { id: bookingId } });
        ops.push({
          entityType: ENTITY_TYPE.BOOKING,
          entityId: bookingId,
          action: 'delete',
          before: toBookingDto(before),
        });
        return { entity: null, ops };
      },
    });
  }

  private bookingCreateData(
    id: string,
    tripId: string,
    actorUserId: string,
    input: CreateBookingInput,
  ): Prisma.BookingUncheckedCreateInput {
    return {
      id,
      tripId,
      type: input.type,
      title: input.title,
      confirmationCode: input.confirmationCode || null,
      provider: input.provider,
      placeId: input.placeId,
      fromPlaceId: input.fromPlaceId,
      toPlaceId: input.toPlaceId,
      details: input.details as Prisma.InputJsonValue | undefined,
      updatedBy: actorUserId,
    };
  }

  private bookingUpdateData(
    actorUserId: string,
    input: UpdateBookingInput,
  ): Prisma.BookingUncheckedUpdateInput {
    return {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.title !== undefined && { title: input.title }),
      // A present-but-empty code is an explicit clear (→ null); undefined leaves it untouched.
      ...(input.confirmationCode !== undefined && {
        confirmationCode: input.confirmationCode || null,
      }),
      ...(input.provider !== undefined && { provider: input.provider }),
      ...(input.placeId !== undefined && { placeId: input.placeId }),
      ...(input.fromPlaceId !== undefined && { fromPlaceId: input.fromPlaceId }),
      ...(input.toPlaceId !== undefined && { toPlaceId: input.toPlaceId }),
      ...(input.details !== undefined && { details: input.details as Prisma.InputJsonValue }),
      updatedBy: actorUserId,
    };
  }

  /** A booking-backed Event: place comes from the booking, so its own `placeId` is
   *  null (ADR-0048 authority rule); category falls back to the booking type only when
   *  the form gave no icon-derived category (ADR-0038). */
  private eventDataFromBooking(
    tripId: string,
    actorUserId: string,
    booking: PrismaBooking,
    seed: BookingEventSeed,
    eventId: string,
  ): Prisma.EventUncheckedCreateInput {
    // The booking→event mapping is shared with the client (bookingEventFields, so
    // the optimistic offline mirror can't diverge from what we persist, ADR-0093);
    // this only adapts it to Prisma (ISO strings → Date) and adds the server-owned
    // id / actor / null place.
    const f = bookingEventFields(
      { id: booking.id, title: booking.title, type: booking.type },
      seed,
    );
    return {
      id: eventId,
      tripId,
      date: new Date(f.date),
      endDate: f.endDate ? new Date(f.endDate) : undefined,
      title: f.title,
      icon: f.icon,
      category: f.category,
      kind: f.kind,
      startsAt: f.startsAt ? new Date(f.startsAt) : undefined,
      endsAt: f.endsAt ? new Date(f.endsAt) : undefined,
      placeId: null,
      bookingId: f.bookingId,
      updatedBy: actorUserId,
    };
  }

  private eventUpdateFromSeed(
    actorUserId: string,
    seed: BookingEventSeed,
  ): Prisma.EventUncheckedUpdateInput {
    return {
      date: new Date(seed.date),
      ...(seed.endDate !== undefined && { endDate: new Date(seed.endDate) }),
      ...(seed.icon !== undefined && { icon: seed.icon }),
      ...(seed.category !== undefined && { category: seed.category }),
      ...(seed.kind !== undefined && { kind: seed.kind }),
      ...(seed.startsAt !== undefined && { startsAt: new Date(seed.startsAt) }),
      ...(seed.endsAt !== undefined && { endsAt: new Date(seed.endsAt) }),
      placeId: null, // linked → place stays on the booking
      updatedBy: actorUserId,
    };
  }

  private async recoverFromDuplicate(
    tripId: string,
    bookingId: string,
    err: unknown,
  ): Promise<Booking> {
    // Client-generated id (ADR-0018): an offline-outbox retry re-POSTs the same ids,
    // rolling the whole transaction back on the first P2002. Treat that as "already
    // applied" and return the persisted booking (its event, if any, is already there).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return toBookingDto(await this.requireBooking(tripId, bookingId));
    }
    throw err;
  }

  private async requireBooking(tripId: string, bookingId: string): Promise<PrismaBooking> {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, tripId } });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /** Transport carries origin/destination (`from`/`to`); every other type carries a
   *  single `placeId`. The two are mutually exclusive (ADR-0048). */
  private assertPlaceShape(
    type: BookingType,
    input: { placeId?: string; fromPlaceId?: string; toPlaceId?: string },
  ): void {
    if (isTransport(type)) {
      if (input.placeId) {
        throw new BadRequestException('Transport bookings use fromPlaceId/toPlaceId, not placeId');
      }
    } else if (input.fromPlaceId || input.toPlaceId) {
      throw new BadRequestException('Only transport bookings have origin/destination places');
    }
  }

  /** Mirrors the hard-event guard (ADR-0011): a hard event losing its booking link is
   *  exactly the surprise that guard exists to prevent — both on delete and unlink. */
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
