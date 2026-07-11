import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { EVENT_KIND } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { BookingsService } from './bookings.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('BookingsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new BookingsService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'BookingsService test trip',
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
    // Events/Bookings/Change rows cascade-delete with the trip (schema.prisma).
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('creates a booking through ChangeService and reads it back via list()', async () => {
    const tripId = await newTrip();

    const created = await service.create(tripId, DEV_USER, {
      type: 'flight',
      title: 'NRT -> HND',
      confirmationCode: 'ABC123',
    });

    expect(created.title).toBe('NRT -> HND');
    const list = await service.list(tripId);
    expect(list.map((b) => b.id)).toContain(created.id);

    const change = await prisma.change.findFirst({ where: { tripId, entityId: created.id } });
    expect(change).toMatchObject({ entityType: 'booking', action: 'create' });
  });

  it('updates a booking through ChangeService', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, { type: 'hotel', title: 'Park Hyatt' });

    const updated = await service.update(tripId, booking.id, DEV_USER, {
      title: 'Park Hyatt Tokyo',
    });
    expect(updated.title).toBe('Park Hyatt Tokyo');

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: booking.id, action: 'update' },
    });
    expect(change).not.toBeNull();
  });

  it('deletes an unreferenced booking without confirmation', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, {
      type: 'restaurant',
      title: 'Ichiran',
    });

    await expect(service.remove(tripId, booking.id, DEV_USER, false)).resolves.toBeUndefined();
  });

  it('deletes a booking only referenced by a soft event without confirmation', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, { type: 'activity', title: 'Teamlab' });
    await prisma.event.create({
      data: {
        tripId,
        date: new Date('2027-02-01'),
        title: 'Maybe Teamlab',
        kind: EVENT_KIND.SOFT,
        bookingId: booking.id,
        updatedBy: DEV_USER,
      },
    });

    await expect(service.remove(tripId, booking.id, DEV_USER, false)).resolves.toBeUndefined();
  });

  it('blocks deleting a booking a hard event still references, until confirmed', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, { type: 'flight', title: 'Flight' });
    await prisma.event.create({
      data: {
        tripId,
        date: new Date('2027-02-01'),
        title: 'Flight',
        kind: EVENT_KIND.HARD,
        bookingId: booking.id,
        updatedBy: DEV_USER,
      },
    });

    await expect(service.remove(tripId, booking.id, DEV_USER, false)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.remove(tripId, booking.id, DEV_USER, true)).resolves.toBeUndefined();

    const orphaned = await prisma.event.findMany({ where: { tripId } });
    expect(orphaned[0].bookingId).toBeNull();
  });
});
