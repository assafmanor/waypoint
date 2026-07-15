import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Event as PrismaEvent } from '@prisma/client';
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
  // Which way the shift propagates: 'later' pushes following events forward (the
  // moved event was delayed), 'earlier' pulls preceding events back (it was moved
  // up). The client needs this to phrase the prompt correctly — the geometry
  // alone doesn't say whether we're rippling down or up.
  direction: 'later' | 'earlier';
  candidates: { id: string; startsAt: string; endsAt?: string }[];
}

export interface MoveEventResult {
  event: TripEvent;
  rippleSuggestion?: RippleSuggestion;
}

const ms = (iso?: string | null) => (iso ? Date.parse(iso) : 0);
const shiftIso = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60000).toISOString();

/** The YYYY-MM-DD calendar day an instant falls on, in a given IANA timezone. */
const localDateKey = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

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
    try {
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
              category: input.category,
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
    } catch (err) {
      // A client-generated id (ADR-0018) makes an offline-outbox retry idempotent:
      // re-POSTing an already-created event hits the id's unique constraint, which
      // we treat as "already applied" rather than an error (sync-and-offline.md).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return toEventDto(await this.requireEvent(tripId, id));
      }
      throw err;
    }
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
            ...(input.category !== undefined && { category: input.category }),
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
    if (input.startsAt !== undefined && input.date === undefined) {
      await this.assertValidMoveTarget(tripId, before, input.startsAt);
    }

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

  /** Guards a quick nudge's target time against two invariants it should never
   *  silently violate: landing in the past, or crossing out of the day it's
   *  scheduled on (a different day is a Plan-mode reassignment — pass `date`
   *  explicitly for that; this guard only applies to a bare `startsAt` nudge). */
  private async assertValidMoveTarget(
    tripId: string,
    before: PrismaEvent,
    newStartsAt: string,
  ): Promise<void> {
    if (new Date(newStartsAt).getTime() <= Date.now()) {
      throw new ConflictException({
        error: {
          code: 'MOVE_INTO_PAST',
          message: 'Cannot move an event to start in the past.',
        },
      });
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { timezone: true },
    });
    const eventDay = before.date.toISOString().slice(0, 10);
    if (localDateKey(newStartsAt, trip.timezone) !== eventDay) {
      throw new ConflictException({
        error: {
          code: 'MOVE_CROSSES_DAY',
          message: 'Cannot move an event to a different day — use Plan mode to reschedule it.',
        },
      });
    }
  }

  /** Ports computeRipple() 1:1 from frontend/src/state/trip-state.tsx (T-010 notes),
   *  generalized to walk either direction (T-014 follow-on): a positive shift pushes
   *  contiguous/overlapping following soft events later; a negative shift pulls
   *  contiguous/overlapping preceding soft events earlier. Stops at the first hard
   *  anchor or the first event that isn't actually overlapping (nothing to resolve).
   *  Suggestion only — never applied here. */
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
    const events = dayEvents
      .map(toEventDto)
      .filter((e) => e.status === EVENT_STATUS.PLANNED && e.startsAt && e.id !== moved.id);

    const direction = minutes > 0 ? 'later' : 'earlier';
    const candidates =
      minutes > 0
        ? this.rippleForward(events, moved, minutes)
        : this.rippleBackward(events, moved, minutes);

    return candidates.length ? { movedTitle: moved.title, direction, candidates } : undefined;
  }

  private rippleForward(
    events: TripEvent[],
    moved: TripEvent,
    minutes: number,
  ): RippleSuggestion['candidates'] {
    const following = events
      .filter((e) => ms(e.startsAt) > ms(moved.startsAt))
      .sort((a, b) => ms(a.startsAt) - ms(b.startsAt) || a.sortOrder - b.sortOrder);

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
    return candidates;
  }

  /** Mirror of rippleForward: walks preceding events in reverse, pulling each one
   *  earlier while it overlaps the shifted-back start of its successor. Also stops
   *  at the first event that's already started — pulling it earlier would rewrite
   *  something that's already happened, which pushing later can never do. */
  private rippleBackward(
    events: TripEvent[],
    moved: TripEvent,
    minutes: number,
  ): RippleSuggestion['candidates'] {
    const preceding = events
      .filter((e) => ms(e.startsAt) < ms(moved.startsAt))
      .sort((a, b) => ms(b.startsAt) - ms(a.startsAt) || b.sortOrder - a.sortOrder);

    const now = Date.now();
    const candidates: RippleSuggestion['candidates'] = [];
    let prevStart = ms(moved.startsAt);
    for (const e of preceding) {
      if (e.kind === EVENT_KIND.HARD) break;
      if (ms(e.startsAt) <= now) break;
      if (ms(e.endsAt ?? e.startsAt) <= prevStart) break;
      const startsAt = shiftIso(e.startsAt!, minutes);
      const endsAt = e.endsAt ? shiftIso(e.endsAt, minutes) : undefined;
      candidates.push({ id: e.id, startsAt, endsAt });
      prevStart = ms(startsAt);
    }
    return candidates;
  }
}
