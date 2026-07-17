import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
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

  it('renames + changes type without touching the blob (ADR-0052)', async () => {
    const tripId = await newTrip();
    const plaintext = Buffer.from('passport scan');
    const created = await service.create(
      tripId,
      DEV_USER,
      { type: 'passport', title: 'Passport' },
      { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length },
    );

    const updated = await service.update(
      tripId,
      DEV_USER,
      created.id,
      { title: 'Passport · Assaf', type: 'visa' },
      undefined,
    );

    expect(updated).toMatchObject({ title: 'Passport · Assaf', type: 'visa' });
    expect(updated.fileRef).toBe(created.fileRef); // blob untouched on a metadata patch
    const content = await service.getContent(tripId, created.id);
    expect(content.buffer).toEqual(plaintext);
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: created.id, action: 'update' },
    });
    expect(change).toMatchObject({ entityType: 'document', action: 'update' });
  });

  it('replaces the file: swaps to a fresh blob and deletes the old one (ADR-0052)', async () => {
    const tripId = await newTrip();
    const before = Buffer.from('old scan');
    const created = await service.create(
      tripId,
      DEV_USER,
      { type: 'passport', title: 'Passport' },
      { buffer: before, mimetype: 'application/pdf', size: before.length },
    );
    const oldRef = created.fileRef;

    const after = Buffer.from('new scan bytes');
    const updated = await service.update(
      tripId,
      DEV_USER,
      created.id,
      {},
      {
        buffer: after,
        mimetype: 'image/jpeg',
        size: after.length,
      },
    );

    expect(updated.fileRef).not.toBe(oldRef); // fresh blob
    expect(updated.mimeType).toBe('image/jpeg');
    const content = await service.getContent(tripId, created.id);
    expect(content.buffer).toEqual(after);
    await expect(readFile(join(LOCAL_STORAGE_DIR, oldRef))).rejects.toThrow(); // old blob gone
  });

  it('is idempotent on a duplicate client id: one document, one blob, no error (ADR-0056)', async () => {
    const tripId = await newTrip();
    const id = randomUUID();
    const plaintext = Buffer.from('boarding pass bytes');
    const file = { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length };

    const first = await service.create(
      tripId,
      DEV_USER,
      { id, type: 'passport', title: 'Boarding pass' },
      file,
    );
    // A flush retry re-POSTs the same client id (e.g. the first response never
    // reached the client) — must be treated as already-applied, not a 500.
    const second = await service.create(
      tripId,
      DEV_USER,
      { id, type: 'passport', title: 'Boarding pass' },
      file,
    );

    expect(second.id).toBe(first.id);
    expect(second.fileRef).toBe(first.fileRef); // same blob, not a fresh one

    const docs = await prisma.document.findMany({ where: { tripId } });
    expect(docs).toHaveLength(1); // exactly one document

    const blobs = await readdir(LOCAL_STORAGE_DIR);
    expect(blobs).toHaveLength(1); // exactly one blob — no orphan from the retry

    const content = await service.getContent(tripId, id);
    expect(content.buffer).toEqual(plaintext);
  });

  it('deletes the row and its encrypted blob (ADR-0052)', async () => {
    const tripId = await newTrip();
    const plaintext = Buffer.from('to be deleted');
    const created = await service.create(
      tripId,
      DEV_USER,
      { type: 'other', title: 'Scratch' },
      { buffer: plaintext, mimetype: 'application/pdf', size: plaintext.length },
    );

    await service.remove(tripId, DEV_USER, created.id);

    await expect(service.getContent(tripId, created.id)).rejects.toThrow(NotFoundException);
    await expect(readFile(join(LOCAL_STORAGE_DIR, created.fileRef))).rejects.toThrow();
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: created.id, action: 'delete' },
    });
    expect(change).toMatchObject({ entityType: 'document', action: 'delete' });
  });
});
