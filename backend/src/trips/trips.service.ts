import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CreateTripInput, Membership, Trip, TripSnapshot } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  toBookingDto,
  toEventDto,
  toMaybeItemDto,
  toMembershipDto,
  toTripDto,
  toTripNoteDto,
} from './trips.mapper';

// Stateless invite tokens (auth-and-google.md): base64url(`${tripId}.${expiresAtMs}`) + '.' + HMAC.
// No DB record, so nothing to revoke — acceptable per ADR-0005 (invite revoke isn't gated in v1).
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function signInvitePayload(payload: string): string {
  return createHmac('sha256', inviteSecret()).update(payload).digest('base64url');
}

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTrip(userId: string, input: CreateTripInput): Promise<Trip> {
    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          name: input.name,
          destination: input.destination,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          timezone: input.timezone,
          currency: input.currency,
          dailyBudgetMinor: input.dailyBudgetMinor,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.membership.create({
        data: { tripId: created.id, userId, role: 'admin' },
      });
      return created;
    });
    return toTripDto(trip);
  }

  async getTripWithMembers(tripId: string): Promise<{ trip: Trip; members: Membership[] }> {
    const [trip, members] = await this.prisma.$transaction([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      this.prisma.membership.findMany({ where: { tripId } }),
    ]);
    return { trip: toTripDto(trip), members: members.map(toMembershipDto) };
  }

  createInviteToken(tripId: string): string {
    const payload = `${tripId}.${Date.now() + INVITE_TTL_MS}`;
    const encoded = Buffer.from(payload).toString('base64url');
    return `${encoded}.${signInvitePayload(payload)}`;
  }

  async joinByToken(userId: string, token: string): Promise<Membership> {
    const tripId = this.verifyInviteToken(token);
    const membership = await this.prisma.membership.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: {},
      create: { tripId, userId, role: 'peer' },
    });
    return toMembershipDto(membership);
  }

  /** Admin-only unless removing yourself (leaving the trip) — ADR-0005. */
  async removeMember(tripId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const target = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (actorUserId !== targetUserId) {
      const actor = await this.prisma.membership.findUniqueOrThrow({
        where: { tripId_userId: { tripId, userId: actorUserId } },
      });
      if (actor.role !== 'admin') {
        throw new ForbiddenException('Only an admin can remove another member');
      }
    }

    await this.prisma.membership.delete({ where: { id: target.id } });
  }

  private verifyInviteToken(token: string): string {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) throw new BadRequestException('Malformed invite token');
    const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
    if (signInvitePayload(payload) !== signature) {
      throw new UnauthorizedException('Invalid invite token');
    }
    const [tripId, expiresAt] = payload.split('.');
    if (!tripId || Date.now() > Number(expiresAt)) {
      throw new UnauthorizedException('Invite token expired');
    }
    return tripId;
  }

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
