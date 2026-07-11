import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

describe('TripsService', () => {
  const prisma = new PrismaService();
  const service = new TripsService(prisma);
  const createdTripIds: string[] = [];

  afterEach(async () => {
    // Membership rows cascade-delete with the trip (schema.prisma).
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('lists trips the user is a member of', async () => {
    const trips = await service.listForUser(DEV_USER);
    expect(trips.map((t) => t.id)).toContain(SEEDED_TRIP);
  });

  it('returns an empty list for a user with no memberships', async () => {
    const trips = await service.listForUser('u-nobody');
    expect(trips).toEqual([]);
  });

  it('returns the full snapshot with latestSeq for the seeded trip', async () => {
    const snapshot = await service.getSnapshot(SEEDED_TRIP);

    expect(snapshot.trip.id).toBe(SEEDED_TRIP);
    expect(snapshot.members.some((m) => m.userId === DEV_USER && m.role === 'admin')).toBe(true);
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
});
