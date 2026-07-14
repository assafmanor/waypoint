import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { MaybeItemsService } from './maybe-items.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('MaybeItemsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new MaybeItemsService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'MaybeItemsService test trip',
        destination: 'Testland',
        startDate: new Date('2027-02-01'),
        endDate: new Date('2027-02-07'),
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

  it('marks a maybe item consumed through ChangeService', async () => {
    const tripId = await newTrip();
    const item = await prisma.maybeItem.create({
      data: { tripId, title: 'Skytree', createdBy: DEV_USER, updatedBy: DEV_USER },
    });

    const consumed = await service.consume(tripId, item.id, DEV_USER);
    expect(consumed.consumed).toBe(true);

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: item.id, action: 'update' },
    });
    expect(change).toMatchObject({ entityType: 'maybeItem' });
  });

  it('is idempotent when the item is already consumed', async () => {
    const tripId = await newTrip();
    const item = await prisma.maybeItem.create({
      data: { tripId, title: 'Skytree', createdBy: DEV_USER, updatedBy: DEV_USER, consumed: true },
    });

    await expect(service.consume(tripId, item.id, DEV_USER)).resolves.toMatchObject({
      consumed: true,
    });
    const changeCount = await prisma.change.count({ where: { tripId, entityId: item.id } });
    expect(changeCount).toBe(0);
  });

  it('creates a shelf idea through ChangeService', async () => {
    const tripId = await newTrip();
    const created = await service.create(tripId, DEV_USER, { title: 'Cat cafe', icon: '🐱' });
    expect(created).toMatchObject({ title: 'Cat cafe', icon: '🐱', consumed: false });

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: created.id, action: 'create' },
    });
    expect(change).toMatchObject({ entityType: 'maybeItem' });
  });

  it('removes a shelf idea through ChangeService', async () => {
    const tripId = await newTrip();
    const item = await prisma.maybeItem.create({
      data: { tripId, title: 'Uniqlo', createdBy: DEV_USER, updatedBy: DEV_USER },
    });

    await service.remove(tripId, item.id, DEV_USER);
    expect(await prisma.maybeItem.findUnique({ where: { id: item.id } })).toBeNull();

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: item.id, action: 'delete' },
    });
    expect(change).toMatchObject({ entityType: 'maybeItem' });
  });

  it('throws for a maybe item that does not belong to the trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const item = await prisma.maybeItem.create({
      data: { tripId, title: 'Skytree', createdBy: DEV_USER, updatedBy: DEV_USER },
    });

    await expect(service.consume(otherTripId, item.id, DEV_USER)).rejects.toThrow();
  });
});
