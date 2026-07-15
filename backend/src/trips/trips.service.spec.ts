import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { TripsService } from './trips.service';

// Mirrors TripsService's private token signing (trips.service.ts) so tests can
// craft an already-expired token without exposing that internal for prod use.
function signedInviteToken(tripId: string, expiresAtMs: number): string {
  const payload = `${tripId}.${expiresAtMs}`;
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SECRET!)
    .update(payload)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

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

describe('TripsService', () => {
  const prisma = new PrismaService();
  // Real ChangeService (trip/membership mutations are data-plane now, ADR-0039):
  // it persists a Change row + broadcasts. The gateway has no connected clients
  // in this integration test, so the broadcast is a no-op.
  const changes = new ChangeService(prisma, new SyncGateway(prisma));
  const service = new TripsService(prisma, changes);
  const createdTripIds: string[] = [];

  afterEach(async () => {
    // Membership rows cascade-delete with the trip (schema.prisma).
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
    expect(snapshot.maybeItems.length).toBeGreaterThan(0);
    expect(snapshot.notes.length).toBeGreaterThan(0);
    // Not a fixed value: the trip's Change log is append-only, so any prior
    // mutation against this DB (manual QA, real app use) bumps it permanently.
    expect(snapshot.latestSeq).toMatch(/^\d+$/);

    // dates/timestamps serialize as ISO strings (@waypoint/shared shapes), never Date objects
    expect(snapshot.trip.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.events[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('creates a trip and the creator admin membership in one transaction', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const { members } = await service.getTripWithMembers(trip.id);
    expect(members).toEqual([
      expect.objectContaining({ tripId: trip.id, userId: DEV_USER, role: 'admin' }),
    ]);
  });

  it('lets a peer join via a valid invite token and keeps existing role on rejoin', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const token = service.createInviteToken(trip.id);
    const membership = await service.joinByToken(PEER_USER, token);
    expect(membership).toMatchObject({ tripId: trip.id, userId: PEER_USER, role: 'peer' });

    // Rejoining (e.g. re-using the link) is idempotent and doesn't change the role.
    const rejoinAsCreator = await service.joinByToken(DEV_USER, token);
    expect(rejoinAsCreator.role).toBe('admin');
  });

  it('rejects an invite token for a trip that no longer matches its signature', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const token = service.createInviteToken(trip.id);
    await expect(service.joinByToken(PEER_USER, `${token}-tampered`)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets an admin remove another member', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    await service.removeMember(trip.id, DEV_USER, PEER_USER);

    const { members } = await service.getTripWithMembers(trip.id);
    expect(members.some((m) => m.userId === PEER_USER)).toBe(false);
  });

  it('lets a member remove themselves (leave) without being admin', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    await expect(service.removeMember(trip.id, PEER_USER, PEER_USER)).resolves.toBeUndefined();
  });

  it('blocks a non-admin from removing another member', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));
    await service.joinByToken(OTHER_PEER_USER, service.createInviteToken(trip.id));

    await expect(service.removeMember(trip.id, PEER_USER, OTHER_PEER_USER)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s removing a user who is not a member', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    await expect(service.removeMember(trip.id, DEV_USER, PEER_USER)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('previews a trip for a valid, unexpired invite token', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const preview = await service.getInvitePreview(service.createInviteToken(trip.id));
    expect(preview).toEqual({
      tripName: NEW_TRIP_INPUT.name,
      destination: NEW_TRIP_INPUT.destination,
      startDate: NEW_TRIP_INPUT.startDate,
      endDate: NEW_TRIP_INPUT.endDate,
      memberCount: 1,
    });
  });

  it('404s an invite preview for an expired token', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const expiredToken = signedInviteToken(trip.id, Date.now() - 1000);
    await expect(service.getInvitePreview(expiredToken)).rejects.toThrow(NotFoundException);
  });

  it('404s an invite preview for a malformed token', async () => {
    await expect(service.getInvitePreview('not-a-real-token')).rejects.toThrow(NotFoundException);
  });

  it('defaults calendarSyncEnabled to false when omitted on join', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const membership = await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));
    expect(membership.calendarSyncEnabled).toBe(false);
  });

  it('persists calendarSyncEnabled true/false on join and re-applies it on rejoin', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    const token = service.createInviteToken(trip.id);

    const joined = await service.joinByToken(PEER_USER, token, { calendarSyncEnabled: true });
    expect(joined.calendarSyncEnabled).toBe(true);

    const rejoined = await service.joinByToken(PEER_USER, token, { calendarSyncEnabled: false });
    expect(rejoined.calendarSyncEnabled).toBe(false);
  });

  it('updates the caller own calendarSyncEnabled via updateMembershipPrefs', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const updated = await service.updateMembershipPrefs(trip.id, DEV_USER, {
      calendarSyncEnabled: true,
    });
    expect(updated).toMatchObject({ tripId: trip.id, userId: DEV_USER, calendarSyncEnabled: true });
  });

  it('updateMembershipPrefs only ever touches the caller own row, never another member', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    await service.updateMembershipPrefs(trip.id, PEER_USER, { calendarSyncEnabled: true });

    const { members } = await service.getTripWithMembers(trip.id);
    expect(members.find((m) => m.userId === PEER_USER)?.calendarSyncEnabled).toBe(true);
    expect(members.find((m) => m.userId === DEV_USER)?.calendarSyncEnabled).toBe(false);
  });

  // --- Trip-settings mutations (ADR-0039) ---

  it('lets an admin edit trip details', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    const updated = await service.updateTrip(trip.id, DEV_USER, {
      name: 'Renamed',
      dailyBudgetMinor: 15000,
    });
    expect(updated).toMatchObject({ name: 'Renamed', dailyBudgetMinor: 15000 });
    // Untouched fields are preserved.
    expect(updated.destination).toBe(NEW_TRIP_INPUT.destination);
  });

  it('blocks a peer from editing trip details', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    await expect(service.updateTrip(trip.id, PEER_USER, { name: 'Nope' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a details edit whose merged date range is inverted', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);

    // startDate stays 2027-01-01 (stored); moving only endDate before it is invalid.
    await expect(service.updateTrip(trip.id, DEV_USER, { endDate: '2026-12-31' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lets an admin promote a peer to admin, and blocks a peer from promoting', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));
    await service.joinByToken(OTHER_PEER_USER, service.createInviteToken(trip.id));

    await expect(
      service.setMemberRole(trip.id, PEER_USER, OTHER_PEER_USER, { role: 'admin' }),
    ).rejects.toThrow(ForbiddenException);

    const promoted = await service.setMemberRole(trip.id, DEV_USER, PEER_USER, { role: 'admin' });
    expect(promoted).toMatchObject({ userId: PEER_USER, role: 'admin' });
  });

  it('auto-promotes another member when the last admin leaves', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    // DEV is the only admin; leaving must not orphan the trip.
    await service.removeMember(trip.id, DEV_USER, DEV_USER);

    const { members } = await service.getTripWithMembers(trip.id);
    expect(members.some((m) => m.role === 'admin')).toBe(true);
    expect(members.find((m) => m.userId === PEER_USER)?.role).toBe('admin');
  });

  it('does not auto-promote while an admin still remains', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    // Removing the peer leaves DEV as admin — the peer is simply gone, no promotion.
    await service.removeMember(trip.id, DEV_USER, PEER_USER);

    const { members } = await service.getTripWithMembers(trip.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: DEV_USER, role: 'admin' });
  });

  it('lets an admin delete the trip and blocks a peer from deleting', async () => {
    const trip = await service.createTrip(DEV_USER, NEW_TRIP_INPUT);
    createdTripIds.push(trip.id);
    await service.joinByToken(PEER_USER, service.createInviteToken(trip.id));

    await expect(service.deleteTrip(trip.id, PEER_USER)).rejects.toThrow(ForbiddenException);

    await service.deleteTrip(trip.id, DEV_USER);
    await expect(service.getTripWithMembers(trip.id)).rejects.toThrow();
  });
});
