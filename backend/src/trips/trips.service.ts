import { createHmac, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Change,
  CreateTripInput,
  InvitePreview,
  JoinTripInput,
  Membership,
  Trip,
  TripSnapshot,
  UpdateMembershipPrefsInput,
  UpdateMembershipRoleInput,
  UpdateTripInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import {
  toBookingDto,
  toDocumentSummaryDto,
  toEventDto,
  toInvitePreviewDto,
  toMaybeItemDto,
  toMembershipDto,
  toPlaceDto,
  toTripDto,
  toUserDto,
} from './trips.mapper';

// Stateless invite tokens (auth-and-google.md): base64url(`${tripId}.${expiresAtMs}`) + '.' + HMAC.
// No DB record, so nothing to revoke — acceptable per ADR-0005 (invite revoke isn't gated in v1).
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: ChangeService,
  ) {}

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
          icon: input.icon,
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

  /** Admin-only trip-details edit (ADR-0039), data-plane via ChangeService so it
   *  broadcasts + is offline-capable like the timeline. A partial patch that
   *  moves only one date bound is validated against the stored trip here (the
   *  shared schema only checks when both bounds are present). */
  async updateTrip(tripId: string, actorUserId: string, input: UpdateTripInput): Promise<Trip> {
    await this.assertAdmin(tripId, actorUserId);
    const before = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });

    const startDate = input.startDate ?? toDateOnly(before.startDate);
    const endDate = input.endDate ?? toDateOnly(before.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must not be before startDate');
    }

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'trip',
      entityId: tripId,
      action: 'update',
      before: toTripDto(before),
      after: input,
      apply: (tx) =>
        tx.trip.update({
          where: { id: tripId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.destination !== undefined && { destination: input.destination }),
            ...(input.icon !== undefined && { icon: input.icon }),
            ...(input.startDate !== undefined && { startDate: new Date(input.startDate) }),
            ...(input.endDate !== undefined && { endDate: new Date(input.endDate) }),
            ...(input.timezone !== undefined && { timezone: input.timezone }),
            ...(input.currency !== undefined && { currency: input.currency }),
            ...(input.dailyBudgetMinor !== undefined && {
              dailyBudgetMinor: input.dailyBudgetMinor,
            }),
            updatedBy: actorUserId,
          },
        }),
    });
    return toTripDto(entity);
  }

  /** Admin-only trip deletion (ADR-0039). The delete cascades the trip's whole
   *  `Change` feed with it, so there is nothing durable to log against — instead
   *  we fan out an ephemeral `trip`/`delete` change so connected members leave
   *  the trip live. Not toast-undoable (a double-confirm guards it client-side). */
  async deleteTrip(tripId: string, actorUserId: string): Promise<void> {
    await this.assertAdmin(tripId, actorUserId);
    await this.prisma.trip.delete({ where: { id: tripId } });
    this.changes.broadcastEphemeral(tripId, this.syntheticChange(tripId, actorUserId));
  }

  createInviteToken(tripId: string): string {
    const payload = `${tripId}.${Date.now() + INVITE_TTL_MS}`;
    const encoded = Buffer.from(payload).toString('base64url');
    return `${encoded}.${signInvitePayload(payload)}`;
  }

  async joinByToken(userId: string, token: string, input: JoinTripInput = {}): Promise<Membership> {
    const tripId = this.verifyInviteToken(token);
    const membership = await this.prisma.membership.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: { ...input },
      create: { tripId, userId, role: 'peer', ...input },
    });
    return toMembershipDto(membership);
  }

  /** Self-only — MembershipGuard already confirms `userId` is a member of `tripId` (ADR-0005). */
  async updateMembershipPrefs(
    tripId: string,
    userId: string,
    input: UpdateMembershipPrefsInput,
  ): Promise<Membership> {
    const membership = await this.prisma.membership.update({
      where: { tripId_userId: { tripId, userId } },
      data: input,
    });
    return toMembershipDto(membership);
  }

  /** Admin promotes a peer to admin (ADR-0039). Admin-only; data-plane so the
   *  roster updates live for everyone. No explicit demotion path in v1. */
  async setMemberRole(
    tripId: string,
    actorUserId: string,
    targetUserId: string,
    input: UpdateMembershipRoleInput,
  ): Promise<Membership> {
    await this.assertAdmin(tripId, actorUserId);
    const target = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === input.role) return toMembershipDto(target); // idempotent no-op

    const { entity } = await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'membership',
      entityId: target.id,
      action: 'update',
      before: toMembershipDto(target),
      after: toMembershipDto({ ...target, role: input.role }),
      apply: (tx) => tx.membership.update({ where: { id: target.id }, data: { role: input.role } }),
    });
    return toMembershipDto(entity);
  }

  /** Admin-only unless removing yourself (leaving the trip) — ADR-0005. Data-plane
   *  via ChangeService so the roster updates live (ADR-0039). If removing the last
   *  admin would leave the trip admin-less, another member is auto-promoted. */
  async removeMember(tripId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const target = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    if (actorUserId !== targetUserId) {
      await this.assertAdmin(tripId, actorUserId);
    }

    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'membership',
      entityId: target.id,
      action: 'delete',
      before: toMembershipDto(target),
      apply: (tx) => tx.membership.delete({ where: { id: target.id } }),
    });

    await this.ensureAdminExists(tripId, actorUserId);
  }

  /** After a removal, if no admin remains but members do, promote the
   *  earliest-joined member (arbitrary but stable) so a trip is never
   *  admin-less (ADR-0039). The promotion is itself a data-plane change. */
  private async ensureAdminExists(tripId: string, actorUserId: string): Promise<void> {
    const remaining = await this.prisma.membership.findMany({
      where: { tripId },
      orderBy: { joinedAt: 'asc' },
    });
    if (remaining.length === 0 || remaining.some((m) => m.role === 'admin')) return;

    const next = remaining[0];
    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'membership',
      entityId: next.id,
      action: 'update',
      before: toMembershipDto(next),
      after: toMembershipDto({ ...next, role: 'admin' }),
      apply: (tx) => tx.membership.update({ where: { id: next.id }, data: { role: 'admin' } }),
    });
  }

  /** Throws 403 unless the actor is an `admin` of the trip. Assumes membership
   *  is already confirmed (MembershipGuard); a non-member reads as non-admin. */
  private async assertAdmin(tripId: string, userId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
  }

  /** A non-persisted `trip`/`delete` change for the ephemeral delete broadcast. */
  private syntheticChange(tripId: string, actorUserId: string): Change {
    return {
      id: randomUUID(),
      seq: '0', // not persisted; the trip's feed is gone, so the cursor is moot
      tripId,
      actorUserId,
      entityType: 'trip',
      entityId: tripId,
      action: 'delete',
      createdAt: new Date().toISOString(),
    };
  }

  /** Public preview for the join screen (ADR-0024) — token invalid or trip gone both 404. */
  async getInvitePreview(token: string): Promise<InvitePreview> {
    let tripId: string;
    try {
      tripId = this.verifyInviteToken(token);
    } catch {
      throw new NotFoundException('Invite not found');
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Invite not found');
    const memberCount = await this.prisma.membership.count({ where: { tripId } });
    return toInvitePreviewDto(trip, memberCount);
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
      include: { _count: { select: { memberships: true } } },
    });
    return trips.map((t) => toTripDto(t, t._count.memberships));
  }

  /**
   * A coherent baseline + cursor (ADR-0019). Read at RepeatableRead so all
   * entity lists reflect one consistent snapshot, and read `latestSeq` FIRST so
   * the cursor can only ever be stale-*low* relative to the entities — a client
   * then harmlessly re-applies the extra change via `/changes` (idempotent). The
   * inverse (cursor ahead of the entities) is B-01's data loss, and the
   * write-side per-trip lock (ADR-0067) guarantees a visible `latestSeq` means
   * every lower `seq` has already committed, so no entity it counts is missing.
   */
  async getSnapshot(tripId: string): Promise<TripSnapshot> {
    const [latestChange, trip, members, events, bookings, documents, maybeItems, places] =
      await this.prisma.$transaction(
        [
          this.prisma.change.findFirst({
            where: { tripId },
            orderBy: { seq: 'desc' },
            select: { seq: true },
          }),
          this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
          this.prisma.membership.findMany({ where: { tripId }, include: { user: true } }),
          this.prisma.event.findMany({
            where: { tripId },
            orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
          }),
          this.prisma.booking.findMany({ where: { tripId } }),
          this.prisma.document.findMany({ where: { tripId }, orderBy: { createdAt: 'asc' } }),
          this.prisma.maybeItem.findMany({ where: { tripId } }),
          this.prisma.place.findMany({ where: { tripId }, orderBy: { createdAt: 'asc' } }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

    return {
      trip: toTripDto(trip),
      members: members.map(toMembershipDto),
      users: members.map((m) => toUserDto(m.user)),
      events: events.map(toEventDto),
      bookings: bookings.map(toBookingDto),
      documents: documents.map(toDocumentSummaryDto),
      maybeItems: maybeItems.map(toMaybeItemDto),
      places: places.map(toPlaceDto),
      latestSeq: latestChange ? latestChange.seq.toString() : '0',
    };
  }
}
