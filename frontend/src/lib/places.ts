// Place resolution for the timeline (ADR-0048 authority rule): a linked event's
// place lives on its booking (single-place → placeId; transport → origin); an
// unlinked event owns its own placeId. Consumers resolve a display name through here
// rather than reading a (now-removed) free-text location off the event.
import { categoryForBookingType, type Booking, type Place, type TripEvent } from '@waypoint/shared';

const isTransport = (booking: Booking): boolean =>
  categoryForBookingType(booking.type) === 'transport';

/** The effective placeId to show for an event, following the authority rule. */
export function eventPlaceId(event: TripEvent, booking?: Booking): string | undefined {
  if (event.bookingId && booking) {
    return isTransport(booking) ? booking.fromPlaceId : booking.placeId;
  }
  return event.placeId;
}

/** Human name for a place id, or undefined when there's no place / no match. */
export function placeName(places: Place[], placeId?: string): string | undefined {
  if (!placeId) return undefined;
  return places.find((p) => p.id === placeId)?.name;
}

/** Convenience: resolve an event straight to its display place name. */
export function eventPlaceName(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): string | undefined {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  return placeName(places, eventPlaceId(event, booking));
}

/** Origin → destination place names, resolved. */
export interface Route {
  from?: string;
  to?: string;
}

/** The origin→destination route of a transport-linked event (ADR-0048/0059), or
 *  null when the event isn't a transport booking or has no endpoints — the caller
 *  then falls back to the event/booking title. A transport booking is the single
 *  authority for from/to; an unlinked event never carries a route. This is the
 *  shared derivation behind every route presentation (Index row, booking detail,
 *  and the board hero) so a flight reads the same wherever it appears — it shows
 *  where it goes, not a name (ADR-0059 §3). */
export function eventRoute(event: TripEvent, bookings: Booking[], places: Place[]): Route | null {
  if (!event.bookingId) return null;
  const booking = bookings.find((b) => b.id === event.bookingId);
  if (!booking || categoryForBookingType(booking.type) !== 'transport') return null;
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  return from || to ? { from, to } : null;
}
