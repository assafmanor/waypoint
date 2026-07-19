import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CHANGES_PAGE_LIMIT } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SyncController } from './sync.controller';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs).
const DEV_USER = 'u-assaf';

describe('SyncController.list — page bound (B-09)', () => {
  const prisma = new PrismaService();
  const controller = new SyncController(prisma);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'Sync page-bound trip',
        destination: 'Testland',
        startDate: new Date('2027-03-01'),
        endDate: new Date('2027-03-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('caps a single /changes page at CHANGES_PAGE_LIMIT and continues from the last seq', async () => {
    const tripId = await newTrip();
    const total = CHANGES_PAGE_LIMIT + 25;
    await prisma.change.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'event',
        entityId: `e-${i}`,
        action: 'create' as const,
      })),
    });

    const firstPage = await controller.list(tripId, '0');
    expect(firstPage).toHaveLength(CHANGES_PAGE_LIMIT);

    // Continuation: fetch from the last returned seq — the remainder is a short page.
    const nextPage = await controller.list(tripId, firstPage[firstPage.length - 1].seq);
    expect(nextPage).toHaveLength(total - CHANGES_PAGE_LIMIT);
    expect(nextPage.length).toBeLessThan(CHANGES_PAGE_LIMIT);
  });
});
