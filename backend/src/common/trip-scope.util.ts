import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Reject any place id that isn't a place in this trip (ADR-0048 / backend-review
 * B-06). A client-supplied `placeId`/`fromPlaceId`/`toPlaceId` must belong to the
 * same trip; a foreign id is a cross-trip reference and gets a 400. Shared by
 * bookings and events so both scope references identically.
 */
export async function assertPlacesInTrip(
  prisma: PrismaService,
  tripId: string,
  ids: (string | null | undefined)[],
): Promise<void> {
  const present = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (present.length === 0) return;
  const found = await prisma.place.findMany({
    where: { tripId, id: { in: present } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((p) => p.id));
  const missing = present.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new BadRequestException(`Unknown place(s) for this trip: ${missing.join(', ')}`);
  }
}

/**
 * Reject a `bookingId` that isn't a booking in this trip (backend-review B-06).
 * Events previously wrote `input.bookingId` unchecked, so a member of trip A
 * could link an event to trip B's booking — corrupting the Event↔Booking 1:1
 * across trips and letting a cross-trip hard event escape the same-trip
 * hard-dependency guard. A foreign id gets a 400.
 */
export async function assertBookingInTrip(
  prisma: PrismaService,
  tripId: string,
  bookingId: string | null | undefined,
): Promise<void> {
  if (!bookingId) return;
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tripId },
    select: { id: true },
  });
  if (!booking) throw new BadRequestException(`Unknown booking for this trip: ${bookingId}`);
}

/**
 * Reject a note's host id that isn't in this trip (ADR-0152 §2). A note carries at most
 * one of five typed FKs, and every one of them is a client-supplied id — so this is the
 * same class of reference `assertPlacesInTrip`/`assertBookingInTrip` above already guard,
 * one entity wider. A foreign id gets a 400 rather than a cross-trip note whose host the
 * reader can never see.
 *
 * Table-driven so a sixth note-bearing entity is one line here and nothing at the call
 * site — the shape ADR-0094 uses for the applier registries, applied to a scope check.
 * The at-most-one rule itself is the shared zod schema's (`createNoteSchema`), so this
 * only has to check whichever host is actually set.
 */
export async function assertNoteHostInTrip(
  prisma: PrismaService,
  tripId: string,
  host: {
    eventId?: string | null;
    bookingId?: string | null;
    placeId?: string | null;
    maybeItemId?: string | null;
    documentId?: string | null;
  },
): Promise<void> {
  const checks: [string | null | undefined, string, () => Promise<{ id: string } | null>][] = [
    [
      host.eventId,
      'event',
      () => prisma.event.findFirst({ where: { id: host.eventId!, tripId }, select: { id: true } }),
    ],
    [
      host.bookingId,
      'booking',
      () =>
        prisma.booking.findFirst({ where: { id: host.bookingId!, tripId }, select: { id: true } }),
    ],
    [
      host.placeId,
      'place',
      () => prisma.place.findFirst({ where: { id: host.placeId!, tripId }, select: { id: true } }),
    ],
    [
      host.maybeItemId,
      'maybe item',
      () =>
        prisma.maybeItem.findFirst({
          where: { id: host.maybeItemId!, tripId },
          select: { id: true },
        }),
    ],
    [
      host.documentId,
      'document',
      () =>
        prisma.document.findFirst({
          where: { id: host.documentId!, tripId },
          select: { id: true },
        }),
    ],
  ];
  for (const [id, label, find] of checks) {
    if (!id) continue;
    if (!(await find())) throw new BadRequestException(`Unknown ${label} for this trip: ${id}`);
  }
}
