import 'reflect-metadata';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from './trips.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
// Run `pnpm --filter @waypoint/backend prisma:seed` first if this fails on a fresh DB.
const DEV_USER = 'u-assaf';
const SEEDED_TRIP = 'trip-japan-26';

describe('TripsService', () => {
  const prisma = new PrismaService();
  const service = new TripsService(prisma);

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
    expect(snapshot.latestSeq).toBe('0');

    // dates/timestamps serialize as ISO strings (@waypoint/shared shapes), never Date objects
    expect(snapshot.trip.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.events[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
