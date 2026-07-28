// Place resolution for the timeline (ADR-0048 authority rule): a linked event's
// place lives on its booking (single-place → placeId; transport → origin); an
// unlinked event owns its own placeId. Consumers resolve a display name through here
// rather than reading a (now-removed) free-text location off the event.
import {
  categoryForBookingType,
  eventDurationUnit,
  isAmbient,
  type Booking,
  type MaybeItem,
  type Place,
  type PlacePrediction,
  type TripEvent,
} from '@waypoint/shared';
import { deriveNow, eventPhase, todayInTz, zoneOffsetMinutes, zonedIso } from './time';
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

/** The zone a **form** interprets a typed wall-clock in (ADR-0107 §2) — the same
 *  answer `eventDisplayZones` will give the day view once the draft is saved, so a
 *  time typed as 19:00 renders as 19:00. Any surface that turns a typed time into
 *  an instant resolves its zone here; a surface that builds its own loses that
 *  agreement (the session-102 lesson, now for authoring).
 *
 *  `base` is the draft's zone-bearing shape — an existing event being edited, or
 *  just `{ placeId }` for a new one. A pinned override is the caller's own state
 *  (it wins before this is consulted), so it is deliberately stripped here.
 *
 *  Two passes: a placeless time resolves through its itinerary segment, which needs
 *  an instant — and the instant needs a zone. Two passes reach the fixed point
 *  wherever the two agree, which is everywhere but a time within a few hours of a
 *  crossing. With no time typed yet the day's **noon** stands in, so a fresh draft
 *  on a post-crossing day starts in that day's segment rather than the primary. */
export function authoringZone(
  base: Partial<TripEvent>,
  at: { date: string; time?: string },
  evidence: ZoneEvidence,
): string {
  const wallClock = at.time || DAY_NOON;
  const resolve = (interpretIn: string): string =>
    eventDisplayZones(
      {
        ...base,
        displayTimezone: undefined,
        startsAt: zonedIso(at.date, wallClock, interpretIn),
      } as TripEvent,
      evidence,
    ).start;
  return resolve(resolve(evidence.primaryZone));
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

/** Every zone a day touched, as far as the itinerary knows: the known zones of its
 *  own events — **both ends** of a crossing, since you were in each — plus the day's
 *  ambient, which covers a day with no zone-bearing events at all. */
function dayZones(date: string, evidence: ZoneEvidence): string[] {
  const { events, bookings, places } = evidence;
  const zones = new Set<string>([dayAmbientZone(date, evidence)]);
  for (const e of eventsOnDate(events, date)) {
    if (e.displayTimezone) {
      zones.add(e.displayTimezone);
      continue;
    }
    const booking = e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined;
    if (booking) {
      const { from, to } = bookingEndZones(booking, places);
      if (from) zones.add(from);
      if (to) zones.add(to);
    } else {
      const placed = placeTimezone(places, e.placeId);
      if (placed) zones.add(placed);
    }
  }
  return [...zones];
}

/** Is this day **over**, for the purpose of locking it as a read-only archive
 *  (ADR-0029 + its session-96/103 amendments)?
 *
 *  A day is over only when it is over in **every** zone it touched — the clock that
 *  ends it last, i.e. the smallest UTC offset among the day's zones. "A day ends
 *  when that day's clock says so" (session 96); a travel day has more than one
 *  clock, and the generous reading is the only safe one.
 *
 *  Session 96 keyed this to the day's ambient, which fixed the case where the
 *  ambient is the origin. It does not fix a travel day, whose ambient IS the
 *  eastward destination: fly Tel Aviv → Auckland and at 18:00 of the day you left,
 *  still airborne, Auckland has already rolled over — so the day you are inside
 *  locked itself. That is the exact hazard session 96 set out to prevent. */
export function isDayOver(date: string, evidence: ZoneEvidence, nowMs: number): boolean {
  const at = new Date(nowMs);
  const noon = new Date(Date.parse(zonedIso(date, DAY_NOON, evidence.primaryZone)));
  const lastToEnd = dayZones(date, evidence).reduce((latest, zone) =>
    zoneOffsetMinutes(noon, zone) < zoneOffsetMinutes(noon, latest) ? zone : latest,
  );
  return todayInTz(lastToEnd, at) > date;
}

/** Trip-local **today** — the calendar day the live zone puts you in (ADR-0107 §4
 *  + session 102). One function so every surface asking "what day is it now"
 *  gets the same answer: the day view, the Plan-mode builder, the day-strip anchor
 *  and the default day all read this. **It takes no mode**: what time it is is a
 *  fact about the trip and the clock, so switching to Plan mode to build must not
 *  change "now" — which is exactly what a per-surface `todayInTz(trip.timezone, …)`
 *  did. */
export function liveToday(nowMs: number, evidence: ZoneEvidence): string {
  return todayInTz(liveZone(nowMs, evidence), new Date(nowMs));
}

/** The zone context for a **day** surface (the Trip-mode day view, the Plan-mode
 *  builder, the glance rail): every field derived from the one `ZoneEvidence`, with
 *  the day's own ambient zone. This exists because a hand-assembled context is how
 *  the two day surfaces drifted apart once already — the resolver was shared, the
 *  *inputs* were not, so Plan mode kept measuring shifts against the crossing-derived
 *  segment after the Trip-mode view had moved to the day's own evidence (session
 *  100). **Build a `ZoneContext` through this or `liveZoneContext`, never by hand.** */
export function dayZoneContext(date: string, evidence: ZoneEvidence): ZoneContext {
  const { bookings, places, crossings, primaryZone } = evidence;
  return {
    bookings,
    places,
    crossings,
    primaryZone,
    ambientZone: dayAmbientZone(date, evidence),
  };
}

/** The zone context for a **live** surface (the board hero): the ambient is where
 *  you are standing right now, so a shift reads "this event is somewhere other than
 *  here" rather than "…than this day". Same one-evidence rule as `dayZoneContext`. */
export function liveZoneContext(nowMs: number, evidence: ZoneEvidence): ZoneContext {
  const { bookings, places, crossings, primaryZone } = evidence;
  return {
    bookings,
    places,
    crossings,
    primaryZone,
    ambientZone: liveZone(nowMs, evidence),
  };
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
// **DIRECTIONS stays Google's forever** (ADR-0106 §F — we never rebuild
// turn-by-turn navigation), and with the rendered map shipped it is the ONE Google
// action a row keeps: `נווט`, a real button, so going to Google is always an
// explicit act.
//
// **VIEW went the other way.** Phase 2's `mapsPlaceUrl` deep-linked out only
// "because we have no map surface yet" (ADR-0109's 2026-07-24 amendment); Phase 6
// ended that, so viewing a place is now selecting it on OUR map and the Google
// place view is retired rather than relocated (ADR-0121 §8). Its last user was a
// *prediction*, which has no coordinates and nothing of ours to focus — that is
// `mapsPredictionUrl` below, on the shared search builder. This is where the
// long-standing `TODO(phase-3)` closed.
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

/** The one "show this on Google Maps" URL: a required free-text query, refined by
 *  a `place_id` when we know it. Coordinates make the best query; a search result
 *  has none yet, so it queries by name (ADR-0115 §2 — vetting a candidate before
 *  we spend on it, still no API call, no key, no cost). */
function mapsSearchUrl(query: string, googlePlaceId?: string): string {
  const refine = googlePlaceId ? `&query_place_id=${encodeURIComponent(googlePlaceId)}` : '';
  return `${GOOGLE_MAPS}/search/?api=1&query=${encodeURIComponent(query)}${refine}`;
}

/** The day's stops as one free Google directions link (ADR-0121 §10) — it ships
 *  with the connector that draws the same order, and costs nothing: a universal
 *  Maps URL, no API call and no key. Null under two stops, where there is no route
 *  to hand over. Google's cheap Routes tier caps at 10 intermediate waypoints
 *  (ADR-0121 §1); this is the free deep-link, so no cap applies to it, but the
 *  URL is built origin → waypoints → destination in exactly that order so a paid
 *  Routes follow-up can reuse the same sequence. */
export function mapsDayRouteUrl(stops: readonly { lat: number; lng: number }[]): string | null {
  if (stops.length < 2) return null;
  const at = (stop: { lat: number; lng: number }) => `${stop.lat},${stop.lng}`;
  const origin = encodeURIComponent(at(stops[0]));
  const destination = encodeURIComponent(at(stops[stops.length - 1]));
  const middle = stops.slice(1, -1);
  const waypoints = middle.length
    ? `&waypoints=${encodeURIComponent(middle.map(at).join('|'))}`
    : '';
  return `${GOOGLE_MAPS}/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}`;
}

/** "View this candidate" for a Google search result, which carries a name and a
 *  `googlePlaceId` but no coordinates until it is picked (ADR-0115 §2). */
export function mapsPredictionUrl(prediction: PlacePrediction): string {
  const label = [prediction.primaryText, prediction.secondaryText].filter(Boolean).join(', ');
  return mapsSearchUrl(label, prediction.googlePlaceId);
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

/** The place an event's `מפה` action shows on OUR map, or null when there is
 *  nothing to focus — no place, or a coordless Place-lite with no position. The
 *  peer of {@link eventDirectionsUrl}: view here vs. navigate there. It returns
 *  the PLACE rather than a URL, because the destination is now a tab and a
 *  selection, not a link (ADR-0121 §8) — which is what retired the old
 *  `eventPlaceUrl`/`bookingPlaceUrl` pair along with `mapsPlaceUrl` itself. */
export function eventMapPlace(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): Place | undefined {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const place = places.find((p) => p.id === eventPlaceId(event, booking));
  return hasCoords(place) ? place : undefined;
}

/** The place a booking's `מפה` action shows on our map, or undefined when it has
 *  none (or a coordless one). The peer of {@link bookingDirectionsUrl}. */
export function bookingMapPlace(booking: Booking, places: Place[]): Place | undefined {
  const place = places.find((p) => p.id === bookingPlaceId(booking));
  return hasCoords(place) ? place : undefined;
}

/**
 * The `מפה` handler for an entity, or `undefined` when the surface owes no button.
 *
 * `show` is `useShowPlaceOnMap()`'s return value — `null` outside the trip shell,
 * where there is no Map tab to route to. Both reasons to have no button collapse
 * here, which is the point: a call site is `onShowOnMap={eventShowOnMap(…)}` and
 * never has to remember either the coords check or the null-hook check. Dropping
 * the affordance is the contract on both counts ("absent, not broken", ADR-0121
 * §8) — a leaf must not throw for want of a context it doesn't own.
 *
 * A caller that hosts the action inside an overlay passes a `show` that closes the
 * overlay first (`BookingDetail`), because the tab must not change underneath a
 * sheet still on the back stack (ADR-0090).
 */
export type ShowPlaceOnMap = ((placeId: string) => void) | null;

export function eventShowOnMap(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
  show: ShowPlaceOnMap,
): (() => void) | undefined {
  const place = eventMapPlace(event, bookings, places);
  return place && show ? () => show(place.id) : undefined;
}

/** The booking peer of {@link eventShowOnMap}. */
export function bookingShowOnMap(
  booking: Booking,
  places: Place[],
  show: ShowPlaceOnMap,
): (() => void) | undefined {
  const place = bookingMapPlace(booking, places);
  return place && show ? () => show(place.id) : undefined;
}

/**
 * Where you are RIGHT NOW — the in-progress event's place, or `undefined`.
 *
 * It does not decide what "now" means; it **asks `deriveNow`**, the same resolver
 * Home's board reads, and then resolves that event's place through the same
 * authority rule everything else here uses. So the Map and the board cannot
 * disagree about which event is happening, which is the whole point: the Map filed
 * a 13:00-14:00 lunch under `מה שלפנינו` at 13:54 while the board called it
 * `עכשיו`, because the list had derived its own two-state ahead/behind partition
 * with no middle (ADR-0107 session-102's precedent — a screen deriving its own
 * answer instead of reading the shared one).
 *
 * **An ambient stay is filtered out before the question is asked**, exactly as
 * Home filters it: a stay's span runs to check-out, so it would read "now" for
 * three days straight and drown whatever you are actually doing. The hotel stays
 * the day's backdrop (ADR-0054).
 *
 * Unlike `nextDestination` this needs **no directions URL**: a coordless place can
 * still be where you are standing — it simply has no pin to mark, which is
 * ADR-0121 §8's select-vs-focus distinction stated once more.
 */
export function currentDestination(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
  nowMs: number,
): { event: TripEvent; place: Place } | undefined {
  const { now } = deriveNow(
    events.filter((e) => !isAmbient(e)),
    new Date(nowMs),
  );
  if (!now) return undefined;
  const booking = now.bookingId ? bookings.find((b) => b.id === now.bookingId) : undefined;
  const place = places.find((p) => p.id === eventPlaceId(now, booking));
  return place ? { event: now, place } : undefined;
}

/** Where you have to get to next, and the event that puts you there. */
export interface NextDestination {
  event: TripEvent;
  place: Place;
  /** Directions deep-link — resolved here, so it is never null for a result. */
  url: string;
}

/**
 * The next place you have to get to (ADR-0106 §6 navigate-to-next): among timed
 * upcoming events, the earliest one whose resolved place is **mappable** — has
 * coordinates, so a directions link can be built. The authority rule applies, so
 * transport resolves to its **origin**: the next stop before a flight is the
 * departure airport, not where it lands.
 *
 * Like its Home quick-access sibling `nextCodedBooking`, this may resolve to a
 * later event than the board's immediate next: a placeless soft event is nothing
 * to navigate to, so the derivation looks past it. Returns
 * `undefined` when nothing upcoming has a location — the tile/cue is then absent
 * rather than pointing somewhere it can't (ADR-0045).
 *
 * A checked-in hotel needs no filtering: its stay event is already in progress, so
 * `upcoming` excludes it; before check-in it is a legitimate next destination.
 */
export function nextDestination(
  events: TripEvent[],
  bookings: Booking[],
  places: Place[],
  nowMs: number,
): NextDestination | undefined {
  const at = new Date(nowMs);
  let best: NextDestination | undefined;
  let bestStart = Infinity;
  for (const event of events) {
    if (!event.startsAt) continue;
    if (eventPhase(event, at) !== 'upcoming') continue;
    const start = Date.parse(event.startsAt);
    if (start >= bestStart) continue;
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    const place = places.find((p) => p.id === eventPlaceId(event, booking));
    const url = place && mapsDirectionsUrl(place);
    if (!place || !url) continue;
    best = { event, place, url };
    bestStart = start;
  }
  return best;
}
