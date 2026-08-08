import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeService } from '../sync/change.service';
import { SyncGateway } from '../sync/sync.gateway';
import { DocumentAttachmentsService } from './document-attachments.service';

// Integration test against the seeded dev Postgres (backend/prisma/seed.mjs, T-015).
const DEV_USER = 'u-assaf';

describe('DocumentAttachmentsService', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  const changes = new ChangeService(prisma, gateway);
  const service = new DocumentAttachmentsService(prisma, changes);
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'DocumentAttachmentsService test trip',
        destination: 'Testland',
        startDate: new Date('2027-03-01'),
        endDate: new Date('2027-03-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  const newDocument = (tripId: string, title = 'אישור הזמנה') =>
    prisma.document.create({
      data: {
        tripId,
        type: 'other',
        title,
        fileRef: `blob-${Math.random().toString(36).slice(2)}`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        updatedBy: DEV_USER,
      },
    });

  const newBooking = (tripId: string, title = 'מלון סאקורה') =>
    prisma.booking.create({ data: { tripId, type: 'hotel', title, updatedBy: DEV_USER } });

  const newEvent = (tripId: string, title = 'צ׳ק-אין') =>
    prisma.event.create({
      data: { tripId, date: new Date('2027-03-02'), title, kind: 'soft', updatedBy: DEV_USER },
    });

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('writes a link and its Change together', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);

    const link = await service.create(tripId, DEV_USER, {
      documentId: doc.id,
      bookingId: booking.id,
    });

    expect(link).toMatchObject({ documentId: doc.id, bookingId: booking.id, createdBy: DEV_USER });
    expect(link.eventId).toBeUndefined();
    const change = await prisma.change.findFirst({ where: { tripId, entityId: link.id } });
    expect(change).toMatchObject({ entityType: 'documentAttachment', action: 'create' });
  });

  // The many-to-many that pays for the join table immediately: ADR-0154 fixes a round trip
  // as TWO bookings, and one confirmation PDF covers both.
  it('lets one document cover two hosts', async () => {
    const tripId = await newTrip();
    const doc = await newDocument(tripId, 'אישור טיסה הלוך ושוב');
    const [out, back] = await Promise.all([
      newBooking(tripId, 'תל אביב · וינה'),
      newBooking(tripId, 'וינה · תל אביב'),
    ]);

    await service.create(tripId, DEV_USER, { documentId: doc.id, bookingId: out.id });
    await service.create(tripId, DEV_USER, { documentId: doc.id, bookingId: back.id });

    expect(await prisma.documentAttachment.count({ where: { documentId: doc.id } })).toBe(2);
  });

  it('treats a duplicate client id as already applied rather than a conflict', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);
    const id = 'att-dupe-1234';
    const input = { id, documentId: doc.id, bookingId: booking.id };

    const first = await service.create(tripId, DEV_USER, input);
    const second = await service.create(tripId, DEV_USER, input);

    expect(second.id).toBe(first.id);
    expect(await prisma.documentAttachment.count({ where: { tripId } })).toBe(1);
  });

  // The second press carries a FRESH id and describes the same link — a double-tap on the
  // picker, not an outbox replay. Same answer, and for the same reason.
  it('treats a re-attach of the same pair as already applied, even under a new id', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);

    const first = await service.create(tripId, DEV_USER, {
      documentId: doc.id,
      bookingId: booking.id,
    });
    const second = await service.create(tripId, DEV_USER, {
      documentId: doc.id,
      bookingId: booking.id,
    });

    expect(second.id).toBe(first.id);
    expect(await prisma.documentAttachment.count({ where: { tripId } })).toBe(1);
  });

  it('refuses a host that belongs to another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const doc = await newDocument(tripId);
    const foreign = await newBooking(otherTripId, 'הזמנה של מישהו אחר');

    await expect(
      service.create(tripId, DEV_USER, { documentId: doc.id, bookingId: foreign.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a document that belongs to another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const [foreignDoc, booking] = await Promise.all([
      newDocument(otherTripId, 'מסמך של מישהו אחר'),
      newBooking(tripId),
    ]);

    await expect(
      service.create(tripId, DEV_USER, { documentId: foreignDoc.id, bookingId: booking.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detaches, and its delete writes a Change', async () => {
    const tripId = await newTrip();
    const [doc, event] = await Promise.all([newDocument(tripId), newEvent(tripId)]);
    const link = await service.create(tripId, DEV_USER, {
      documentId: doc.id,
      eventId: event.id,
    });

    await service.remove(tripId, link.id, DEV_USER);

    expect(await prisma.documentAttachment.count({ where: { tripId } })).toBe(0);
    const change = await prisma.change.findFirst({
      where: { tripId, entityId: link.id, action: 'delete' },
    });
    expect(change).toMatchObject({ entityType: 'documentAttachment' });
  });

  it('refuses to detach a link from another trip', async () => {
    const tripId = await newTrip();
    const otherTripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(otherTripId), newBooking(otherTripId)]);
    const foreign = await service.create(otherTripId, DEV_USER, {
      documentId: doc.id,
      bookingId: booking.id,
    });

    await expect(service.remove(tripId, foreign.id, DEV_USER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // **The whole argument for the join table** (ADR-0173 §1): deleting the host takes the
  // LINK and cannot reach the document, because the document is not on the other end of
  // that FK. A cancelled hotel must not delete your voucher.
  it('a deleted host takes its links and leaves the document alone', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);
    await service.create(tripId, DEV_USER, { documentId: doc.id, bookingId: booking.id });

    await prisma.booking.delete({ where: { id: booking.id } });

    expect(await prisma.documentAttachment.count({ where: { tripId } })).toBe(0);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).not.toBeNull();
  });

  // The other direction, which is the one that SHOULD cascade: the file is gone, so its
  // pointers are meaningless.
  it('a deleted document takes its links', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);
    await service.create(tripId, DEV_USER, { documentId: doc.id, bookingId: booking.id });

    await prisma.document.delete({ where: { id: doc.id } });

    expect(await prisma.documentAttachment.count({ where: { tripId } })).toBe(0);
    expect(await prisma.booking.findUnique({ where: { id: booking.id } })).not.toBeNull();
  });

  // The silent half of the same cascade (§7): Postgres removes the rows and writes NO
  // `Change`, which is exactly why the client owes `dropAttachmentsForHostChange`. Pinned
  // here so the frontend derivation's reason for existing is a tested fact, not a claim.
  it('writes no Change for a cascaded link — the client owes the derivation', async () => {
    const tripId = await newTrip();
    const [doc, booking] = await Promise.all([newDocument(tripId), newBooking(tripId)]);
    const link = await service.create(tripId, DEV_USER, {
      documentId: doc.id,
      bookingId: booking.id,
    });

    await prisma.booking.delete({ where: { id: booking.id } });

    const changes = await prisma.change.findMany({ where: { tripId, entityId: link.id } });
    expect(changes.map((c) => c.action)).toEqual(['create']);
  });
});
