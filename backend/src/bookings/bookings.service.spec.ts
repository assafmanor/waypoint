import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

    await expect(
      service.remove(tripId, booking.id, DEV_USER, false, false),
    ).resolves.toBeUndefined();
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

    await expect(
      service.remove(tripId, booking.id, DEV_USER, false, false),
    ).resolves.toBeUndefined();
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

    await expect(service.remove(tripId, booking.id, DEV_USER, false, false)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.remove(tripId, booking.id, DEV_USER, true, false),
    ).resolves.toBeUndefined();

    const orphaned = await prisma.event.findMany({ where: { tripId } });
    expect(orphaned[0].bookingId).toBeNull();
  });

  async function newPlace(tripId: string, name: string): Promise<string> {
    const place = await prisma.place.create({ data: { tripId, name, updatedBy: DEV_USER } });
    return place.id;
  }

  const eventSeed = (kind: 'hard' | 'soft' = 'hard') => ({
    date: '2027-02-02',
    startsAt: '2027-02-02T10:00:00Z',
    endsAt: '2027-02-02T11:00:00Z',
    kind,
  });

  it('auto-creates the linked event with two changes in one transaction (ADR-0047 §1)', async () => {
    const tripId = await newTrip();

    const booking = await service.create(tripId, DEV_USER, {
      type: 'restaurant',
      title: 'Sukiyabashi Jiro',
      event: eventSeed(),
    });

    const event = await prisma.event.findUnique({ where: { bookingId: booking.id } });
    expect(event).not.toBeNull();
    expect(event?.kind).toBe(EVENT_KIND.HARD);
    expect(event?.title).toBe('Sukiyabashi Jiro');
    // Linked event's place lives on the booking → its own placeId is null (ADR-0048).
    expect(event?.placeId).toBeNull();

    const changes = await prisma.change.findMany({ where: { tripId }, orderBy: { seq: 'asc' } });
    expect(changes.map((c) => `${c.entityType}:${c.action}`)).toEqual([
      'booking:create',
      'event:create',
    ]);
  });

  it('is idempotent when the same client ids are re-POSTed (offline retry)', async () => {
    const tripId = await newTrip();
    const input = {
      id: 'bk-retry-1',
      type: 'restaurant' as const,
      title: 'Retry Ramen',
      event: { ...eventSeed(), id: 'ev-retry-1' },
    };

    const first = await service.create(tripId, DEV_USER, input);
    const second = await service.create(tripId, DEV_USER, input);

    expect(second.id).toBe(first.id);
    expect(await prisma.booking.count({ where: { tripId } })).toBe(1);
    expect(await prisma.event.count({ where: { tripId } })).toBe(1);
    // The rolled-back retry writes no extra changes.
    expect(await prisma.change.count({ where: { tripId } })).toBe(2);
  });

  it('delete-both removes the booking and its linked event', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, {
      type: 'activity',
      title: 'Teamlab',
      event: eventSeed('soft'),
    });

    await service.remove(tripId, booking.id, DEV_USER, false, true);

    expect(await prisma.booking.count({ where: { tripId } })).toBe(0);
    expect(await prisma.event.count({ where: { tripId } })).toBe(0);
    const changes = await prisma.change.findMany({ where: { tripId }, orderBy: { seq: 'asc' } });
    expect(changes.map((c) => `${c.entityType}:${c.action}`)).toContain('event:delete');
    expect(changes.map((c) => `${c.entityType}:${c.action}`)).toContain('booking:delete');
  });

  it('unlink keeps the event and records an event update (not a silent FK SetNull)', async () => {
    const tripId = await newTrip();
    const booking = await service.create(tripId, DEV_USER, {
      type: 'activity',
      title: 'Teamlab',
      event: eventSeed('soft'),
    });

    await service.remove(tripId, booking.id, DEV_USER, false, false);

    const events = await prisma.event.findMany({ where: { tripId } });
    expect(events).toHaveLength(1);
    expect(events[0].bookingId).toBeNull();
    const updates = await prisma.change.findMany({
      where: { tripId, entityType: 'event', action: 'update' },
    });
    expect(updates.length).toBeGreaterThan(0);
  });

  it('rejects a place that does not belong to the trip', async () => {
    const tripId = await newTrip();
    await expect(
      service.create(tripId, DEV_USER, { type: 'hotel', title: 'Hotel', placeId: 'pl-missing' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid trip place and enforces the transport/single-place partition', async () => {
    const tripId = await newTrip();
    const placeId = await newPlace(tripId, 'Park Hyatt');

    const hotel = await service.create(tripId, DEV_USER, {
      type: 'hotel',
      title: 'Hotel',
      placeId,
    });
    expect(hotel.placeId).toBe(placeId);

    // A hotel may not carry origin/destination; a flight may not carry a single placeId.
    await expect(
      service.create(tripId, DEV_USER, { type: 'hotel', title: 'Hotel', fromPlaceId: placeId }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(tripId, DEV_USER, { type: 'flight', title: 'Flight', placeId }),
    ).rejects.toThrow(BadRequestException);
  });
});
