import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TRANSIT_LEG_MODE, TRAVEL_MODE } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { TravelModesService } from './travel-modes.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('TravelModesService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new TravelModesService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'TravelModesService test trip',
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

  const newPlace = (tripId: string, name: string) =>
    prisma.place.create({ data: { tripId, name, updatedBy: DEV_USER } });

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('writes a declared leg and its Change together', async () => {
    const tripId = await newTrip();
    const [a, b] = await Promise.all([
      newPlace(tripId, 'סנסו-ג׳י'),
      newPlace(tripId, 'תחנת טוקיו'),
    ]);

    const override = await service.set(tripId, DEV_USER, {
      fromPlaceId: a.id,
      toPlaceId: b.id,
      mode: TRANSIT_LEG_MODE,
    });

    expect(override).toMatchObject({ mode: TRANSIT_LEG_MODE, createdBy: DEV_USER });
    const change = await prisma.change.findFirst({ where: { tripId, entityId: override.id } });
    expect(change).toMatchObject({ entityType: 'travelModeOverride', action: 'create' });
  });

  /**
   * **§AM2's claim, asserted rather than assumed.** The whole reason the ids are canonicalised is
   * that ONE row serves the pair both ways — declaring תחב״צ on A→B and having the return leg keep
   * printing a walking number is the silent failure the sorting exists to prevent. So: set it one
   * way, set it the other, and there must still be exactly one row.
   */
  it('serves the pair in BOTH directions from one row', async () => {
    const tripId = await newTrip();
    const [a, b] = await Promise.all([newPlace(tripId, 'א'), newPlace(tripId, 'ב')]);

    const first = await service.set(tripId, DEV_USER, {
      fromPlaceId: a.id,
      toPlaceId: b.id,
      mode: TRANSIT_LEG_MODE,
    });
    const reversed = await service.set(tripId, DEV_USER, {
      fromPlaceId: b.id,
      toPlaceId: a.id,
      mode: TRAVEL_MODE.CYCLING,
    });

    expect(reversed.id).toBe(first.id);
    expect(reversed.mode).toBe(TRAVEL_MODE.CYCLING);
    expect(await prisma.travelModeOverride.count({ where: { tripId } })).toBe(1);
    // The stored pair is sorted, whichever way round the caller asked.
    expect([reversed.fromPlaceId, reversed.toPlaceId]).toEqual([a.id, b.id].sort());
  });

  /** Stating the same thing twice is stating it once — and the second write is an `update`
   *  Change, not a second `create`, so a peer applying the feed lands on one row too. */
  it('is idempotent on the pair, and says so in the Change action', async () => {
    const tripId = await newTrip();
    const [a, b] = await Promise.all([newPlace(tripId, 'א'), newPlace(tripId, 'ב')]);
    const input = { fromPlaceId: a.id, toPlaceId: b.id, mode: TRANSIT_LEG_MODE } as const;

    await service.set(tripId, DEV_USER, input);
    await service.set(tripId, DEV_USER, input);

    expect(await prisma.travelModeOverride.count({ where: { tripId } })).toBe(1);
    const actions = await prisma.change.findMany({
      where: { tripId, entityType: 'travelModeOverride' },
      orderBy: { seq: 'asc' },
      select: { action: true },
    });
    expect(actions.map((c) => c.action)).toEqual(['create', 'update']);
  });

  /** B-06's class of bug: both ends are client-supplied, so both are scoped before either is
   *  written. A foreign place is a 400, never a cross-trip row whose other end nobody can see. */
  it('refuses a place from another trip', async () => {
    const [mine, theirs] = await Promise.all([newTrip(), newTrip()]);
    const [a, foreign] = await Promise.all([
      newPlace(mine, 'שלי'),
      newPlace(theirs, 'של מישהו אחר'),
    ]);

    await expect(
      service.set(mine, DEV_USER, {
        fromPlaceId: a.id,
        toPlaceId: foreign.id,
        mode: TRANSIT_LEG_MODE,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(await prisma.travelModeOverride.count({ where: { tripId: mine } })).toBe(0);
  });

  it('clears a declaration and records the delete', async () => {
    const tripId = await newTrip();
    const [a, b] = await Promise.all([newPlace(tripId, 'א'), newPlace(tripId, 'ב')]);
    const override = await service.set(tripId, DEV_USER, {
      fromPlaceId: a.id,
      toPlaceId: b.id,
      mode: TRANSIT_LEG_MODE,
    });

    await service.clear(tripId, override.id, DEV_USER);

    expect(await prisma.travelModeOverride.count({ where: { tripId } })).toBe(0);
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: override.id, action: 'delete' },
    });
    expect(change).not.toBeNull();
  });

  it('404s clearing something this trip does not have', async () => {
    const tripId = await newTrip();
    await expect(service.clear(tripId, 'nope', DEV_USER)).rejects.toThrow(NotFoundException);
  });

  /** **§AM4's cascade, asserted.** The row's whole meaning is the pair, so a dangling override
   *  would be a mode for a journey with only one end left. Postgres owns this, not the service —
   *  which is exactly why it is worth a test: nothing in the TypeScript would fail without it. */
  it('goes with a deleted place', async () => {
    const tripId = await newTrip();
    const [a, b] = await Promise.all([newPlace(tripId, 'א'), newPlace(tripId, 'ב')]);
    await service.set(tripId, DEV_USER, {
      fromPlaceId: a.id,
      toPlaceId: b.id,
      mode: TRANSIT_LEG_MODE,
    });

    await prisma.place.delete({ where: { id: b.id } });

    expect(await prisma.travelModeOverride.count({ where: { tripId } })).toBe(0);
  });
});
