import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { NotesService } from './notes.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('NotesService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new NotesService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'NotesService test trip',
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

  const newEvent = (tripId: string, title = 'Dinner') =>
    prisma.event.create({
      data: { tripId, date: new Date('2027-02-02'), title, kind: 'soft', updatedBy: DEV_USER },
    });

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('writes a general note and its Change together', async () => {
    const tripId = await newTrip();
    const note = await service.create(tripId, DEV_USER, { body: 'מי הברז ראויים לשתייה' });

    expect(note).toMatchObject({ body: 'מי הברז ראויים לשתייה', source: 'member' });
    expect(note.eventId).toBeUndefined();
    const change = await prisma.change.findFirst({ where: { tripId, entityId: note.id } });
    expect(change).toMatchObject({ entityType: 'note', action: 'create' });
  });

  it('writes a hosted note with NO category — it resolves from the host at render', async () => {
    const tripId = await newTrip();
    const event = await newEvent(tripId);

    const note = await service.create(tripId, DEV_USER, {
      body: 'הכניסה מאחור',
      eventId: event.id,
    });

    expect(note.eventId).toBe(event.id);
    expect(note.category).toBeUndefined();
  });

  // A host save can queue several notes at once, so a half-flushed outbox re-POSTing a
  // create is a normal state to re-enter — not an error (ADR-0018's client-generated ids).
  it('treats a duplicate client id as already applied rather than a conflict', async () => {
    const tripId = await newTrip();
    const id = 'note-dupe-1234';

    const first = await service.create(tripId, DEV_USER, { id, body: 'מזומן בלבד' });
    const second = await service.create(tripId, DEV_USER, { id, body: 'מזומן בלבד' });

    expect(second.id).toBe(first.id);
    expect(await prisma.note.count({ where: { tripId } })).toBe(1);
  });

  it('refuses a host that belongs to another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const foreign = await newEvent(otherTripId, 'Someone else’s dinner');

    await expect(
      service.create(tripId, DEV_USER, { body: 'x', eventId: foreign.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a host id that does not exist at all', async () => {
    const tripId = await newTrip();
    await expect(
      service.create(tripId, DEV_USER, { body: 'x', bookingId: 'bkg-nope-1234' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('edits a note and records the before/after on the Change', async () => {
    const tripId = await newTrip();
    const note = await service.create(tripId, DEV_USER, { body: 'קוד הכספת 4417' });

    const updated = await service.update(tripId, note.id, { body: 'קוד הכספת 4418' }, DEV_USER);
    expect(updated.body).toBe('קוד הכספת 4418');

    const change = await prisma.change.findFirst({
      where: { tripId, entityId: note.id, action: 'update' },
    });
    expect(change?.before).toMatchObject({ body: 'קוד הכספת 4417' });
  });

  it('deletes a note and writes the delete Change the clients need', async () => {
    const tripId = await newTrip();
    const note = await service.create(tripId, DEV_USER, { body: 'זמני' });

    await service.remove(tripId, note.id, DEV_USER);

    expect(await prisma.note.findUnique({ where: { id: note.id } })).toBeNull();
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: note.id, action: 'delete' },
    });
    expect(change).toMatchObject({ entityType: 'note' });
  });

  it('does not leak another trip’s note through update or delete', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const foreign = await service.create(otherTripId, DEV_USER, { body: 'not yours' });

    await expect(service.update(tripId, foreign.id, { body: 'x' }, DEV_USER)).rejects.toThrow();
    await expect(service.remove(tripId, foreign.id, DEV_USER)).rejects.toThrow();
  });

  // THE TRAP ADR-0152 §2 NAMES: Postgres removes the rows and writes NO Change, which is
  // why the clients are told by an applier rule instead. This pins the half that is real
  // here — the rows go, and the absence of a Change is deliberate, not an oversight.
  it('cascades a host delete in the database and writes no Change for the notes', async () => {
    const tripId = await newTrip();
    const event = await newEvent(tripId);
    const note = await service.create(tripId, DEV_USER, {
      body: 'ייעלם עם האירוע',
      eventId: event.id,
    });

    await prisma.event.delete({ where: { id: event.id } });

    expect(await prisma.note.findUnique({ where: { id: note.id } })).toBeNull();
    const deleteChange = await prisma.change.findFirst({
      where: { tripId, entityId: note.id, action: 'delete' },
    });
    expect(deleteChange).toBeNull();
  });
});
