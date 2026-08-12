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
import { BOOKING_TYPE_TO_CATEGORY, EVENT_KIND } from './constants';
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
