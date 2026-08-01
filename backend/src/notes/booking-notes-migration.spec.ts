import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// The `Booking.details.notes` → `Note` rows migration (ADR-0152 §7). A one-time, one-way
// data move over rows a real trip already has, so its rules get a test rather than a
// careful read: what it moves, what it must NOT touch, and that a re-run is a no-op.
//
// It runs the migration's OWN sql file rather than a copy, so the thing under test is the
// thing that ships.
const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260801200000_booking_notes_to_rows_adr0152/migration.sql',
  ),
  'utf8',
);

const DEV_USER = 'u-assaf';

describe('Booking.details.notes → Note rows (ADR-0152 §7)', () => {
  const prisma = new PrismaService();
  let tripId = '';

  const runMigration = () => prisma.$executeRawUnsafe(MIGRATION_SQL);

  const booking = (id: string, details: Prisma.InputJsonValue) =>
    prisma.booking.create({
      data: {
        id,
        tripId,
        type: 'hotel',
        title: `booking ${id}`,
        details,
        updatedBy: DEV_USER,
      },
    });

  beforeAll(async () => {
    const trip = await prisma.trip.create({
      data: {
        name: 'notes migration test trip',
        destination: 'Testland',
        startDate: new Date('2027-03-01'),
        endDate: new Date('2027-03-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    tripId = trip.id;
  });

  afterEach(async () => {
    await prisma.note.deleteMany({ where: { tripId } });
    await prisma.booking.deleteMany({ where: { tripId } });
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { id: tripId } });
    await prisma.$disconnect();
  });

  it('moves a booking’s note into a row hosted by that booking', async () => {
    await booking('bk-1', { notes: 'קוד הכספת 4417' });
    await runMigration();

    const notes = await prisma.note.findMany({ where: { bookingId: 'bk-1' } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ body: 'קוד הכספת 4417', source: 'member', tripId });
  });

  it('drops the key afterwards, so nothing can read it again and drift', async () => {
    await booking('bk-1', { notes: 'x' });
    await runMigration();

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: 'bk-1' } });
    expect(after.details).not.toHaveProperty('notes');
  });

  // The line ADR-0152 §7 is most explicit about: WiFi is a field with one specific reader
  // (`lib/home-quick.ts`), not a note, and moving it would re-open a settled question.
  it('leaves details.wifi and details.room exactly where they are', async () => {
    await booking('bk-1', {
      notes: 'לזכור',
      wifi: { network: 'GRANBELL', password: '8829granbell' },
      room: '512',
    });
    await runMigration();

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: 'bk-1' } });
    expect(after.details).toMatchObject({
      wifi: { network: 'GRANBELL', password: '8829granbell' },
      room: '512',
    });
  });

  it('makes no row for a blank or whitespace-only note, but still clears the key', async () => {
    await booking('bk-blank', { notes: '   ' });
    await runMigration();

    expect(await prisma.note.count({ where: { bookingId: 'bk-blank' } })).toBe(0);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: 'bk-blank' } });
    expect(after.details).not.toHaveProperty('notes');
  });

  it('does not touch a booking that never had the key', async () => {
    await booking('bk-none', { wifi: { network: 'X' } });
    await runMigration();

    expect(await prisma.note.count({ where: { bookingId: 'bk-none' } })).toBe(0);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: 'bk-none' } });
    expect(after.details).toEqual({ wifi: { network: 'X' } });
  });

  // A migration that runs twice on a partially-migrated database must not double the rows.
  it('is a no-op on a second run', async () => {
    await booking('bk-1', { notes: 'פעם אחת' });
    await runMigration();
    await runMigration();

    expect(await prisma.note.count({ where: { bookingId: 'bk-1' } })).toBe(1);
  });

  // The blob never recorded an author, so the booking's own `updatedBy` is the closest
  // thing to one — and the booking's `createdAt` keeps a migrated note from sorting to the
  // top of a recency-ordered screen as though it had just been written.
  it('attributes the note to the booking’s own author and age', async () => {
    const created = await booking('bk-1', { notes: 'ישן' });
    await runMigration();

    const note = await prisma.note.findFirstOrThrow({ where: { bookingId: 'bk-1' } });
    expect(note.createdBy).toBe(DEV_USER);
    expect(note.createdAt.getTime()).toBe(created.createdAt.getTime());
  });
});
