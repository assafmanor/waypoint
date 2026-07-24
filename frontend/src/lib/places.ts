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

// ── Per-event display zones (ADR-0107 multi-zone time model) ────────────────
// "Which timezone is this event shown in" resolves here, beside the linked/
// unlinked place authority it rides on (ADR-0107 consequence: this is where the
// zone naturally lives). Pure + clock-free — callers own `now`. The now/next
// engine and stored instants are untouched; this is display/authoring only.

/** A zone-crossing transport event: the timeline splits into zone segments at
 *  its departure instant. Only transport whose origin and destination zones are
 *  both known **and differ** makes a crossing — a same-zone or coordless hop
 *  doesn't reorient anything. */
export interface ZoneCrossing {
  at: number; // departure instant (ms) — the boundary between the two segments
  fromZone: string;
  toZone: string;
}

/** IANA zone cached on a place row (undefined for a coordless Place-lite). */
function placeZone(places: Place[], placeId?: string): string | undefined {
  if (!placeId) return undefined;
  return places.find((p) => p.id === placeId)?.timezone;
}

/** The trip's zone-crossings in departure order (ADR-0107 §3). Everything before
 *  the first crossing sits in its origin zone (the home zone, known once the
 *  outbound flight's `fromPlace` is entered); each later segment takes the
 *  preceding crossing's destination zone. */
export function tripZoneCrossings(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
): ZoneCrossing[] {
  const crossings: ZoneCrossing[] = [];
  for (const event of events) {
    if (!event.bookingId || !event.startsAt) continue;
    const booking = bookings.find((b) => b.id === event.bookingId);
    if (!booking || !isTransport(booking)) continue;
    const fromZone = placeZone(places, booking.fromPlaceId);
    const toZone = placeZone(places, booking.toPlaceId);
    if (!fromZone || !toZone || fromZone === toZone) continue;
    crossings.push({ at: Date.parse(event.startsAt), fromZone, toZone });
  }
  return crossings.sort((a, b) => a.at - b.at);
}

/** The itinerary-segment zone at an instant (ADR-0107 §3 step 2), or undefined
 *  when no transport anchors the timeline (caller falls back to the trip primary
 *  zone). Before the first crossing → its origin zone; at/after a crossing's
 *  departure → its destination zone (so a mid-flight instant reads the
 *  destination, ADR-0107 §8). */
export function segmentZoneAt(instantMs: number, crossings: ZoneCrossing[]): string | undefined {
  if (crossings.length === 0) return undefined;
  if (instantMs < crossings[0].at) return crossings[0].fromZone;
  let zone = crossings[0].toZone;
  for (const crossing of crossings) {
    if (instantMs >= crossing.at) zone = crossing.toZone;
    else break;
  }
  return zone;
}

/** The resolved display zones for an event's start and end (they differ only for
 *  zone-crossing transport). Priority (ADR-0107 §3, ADR-0110 §94-99):
 *    1. `displayTimezone` manual override — honoured forever, both ends.
 *    2. Attached place — transport renders start in `fromPlace`, end in
 *       `toPlace`; any other place drives both ends.
 *    3. Placeless (or a coordless place) — the itinerary segment's zone.
 *    4. Nothing anchors it — the trip primary zone. */
export function eventDisplayZones(
  event: TripEvent,
  opts: { bookings: Booking[]; places: Place[]; crossings: ZoneCrossing[]; primaryZone: string },
): { start: string; end: string } {
  const { bookings, places, crossings, primaryZone } = opts;
  if (event.displayTimezone) {
    return { start: event.displayTimezone, end: event.displayTimezone };
  }

  const zoneForInstant = (iso: string | undefined): string =>
    (iso ? segmentZoneAt(Date.parse(iso), crossings) : undefined) ?? primaryZone;

  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  if (booking && isTransport(booking)) {
    return {
      start: placeZone(places, booking.fromPlaceId) ?? zoneForInstant(event.startsAt),
      end: placeZone(places, booking.toPlaceId) ?? zoneForInstant(event.endsAt ?? event.startsAt),
    };
  }

  const placed = placeZone(places, eventPlaceId(event, booking));
  if (placed) return { start: placed, end: placed };

  const zone = zoneForInstant(event.startsAt);
  return { start: zone, end: zone };
}

// ── Google Maps deep-links (Phase 2, ADR-0106/0109) ─────────────────────────
// Universal Maps-URL links (no API key, open the Maps app on device): a place
// is navigable/mappable only when it has real coordinates. A name-only
// "Place-lite" (coordless) has no usable location, so these return null and the
// caller drops the affordance — "no location, no ניווט button".
//
// Two long-term fates (ADR-0109 amendment):
//   • DIRECTIONS (`mapsDirectionsUrl`) stays a Google Maps deep-link forever —
//     we never rebuild turn-by-turn navigation (ADR-0106 §F).
//   • VIEW (`mapsPlaceUrl`) is INTERIM. Once the Map tab (Phase 3) / embedded
//     map (Phase 6) ships, "מפה"/view should focus OUR in-app map on the place
//     instead of leaving to Google. TODO(phase-3): route the view action to the
//     Map tab; this Google deep-link is the stopgap until that surface exists.
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

/** "View this place" deep-link (open in Maps), or null when it has no coordinates.
 *  INTERIM (TODO phase-3): becomes an in-app Map-tab focus once that surface exists. */
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

/** "View on map" link for an event's resolved place, or null when it has no place
 *  or a coordless one. The peer of {@link eventDirectionsUrl}: navigate vs. view. */
export function eventPlaceUrl(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): string | null {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  return mapsPlaceUrl(places.find((p) => p.id === eventPlaceId(event, booking)));
}

/** "View on map" link for a booking's resolved place, or null when it has no place
 *  or a coordless one. The peer of {@link bookingDirectionsUrl}. */
export function bookingPlaceUrl(booking: Booking, places: Place[]): string | null {
  return mapsPlaceUrl(places.find((p) => p.id === bookingPlaceId(booking)));
}
