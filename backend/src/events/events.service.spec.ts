import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

  // B-06: events wrote client-supplied bookingId/placeId unchecked, so a member of
  // trip A could reference trip B's booking/place (corrupting the Event↔Booking 1:1
  // across trips and escaping the same-trip hard-event guard). Both are now
  // trip-scoped and a cross-trip reference is a 400.
  it("rejects an event referencing another trip's booking (cross-trip)", async () => {
    const tripA = await newTrip();
    const tripB = await newTrip();
    const foreignBooking = await prisma.booking.create({
      data: { tripId: tripB, type: 'hotel', title: 'B hotel', updatedBy: DEV_USER },
    });

    await expect(
      service.create(tripA, DEV_USER, {
        date: DAY,
        title: 'Linked to B',
        kind: EVENT_KIND.SOFT,
        bookingId: foreignBooking.id,
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await service.list(tripA)).toEqual([]);
  });

  it("rejects an event referencing another trip's place (cross-trip)", async () => {
    const tripA = await newTrip();
    const tripB = await newTrip();
    const foreignPlace = await prisma.place.create({
      data: { tripId: tripB, name: 'B place', updatedBy: DEV_USER },
    });

    await expect(
      service.create(tripA, DEV_USER, {
        date: DAY,
        title: 'At B place',
        kind: EVENT_KIND.SOFT,
        placeId: foreignPlace.id,
        source: 'manual',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an event referencing a place in the same trip', async () => {
    const tripId = await newTrip();
    const place = await prisma.place.create({
      data: { tripId, name: 'A place', updatedBy: DEV_USER },
    });

    const created = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'At A place',
      kind: EVENT_KIND.SOFT,
      placeId: place.id,
      source: 'manual',
    });
    expect(created.placeId).toBe(place.id);
  });

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

  // T-013: a client-generated id (ADR-0018) makes an offline-outbox re-POST
  // idempotent — the retry hits the id's unique constraint, which is treated
  // as "already applied" (returns the existing event) rather than an error.
  it('treats a duplicate create (same client-generated id) as already-applied, not an error', async () => {
    const tripId = await newTrip();
    const input = {
      id: 'ev-client-generated',
      date: DAY,
      title: 'Ramen',
      kind: EVENT_KIND.SOFT,
      startsAt: at('19:00'),
      endsAt: at('20:00'),
      source: 'manual',
    } as const;

    const first = await service.create(tripId, DEV_USER, input);
    const retry = await service.create(tripId, DEV_USER, input);

    expect(retry.id).toBe(first.id);
    expect(retry).toEqual(first);
    // No duplicate Change row from the retry — it never reached ChangeService.mutate.
    const changeCount = await prisma.change.count({ where: { tripId, entityId: first.id } });
    expect(changeCount).toBe(1);
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
    expect(rippleSuggestion?.direction).toBe('later');
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

  it('ripples preceding soft events earlier on overlap, stopping at the first hard anchor', async () => {
    const tripId = await newTrip();
    const flight = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Flight',
      kind: EVENT_KIND.HARD,
      startsAt: at('08:00'),
      endsAt: at('10:00'),
      source: 'manual',
    });
    const coffee = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Coffee',
      kind: EVENT_KIND.SOFT,
      startsAt: at('10:00'),
      endsAt: at('11:00'),
      sortOrder: 1,
      source: 'manual',
    });
    const market = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Market',
      kind: EVENT_KIND.SOFT,
      startsAt: at('11:15'),
      endsAt: at('12:00'),
      sortOrder: 2,
      source: 'manual',
    });

    // Pull Market 30 minutes earlier so it now overlaps Coffee.
    const { rippleSuggestion } = await service.move(
      tripId,
      market.id,
      DEV_USER,
      { startsAt: at('10:45') },
      false,
    );

    expect(rippleSuggestion?.movedTitle).toBe('Market');
    expect(rippleSuggestion?.direction).toBe('earlier');
    expect(rippleSuggestion?.candidates).toEqual([
      {
        id: coffee.id,
        startsAt: new Date(at('09:30')).toISOString(),
        endsAt: new Date(at('10:30')).toISOString(),
      },
    ]);
    expect(rippleSuggestion?.candidates.some((c) => c.id === flight.id)).toBe(false);

    // Suggestion only — never auto-applied.
    const untouchedCoffee = await prisma.event.findUniqueOrThrow({ where: { id: coffee.id } });
    expect(untouchedCoffee.startsAt?.toISOString()).toBe(new Date(at('10:00')).toISOString());
  });

  it('does not ripple a preceding event that has already started', async () => {
    // Fixed, day-boundary-clear instant: the ±5..75min offsets below computed
    // from a real Date.now() would flake near UTC midnight, since `date` (the
    // day) and `startsAt` (the offset instant) could land on different days.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-06-15T12:00:00Z'));
    try {
      const tripId = await newTrip();
      const now = Date.now();
      const today = new Date(now).toISOString().slice(0, 10);
      await service.create(tripId, DEV_USER, {
        date: today,
        title: 'Already happening',
        kind: EVENT_KIND.SOFT,
        startsAt: new Date(now - 60 * 60_000).toISOString(),
        endsAt: new Date(now + 15 * 60_000).toISOString(),
        source: 'manual',
      });
      const market = await service.create(tripId, DEV_USER, {
        date: today,
        title: 'Market',
        kind: EVENT_KIND.SOFT,
        startsAt: new Date(now + 30 * 60_000).toISOString(),
        endsAt: new Date(now + 75 * 60_000).toISOString(),
        sortOrder: 1,
        source: 'manual',
      });

      // Pulling Market back to now+5 would, absent the guard, overlap "Already
      // happening" (which ends at now+15) and pull it — but it already started.
      const { rippleSuggestion } = await service.move(
        tripId,
        market.id,
        DEV_USER,
        { startsAt: new Date(now + 5 * 60_000).toISOString() },
        false,
      );
      expect(rippleSuggestion).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns no backward ripple when the preceding soft event has a real gap', async () => {
    const tripId = await newTrip();
    await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Coffee',
      kind: EVENT_KIND.SOFT,
      startsAt: at('09:00'),
      endsAt: at('09:30'),
      source: 'manual',
    });
    const market = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Market',
      kind: EVENT_KIND.SOFT,
      startsAt: at('11:00'),
      endsAt: at('12:00'),
      sortOrder: 1,
      source: 'manual',
    });

    // Pulling Market 30 min earlier (to 10:30) still leaves a gap after Coffee (ends 09:30) — nothing to resolve.
    const { rippleSuggestion } = await service.move(
      tripId,
      market.id,
      DEV_USER,
      { startsAt: at('10:30') },
      false,
    );
    expect(rippleSuggestion).toBeUndefined();
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

  it('rejects moving an event to start in the past', async () => {
    const tripId = await newTrip();
    const market = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Market',
      kind: EVENT_KIND.SOFT,
      startsAt: at('11:00'),
      endsAt: at('12:00'),
      source: 'manual',
    });

    await expect(
      service.move(
        tripId,
        market.id,
        DEV_USER,
        { startsAt: new Date(Date.now() - 60_000).toISOString() },
        false,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects nudging an event across a day boundary', async () => {
    const tripId = await newTrip();
    const walkback = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Walk back',
      kind: EVENT_KIND.SOFT,
      startsAt: at('22:45'),
      endsAt: at('23:15'),
      source: 'manual',
    });

    // newTrip() sets no explicit timezone, so it defaults to UTC — the day
    // boundary is UTC midnight. `at()` bakes in a +09:00 offset; this target
    // (2027-02-02T09:01+09:00 = 2027-02-02T00:01Z) crosses from Feb 1 into Feb 2 UTC.
    await expect(
      service.move(tripId, walkback.id, DEV_USER, { startsAt: '2027-02-02T09:01:00+09:00' }, false),
    ).rejects.toThrow(ConflictException);
  });

  it('allows an explicit date change to cross days (Plan-mode reassignment)', async () => {
    const tripId = await newTrip();
    const walkback = await service.create(tripId, DEV_USER, {
      date: DAY,
      title: 'Walk back',
      kind: EVENT_KIND.SOFT,
      startsAt: at('22:45'),
      endsAt: at('23:15'),
      source: 'manual',
    });

    const { event } = await service.move(
      tripId,
      walkback.id,
      DEV_USER,
      { date: '2027-02-02', startsAt: '2027-02-02T09:01:00+09:00' },
      false,
    );
    expect(event.date).toBe('2027-02-02');
  });
});
