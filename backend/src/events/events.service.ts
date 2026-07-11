import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Event as PrismaEvent } from '@prisma/client';
import {
  EVENT_KIND,
  EVENT_STATUS,
  type CreateEventInput,
  type EventStatus,
  type MoveEventInput,
  type TripEvent,
  type UpdateEventInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { toBookingDto, toEventDto } from '../trips/trips.mapper';

export interface RippleSuggestion {
  movedTitle: string;
  candidates: { id: string; startsAt: string; endsAt?: string }[];
}

export interface MoveEventResult {
  event: TripEvent;
  rippleSuggestion?: RippleSuggestion;
}

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : 0);
const shiftIso = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

  async list(tripId: string): Promise<TripEvent[]> {
    const events = await this.prisma.event.findMany({
      where: { tripId },
      orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
    });
    return events.map(toEventDto);
  }

  async create(tripId: string, actorUserId: string, input: CreateEventInput): Promise<TripEvent> {
    const id = input.id ?? randomUUID();
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'event',
      entityId: id,
      action: 'create',
      after: input,
      apply: (tx) =>
        tx.event.create({
          data: {
            id,
            tripId,
            date: new Date(input.date),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            title: input.title,
            icon: input.icon,
            kind: input.kind,
            startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
            endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
            location: input.location,
            placeId: input.placeId,
            bookingId: input.bookingId,
            sortOrder: input.sortOrder ?? 0,
            source: input.source,
            updatedBy: actorUserId,
          },
        }),
    });
    return toEventDto(entity);
  }

  async update(
    tripId: string,
    eventId: string,
    actorUserId: string,
    input: UpdateEventInput,
    confirm: boolean,
  ): Promise<TripEvent> {
    const before = await this.requireEvent(tripId, eventId);
    await this.assertHardConfirmed(before, confirm);

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'event',
      entityId: eventId,
      action: 'update',
      before: toEventDto(before),
      after: input,
      apply: (tx) =>
        tx.event.update({
          where: { id: eventId },
          data: {
            ...(input.date !== undefined && { date: new Date(input.date) }),
            ...(input.endDate !== undefined && { endDate: new Date(input.endDate) }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.icon !== undefined && { icon: input.icon }),
            ...(input.kind !== undefined && { kind: input.kind }),
            ...(input.startsAt !== undefined && { startsAt: new Date(input.startsAt) }),
            ...(input.endsAt !== undefined && { endsAt: new Date(input.endsAt) }),
            ...(input.location !== undefined && { location: input.location }),
            ...(input.placeId !== undefined && { placeId: input.placeId }),
            ...(input.bookingId !== undefined && { bookingId: input.bookingId }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
            ...(input.source !== undefined && { source: input.source }),
            ...(input.status !== undefined && { status: input.status }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toEventDto(entity);
  }

  async setStatus(
    tripId: string,
    eventId: string,
    actorUserId: string,
    status: EventStatus,
  ): Promise<TripEvent> {
    await this.requireEvent(tripId, eventId);
    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'event',
      entityId: eventId,
      action: 'status',
      after: { status },
      apply: (tx) =>
        tx.event.update({ where: { id: eventId }, data: { status, updatedBy: actorUserId } }),
    });
    return toEventDto(entity);
  }

  async move(
    tripId: string,
    eventId: string,
    actorUserId: string,
    input: MoveEventInput,
    confirm: boolean,
  ): Promise<MoveEventResult> {
    const before = await this.requireEvent(tripId, eventId);
    await this.assertHardConfirmed(before, confirm);

    // moveEventSchema carries `startsAt` only, not `endsAt` — shift endsAt by the same
    // delta so a move preserves the event's duration (matches the DELAY semantics
    // computeRipple() is ported from; see frontend/src/state/trip-state.tsx).
    const minutesShift =
      input.startsAt !== undefined && before.startsAt
        ? Math.round((new Date(input.startsAt).getTime() - before.startsAt.getTime()) / 60000)
        : 0;

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'event',
      entityId: eventId,
      action: 'move',
      before: toEventDto(before),
      after: input,
      apply: (tx) =>
        tx.event.update({
          where: { id: eventId },
          data: {
            ...(input.date !== undefined && { date: new Date(input.date) }),
            ...(input.startsAt !== undefined && { startsAt: new Date(input.startsAt) }),
            ...(minutesShift !== 0 &&
              before.endsAt && { endsAt: shiftIso(before.endsAt.toISOString(), minutesShift) }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
            updatedBy: actorUserId,
          },
        }),
    });

    const moved = toEventDto(entity);
    const rippleSuggestion =
      minutesShift !== 0
        ? await this.computeRippleSuggestion(tripId, moved, minutesShift)
        : undefined;
    return { event: moved, rippleSuggestion };
  }

  async remove(
    tripId: string,
    eventId: string,
    actorUserId: string,
    confirm: boolean,
  ): Promise<void> {
    const before = await this.requireEvent(tripId, eventId);
    await this.assertHardConfirmed(before, confirm);
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'event',
      entityId: eventId,
      action: 'delete',
      before: toEventDto(before),
      apply: (tx) => tx.event.delete({ where: { id: eventId } }),
    });
  }

  private async requireEvent(tripId: string, eventId: string): Promise<PrismaEvent> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tripId } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Hard-event guard (ADR-0011): blocks PATCH/move/DELETE on a hard event unless confirmed. */
  private async assertHardConfirmed(event: PrismaEvent, confirm: boolean): Promise<void> {
    if (event.kind !== EVENT_KIND.HARD || confirm) return;
    const booking = event.bookingId
      ? await this.prisma.booking.findUnique({ where: { id: event.bookingId } })
      : null;
    throw new ConflictException({
      error: {
        code: 'HARD_EVENT_REQUIRES_CONFIRM',
        message: 'This is a hard event — confirm to proceed.',
        details: {
          bookingId: event.bookingId ?? undefined,
          booking: booking ? toBookingDto(booking) : undefined,
        },
      },
    });
  }

  /** Ports computeRipple() 1:1 from frontend/src/state/trip-state.tsx (T-010 notes):
   *  following soft events on the same day, shifted by the same delta, stopping at
   *  the first hard anchor or the first gap. Suggestion only — never applied here. */
  private async computeRippleSuggestion(
    tripId: string,
    moved: TripEvent,
    minutes: number,
  ): Promise<RippleSuggestion | undefined> {
    if (moved.kind !== EVENT_KIND.SOFT || !moved.startsAt || !moved.endsAt) {
      return undefined;
    }

    const dayEvents = await this.prisma.event.findMany({
      where: { tripId, date: new Date(moved.date) },
    });
    const events = dayEvents.map(toEventDto);

    const following = events
      .filter((e) => e.status === EVENT_STATUS.PLANNED && e.startsAt && e.id !== moved.id)
      .sort((a, b) => ms(a.startsAt) - ms(b.startsAt) || a.sortOrder - b.sortOrder)
      .filter((e) => ms(e.startsAt) > ms(moved.startsAt));

    const candidates: RippleSuggestion['candidates'] = [];
    let prevEnd = ms(moved.endsAt);
    for (const e of following) {
      if (e.kind === EVENT_KIND.HARD) break;
      if (ms(e.startsAt) >= prevEnd) break;
      const startsAt = shiftIso(e.startsAt!, minutes);
      const endsAt = e.endsAt ? shiftIso(e.endsAt, minutes) : undefined;
      candidates.push({ id: e.id, startsAt, endsAt });
      prevEnd = ms(endsAt ?? startsAt);
    }
    return candidates.length ? { movedTitle: moved.title, candidates } : undefined;
  }
}
