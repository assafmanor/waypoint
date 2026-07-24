// Place resolution for the timeline (ADR-0048 authority rule): a linked event's
// place lives on its booking (single-place → placeId; transport → origin); an
// unlinked event owns its own placeId. Consumers resolve a display name through here
// rather than reading a (now-removed) free-text location off the event.
import {
  categoryForBookingType,
  eventDurationUnit,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { todayInTz, zoneOffsetMinutes, zonedIso } from './time';
import { DAY_NOON, LIVE_ZONE_WINDOW_MS } from '../constants';
import { formatDuration } from './duration';

/** Whether a booking is transport (flight/train/…): its category is `transport`. */
export function isTransportBooking(booking: Booking): boolean {
  return categoryForBookingType(booking.type) === 'transport';
}
const isTransport = isTransportBooking;

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

/** IANA zone cached on a place row (undefined for a coordless Place-lite). The
 *  public name for form authoring, where a time field is entered in its
 *  endpoint's own zone (ADR-0107 §2): a departure in `fromPlace`, an arrival in
 *  `toPlace`, a single-place booking/event in its place. */
export function placeTimezone(places: Place[], placeId?: string): string | undefined {
  if (!placeId) return undefined;
  return places.find((p) => p.id === placeId)?.timezone;
}

/** A booking's per-end zone overrides, resolved by the same authority rule as its
 *  place fields (ADR-0107 §6-7 session-99 amendment): transport pins its origin's
 *  zone on `start` and its destination's on `end`; a single-place booking uses only
 *  `start`, which then drives both ends. Undefined = nothing pinned. */
export function bookingZoneOverrides(booking: Booking | undefined): {
  start?: string;
  end?: string;
} {
  if (!booking) return {};
  const start = booking.startDisplayTimezone;
  const end = isTransport(booking) ? booking.endDisplayTimezone : start;
  return { start, end };
}

/** What zone each end of a booking is in **as far as we know**: the user's pinned
 *  override, else the endpoint place's cached zone, else undefined (a coordless
 *  Place-lite with nothing pinned — the caller falls back to the segment/primary).
 *  The one answer both the crossing detection and the event resolver read, so a
 *  pinned zone partitions the itinerary exactly like a real place does. */
export function bookingEndZones(booking: Booking, places: Place[]): { from?: string; to?: string } {
  const pinned = bookingZoneOverrides(booking);
  return isTransport(booking)
    ? {
        from: pinned.start ?? placeTimezone(places, booking.fromPlaceId),
        to: pinned.end ?? placeTimezone(places, booking.toPlaceId),
      }
    : (() => {
        const zone = pinned.start ?? placeTimezone(places, booking.placeId);
        return { from: zone, to: zone };
      })();
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
    const { from: fromZone, to: toZone } = bookingEndZones(booking, places);
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

/** The zone the live "now" sits in (ADR-0107 §4): the itinerary segment holding
 *  `nowMs`, falling back to the trip primary zone when no crossing anchors the
 *  timeline. Trip mode reads the clock, the now-line and "today" through this, so
 *  they track which side of a crossing you're on — via the itinerary, never GPS.
 *  Plan mode deliberately does NOT use it: planning is framed in the trip primary
 *  zone (§4). */
export function currentZone(nowMs: number, crossings: ZoneCrossing[], primaryZone: string): string {
  return segmentZoneAt(nowMs, crossings) ?? primaryZone;
}

/** Everything the zone questions resolve against. Bundled because "which zone is
 *  this day in" now reads the day's own events, not only the transport crossings
 *  (ADR-0107 session-100 amendment) — five arguments at four call sites otherwise. */
export interface ZoneEvidence {
  events: TripEvent[];
  bookings: Booking[];
  places: Place[];
  crossings: ZoneCrossing[];
  primaryZone: string;
}

/** An event's zone **only when something actually says so** — a manual pin or a
 *  place with coordinates — and `undefined` when it would fall back to the
 *  itinerary segment or the trip primary. This is what makes the day-consensus
 *  below evidence rather than a circular vote: a placeless event's zone *is* the
 *  segment zone, so letting it vote would only ever confirm the segment.
 *  Zone-crossing transport is excluded too: it is the thing that moves you between
 *  zones, so it can't testify about where a day sits. */
function eventKnownZone(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): string | undefined {
  if (event.displayTimezone) return event.displayTimezone;
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  if (booking) {
    const { from, to } = bookingEndZones(booking, places);
    if (from && to && from !== to) return undefined; // a crossing doesn't vote
    return from ?? to;
  }
  return placeTimezone(places, event.placeId);
}

/** Events that sit on `date` — including a multi-day stay on its middle nights,
 *  which is strong evidence about where you are (ADR-0054's ambient span). */
function eventsOnDate(events: TripEvent[], date: string): TripEvent[] {
  return events.filter(
    (e) => e.date === date || (e.endDate != null && e.date <= date && date <= e.endDate),
  );
}

/** The **day's** ambient zone: the zone that day is lived in. This is what a day
 *  surface measures an event's shift against (a pill shows only when an event
 *  differs from its day), and what decides whether a day is over for editing
 *  (ADR-0029 amendment) — as opposed to `currentZone`, the segment primitive.
 *
 *  Resolution (ADR-0107 session-100 amendment):
 *    1. **The day's own events**, when the ones with a *known* zone agree on a UTC
 *       offset — a day whose bookings are all in Cyprus is a Cyprus day, whatever
 *       the last flight was. Sessions 89-90 keyed this to the crossing-derived
 *       segment alone, which framed every day after an outbound flight in the
 *       destination's zone forever: two same-offset events then each drew a shift
 *       pill against a zone neither of them was in.
 *    2. The **itinerary segment** at the day's noon — the honest answer for a real
 *       travel day, whose events genuinely span two zones (so step 1 abstains).
 *    3. The **trip primary** zone.
 *
 *  Noon is sampled in `primaryZone`: only which calendar day it lands in matters,
 *  and every zone agrees about noon-ish. */
export function dayAmbientZone(date: string, evidence: ZoneEvidence): string {
  const { events, bookings, places, crossings, primaryZone } = evidence;
  const noonMs = Date.parse(zonedIso(date, DAY_NOON, primaryZone));
  const noon = new Date(noonMs);

  const known = eventsOnDate(events, date)
    .map((e) => eventKnownZone(e, bookings, places))
    .filter((zone): zone is string => zone != null);
  if (known.length > 0) {
    const offset = zoneOffsetMinutes(noon, known[0]);
    // Offsets, not zone ids: Nicosia and Jerusalem are different zones that agree
    // about what time it is, and a day split between them is not a mixed day.
    if (known.every((zone) => zoneOffsetMinutes(noon, zone) === offset)) return known[0];
  }

  return segmentZoneAt(noonMs, crossings) ?? primaryZone;
}

/** The zone the live "now" is in, for Trip mode's clock / now-line / "today"
 *  (ADR-0107 §4 + the session-100 amendment): **where the plan says you are right
 *  now**, evidenced by the events around this moment rather than by the last
 *  crossing alone.
 *
 *    1. An event **in progress** with a known zone — you are there. A crossing in
 *       progress reads its destination (§8: mid-flight belongs to where you're
 *       heading).
 *    2. The **nearest** known-zone event within `LIVE_ZONE_WINDOW_MS` on either
 *       side. A booking half an hour ago or an hour ahead places you; one five days
 *       out says nothing about now, which is what the window is for.
 *    3. Otherwise the ambient zone of the day the segment puts you in — which is
 *       itself the day's own consensus, else the segment, else the trip primary.
 *
 *  Why not the segment alone (the old rule): after a single outbound flight every
 *  later instant reads the destination's clock forever, so a traveler whose plan has
 *  since moved on saw a clock hours off from every time printed beside it. Still
 *  driven by the itinerary, never GPS (§4). Plan mode deliberately does not use it. */
export function liveZone(nowMs: number, evidence: ZoneEvidence): string {
  const { events, bookings, places, crossings, primaryZone } = evidence;
  const timed = events.filter((e) => e.startsAt);

  const inProgress = timed.find((e) => {
    const start = Date.parse(e.startsAt!);
    const end = e.endsAt ? Date.parse(e.endsAt) : start;
    return start <= nowMs && nowMs < end;
  });
  if (inProgress) {
    const booking = inProgress.bookingId
      ? bookings.find((b) => b.id === inProgress.bookingId)
      : undefined;
    const crossing = booking ? bookingEndZones(booking, places) : undefined;
    // Mid-flight reads the destination; anything else its single known zone.
    const zone =
      crossing && crossing.from !== crossing.to
        ? crossing.to
        : eventKnownZone(inProgress, bookings, places);
    if (zone) return zone;
  }

  let nearest: { zone: string; distance: number } | undefined;
  for (const e of timed) {
    const zone = eventKnownZone(e, bookings, places);
    if (!zone) continue;
    const start = Date.parse(e.startsAt!);
    const end = e.endsAt ? Date.parse(e.endsAt) : start;
    const distance = nowMs < start ? start - nowMs : nowMs > end ? nowMs - end : 0;
    if (distance > LIVE_ZONE_WINDOW_MS) continue;
    if (!nearest || distance < nearest.distance) nearest = { zone, distance };
  }
  if (nearest) return nearest.zone;

  const segment = currentZone(nowMs, crossings, primaryZone);
  return dayAmbientZone(todayInTz(segment, new Date(nowMs)), evidence);
}

/** The resolved display zones for an event's start and end (they differ only for
 *  zone-crossing transport). Priority (ADR-0107 §3/§6, ADR-0110 §94-99):
 *    1. The event's `displayTimezone` manual override — both ends. (The chip on a
 *       standalone event; a booking-linked event is pinned per-end instead, below.)
 *    2. The **booking's** per-end override — the chip in the booking form, which is
 *       what a zone-crossing pair needs: one override per end, not one for both.
 *    3. Attached place — transport renders start in `fromPlace`, end in `toPlace`;
 *       any other place drives both ends.
 *    4. Placeless (or a coordless place) — the itinerary segment's zone.
 *    5. Nothing anchors it — the trip primary zone.
 *
 *  Steps 2-3 are per-end, so a flight can take its origin from a pinned zone and
 *  its destination from a real place, or vice versa. */
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
    const known = bookingEndZones(booking, places);
    return {
      start: known.from ?? zoneForInstant(event.startsAt),
      end: known.to ?? zoneForInstant(event.endsAt ?? event.startsAt),
    };
  }

  const single = booking
    ? bookingEndZones(booking, places).from
    : placeTimezone(places, eventPlaceId(event, booking));
  if (single) return { start: single, end: single };

  const zone = zoneForInstant(event.startsAt);
  return { start: zone, end: zone };
}

/** Context an event's display zones resolve against — the trip's crossings, the
 *  fallback trip-primary zone, and the day's **ambient** zone (the segment zone
 *  spanning the day being viewed) that the non-trivial-suppression rule
 *  compares against. */
export interface ZoneContext {
  bookings: Booking[];
  places: Place[];
  crossings: ZoneCrossing[];
  primaryZone: string;
  ambientZone: string;
}

/** An event's resolved display zones plus the **time-zone shift** to surface, in
 *  signed minutes (ADR-0107 §6 / ADR-0110 amendment). `deltaMinutes` is the
 *  interesting clock jump — for a zone-crossing event it's the destination clock
 *  minus the origin clock; for a single-zone event it's that zone minus the
 *  **day's ambient** zone. The **shift drives visibility**: `undefined` (a zero
 *  jump — a single-zone trip, or two differently-named zones that share an
 *  offset) shows nothing. `startZone`/`endZone` still say which zone renders each
 *  end's clock (they differ only for a crossing). */
export interface EventZones {
  startZone: string;
  endZone: string;
  deltaMinutes?: number;
}

/** Range display for a timeline event (EventCard): the two ends' zones + the
 *  shift pill to show (crossing → destination vs origin; single zone → vs the
 *  day's ambient). A zero shift resolves to `undefined` — no pill. */
export function eventZones(event: TripEvent, ctx: ZoneContext): EventZones {
  const { start, end } = eventDisplayZones(event, ctx);
  const startAt = event.startsAt ? new Date(event.startsAt) : undefined;
  const endAt = event.endsAt ? new Date(event.endsAt) : startAt;
  let deltaMinutes = 0;
  if (start !== end && startAt && endAt) {
    deltaMinutes = zoneOffsetMinutes(endAt, end) - zoneOffsetMinutes(startAt, start);
  } else if (start === end && startAt) {
    deltaMinutes = zoneOffsetMinutes(startAt, start) - zoneOffsetMinutes(startAt, ctx.ambientZone);
  }
  return { startZone: start, endZone: end, deltaMinutes: deltaMinutes || undefined };
}

/** Single-edge display for a transition entry (arrival/departure row, ADR-0064):
 *  the edge's zone + its shift vs the day's ambient zone (usually 0 — each edge
 *  files under the day it lands in, whose ambient is that edge's own zone). */
export function eventEdgeZone(
  event: TripEvent,
  edge: 'start' | 'end',
  ctx: ZoneContext,
): { zone: string; deltaMinutes?: number } {
  const { start, end } = eventDisplayZones(event, ctx);
  const zone = edge === 'start' ? start : end;
  const iso = edge === 'start' ? event.startsAt : (event.endsAt ?? event.startsAt);
  const at = iso ? new Date(iso) : undefined;
  const deltaMinutes = at
    ? zoneOffsetMinutes(at, zone) - zoneOffsetMinutes(at, ctx.ambientZone)
    : 0;
  return { zone, deltaMinutes: deltaMinutes || undefined };
}

/** The elapsed-duration label to show on a timeline row, or undefined when it
 *  shouldn't (ADR-0107/0084). A zone shift makes the raw times misread the span
 *  (07:15→11:00 with −3 looks like 3h45 but is 6h45), so show duration whenever
 *  the event is **transport** (always — travelers want the flight length) or
 *  carries a **zone shift**. Duration is instant-based (zone-independent) and
 *  phrased per the event's category unit (`hours` for transport, ADR-0084). */
export function eventDurationLabel(
  event: TripEvent,
  booking: Booking | undefined,
  zones: Pick<EventZones, 'deltaMinutes'>,
): string | undefined {
  if (!event.startsAt || !event.endsAt) return undefined;
  const transport = booking ? isTransportBooking(booking) : false;
  if (!transport && zones.deltaMinutes == null) return undefined;
  const minutes = (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000;
  return formatDuration(minutes, eventDurationUnit(event)) ?? undefined;
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
