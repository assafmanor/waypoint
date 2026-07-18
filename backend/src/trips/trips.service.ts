import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Change,
  CreateTripInput,
  InvitePreview,
  JoinTripInput,
  Membership,
  RemovedMember,
  Trip,
  TripSnapshot,
  UpdateMembershipPrefsInput,
  UpdateMembershipRoleInput,
  UpdateTripInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { generateInviteCode } from './invite.util';
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

const toDateOnly = (d: Date): string => d.toISOString().slice(0, 10);

/** A trip is "over" once its end date has passed in the trip's own timezone
 *  (ADR-0067) — that's when an invite code stops working. Falls back to UTC if
 *  the stored timezone is unusable. */
function tripHasEnded(endDate: Date, timezone: string): boolean {
  const endKey = toDateOnly(endDate);
  let todayKey: string;
  try {
    todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    todayKey = toDateOnly(new Date());
  }
  return todayKey > endKey;
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

  /** The trip's one durable invite (ADR-0067): returns the current code, minting
   *  one only if the trip has none. Stable across calls, so opening trip-settings
   *  shows the same link rather than churning a new one each time. */
  async getOrCreateInvite(tripId: string, actorUserId: string): Promise<string> {
    const existing = await this.prisma.invite.findUnique({ where: { tripId } });
    if (existing) return existing.code;
    return this.mintInvite(tripId, actorUserId);
  }

  /** Revoke + replace the trip's invite (ADR-0067): a fresh code + token overwrite
   *  the row in place, so the previously shared code stops resolving at once. */
  async rotateInvite(tripId: string, actorUserId: string): Promise<string> {
    await this.assertAdmin(tripId, actorUserId);
    return this.mintInvite(tripId, actorUserId);
  }

  /** Upsert the trip's single invite row with a new code (retrying on the rare
   *  code collision against the @unique). */
  private async mintInvite(tripId: string, actorUserId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      try {
        await this.prisma.invite.upsert({
          where: { tripId },
          create: { tripId, code, createdBy: actorUserId },
          update: { code },
        });
        return code;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new ConflictException('Could not allocate a unique invite code');
  }

  async joinByCode(userId: string, code: string, input: JoinTripInput = {}): Promise<Membership> {
    const tripId = await this.resolveActiveInvite(code);

    const blocked = await this.prisma.tripBlock.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (blocked) {
      throw new ForbiddenException({
        error: {
          code: 'REMOVED_FROM_TRIP',
          message: 'You were removed from this trip. Ask an admin to re-invite you.',
        },
      });
    }

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
   *  admin would leave the trip admin-less, another member is auto-promoted. An
   *  admin *kick* (actor ≠ target) also writes a `TripBlock` in the same transaction
   *  so the removed member can't rejoin via the live invite link (ADR-0067); a
   *  self-leave writes none. */
  async removeMember(tripId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const target = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');

    const isAdminKick = actorUserId !== targetUserId;
    if (isAdminKick) {
      await this.assertAdmin(tripId, actorUserId);
    }

    await this.changes.mutate({
      tripId,
      actorUserId,
      entityType: 'membership',
      entityId: target.id,
      action: 'delete',
      before: toMembershipDto(target),
      apply: async (tx) => {
        const deleted = await tx.membership.delete({ where: { id: target.id } });
        if (isAdminKick) {
          await tx.tripBlock.upsert({
            where: { tripId_userId: { tripId, userId: targetUserId } },
            create: { tripId, userId: targetUserId, blockedBy: actorUserId },
            update: { blockedBy: actorUserId, blockedAt: new Date() },
          });
        }
        return deleted;
      },
    });

    await this.ensureAdminExists(tripId, actorUserId);
  }

  /** Admin-only list of members an admin has kicked (ADR-0067) — the "Removed"
   *  section in trip-settings, the handle for re-inviting them. */
  async listBlocked(tripId: string, actorUserId: string): Promise<RemovedMember[]> {
    await this.assertAdmin(tripId, actorUserId);
    const blocks = await this.prisma.tripBlock.findMany({
      where: { tripId },
      orderBy: { blockedAt: 'desc' },
      include: { user: true },
    });
    return blocks.map((b) => ({
      userId: b.userId,
      displayName: b.user.displayName,
      avatarColor: b.user.avatarColor,
      blockedAt: b.blockedAt.toISOString(),
    }));
  }

  /** Admin re-invite (ADR-0067): clear a block so the person can rejoin via the
   *  live link. Idempotent — an already-absent block is a no-op. */
  async unblockMember(tripId: string, actorUserId: string, targetUserId: string): Promise<void> {
    await this.assertAdmin(tripId, actorUserId);
    await this.prisma.tripBlock.deleteMany({ where: { tripId, userId: targetUserId } });
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

  /** Public preview for the join screen (ADR-0024) — code invalid, trip gone, or
   *  trip already over all read as 404/410 (nothing joinable to preview). */
  async getInvitePreview(code: string): Promise<InvitePreview> {
    const tripId = await this.resolveActiveInvite(code);
    const [trip, memberCount] = await this.prisma.$transaction([
      this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      this.prisma.membership.count({ where: { tripId } }),
    ]);
    return toInvitePreviewDto(trip, memberCount);
  }

  /** Resolve a public invite code to its trip, enforcing every join gate that is
   *  independent of the caller (ADR-0067): the code exists, the trip exists, and
   *  the trip hasn't ended. A missing code is a 404 (no existence oracle); an over
   *  trip is a 410. The code itself is the grant — there is no token to verify. */
  private async resolveActiveInvite(code: string): Promise<string> {
    const invite = await this.prisma.invite.findUnique({ where: { code } });
    if (!invite) throw new NotFoundException('Invite not found');
    const trip = await this.prisma.trip.findUnique({
      where: { id: invite.tripId },
      select: { endDate: true, timezone: true },
    });
    if (!trip) throw new NotFoundException('Invite not found');
    if (tripHasEnded(trip.endDate, trip.timezone)) {
      throw new GoneException({
        error: { code: 'INVITE_EXPIRED', message: 'This trip has ended.' },
      });
    }
    return invite.tripId;
  }

  async listForUser(userId: string): Promise<Trip[]> {
    const trips = await this.prisma.trip.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { startDate: 'asc' },
      include: { _count: { select: { memberships: true } } },
    });
    return trips.map((t) => toTripDto(t, t._count.memberships));
  }

  async getSnapshot(tripId: string): Promise<TripSnapshot> {
    const [trip, members, events, bookings, documents, maybeItems, places, latestChange] =
      await this.prisma.$transaction([
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
        this.prisma.change.findFirst({
          where: { tripId },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        }),
      ]);

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
