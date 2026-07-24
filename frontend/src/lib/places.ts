// Place resolution for the timeline (ADR-0048 authority rule): a linked event's
// place lives on its booking (single-place → placeId; transport → origin); an
// unlinked event owns its own placeId. Consumers resolve a display name through here
// rather than reading a (now-removed) free-text location off the event.
import {
  categoryForBookingType,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';

const isTransport = (booking: Booking): boolean =>
  categoryForBookingType(booking.type) === 'transport';

/**
 * Every `placeId` actually referenced by a saved entity — the set that defines
 * "in the trip". A `Place` row exists the moment it's picked (it doubles as the
 * dedup/enrichment cache, ADR-0048), but a picked-then-unsaved place has **no**
 * reference, so it is cache-only, not in the trip: it drops out of this set and
 * back in the moment something references it. Consumers (the picker's "already in
 * trip" chip, and the Map tab's place-usage) key off this, not mere row-presence.
 */
export function referencedPlaceIds(
  events: TripEvent[],
  bookings: Booking[],
  maybeItems: MaybeItem[],
): Set<string> {
  const ids = new Set<string>();
  const add = (id?: string | null) => {
    if (id) ids.add(id);
  };
  for (const e of events) add(e.placeId);
  for (const b of bookings) {
    add(b.placeId);
    add(b.fromPlaceId);
    add(b.toPlaceId);
  }
  for (const m of maybeItems) add(m.placeId);
  return ids;
}

/** The effective placeId of a booking, following the authority rule: transport
 *  departs from its origin, every other booking sits at its single place. */
export function bookingPlaceId(booking: Booking): string | undefined {
  return isTransport(booking) ? booking.fromPlaceId : booking.placeId;
}

/** The effective placeId to show for an event, following the authority rule. */
export function eventPlaceId(event: TripEvent, booking?: Booking): string | undefined {
  if (event.bookingId && booking) return bookingPlaceId(booking);
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

// ── Google Maps deep-links (Phase 2, ADR-0106/0109) ─────────────────────────
// Universal Maps-URL links (no API key, open the Maps app on device): a place
// is navigable/mappable only when it has real coordinates. A name-only
// "Place-lite" (coordless) has no usable location, so these return null and the
// caller drops the affordance — "no location, no ניווט button".
const GOOGLE_MAPS = 'https://www.google.com/maps';

function hasCoords(place: Place | undefined): place is Place & { lat: number; lng: number } {
  return place != null && place.lat != null && place.lng != null;
}

/** Directions ("נווט") deep-link to a place, or null when it has no coordinates. */
export function mapsDirectionsUrl(place: Place | undefined): string | null {
  if (!hasCoords(place)) return null;
  const destination = encodeURIComponent(`${place.lat},${place.lng}`);
  const placeId = place.googlePlaceId
    ? `&destination_place_id=${encodeURIComponent(place.googlePlaceId)}`
    : '';
  return `${GOOGLE_MAPS}/dir/?api=1&destination=${destination}${placeId}`;
}

/** "View this place" deep-link (open in Maps), or null when it has no coordinates. */
export function mapsPlaceUrl(place: Place | undefined): string | null {
  if (!hasCoords(place)) return null;
  const query = encodeURIComponent(`${place.lat},${place.lng}`);
  const placeId = place.googlePlaceId
    ? `&query_place_id=${encodeURIComponent(place.googlePlaceId)}`
    : '';
  return `${GOOGLE_MAPS}/search/?api=1&query=${query}${placeId}`;
}

/** Directions link for an event's resolved place (authority rule), or null when
 *  the event has no place or a coordless one. */
export function eventDirectionsUrl(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): string | null {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  return mapsDirectionsUrl(places.find((p) => p.id === eventPlaceId(event, booking)));
}

/** Directions link for a booking's resolved place (authority rule), or null when
 *  the booking has no place or a coordless one. */
export function bookingDirectionsUrl(booking: Booking, places: Place[]): string | null {
  return mapsDirectionsUrl(places.find((p) => p.id === bookingPlaceId(booking)));
}
