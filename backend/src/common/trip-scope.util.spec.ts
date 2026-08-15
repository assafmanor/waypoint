import 'reflect-metadata';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBookingInTrip,
  assertEntityRefsInTrip,
  assertMemberInTrip,
  assertPlacesInTrip,
} from './trip-scope.util';

// The shared scope guard, tested directly rather than only through the services that call it
// (backend/CLAUDE.md) — it now serves notes AND attachments, so a drift between the two would
// otherwise only surface as a cross-trip row somebody's reader cannot see (backend-review
// B-06's class of bug). Integration test against the seeded dev Postgres.
const DEV_USER = 'u-assaf';

describe('trip-scope guards', () => {
  const prisma = new PrismaService();
  const createdTripIds: string[] = [];

  async function newTrip(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'trip-scope test trip',
        destination: 'Testland',
        startDate: new Date('2027-04-01'),
        endDate: new Date('2027-04-07'),
        createdBy: DEV_USER,
        updatedBy: DEV_USER,
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  afterEach(async () => {
    await prisma.trip.deleteMany({ where: { id: { in: createdTripIds.splice(0) } } });
  });

  afterAll(() => prisma.$disconnect());

  it('accepts a place in this trip and refuses one from another', async () => {
    const [tripId, otherTripId] = [await newTrip(), await newTrip()];
    const mine = await prisma.place.create({
      data: { tripId, name: 'מלון סאקורה', updatedBy: DEV_USER },
    });
    const theirs = await prisma.place.create({
      data: { tripId: otherTripId, name: 'אחר', updatedBy: DEV_USER },
    });

    await expect(assertPlacesInTrip(prisma, tripId, [mine.id])).resolves.toBeUndefined();
    await expect(assertPlacesInTrip(prisma, tripId, [theirs.id])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an absent reference — nothing to scope is not a violation', async () => {
    const tripId = await newTrip();
    await expect(assertPlacesInTrip(prisma, tripId, [null, undefined])).resolves.toBeUndefined();
    await expect(assertBookingInTrip(prisma, tripId, null)).resolves.toBeUndefined();
    await expect(assertEntityRefsInTrip(prisma, tripId, {})).resolves.toBeUndefined();
  });

  // The generalization ADR-0173 leans on: whichever keys are PRESENT are checked, so a note's
  // host and an attachment's host-plus-document go through one guard rather than two copies.
  it('checks every reference that is set, across entity kinds', async () => {
    const [tripId, otherTripId] = [await newTrip(), await newTrip()];
    const booking = await prisma.booking.create({
      data: { tripId, type: 'hotel', title: 'מלון', updatedBy: DEV_USER },
    });
    const document = await prisma.document.create({
      data: {
        tripId,
        type: 'other',
        title: 'אישור',
        fileRef: 'blob-scope-1',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        updatedBy: DEV_USER,
      },
    });
    const foreignDocument = await prisma.document.create({
      data: {
        tripId: otherTripId,
        type: 'other',
        title: 'אישור של מישהו אחר',
        fileRef: 'blob-scope-2',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        updatedBy: DEV_USER,
      },
    });

    await expect(
      assertEntityRefsInTrip(prisma, tripId, { bookingId: booking.id, documentId: document.id }),
    ).resolves.toBeUndefined();
    // One good reference does not excuse the other.
    await expect(
      assertEntityRefsInTrip(prisma, tripId, {
        bookingId: booking.id,
        documentId: foreignDocument.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an id that exists nowhere at all', async () => {
    const tripId = await newTrip();
    await expect(
      assertEntityRefsInTrip(prisma, tripId, { eventId: 'no-such-event' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // The assignee guard (tasks brief §6). Keyed on `(tripId, userId)` rather than on a row
  // id, which is why it is a sibling of the table above rather than a line in it.
  describe('assertMemberInTrip', () => {
    it('accepts a member of this trip and no assignee at all', async () => {
      const tripId = await newTrip();
      await prisma.membership.create({ data: { tripId, userId: DEV_USER, role: 'admin' } });

      await expect(assertMemberInTrip(prisma, tripId, DEV_USER)).resolves.toBeUndefined();
      // Unassigned is the group's task, not a missing value (brief §6).
      await expect(assertMemberInTrip(prisma, tripId, null)).resolves.toBeUndefined();
      await expect(assertMemberInTrip(prisma, tripId, undefined)).resolves.toBeUndefined();
    });

    it('refuses a real user who is not a member of THIS trip', async () => {
      const tripId = await newTrip();
      const otherTripId = await newTrip();
      await prisma.membership.create({
        data: { tripId: otherTripId, userId: DEV_USER, role: 'admin' },
      });

      // The user exists and is a member of a trip — just not this one, which is the case a
      // bare `user.findUnique` would have waved through.
      await expect(assertMemberInTrip(prisma, tripId, DEV_USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a user id that exists nowhere', async () => {
      const tripId = await newTrip();
      await expect(assertMemberInTrip(prisma, tripId, 'u-nobody')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
