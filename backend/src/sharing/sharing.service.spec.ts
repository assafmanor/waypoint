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
import { EnrichmentService } from '../enrichment/enrichment.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisabledItineraryNarrativeGenerator } from './itinerary-narrative.generator';
import { ItineraryNarrativeService } from './itinerary-narrative.service';
import { SharingProjectionService } from './sharing-projection.service';
import { SharingService } from './sharing.service';
import type { PdfBrowserService } from './pdf-browser.service';

const ADMIN = 'u-assaf';
const PEER = 'u-noam';
const TRIP_NAME = 'sharing service test trip';

const FULL: UpsertTripShareInput = {
  detailLevel: SHARE_DETAIL_LEVEL.FULL,
  sensitive: NO_SENSITIVE_FIELDS,
  documentIds: [],
};

/** **A trip whose places carry no enrichment**, which is what every fixture below is and
 *  what a freshly picked place is until a pass runs. The projection reads the store to
 *  reach rung 2 of the place-label chain (the city an airport serves) and takes rung 3 —
 *  the stripped name — when there is nothing there, so this stub exercises the fallback
 *  rather than skipping the chain. `readForPlaces` is the only method it calls, and it
 *  ignores the `stale` half deliberately: a public read must never trigger a fetch. */
const noEnrichment = () =>
  ({ readForPlaces: async () => ({ enrichments: {}, stale: [] }) }) as unknown as EnrichmentService;

describe('SharingService', () => {
  const prisma = new PrismaService();
  const projection = new SharingProjectionService(
    prisma,
    new ItineraryNarrativeService(prisma, new DisabledItineraryNarrativeGenerator()),
    noEnrichment(),
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
  // The renderer is a real browser; the service spec is about authorization, so it takes a
  // stub. `pdf-browser.service.spec.ts` drives the real Chromium.
  const pdfBrowser = {
    render: async () => Buffer.from('%PDF-1.4'),
  } as unknown as PdfBrowserService;
  const service = new SharingService(prisma, projection, documents, pdfBrowser);

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

  const SUMMARY: UpsertTripShareInput = {
    detailLevel: SHARE_DETAIL_LEVEL.SUMMARY,
    sensitive: NO_SENSITIVE_FIELDS,
    documentIds: [],
  };

  it('creates one stable Full share with every sensitive family off', async () => {
    const first = await service.upsert(tripId, ADMIN, FULL);
    const second = await service.upsert(tripId, ADMIN, FULL);

    expect(first.code).toMatch(PUBLIC_CODE_PATTERN);
    // Idempotent, which is what lets the sheet's first outcome press create the share with
    // no separate Save, and stops a double-tap minting a second URL.
    expect(second.code).toBe(first.code);
    expect(second.sensitive).toEqual(NO_SENSITIVE_FIELDS);
    expect(second.shareUrl).toBe(`/s/${first.code}`);
    expect(await service.list(tripId)).toHaveLength(1);
  });

  it('hands back a root-relative url, never an origin', async () => {
    const config = await service.upsert(tripId, ADMIN, FULL);
    expect(config.shareUrl.startsWith('/s/')).toBe(true);
    expect(config.shareUrl).not.toContain('http');
  });

  it('never creates a share on a read', async () => {
    expect(await service.list(tripId)).toEqual([]);
    expect(await prisma.tripShare.count({ where: { tripId } })).toBe(0);
  });

  /**
   * **The question the tenth amendment exists to answer** (owner: _"I want to be able to
   * share with different privacy options … and not choose only one"_). Two audiences, two
   * links, at once — and neither press disturbs the other's URL.
   */
  it('serves several levels at once, each with its own link', async () => {
    const summary = await service.upsert(tripId, ADMIN, SUMMARY);
    const full = await service.upsert(tripId, ADMIN, FULL);
    const operational = await service.upsert(tripId, ADMIN, everything([documentId]));

    const codes = [summary.code, full.code, operational.code];
    expect(new Set(codes).size).toBe(3);
    await Promise.all(codes.map((code) => expect(projection.byCode(code)).resolves.toBeTruthy()));
    // Listed in the sheet's order — by level, which is the enum's own order.
    expect((await service.list(tripId)).map((config) => config.detailLevel)).toEqual([
      SHARE_DETAIL_LEVEL.SUMMARY,
      SHARE_DETAIL_LEVEL.FULL,
      SHARE_DETAIL_LEVEL.EVERYTHING,
    ]);
  });

  /**
   * **`everything` is a family, not a projection** (owner, on the first drawing: _"The הכל
   * category could have different levels of detail based on what you allow, so maybe for
   * that there could be multiple different links"_). A sister who needs codes and a hotel
   * that needs only names are both Everything and must not share a link.
   */
  it('gives two Everything policies two links', async () => {
    const withFile = await service.upsert(tripId, ADMIN, everything([documentId]));
    const withoutFile = await service.upsert(tripId, ADMIN, everything());
    const withNotes = await service.upsert(tripId, ADMIN, {
      ...everything(),
      sensitive: { ...NO_SENSITIVE_FIELDS, bookingSecrets: true, notesAndTasks: true },
    });

    expect(new Set([withFile.code, withoutFile.code, withNotes.code]).size).toBe(3);
    // The file travels with the policy that names it, and with no other.
    await expect(service.publicDocument(withFile.code, documentId)).resolves.toBeTruthy();
    await expect(service.publicDocument(withoutFile.code, documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /** The order of the file list is not part of what a link reveals, so it must not mint a
   *  second one that reveals exactly the same thing. */
  it('treats a reordered file selection as the same policy', async () => {
    const first = await service.upsert(tripId, ADMIN, everything([documentId, otherDocumentId]));
    const again = await service.upsert(tripId, ADMIN, everything([otherDocumentId, documentId]));

    expect(again.code).toBe(first.code);
    expect(await service.list(tripId)).toHaveLength(1);
  });

  it('lets a peer read the list but not mutate anything', async () => {
    const config = await service.upsert(tripId, ADMIN, FULL);

    await expect(service.list(tripId)).resolves.toEqual([
      expect.objectContaining({ code: config.code }),
    ]);
    await expect(service.upsert(tripId, PEER, FULL)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rotate(tripId, config.code, PEER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.revoke(tripId, config.code, PEER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.revokeAll(tripId, PEER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('makes a rotated code stop resolving immediately', async () => {
    const before = await service.upsert(tripId, ADMIN, FULL);
    const after = await service.rotate(tripId, before.code, ADMIN);

    expect(after.code).not.toBe(before.code);
    await expect(projection.byCode(before.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(projection.byCode(after.code)).resolves.toBeTruthy();
  });

  /** A code is a bearer credential, so holding one must not let an admin of a DIFFERENT
   *  trip act on it — the cross-trip refusal `trip-scope.util.ts` exists for. */
  it("refuses to rotate or revoke another trip's link", async () => {
    const config = await service.upsert(tripId, ADMIN, FULL);

    await expect(service.rotate(otherTripId, config.code, ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.revoke(otherTripId, config.code, ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(projection.byCode(config.code)).resolves.toBeTruthy();
  });

  it('stops one link without touching its siblings', async () => {
    const summary = await service.upsert(tripId, ADMIN, SUMMARY);
    const full = await service.upsert(tripId, ADMIN, FULL);

    await service.revoke(tripId, summary.code, ADMIN);

    await expect(projection.byCode(summary.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(projection.byCode(full.code)).resolves.toBeTruthy();
    expect((await service.list(tripId)).map((config) => config.code)).toEqual([full.code]);
    // The row survives, so the policy is still there to re-share.
    expect(await prisma.tripShare.count({ where: { tripId } })).toBe(2);
  });

  /** The route that existed before the amendment, keeping the meaning it always had — and
   *  the one honest answer to somebody who wants the sharing to stop now. */
  it('stops every link at once', async () => {
    const summary = await service.upsert(tripId, ADMIN, SUMMARY);
    const operational = await service.upsert(tripId, ADMIN, everything([documentId]));

    await service.revokeAll(tripId, ADMIN);

    expect(await service.list(tripId)).toEqual([]);
    await expect(projection.byCode(summary.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(projection.byCode(operational.code)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.publicDocument(operational.code, documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('re-shares a withdrawn policy with a fresh code rather than reviving one', async () => {
    const first = await service.upsert(tripId, ADMIN, FULL);
    await service.revoke(tripId, first.code, ADMIN);
    const again = await service.upsert(tripId, ADMIN, FULL);

    expect(again.code).not.toBe(first.code);
    await expect(projection.byCode(first.code)).rejects.toBeInstanceOf(NotFoundException);
    // Reused row, not a second one — the uniqueness spans revoked rows.
    expect(await prisma.tripShare.count({ where: { tripId } })).toBe(1);
  });

  it('restores exactly the file selection a re-shared policy names', async () => {
    const first = await service.upsert(tripId, ADMIN, everything([documentId, otherDocumentId]));
    await service.revoke(tripId, first.code, ADMIN);
    const again = await service.upsert(tripId, ADMIN, everything([documentId, otherDocumentId]));

    expect(again.documentIds.sort()).toEqual([documentId, otherDocumentId].sort());
    await expect(service.publicDocument(again.code, otherDocumentId)).resolves.toBeTruthy();
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
    await service.revoke(tripId, config.code, ADMIN);

    await expect(service.publicDocument(config.code, documentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
