import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { TripsService } from './trips.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
// Run `pnpm --filter @waypoint/backend prisma:seed` first if this fails on a fresh DB.
const DEV_USER = 'u-assaf';
const PEER_USER = 'u-noam'; // seeded, not a member of any trip created in these tests
const OTHER_PEER_USER = 'u-dana';
const SEEDED_TRIP = 'trip-japan-26';

const NEW_TRIP_INPUT = {
  name: 'Test Trip',
  destination: 'Testland',
  startDate: '2027-01-01',
  endDate: '2027-01-07',
  timezone: 'UTC',
};

// A trip whose dates are already in the past — its invite code reads as expired (ADR-0067).
const ENDED_TRIP_INPUT = {
  name: 'Past Trip',
  destination: 'Yesterland',
  startDate: '2020-01-01',
  endDate: '2020-01-07',
  timezone: 'UTC',
};

describe('TripsService', () => {
  const prisma = new PrismaService();
  // Real ChangeService (trip/membership mutations are data-plane now, ADR-0039):
  // it persists a Change row + broadcasts. The gateway has no connected clients
  // in this integration test, so the broadcast is a no-op.
  const changes = new ChangeService(prisma, new SyncGateway(prisma));
  const service = new TripsService(prisma, changes);
  const createdTripIds: string[] = [];

  // One trip per case; Invite/TripBlock/Membership rows cascade-delete with it.
  async function freshTrip(input = NEW_TRIP_INPUT): Promise<string> {
    const trip = await service.createTrip(DEV_USER, input);
    createdTripIds.push(trip.id);
    return trip.id;
  }

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('lists trips the user is a member of, with a member count', async () => {
    const trips = await service.listForUser(DEV_USER);
    expect(trips.map((t) => t.id)).toContain(SEEDED_TRIP);
    expect(trips.find((t) => t.id === SEEDED_TRIP)?.memberCount).toBeGreaterThan(0);
  });

  it('returns an empty list for a user with no memberships', async () => {
    const trips = await service.listForUser('u-nobody');
    expect(trips).toEqual([]);
  });

  it('returns the full snapshot with latestSeq for the seeded trip', async () => {
    const snapshot = await service.getSnapshot(SEEDED_TRIP);

    expect(snapshot.trip.id).toBe(SEEDED_TRIP);
    expect(snapshot.members.some((m) => m.userId === DEV_USER && m.role === 'admin')).toBe(true);
    expect(snapshot.users.some((u) => u.id === DEV_USER)).toBe(true);
    expect(snapshot.users.length).toBe(snapshot.members.length);
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.bookings.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.documents)).toBe(true);
    expect(snapshot.maybeItems.length).toBeGreaterThan(0);
    expect(snapshot.places.length).toBeGreaterThan(0);
    // Not a fixed value: the trip's Change log is append-only, so any prior
    // mutation against this DB (manual QA, real app use) bumps it permanently.
    expect(snapshot.latestSeq).toMatch(/^\d+$/);

    // dates/timestamps serialize as ISO strings (@waypoint/shared shapes), never Date objects
    expect(snapshot.trip.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.events[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('creates a trip and the creator admin membership in one transaction', async () => {
    const tripId = await freshTrip();

    const { members } = await service.getTripWithMembers(tripId);
    expect(members).toEqual([expect.objectContaining({ tripId, userId: DEV_USER, role: 'admin' })]);
  });

  // --- Invite codes (ADR-0067) ---

  it('returns one stable invite code (get-or-create), an 8-char base58 handle', async () => {
    const tripId = await freshTrip();

    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    expect(code).toMatch(/^[1-9A-HJ-NP-Za-km-z]{8}$/);
    // Idempotent: a second call returns the same code, not a fresh one.
    expect(await service.getOrCreateInvite(tripId, DEV_USER)).toBe(code);
  });

  it('lets a peer join via a valid code and keeps existing role on rejoin', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);

    const membership = await service.joinByCode(PEER_USER, code);
    expect(membership).toMatchObject({ tripId, userId: PEER_USER, role: 'peer' });

    // Rejoining (re-using the link) is idempotent and doesn't change the role.
    const rejoinAsCreator = await service.joinByCode(DEV_USER, code);
    expect(rejoinAsCreator.role).toBe('admin');
  });

  it('rotates the code (admin revoke): the old code stops resolving, a new one works', async () => {
    const tripId = await freshTrip();
    const oldCode = await service.getOrCreateInvite(tripId, DEV_USER);

    const newCode = await service.rotateInvite(tripId, DEV_USER);
    expect(newCode).not.toBe(oldCode);

    await expect(service.joinByCode(PEER_USER, oldCode)).rejects.toThrow(NotFoundException);
    await expect(service.joinByCode(PEER_USER, newCode)).resolves.toMatchObject({
      userId: PEER_USER,
    });
  });

  it('blocks a peer from rotating (revoking) the invite', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await expect(service.rotateInvite(tripId, PEER_USER)).rejects.toThrow(ForbiddenException);
  });

  it('404s an unknown invite code', async () => {
    await expect(service.getInvitePreview('nosuchcd')).rejects.toThrow(NotFoundException);
    await expect(service.joinByCode(PEER_USER, 'nosuchcd')).rejects.toThrow(NotFoundException);
  });

  it('410s a code whose trip has already ended', async () => {
    const tripId = await freshTrip(ENDED_TRIP_INPUT);
    const code = await service.getOrCreateInvite(tripId, DEV_USER);

    await expect(service.getInvitePreview(code)).rejects.toThrow(GoneException);
    await expect(service.joinByCode(PEER_USER, code)).rejects.toThrow(GoneException);
  });

  it('previews a trip (with tripId for the already-member redirect) for a valid code', async () => {
    const tripId = await freshTrip();

    const preview = await service.getInvitePreview(
      await service.getOrCreateInvite(tripId, DEV_USER),
    );
    expect(preview).toEqual({
      tripId,
      tripName: NEW_TRIP_INPUT.name,
      destination: NEW_TRIP_INPUT.destination,
      startDate: NEW_TRIP_INPUT.startDate,
      endDate: NEW_TRIP_INPUT.endDate,
      memberCount: 1,
    });
  });

  // --- Removal blocks + re-invite (ADR-0067) ---

  it('blocks a kicked member from rejoining via the live link', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);

    await service.removeMember(tripId, DEV_USER, PEER_USER); // admin kick

    await expect(service.joinByCode(PEER_USER, code)).rejects.toThrow(ForbiddenException);
    const removed = await service.listBlocked(tripId, DEV_USER);
    expect(removed).toEqual([expect.objectContaining({ userId: PEER_USER })]);
  });

  it('does NOT block a member who leaves voluntarily — they can rejoin', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);

    await service.removeMember(tripId, PEER_USER, PEER_USER); // self-leave

    expect(await service.listBlocked(tripId, DEV_USER)).toEqual([]);
    await expect(service.joinByCode(PEER_USER, code)).resolves.toMatchObject({ userId: PEER_USER });
  });

  it('lets an admin allow a kicked member back in (clear the block), then they rejoin', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);
    await service.removeMember(tripId, DEV_USER, PEER_USER);

    await service.unblockMember(tripId, DEV_USER, PEER_USER);

    expect(await service.listBlocked(tripId, DEV_USER)).toEqual([]);
    await expect(service.joinByCode(PEER_USER, code)).resolves.toMatchObject({ userId: PEER_USER });
  });

  it('gates the removed-list and unblock behind admin', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);

    await expect(service.listBlocked(tripId, PEER_USER)).rejects.toThrow(ForbiddenException);
    await expect(service.unblockMember(tripId, PEER_USER, OTHER_PEER_USER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // --- Membership removal (ADR-0005/0039) ---

  it('lets an admin remove another member', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await service.removeMember(tripId, DEV_USER, PEER_USER);

    const { members } = await service.getTripWithMembers(tripId);
    expect(members.some((m) => m.userId === PEER_USER)).toBe(false);
  });

  it('lets a member remove themselves (leave) without being admin', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await expect(service.removeMember(tripId, PEER_USER, PEER_USER)).resolves.toBeUndefined();
  });

  it('blocks a non-admin from removing another member', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);
    await service.joinByCode(OTHER_PEER_USER, code);

    await expect(service.removeMember(tripId, PEER_USER, OTHER_PEER_USER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s removing a user who is not a member', async () => {
    const tripId = await freshTrip();

    await expect(service.removeMember(tripId, DEV_USER, PEER_USER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('defaults calendarSyncEnabled to false when omitted on join', async () => {
    const tripId = await freshTrip();

    const membership = await service.joinByCode(
      PEER_USER,
      await service.getOrCreateInvite(tripId, DEV_USER),
    );
    expect(membership.calendarSyncEnabled).toBe(false);
  });

  it('persists calendarSyncEnabled true/false on join and re-applies it on rejoin', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);

    const joined = await service.joinByCode(PEER_USER, code, { calendarSyncEnabled: true });
    expect(joined.calendarSyncEnabled).toBe(true);

    const rejoined = await service.joinByCode(PEER_USER, code, { calendarSyncEnabled: false });
    expect(rejoined.calendarSyncEnabled).toBe(false);
  });

  it('updates the caller own calendarSyncEnabled via updateMembershipPrefs', async () => {
    const tripId = await freshTrip();

    const updated = await service.updateMembershipPrefs(tripId, DEV_USER, {
      calendarSyncEnabled: true,
    });
    expect(updated).toMatchObject({ tripId, userId: DEV_USER, calendarSyncEnabled: true });
  });

  it('updateMembershipPrefs only ever touches the caller own row, never another member', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await service.updateMembershipPrefs(tripId, PEER_USER, { calendarSyncEnabled: true });

    const { members } = await service.getTripWithMembers(tripId);
    expect(members.find((m) => m.userId === PEER_USER)?.calendarSyncEnabled).toBe(true);
    expect(members.find((m) => m.userId === DEV_USER)?.calendarSyncEnabled).toBe(false);
  });

  // --- Trip-settings mutations (ADR-0039) ---

  it('lets an admin edit trip details', async () => {
    const tripId = await freshTrip();

    const updated = await service.updateTrip(tripId, DEV_USER, {
      name: 'Renamed',
      dailyBudgetMinor: 15000,
    });
    expect(updated).toMatchObject({ name: 'Renamed', dailyBudgetMinor: 15000 });
    // Untouched fields are preserved.
    expect(updated.destination).toBe(NEW_TRIP_INPUT.destination);
  });

  it('blocks a peer from editing trip details', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await expect(service.updateTrip(tripId, PEER_USER, { name: 'Nope' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a details edit whose merged date range is inverted', async () => {
    const tripId = await freshTrip();

    // startDate stays 2027-01-01 (stored); moving only endDate before it is invalid.
    await expect(service.updateTrip(tripId, DEV_USER, { endDate: '2026-12-31' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lets an admin promote a peer to admin, and blocks a peer from promoting', async () => {
    const tripId = await freshTrip();
    const code = await service.getOrCreateInvite(tripId, DEV_USER);
    await service.joinByCode(PEER_USER, code);
    await service.joinByCode(OTHER_PEER_USER, code);

    await expect(
      service.setMemberRole(tripId, PEER_USER, OTHER_PEER_USER, { role: 'admin' }),
    ).rejects.toThrow(ForbiddenException);

    const promoted = await service.setMemberRole(tripId, DEV_USER, PEER_USER, { role: 'admin' });
    expect(promoted).toMatchObject({ userId: PEER_USER, role: 'admin' });
  });

  it('auto-promotes another member when the last admin leaves', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    // DEV is the only admin; leaving must not orphan the trip.
    await service.removeMember(tripId, DEV_USER, DEV_USER);

    const { members } = await service.getTripWithMembers(tripId);
    expect(members.some((m) => m.role === 'admin')).toBe(true);
    expect(members.find((m) => m.userId === PEER_USER)?.role).toBe('admin');
  });

  it('does not auto-promote while an admin still remains', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    // Removing the peer leaves DEV as admin — the peer is simply gone, no promotion.
    await service.removeMember(tripId, DEV_USER, PEER_USER);

    const { members } = await service.getTripWithMembers(tripId);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: DEV_USER, role: 'admin' });
  });

  it('lets an admin delete the trip and blocks a peer from deleting', async () => {
    const tripId = await freshTrip();
    await service.joinByCode(PEER_USER, await service.getOrCreateInvite(tripId, DEV_USER));

    await expect(service.deleteTrip(tripId, PEER_USER)).rejects.toThrow(ForbiddenException);

    await service.deleteTrip(tripId, DEV_USER);
    await expect(service.getTripWithMembers(tripId)).rejects.toThrow();
  });
});
