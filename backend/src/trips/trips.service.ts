import { Injectable } from '@nestjs/common';
import type { Trip, TripSnapshot } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  toBookingDto,
  toEventDto,
  toMaybeItemDto,
  toMembershipDto,
  toTripDto,
  toTripNoteDto,
} from './trips.mapper';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<Trip[]> {
    const trips = await this.prisma.trip.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { startDate: 'asc' },
    });
    return trips.map(toTripDto);
  }

  async getSnapshot(tripId: string): Promise<TripSnapshot> {
    const [trip, members, events, bookings, maybeItems, notes] = await this.prisma.$transaction([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      this.prisma.membership.findMany({ where: { tripId } }),
      this.prisma.event.findMany({
        where: { tripId },
        orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.booking.findMany({ where: { tripId } }),
      this.prisma.maybeItem.findMany({ where: { tripId } }),
      this.prisma.tripNote.findMany({ where: { tripId }, orderBy: { sortOrder: 'asc' } }),
    ]);

    return {
      trip: toTripDto(trip),
      members: members.map(toMembershipDto),
      events: events.map(toEventDto),
      bookings: bookings.map(toBookingDto),
      maybeItems: maybeItems.map(toMaybeItemDto),
      notes: notes.map(toTripNoteDto),
      // No ChangeService yet (ADR-0022) — real cursor lands with the first data-plane write.
      latestSeq: '0',
    };
  }
}
