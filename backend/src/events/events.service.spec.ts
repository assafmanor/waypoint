import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { EVENT_KIND, EVENT_STATUS } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { EventsService } from './events.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';
const TZ = '+09:00';
const DAY = '2027-02-01';
const at = (time: string) => `${DAY}T${time}:00${TZ}`;

describe('EventsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new EventsService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'EventsService test trip',
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
    // Bookings/Events/Change rows cascade-delete with the trip (schema.prisma).
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('creates an event through ChangeService and reads it back via list()', async () => {
    const tripId = await newTrip();

    const created = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Ramen',
      kind: EVENT_KIND.SOFT,
      startsAt: at('19:00'),
      endsAt: at('20:00'),
      source: 'manual',
    });

    expect(created.title).toBe('Ramen');
    const list = await service.list(tripId);
    expect(list.map((e) => e.id)).toContain(created.id);

    const change = await prisma.change.findFirst({ where: { tripId, entityId: created.id } });
    expect(change).toMatchObject({ entityType: 'event', action: 'create' });
  });

  it('blocks PATCH on a hard event without confirm, and allows it with confirm', async () => {
    const tripId = await newTrip();
    const booking = await prisma.booking.create({
      data: {
        tripId,
        type: 'restaurant',
        title: 'Ichiran',
        confirmationCode: '1234',
        updatedBy: DEV_USER,
      },
    });
    const hard = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Ichiran Ramen',
      kind: EVENT_KIND.HARD,
      startsAt: at('19:30'),
      endsAt: at('21:00'),
      bookingId: booking.id,
      source: 'manual',
    });

    await expect(
      service.update(tripId, hard.id, DEV_USER, { title: 'renamed' }, false),
    ).rejects.toThrow(ConflictException);

    const updated = await service.update(tripId, hard.id, DEV_USER, { title: 'renamed' }, true);
    expect(updated.title).toBe('renamed');
  });

  it('never blocks a soft event, even without confirm', async () => {
    const tripId = await newTrip();
    const soft = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Shinjuku',
      kind: EVENT_KIND.SOFT,
      startsAt: at('16:30'),
      endsAt: at('19:30'),
      source: 'manual',
    });

    await expect(
      service.update(tripId, soft.id, DEV_USER, { title: 'still soft' }, false),
    ).resolves.toMatchObject({ title: 'still soft' });
  });

  it('blocks DELETE and move on a hard event without confirm', async () => {
    const tripId = await newTrip();
    const hard = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Flight',
      kind: EVENT_KIND.HARD,
      startsAt: at('08:00'),
      endsAt: at('10:00'),
      source: 'manual',
    });

    await expect(service.remove(tripId, hard.id, DEV_USER, false)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.move(tripId, hard.id, DEV_USER, { startsAt: at('09:00') }, false),
    ).rejects.toThrow(ConflictException);

    await expect(service.remove(tripId, hard.id, DEV_USER, true)).resolves.toBeUndefined();
  });

  it('moves an event atomically and returns the updated entity', async () => {
    const tripId = await newTrip();
    const soft = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Golden Gai',
      kind: EVENT_KIND.SOFT,
      startsAt: at('21:30'),
      endsAt: at('22:30'),
      source: 'manual',
    });

    const { event } = await service.move(
      tripId,
      soft.id,
      DEV_USER,
      { startsAt: at('22:00') },
      false,
    );
    expect(event.startsAt).toBe(new Date(at('22:00')).toISOString());

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: soft.id, action: 'move' },
    });
    expect(change).not.toBeNull();
  });

  it('ripples following soft events on overlap, stopping at the first hard anchor', async () => {
    const tripId = await newTrip();
    const goldenGai = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Golden Gai',
      kind: EVENT_KIND.SOFT,
      startsAt: at('21:30'),
      endsAt: at('22:30'),
      source: 'manual',
    });
    const walkback = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Walk back',
      kind: EVENT_KIND.SOFT,
      startsAt: at('22:45'),
      endsAt: at('23:15'),
      sortOrder: 1,
      source: 'manual',
    });
    const flight = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Early flight (hard, unaffected)',
      kind: EVENT_KIND.HARD,
      startsAt: at('23:30'),
      endsAt: at('23:59'),
      sortOrder: 2,
      source: 'manual',
    });

    // Push Golden Gai 30 minutes later so it now overlaps the walk-back.
    const { rippleSuggestion } = await service.move(
      tripId,
      goldenGai.id,
      DEV_USER,
      { startsAt: at('22:00') },
      false,
    );

    expect(rippleSuggestion?.movedTitle).toBe('Golden Gai');
    expect(rippleSuggestion?.candidates).toEqual([
      {
        id: walkback.id,
        startsAt: new Date(at('23:15')).toISOString(),
        endsAt: new Date(at('23:45')).toISOString(),
      },
    ]);
    expect(rippleSuggestion?.candidates.some((c) => c.id === flight.id)).toBe(false);

    // Suggestion only — never auto-applied.
    const untouchedWalkback = await prisma.event.findUniqueOrThrow({ where: { id: walkback.id } });
    expect(untouchedWalkback.startsAt?.toISOString()).toBe(new Date(at('22:45')).toISOString());
  });

  it('does not ripple a hard event move', async () => {
    const tripId = await newTrip();
    const booking = await prisma.booking.create({
      data: { tripId, type: 'flight', title: 'Flight', updatedBy: DEV_USER },
    });
    const hard = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Flight',
      kind: EVENT_KIND.HARD,
      startsAt: at('08:00'),
      endsAt: at('10:00'),
      bookingId: booking.id,
      source: 'manual',
    });
    await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Following soft',
      kind: EVENT_KIND.SOFT,
      startsAt: at('10:15'),
      endsAt: at('11:00'),
      sortOrder: 1,
      source: 'manual',
    });

    const { rippleSuggestion } = await service.move(
      tripId,
      hard.id,
      DEV_USER,
      { startsAt: at('09:00') },
      true,
    );
    expect(rippleSuggestion).toBeUndefined();
  });

  it('skips events with status done/skipped when computing ripple', async () => {
    const tripId = await newTrip();
    const moved = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Moved',
      kind: EVENT_KIND.SOFT,
      startsAt: at('10:00'),
      endsAt: at('11:00'),
      source: 'manual',
    });
    const done = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Already done',
      kind: EVENT_KIND.SOFT,
      startsAt: at('11:15'),
      endsAt: at('12:00'),
      sortOrder: 1,
      source: 'manual',
    });
    await service.setStatus(tripId, done.id, DEV_USER, EVENT_STATUS.DONE);

    const { rippleSuggestion } = await service.move(
      tripId,
      moved.id,
      DEV_USER,
      { startsAt: at('11:00') },
      false,
    );
    expect(rippleSuggestion).toBeUndefined();
  });
});
