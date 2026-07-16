import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService, type ChangeOp } from './change.service';
import { SyncGateway } from './sync.gateway';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('ChangeService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const service = new ChangeService(prisma, gateway);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'ChangeService test trip',
        destination: 'Testland',
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-01-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    // Membership/Place/Change rows cascade-delete with the trip (schema.prisma).
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('commits the entity write and the Change atomically, then broadcasts post-commit', async () => {
    const tripId = await newTrip();
    const broadcast = vi.spyOn(gateway, 'broadcast');

    const { entity, change } = await service.mutate({
      tripId,
      actorUserId: DEV_USER,
      entityType: 'place',
      entityId: 'pending',
      action: 'create',
      after: { name: 'Shibuya Crossing' },
      apply: (tx) =>
        tx.place.create({
          data: { tripId, name: 'Shibuya Crossing', updatedBy: DEV_USER },
        }),
    });

    const place = await prisma.place.findUnique({ where: { id: entity.id } });
    expect(place).not.toBeNull();

    const changeRow = await prisma.change.findUnique({ where: { id: change.id } });
    expect(changeRow).toMatchObject({ tripId, actorUserId: DEV_USER, action: 'create' });

    expect(broadcast).toHaveBeenCalledWith(tripId, change);
  });

  it('rolls back the entity write and writes no Change when apply throws', async () => {
    const tripId = await newTrip();
    const broadcast = vi.spyOn(gateway, 'broadcast');

    await expect(
      service.mutate({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'place',
        entityId: 'pending',
        action: 'create',
        apply: async (tx) => {
          await tx.place.create({ data: { tripId, name: 'x', updatedBy: DEV_USER } });
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const places = await prisma.place.findMany({ where: { tripId } });
    expect(places).toEqual([]);

    const changes = await prisma.change.findMany({ where: { tripId } });
    expect(changes).toEqual([]);

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('assigns strictly increasing seq across mutations for the same trip', async () => {
    const tripId = await newTrip();

    const mutateOnce = (name: string) =>
      service.mutate({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'place',
        entityId: 'pending',
        action: 'create',
        apply: (tx) => tx.place.create({ data: { tripId, name, updatedBy: DEV_USER } }),
      });

    const first = await mutateOnce('one');
    const second = await mutateOnce('two');

    expect(BigInt(second.change.seq)).toBeGreaterThan(BigInt(first.change.seq));
  });

  it('mutateMany commits several Changes atomically and broadcasts them in order', async () => {
    const tripId = await newTrip();
    const broadcast = vi.spyOn(gateway, 'broadcast');

    const { entity, changes } = await service.mutateMany({
      tripId,
      actorUserId: DEV_USER,
      apply: async (tx) => {
        const first = await tx.place.create({
          data: { tripId, name: 'origin', updatedBy: DEV_USER },
        });
        const second = await tx.place.create({
          data: { tripId, name: 'dest', updatedBy: DEV_USER },
        });
        return {
          entity: first,
          ops: [
            {
              entityType: 'place',
              entityId: first.id,
              action: 'create',
              after: { name: 'origin' },
            },
            { entityType: 'place', entityId: second.id, action: 'create', after: { name: 'dest' } },
          ] satisfies ChangeOp[],
        };
      },
    });

    expect(entity.name).toBe('origin');
    expect(changes).toHaveLength(2);
    // seq is strictly increasing in op order, and broadcasts follow the same order.
    expect(BigInt(changes[1].seq)).toBeGreaterThan(BigInt(changes[0].seq));
    expect(broadcast.mock.calls.map((c) => c[1])).toEqual(changes);

    const persisted = await prisma.change.findMany({ where: { tripId } });
    expect(persisted).toHaveLength(2);
  });

  it('mutateMany rolls back every write when apply throws', async () => {
    const tripId = await newTrip();

    await expect(
      service.mutateMany({
        tripId,
        actorUserId: DEV_USER,
        apply: async (tx) => {
          await tx.place.create({ data: { tripId, name: 'doomed', updatedBy: DEV_USER } });
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    expect(await prisma.place.findMany({ where: { tripId } })).toEqual([]);
    expect(await prisma.change.findMany({ where: { tripId } })).toEqual([]);
  });
});
