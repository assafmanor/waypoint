import 'reflect-metadata';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  NO_SENSITIVE_FIELDS,
  SHARE_DETAIL_LEVEL,
  type UpsertTripShareInput,
} from '@waypoint/shared';
import { PUBLIC_CODE_PATTERN } from '../common/public-code.util';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisabledItineraryNarrativeGenerator } from './itinerary-narrative.generator';
import { ItineraryNarrativeService } from './itinerary-narrative.service';
import { SharingProjectionService } from './sharing-projection.service';
import { SharingService } from './sharing.service';

const ADMIN = 'u-assaf';
const PEER = 'u-noam';
const TRIP_NAME = 'sharing service test trip';

const FULL: UpsertTripShareInput = {
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  sensitive: NO_SENSITIVE_FIELDS,
  documentIds: [],
};

describe('SharingService', () => {
  const prisma = new PrismaService();
  const projection = new SharingProjectionService(
    prisma,
    new ItineraryNarrativeService(prisma, new DisabledItineraryNarrativeGenerator()),
  );
  // The document content path is exercised through its own module's spec; here only the
  // authorization in front of it matters, so the decryption is stubbed.
  const documents = {
    getContent: async () => ({
      buffer: Buffer.from('%PDF-1.4'),
      mimeType: 'application/pdf',
      title: 'הזמנת הדירה.pdf',
    }),
  } as unknown as DocumentsService;
  const service = new SharingService(prisma, projection, documents);

  let tripId: string;
  let otherTripId: string;
  let documentId: string;
  let otherDocumentId: string;
  let foreignDocumentId: string;

  async function newTrip(name = TRIP_NAME): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name,
        destination: 'Iceland',
        startDate: new Date('2026-08-29'),
        endDate: new Date('2026-08-30'),
        createdBy: ADMIN,
        updatedBy: ADMIN,
        memberships: {
          create: [
            { userId: ADMIN, role: 'admin' },
            { userId: PEER, role: 'peer' },
          ],
        },
      },
    });
    return trip.id;
  }

  const newDocument = async (owningTripId: string, title: string): Promise<string> =>
    (
      await prisma.document.create({
        data: {
          tripId: owningTripId,
          type: 'other',
          title,
          fileRef: `ref-${title}`,
          mimeType: 'application/pdf',
          sizeBytes: 8,
          updatedBy: ADMIN,
        },
      })
    ).id;

  const everything = (documentIds: string[] = []): UpsertTripShareInput => ({
    detailLevel: SHARE_DETAIL_LEVEL.EVERYTHING,
    sensitive: { ...NO_SENSITIVE_FIELDS, bookingSecrets: true },
    documentIds,
  });

  beforeEach(async () => {
    tripId = await newTrip();
    otherTripId = await newTrip(`${TRIP_NAME} other`);
    documentId = await newDocument(tripId, 'shared.pdf');
    otherDocumentId = await newDocument(tripId, 'private.pdf');
    foreignDocumentId = await newDocument(otherTripId, 'foreign.pdf');
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { name: { startsWith: TRIP_NAME } } });
    await prisma.$disconnect();
  });

  it('creates one stable Full share with every sensitive family off', async () => {
    const first = await service.upsert(tripId, ADMIN, FULL);
    const second = await service.upsert(tripId, ADMIN, FULL);

    expect(first.code).toMatch(PUBLIC_CODE_PATTERN);
    // Idempotent, which is what lets the sheet's first outcome press create the share with
    // no separate Save, and stops a double-tap minting a second URL.
    expect(second.code).toBe(first.code);
    expect(second.sensitive).toEqual(NO_SENSITIVE_FIELDS);
    expect(second.shareUrl).toBe(`/s/${first.code}`);
  });

  it('hands back a root-relative url, never an origin', async () => {
    const config = await service.upsert(tripId, ADMIN, FULL);
    expect(config.shareUrl.startsWith('/s/')).toBe(true);
    expect(config.shareUrl).not.toContain('http');
  });

  it('never creates a share on a read', async () => {
    await expect(service.get(tripId)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.tripShare.count({ where: { tripId } })).toBe(0);
  });

  it('lets a peer read an existing config but not mutate it', async () => {
    await service.upsert(tripId, ADMIN, FULL);

    await expect(service.get(tripId)).resolves.toEqual(
      expect.objectContaining({ code: expect.any(String) }),
    );
    await expect(service.upsert(tripId, PEER, FULL)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rotate(tripId, PEER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.revoke(tripId, PEER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('makes a rotated code stop resolving immediately', async () => {
    const before = await service.upsert(tripId, ADMIN, FULL);
    const after = await service.rotate(tripId, ADMIN);

    expect(after.code).not.toBe(before.code);
    await expect(projection.byCode(before.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(projection.byCode(after.code)).resolves.toBeTruthy();
  });

  it('keeps the configuration but stops the link when sharing is stopped', async () => {
    const config = await service.upsert(tripId, ADMIN, FULL);
    await service.revoke(tripId, ADMIN);

    await expect(projection.byCode(config.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(tripId)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.tripShare.count({ where: { tripId } })).toBe(1);
  });

  it('re-shares with a fresh code rather than reviving a withdrawn one', async () => {
    const first = await service.upsert(tripId, ADMIN, FULL);
    await service.revoke(tripId, ADMIN);
    const again = await service.upsert(tripId, ADMIN, FULL);

    expect(again.code).not.toBe(first.code);
    await expect(projection.byCode(first.code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops sensitive selections when the level moves back below Everything', async () => {
    await service.upsert(tripId, ADMIN, everything([documentId]));
    const narrowed = await service.upsert(tripId, ADMIN, FULL);

    expect(narrowed.sensitive).toEqual(NO_SENSITIVE_FIELDS);
    expect(narrowed.documentIds).toEqual([]);
    // The rows are gone, not merely unread: the download route's authorization is that row.
    await expect(service.publicDocument(narrowed.code, documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replaces the file selection rather than accumulating it', async () => {
    await service.upsert(tripId, ADMIN, everything([documentId, otherDocumentId]));
    const config = await service.upsert(tripId, ADMIN, everything([documentId]));

    expect(config.documentIds).toEqual([documentId]);
    await expect(service.publicDocument(config.code, otherDocumentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses another trip's document", async () => {
    await expect(
      service.upsert(tripId, ADMIN, everything([foreignDocumentId])),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('downloads only a document selected for this active share', async () => {
    const config = await service.upsert(tripId, ADMIN, everything([documentId]));

    await expect(service.publicDocument(config.code, documentId)).resolves.toEqual(
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    await expect(service.publicDocument(config.code, otherDocumentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('stops a selected document downloading once the share is revoked', async () => {
    const config = await service.upsert(tripId, ADMIN, everything([documentId]));
    await service.revoke(tripId, ADMIN);

    await expect(service.publicDocument(config.code, documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
