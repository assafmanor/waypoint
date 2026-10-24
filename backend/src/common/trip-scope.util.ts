import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MEMBERSHIP_ROLE } from '@waypoint/shared';
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
 * Reject any entity reference that isn't in this trip — a note's host (ADR-0152 §2), an
 * attachment's host and the document it points at (ADR-0173 §1). Every one of them is a
 * client-supplied id, so this is the same class of reference
 * `assertPlacesInTrip`/`assertBookingInTrip` above already guard, several entities wider.
 * A foreign id gets a 400 rather than a cross-trip row whose other end the reader can
 * never see.
 *
 * **Whichever keys are present are checked, and that is what makes it shared.** It says
 * nothing about how many may be set at once: a note's "at most one host" and an
 * attachment's "exactly one" are the shared zod schemas' rules (`createNoteSchema`,
 * `createDocumentAttachmentSchema`), enforced at both edges.
 *
 * Table-driven so a sixth referenced entity is one line here and nothing at the call site —
 * the shape ADR-0094 uses for the applier registries, applied to a scope check.
 */
export async function assertEntityRefsInTrip(
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

/**
 * Reject an assignee who is not a member of this trip (tasks brief §6). The same
 * class of reference as the three guards above — a client-supplied id written onto a
 * trip's row — and a foreign one would be a task delegated to somebody who can never
 * see it, which reads on the row as a name nobody recognises.
 *
 * **A sibling rather than a sixth line in the table above**, per this file's own rule:
 * that lookup keys on the referenced row's `id`, and a member is resolved by the
 * `(tripId, userId)` pair on `Membership` instead. Same shape, different key.
 */
export async function assertMemberInTrip(
  prisma: PrismaService,
  tripId: string,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const membership = await prisma.membership.findFirst({
    where: { tripId, userId },
    select: { id: true },
  });
  if (!membership) throw new BadRequestException(`Unknown member for this trip: ${userId}`);
}

/**
 * Reject an actor who is not an **admin** of this trip.
 *
 * A sibling to the guards above rather than a variant of them: those answer "is this id in
 * this trip", this answers "may this person do this", and both are the same class of
 * client-supplied claim checked once, in one place. It moved here from
 * `TripsService.assertAdmin` when ADR-0213's sharing module needed the identical check —
 * a private copy in a second service is precisely the drift `assertPlacesInTrip` exists to
 * prevent (B-06), and an authorization check that drifts is worse than a scope one.
 *
 * Assumes membership is already confirmed by `MembershipGuard`; a non-member reads as a
 * non-admin and gets the same 403, which discloses nothing extra either way.
 */
export async function assertTripAdmin(
  prisma: PrismaService,
  tripId: string,
  userId: string,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { role: true },
  });
  if (!membership || membership.role !== MEMBERSHIP_ROLE.ADMIN) {
    throw new ForbiddenException('Admin only');
  }
}
