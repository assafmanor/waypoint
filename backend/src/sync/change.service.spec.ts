import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from './change.service';
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
    // Membership/TripNote/Change rows cascade-delete with the trip (schema.prisma).
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('commits the entity write and the Change atomically, then broadcasts post-commit', async () => {
    const tripId = await newTrip();
    const broadcast = vi.spyOn(gateway, 'broadcast');

    const { entity, change } = await service.mutate({
      tripId,
      actorUserId: DEV_USER,
      entityType: 'note',
      entityId: 'pending',
      action: 'create',
      after: { label: 'WiFi', value: 'hunter2' },
      apply: (tx) =>
        tx.tripNote.create({
          data: {
            tripId,
            category: 'wifi',
            label: 'WiFi',
            value: 'hunter2',
            updatedBy: DEV_USER,
          },
        }),
    });

    const note = await prisma.tripNote.findUnique({ where: { id: entity.id } });
    expect(note).not.toBeNull();

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
        entityType: 'note',
        entityId: 'pending',
        action: 'create',
        apply: async (tx) => {
          await tx.tripNote.create({
            data: { tripId, category: 'wifi', label: 'x', value: 'y', updatedBy: DEV_USER },
          });
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const notes = await prisma.tripNote.findMany({ where: { tripId } });
    expect(notes).toEqual([]);

    const changes = await prisma.change.findMany({ where: { tripId } });
    expect(changes).toEqual([]);

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('assigns strictly increasing seq across mutations for the same trip', async () => {
    const tripId = await newTrip();

    const mutateOnce = (label: string) =>
      service.mutate({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'note',
        entityId: 'pending',
        action: 'create',
        apply: (tx) =>
          tx.tripNote.create({
            data: { tripId, category: 'note', label, value: 'v', updatedBy: DEV_USER },
          }),
      });

    const first = await mutateOnce('one');
    const second = await mutateOnce('two');

    expect(BigInt(second.change.seq)).toBeGreaterThan(BigInt(first.change.seq));
  });
});
