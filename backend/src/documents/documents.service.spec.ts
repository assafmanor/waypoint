import 'reflect-metadata';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { DocumentsService } from './documents.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
// No S3_BUCKET set — exercises the local-filesystem storage branch (storage.ts).
const DEV_USER = 'u-assaf';
const LOCAL_STORAGE_DIR = join(process.cwd(), 'storage', 'documents');

describe('DocumentsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new DocumentsService(prisma, changes);
  const createdTripIds: string[] = [];

  beforeAll(() => {
    process.env.DOC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(async () => {
    delete process.env.DOC_ENCRYPTION_KEY;
    await prisma.$disconnect();
  });

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'DocumentsService test trip',
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
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
    await rm(LOCAL_STORAGE_DIR, { recursive: true, force: true });
  });

  it('encrypts on upload (blob on disk is not plaintext) and decrypts correctly on read', async () => {
    const tripId = await newTrip();
    const plaintext = Buffer.from('passport scan bytes, not real');

    const created = await service.create(
      tripId,
      DEV_USER,
      { type: 'passport', title: 'Passport' },
      { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length },
    );

    const onDisk = await readFile(join(LOCAL_STORAGE_DIR, created.fileRef));
    expect(onDisk.includes(plaintext)).toBe(false);

    const content = await service.getContent(tripId, created.id);
    expect(content.buffer).toEqual(plaintext);
    expect(content.mimeType).toBe('application/pdf');

    const change = await prisma.change.findFirst({ where: { tripId, entityId: created.id } });
    expect(change).toMatchObject({ entityType: 'document', action: 'create' });
  });

  it('lists document metadata without exposing fileRef', async () => {
    const tripId = await newTrip();
    const plaintext = Buffer.from('insurance doc');
    await service.create(
      tripId,
      DEV_USER,
      { type: 'insurance', title: 'Insurance' },
      { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length },
    );

    const list = await service.list(tripId);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('fileRef');
  });

  it('404s reading content for a document in another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const plaintext = Buffer.from('visa doc');
    const created = await service.create(
      tripId,
      DEV_USER,
      { type: 'visa', title: 'Visa' },
      { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length },
    );

    await expect(service.getContent(otherTripId, created.id)).rejects.toThrow(NotFoundException);
  });
});
