import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DOC_LOCAL_STORAGE_DIR } from '../common/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { DocumentsService } from './documents.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
// No S3_BUCKET set — exercises the local-filesystem storage branch (storage.ts).
const DEV_USER = 'u-assaf';
// A dir private to this spec file: the storage tests run in parallel Vitest workers,
// and a shared `<cwd>/storage/documents` let one file's afterEach rm the dir mid-test
// in another (flaky ENOENT). DOC_LOCAL_STORAGE_DIR points storage.ts here instead.
const LOCAL_STORAGE_DIR = join(tmpdir(), `wp-docs-service-${randomUUID()}`);

describe('DocumentsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new DocumentsService(prisma, changes);
  const createdTripIds: string[] = [];

  beforeAll(() => {
    process.env.DOC_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env[DOC_LOCAL_STORAGE_DIR] = LOCAL_STORAGE_DIR;
  });

  afterAll(async () => {
    delete process.env.DOC_ENCRYPTION_KEY;
    delete process.env[DOC_LOCAL_STORAGE_DIR];
    await rm(LOCAL_STORAGE_DIR, { recursive: true, force: true });
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

  // B-03: an executable "document" (HTML/SVG/XHTML) uploaded by one member runs
  // script in the app origin when a co-traveler opens it. The allow-list rejects
  // those types before anything is encrypted or stored — no row, no orphan blob.
  it('rejects a disallowed upload MIME type (text/html) before storing anything', async () => {
    const tripId = await newTrip();
    const payload = Buffer.from('<script>alert(document.cookie)</script>');

    await expect(
      service.create(
        tripId,
        DEV_USER,
        { type: 'other', title: 'itinerary' },
        { buffer: payload, mimetype: 'text/html', size: payload.length },
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    expect(await prisma.document.findMany({ where: { tripId } })).toEqual([]);
    await expect(readdir(LOCAL_STORAGE_DIR)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  // B-13: a client-supplied ownerUserId must be a member of the trip — otherwise
  // a document could be attributed to a non-member.
  it('rejects a create whose ownerUserId is not a trip member', async () => {
    const tripId = await newTrip();
    const payload = Buffer.from('passport');

    await expect(
      service.create(
        tripId,
        DEV_USER,
        { type: 'passport', title: 'Passport', ownerUserId: 'u-not-a-member' },
        { buffer: payload, mimetype: 'application/pdf', size: payload.length },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.document.findMany({ where: { tripId } })).toEqual([]);
  });

  it('rejects image/svg+xml uploads (SVG can carry inline script)', async () => {
    const tripId = await newTrip();
    const payload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    await expect(
      service.create(
        tripId,
        DEV_USER,
        { type: 'other', title: 'diagram' },
        { buffer: payload, mimetype: 'image/svg+xml', size: payload.length },
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
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
