import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { PlacesService } from './places.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('PlacesService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new PlacesService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'PlacesService test trip',
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

  it('creates a name-only place and reads it back via list()', async () => {
    const tripId = await newTrip();

    const created = await service.create(tripId, DEV_USER, { name: 'Shibuya' });

    expect(created.name).toBe('Shibuya');
    expect(created.googlePlaceId).toBeUndefined();
    const list = await service.list(tripId);
    expect(list.map((p) => p.id)).toContain(created.id);

    const change = await prisma.change.findFirst({ where: { tripId, entityId: created.id } });
    expect(change).toMatchObject({ entityType: 'place', action: 'create' });
  });

  it('enriches a place on update (the picker path)', async () => {
    const tripId = await newTrip();
    const place = await service.create(tripId, DEV_USER, { name: 'Shibuya' });

    const updated = await service.update(tripId, place.id, DEV_USER, {
      googlePlaceId: 'ChIJ123',
      lat: 35.6595,
      lng: 139.7005,
    });

    expect(updated.googlePlaceId).toBe('ChIJ123');
    expect(updated.lat).toBeCloseTo(35.6595);
  });

  it('treats a re-POST of the same client id as already applied (offline retry)', async () => {
    const tripId = await newTrip();
    const input = { id: 'pl-retry-1', name: 'Asakusa' };

    const first = await service.create(tripId, DEV_USER, input);
    const second = await service.create(tripId, DEV_USER, input);

    expect(second.id).toBe(first.id);
    expect(await prisma.place.count({ where: { tripId } })).toBe(1);
  });
});
