import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '@prisma/client';
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

    // The trip's first change, so its predecessor is the "nothing yet" cursor.
    expect(broadcast).toHaveBeenCalledWith(tripId, change, '0');
  });

  // Field report #33: half a row does not exist until the write runs, so a caller that can
  // only name `after` up front can only publish what the client already knew — never the id,
  // the timestamps or `updatedBy` the server mints. The function form reads them off the row
  // that was just written, inside the same transaction.
  it('takes `after` from the entity it just wrote when given a function', async () => {
    const tripId = await newTrip();

    // Explicit type argument because both closures here are inline: a real caller passes a
    // named mapper (`after: toDocumentSummaryDto`), which pins it on its own.
    const { entity, change } = await service.mutate<Place>({
      tripId,
      actorUserId: DEV_USER,
      entityType: 'place',
      entityId: 'pending',
      action: 'create',
      after: (place) => ({ id: place.id, name: place.name, updatedBy: place.updatedBy }),
      apply: (tx) =>
        tx.place.create({ data: { tripId, name: 'Kiyomizu-dera', updatedBy: DEV_USER } }),
    });

    expect(change.after).toEqual({
      id: entity.id,
      name: 'Kiyomizu-dera',
      updatedBy: DEV_USER,
    });
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

  // B-01: `Change.seq` (BIGSERIAL) is allocated at INSERT, not at commit, so
  // without serialization a higher seq can become visible before a lower one
  // commits and a client's cursor skips the lower change forever. The per-trip
  // advisory lock (lockTrip) makes concurrent writes queue, so seq order ==
  // commit order. This reproduces the interleaving: a slow writer holds the lock
  // while a fast writer fires; on the buggy (lock-less) path the fast write would
  // commit first with a *lower* seq — here it must wait and commit second.
  it('serializes concurrent writes per trip so seq order == commit order (B-01)', async () => {
    const tripId = await newTrip();

    const slowWrite = service
      .mutate({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'place',
        entityId: 'pending',
        action: 'create',
        apply: async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM (SELECT pg_sleep(0.4)) _s`;
          return tx.place.create({ data: { tripId, name: 'slow', updatedBy: DEV_USER } });
        },
      })
      .then((r) => ({ ...r, finishedAt: Date.now() }));

    // Let the slow writer take the per-trip lock first, then fire a fast writer.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const fastWrite = service
      .mutate({
        tripId,
        actorUserId: DEV_USER,
        entityType: 'place',
        entityId: 'pending',
        action: 'create',
        apply: (tx) => tx.place.create({ data: { tripId, name: 'fast', updatedBy: DEV_USER } }),
      })
      .then((r) => ({ ...r, finishedAt: Date.now() }));

    const [slow, fast] = await Promise.all([slowWrite, fastWrite]);

    // The fast writer blocks on the slow writer's lock, so it commits second and
    // gets the higher seq. Without the lock it would finish ~300ms sooner with a
    // lower seq — both assertions fail on the buggy path.
    expect(fast.finishedAt).toBeGreaterThanOrEqual(slow.finishedAt);
    expect(BigInt(fast.change.seq)).toBeGreaterThan(BigInt(slow.change.seq));
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
    // Each op's `prevSeq` chains off the one broadcast before it, so a receiver reading
    // them in order never sees a hole between two changes of the same save.
    expect(broadcast.mock.calls.map((c) => c[2])).toEqual(['0', changes[0].seq]);

    const persisted = await prisma.change.findMany({ where: { tripId } });
    expect(persisted).toHaveLength(2);
  });

  // **Field report #32.** `Change.seq` is a GLOBAL autoincrement, so this trip's changes
  // are not consecutive integers as soon as any other trip is written to — and the client's
  // gap test (`seq === lastSeq + 1`) then reads ordinary live delivery as lost frames and
  // drops the change it is holding. `prevSeq` is what makes that test exact, so it has to
  // name THIS trip's predecessor, not `seq - 1`.
  it("broadcasts this trip's own predecessor as prevSeq, across another trip's writes", async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();

    const write = (id: string, name: string) =>
      service.mutate({
        tripId: id,
        actorUserId: DEV_USER,
        entityType: 'place',
        entityId: 'pending',
        action: 'create',
        apply: (tx) => tx.place.create({ data: { tripId: id, name, updatedBy: DEV_USER } }),
      });

    const first = await write(tripId, 'ours-one');
    // Another trip advances the shared sequence — the production condition.
    await write(otherTripId, 'theirs-one');
    await write(otherTripId, 'theirs-two');

    const broadcast = vi.spyOn(gateway, 'broadcast');
    const second = await write(tripId, 'ours-two');

    // The global seq skipped, and prevSeq still points at our own previous change.
    expect(BigInt(second.change.seq)).toBeGreaterThan(BigInt(first.change.seq) + 1n);
    expect(broadcast).toHaveBeenCalledWith(tripId, second.change, first.change.seq);
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
