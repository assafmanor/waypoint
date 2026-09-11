// The linked itinerary event a timed booking derives (ADR-0047 §1 / ADR-0093).
// ONE source of truth for the booking→event mapping so the client's optimistic
// mirror (frontend `eventFromBookingSeed`) and the server's persistence
// (backend `eventDataFromBooking`) can't diverge: the title tracks the booking,
// the category falls back to the booking type's, the kind falls back to hard,
// the schedule passes through from the seed, and `bookingId` ties them. A linked
// event's place always comes from the booking (ADR-0048), so it carries none.
//
// Representation-agnostic (ISO strings, not Date): each side adapts the shape it
// persists/renders and adds its own id / status / actor / timestamps.
import { BOOKING_TYPE_TO_CATEGORY, EVENT_KIND, GATE_WINDOW_MINUTES } from './constants';
import type { BookingType, EventCategory, EventKind } from './entities';
import type { BookingEventSeed } from './schemas';

/** The fields a linked event derives from its booking + seed — the parts both
 *  the client mirror and the server persist identically. */
export interface BookingEventFields {
  title: string;
  icon?: string;
  category: EventCategory;
  kind: EventKind;
  date: string;
  endDate?: string;
  startsAt?: string;
  endsAt?: string;
  /** The other bound of a flexible edge's window (ADR-0184). Passes through from the
   *  seed like the rest of the schedule, so the client mirror and the server agree —
   *  and `null` is meaningful here: the seed is rebuilt whole on every save, so an
   *  absent window means the user removed it, exactly as `endDate` already works. */
  startWindowEnd?: string | null;
  endWindowStart?: string | null;
  bookingId: string;
}

export function bookingEventFields(
  booking: { id: string; title: string; type: BookingType },
  seed: BookingEventSeed,
): BookingEventFields {
  return {
    title: booking.title,
    icon: seed.icon,
    category: seed.category ?? BOOKING_TYPE_TO_CATEGORY[booking.type],
    kind: seed.kind ?? EVENT_KIND.HARD,
    date: seed.date,
    endDate: seed.endDate,
    startsAt: seed.startsAt,
    endsAt: seed.endsAt,
    startWindowEnd: seed.startWindowEnd ?? null,
    endWindowStart: seed.endWindowStart ?? null,
    bookingId: booking.id,
  };
}

/**
 * **Where an event IS**, and the reason it cannot be `event.placeId`.
 *
 * ADR-0048 makes a linked event's place the BOOKING's: `bookingEventFields` above carries none
 * and the column is cleared on save, so `event.placeId` is authoritative only for an event no
 * booking backs. Reading it alone puts every hotel, restaurant, ticket and activity on the trip
 * at nowhere — which is what named a day `מפלי גולפוס ← Kerið Crater` when its first stop was a
 * booked zip line (owner, 2026-09-05), and what left a day of three pictured booked stops with
 * no picture at all.
 *
 * **Transport answers with neither end.** A leg is at two places rather than one, and a caller
 * that wants them asks for them (`buildDayStopSequence` takes both). Contrast the app's
 * `lib/places.ts` `eventPlaceId`, which is a different question with a different answer — which
 * PIN an event drops, where a leg drops its origin — and is deliberately not this.
 *
 * Takes `null` as well as `undefined` so the two callers hand it their rows as they hold them:
 * Prisma says `null` where these shapes say `undefined` (`packages/shared/CLAUDE.md`).
 */
export function eventStopPlaceId(
  event: { placeId?: string | null },
  booking?: { placeId?: string | null; fromPlaceId?: string | null; toPlaceId?: string | null },
): string | undefined {
  if (!booking) return event.placeId ?? undefined;
  if (booking.fromPlaceId || booking.toPlaceId) return undefined;
  return booking.placeId ?? undefined;
}

/** **Is the gate the thing to say right now?** (ADR-0222 §4/§5.)
 *
 *  A gate is the one fact in this app that is worthless all trip and decisive for forty
 *  minutes: unknown when you book, published a couple of hours out, and meaningless once
 *  you are aboard. So the board draws it only inside a window before departure, and there
 *  it takes the confirmation code's slot rather than adding a chip beside it — not because
 *  the line cannot afford both (measured: it can) but because printing a ticket number you
 *  cannot act on beside a gate you must act on is the wrong sentence, and the code is
 *  already carried by Home's `הכרטיס הבא` tile.
 *
 *  **Closes at departure, not after it.** Past `startsAt` the board is in its in-transit
 *  state, where a gate says nothing — so this is a half-open window and never a "recently
 *  departed" grace period.
 *
 *  Returns false for a booking with no gate, so callers need no second null check: an
 *  absent gate and a gate outside its window are the same answer to the board.
 */
export function gateIsDue(
  booking: { gate?: string } | undefined,
  startsAt: string | undefined,
  nowMs: number,
): boolean {
  if (!booking?.gate || !startsAt) return false;
  const startMs = Date.parse(startsAt);
  if (Number.isNaN(startMs)) return false;
  return nowMs < startMs && startMs - nowMs <= GATE_WINDOW_MINUTES * 60_000;
}
