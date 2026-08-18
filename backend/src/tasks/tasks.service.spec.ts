import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TASK_STATUS, TASK_SUBTASK_CAP } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { TasksService } from './tasks.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs), the shape
// `notes.service.spec.ts` uses.
const DEV_USER = 'u-assaf';

describe('TasksService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new TasksService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'TasksService test trip',
        destination: 'Testland',
        startDate: new Date('2027-02-01'),
        endDate: new Date('2027-02-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    // The assignee guard resolves against `Membership`, so a trip with no roster would
    // refuse every assignment — the creator has to actually be a member.
    await prisma.membership.create({ data: { tripId: trip.id, userId: DEV_USER, role: 'admin' } });
    return trip.id;
  }

  const newEvent = (tripId: string, title = 'Dinner') =>
    prisma.event.create({
      data: { tripId, date: new Date('2027-02-02'), title, kind: 'soft', updatedBy: DEV_USER },
    });

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('writes a task and its Change together, open and undated', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, { title: 'למשוך מזומן ליום בקיוטו' });

    expect(task).toMatchObject({
      title: 'למשוך מזומן ליום בקיוטו',
      status: TASK_STATUS.OPEN,
      important: false,
      dueHasTime: false,
    });
    // An undated task is legitimate, not half-filled (brief §5).
    expect(task.dueAt).toBeUndefined();
    expect(task.assigneeUserId).toBeUndefined();
    const change = await prisma.change.findFirst({ where: { tripId, entityId: task.id } });
    expect(change).toMatchObject({ entityType: 'task', action: 'create' });
  });

  it('keeps a date-only deadline distinct from a timed one', async () => {
    const tripId = await newTrip();

    const dayOnly = await service.create(tripId, DEV_USER, {
      title: 'לקנות מתאם חשמל',
      dueAt: '2027-02-03T00:00:00.000Z',
      dueHasTime: false,
    });
    const timed = await service.create(tripId, DEV_USER, {
      title: 'להזמין את המסעדה',
      dueAt: '2027-02-03T00:00:00.000Z',
      dueHasTime: true,
    });

    // Same instant, different obligations — which is exactly why `dueHasTime` is stored
    // rather than derived from `dueAt`.
    expect(dayOnly.dueAt).toBe(timed.dueAt);
    expect(dayOnly.dueHasTime).toBe(false);
    expect(timed.dueHasTime).toBe(true);
  });

  it('treats a duplicate client id as already applied rather than a conflict', async () => {
    const tripId = await newTrip();
    const id = 'task-dupe-1234';

    const first = await service.create(tripId, DEV_USER, { id, title: 'לארוז' });
    const second = await service.create(tripId, DEV_USER, { id, title: 'לארוז' });

    expect(second.id).toBe(first.id);
    expect(await prisma.task.count({ where: { tripId } })).toBe(1);
  });

  it('refuses a host that belongs to another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const foreign = await newEvent(otherTripId, 'Someone else’s dinner');

    await expect(
      service.create(tripId, DEV_USER, { title: 'x', eventId: foreign.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // A task delegated to someone outside the trip reads on the row as a name nobody
  // recognises, and they can never see it to do it.
  it('refuses an assignee who is not a member of the trip', async () => {
    const tripId = await newTrip();

    await expect(
      service.create(tripId, DEV_USER, { title: 'x', assigneeUserId: 'u-not-a-member' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles a task, stamping who and when from the server', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, { title: 'להזמין את המסעדה' });

    const done = await service.update(tripId, task.id, { status: TASK_STATUS.DONE }, DEV_USER);

    expect(done.status).toBe(TASK_STATUS.DONE);
    expect(done.settledBy).toBe(DEV_USER);
    expect(done.settledAt).toBeTruthy();
  });

  it('clears the settlement when a task is reopened', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, { title: 'להזמין את המסעדה' });
    await service.update(tripId, task.id, { status: TASK_STATUS.DONE }, DEV_USER);

    const reopened = await service.update(tripId, task.id, { status: TASK_STATUS.OPEN }, DEV_USER);

    expect(reopened.status).toBe(TASK_STATUS.OPEN);
    expect(reopened.settledAt).toBeUndefined();
    expect(reopened.settledBy).toBeUndefined();
  });

  // ── THE SPARSE HALF OF THE PATCH ───────────────────────────────────────────────────
  //
  // The tick settles a task without opening its editor, so it sends `status` and nothing
  // else. If `title` read as whole-content the way `body` does, one tick would erase the
  // words — which is the regression this pair exists to catch.
  it('leaves the title and the deadline alone when only the status is sent', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, {
      title: 'לאסוף את ה-JR Pass',
      dueAt: '2027-02-02T09:00:00.000Z',
      dueHasTime: true,
      important: true,
    });

    const done = await service.update(tripId, task.id, { status: TASK_STATUS.DONE }, DEV_USER);

    expect(done.title).toBe('לאסוף את ה-JR Pass');
    expect(done.dueAt).toBe('2027-02-02T09:00:00.000Z');
    expect(done.important).toBe(true);
  });

  it('leaves the host alone on an ordinary content edit', async () => {
    const tripId = await newTrip();
    const event = await newEvent(tripId);
    const task = await service.create(tripId, DEV_USER, {
      title: 'לוודא את שעת הצ׳ק-אאוט',
      eventId: event.id,
    });

    const updated = await service.update(
      tripId,
      task.id,
      { title: 'לוודא את שעת הצ׳ק-אאוט האמיתית' },
      DEV_USER,
    );

    expect(updated.title).toBe('לוודא את שעת הצ׳ק-אאוט האמיתית');
    expect(updated.eventId).toBe(event.id);
  });

  it('clears the deadline when the editor submits without one', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, {
      title: 'לבדוק אם האונסן מאפשר קעקועים',
      dueAt: '2027-02-04T10:00:00.000Z',
      dueHasTime: true,
    });

    const updated = await service.update(
      tripId,
      task.id,
      { title: 'לבדוק אם האונסן מאפשר קעקועים', dueAt: null, dueHasTime: false },
      DEV_USER,
    );

    expect(updated.dueAt).toBeUndefined();
    expect(updated.dueHasTime).toBe(false);
  });

  it('records the before/after on an edit Change', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, { title: 'קוד הכספת 4417' });

    await service.update(tripId, task.id, { title: 'קוד הכספת 4418' }, DEV_USER);

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: task.id, action: 'update' },
    });
    expect(change?.before).toMatchObject({ title: 'קוד הכספת 4417' });
  });

  it('deletes a task and writes the delete Change', async () => {
    const tripId = await newTrip();
    const task = await service.create(tripId, DEV_USER, { title: 'להעביר לנועם את הכסף' });

    await service.remove(tripId, task.id, DEV_USER);

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: task.id, action: 'delete' },
    });
    expect(change?.before).toMatchObject({ title: 'להעביר לנועם את הכסף' });
  });

  // The cascade is the storage guarantee; the clients are told by the applier rule
  // (ADR-0152 §2, ADR-0157 §3). Nothing hosts a task until phase 4 — this asserts the
  // column and its `onDelete` shipped together, so phase 4 wires sync to a live cascade.
  it('lets a deleted host cascade its tasks away', async () => {
    const tripId = await newTrip();
    const event = await newEvent(tripId);
    const task = await service.create(tripId, DEV_USER, { title: 'x', eventId: event.id });

    await prisma.event.delete({ where: { id: event.id } });

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
  });

  // ── Sub-tasks (ADR-0196) ──────────────────────────────────────────────────────────────
  // Three rules the schema cannot enforce, because each needs the PARENT row loaded: it is in
  // this trip, it is not itself a step, and it is not already full. A client-only version of
  // any of them is one the offline outbox replays past.
  describe('sub-tasks', () => {
    const parentOf = async (tripId: string) =>
      service.create(tripId, DEV_USER, { title: 'יציאה לשדה' });

    it('creates a step under its parent and reports the link back', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);

      const step = await service.create(tripId, DEV_USER, {
        title: 'להזמין מונית',
        parentTaskId: parent.id,
      });

      expect(step.parentTaskId).toBe(parent.id);
    });

    it('refuses a parent from another trip', async () => {
      const tripId = await newTrip();
      const otherTrip = await newTrip();
      const parent = await parentOf(otherTrip);

      await expect(
        service.create(tripId, DEV_USER, { title: 'x', parentTaskId: parent.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // **The depth cap.** A self-relation cannot express "not more than one deep", so this is
    // the only place it holds.
    it('refuses a step of a step', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);
      const step = await service.create(tripId, DEV_USER, {
        title: 'להזמין מונית',
        parentTaskId: parent.id,
      });

      await expect(
        service.create(tripId, DEV_USER, { title: 'עמוק מדי', parentTaskId: step.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses the step past the cap', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);
      for (let i = 0; i < TASK_SUBTASK_CAP; i++) {
        await service.create(tripId, DEV_USER, { title: `שלב ${i}`, parentTaskId: parent.id });
      }

      await expect(
        service.create(tripId, DEV_USER, { title: 'אחת יותר מדי', parentTaskId: parent.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // A sparse patch does not say whether its target is a step, so this refusal can only be
    // made here, against the loaded row.
    it('refuses a patch that would give a step a deadline', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);
      const step = await service.create(tripId, DEV_USER, {
        title: 'להזמין מונית',
        parentTaskId: parent.id,
      });

      await expect(
        service.update(tripId, step.id, { dueAt: '2027-02-02T18:00:00.000Z' }, DEV_USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still lets a step be renamed, reassigned and ticked', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);
      const step = await service.create(tripId, DEV_USER, {
        title: 'להזמין מונית',
        parentTaskId: parent.id,
      });

      const renamed = await service.update(
        tripId,
        step.id,
        { title: 'להזמין מונית ל-04:30' },
        DEV_USER,
      );
      expect(renamed.title).toBe('להזמין מונית ל-04:30');
      const ticked = await service.update(tripId, step.id, { status: TASK_STATUS.DONE }, DEV_USER);
      expect(ticked.status).toBe(TASK_STATUS.DONE);
      const assigned = await service.update(
        tripId,
        step.id,
        { assigneeUserId: DEV_USER },
        DEV_USER,
      );
      expect(assigned.assigneeUserId).toBe(DEV_USER);
    });

    // The DB half of the client cascade: deleting a parent removes its steps in one statement,
    // and writes no `Change` rows for them — which is exactly why the client owes its own
    // applier (`dropTasksForHostChange`).
    it('takes its steps with it when the parent is deleted', async () => {
      const tripId = await newTrip();
      const parent = await parentOf(tripId);
      const step = await service.create(tripId, DEV_USER, {
        title: 'להזמין מונית',
        parentTaskId: parent.id,
      });

      await service.remove(tripId, parent.id, DEV_USER);

      expect(await prisma.task.findUnique({ where: { id: step.id } })).toBeNull();
      expect(
        await prisma.change.findFirst({ where: { tripId, entityId: step.id, action: 'delete' } }),
      ).toBeNull();
    });
  });
});
