// Place resolution for the timeline (ADR-0048 authority rule): a linked event's
// place lives on its booking (single-place → placeId; transport → origin); an
// unlinked event owns its own placeId. Consumers resolve a display name through here
// rather than reading a (now-removed) free-text location off the event.
import {
  carriesRoute,
  titlesFromRoute,
  eventDurationUnit,
  isAmbient,
  type Booking,
  type MaybeItem,
  type Place,
  type PlacePrediction,
  type TripEvent,
  haversineMeters,
  type LatLng,
} from '@waypoint/shared';

// Imported for this file's own use AND re-exported below: a bare `export … from` would not
// bring them into scope here, and several derivations in this file read them.
import {
  bookingEndZones,
  bookingZoneOverrides,
  currentZone,
  eventDisplayZones,
  placeTimezone,
  segmentZoneAt,
  tripZoneCrossings,
  type ZoneCrossing,
} from '@waypoint/shared';

export {
  bookingEndZones,
  bookingZoneOverrides,
  currentZone,
  eventDisplayZones,
  placeTimezone,
  segmentZoneAt,
  tripZoneCrossings,
  type ZoneCrossing,
};
import { ltrIsolate } from './bidi';
import type { PlaceLabels } from './place-label';
import {
  deriveNow,
  eventPhase,
  isCalendarDay,
  todayInTz,
  zoneOffsetMinutes,
  zonedIso,
} from './time';
import { DAY_NOON, LIVE_ZONE_WINDOW_MS } from '../constants';
import { formatDuration } from './duration';
import { formatDistance } from './distance';
import { carriedBookingMeters, coordOf } from './day-travel';
import { DAY_ANCHOR_AGREE_M } from '../constants';

/** Whether a booking carries a route rather than a single place — one call into the
 *  shared profile (ADR-0154 §2), which is where that question now lives for both
 *  packages. Kept as a local alias only because it reads better over a `Booking`
 *  than over its `.type` at the dozen call sites below. */
const isTransport = (booking: Booking): boolean => carriesRoute(booking.type);

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

/** **Where a booking is headed**, which for transport is the other end of the same
 *  authority rule (`bookingPlaceId` answers the origin). Only meaningful while you are
 *  inside the span: a flight in the air is *at* nowhere and *going* somewhere, so the
 *  origin airport — the one thing `bookingPlaceId` can answer — is the airport you have
 *  already left (session 215). Anything not transport has one place and it is the answer
 *  to both questions. */
export function bookingDestinationId(booking: Booking): string | undefined {
  return isTransport(booking) ? booking.toPlaceId : booking.placeId;
}

/** The effective placeId to show for an event, following the authority rule.
 *
 *  `heading` flips a transport event to its destination — used by the lifted hero for the
 *  span you are inside, where the useful pin is where you are going. */
export function eventPlaceId(
  event: TripEvent,
  booking?: Booking,
  heading?: boolean,
): string | undefined {
  if (event.bookingId && booking) {
    return heading ? bookingDestinationId(booking) : bookingPlaceId(booking);
  }
  return event.placeId;
}

/** Human name for a place id, or undefined when there's no place / no match. */
export function placeName(places: Place[], placeId?: string): string | undefined {
  if (!placeId) return undefined;
  return places.find((p) => p.id === placeId)?.name;
}

/** **What a linked Place derives as a title** (field reports #30/#31) — the ONE answer both
 *  authoring forms read, so the value shown while typing and the value `BookingSheet`'s
 *  `finalTitle` saves can never disagree. `undefined` when nothing is linked or the place is
 *  nameless, so the `??`/`||` chain behind it keeps running.
 *
 *  Transport is deliberately not in here: a journey is named by its route (ADR-0059 §3), and
 *  a hire by its company (ADR-0163 §3). Both are titles a Place cannot supply. */
export function placeDerivedTitle(places: Place[], placeId?: string): string | undefined {
  return placeName(places, placeId)?.trim() || undefined;
}

/** **The title in force, by the owner's precedence** (field report #37): what a person
 *  explicitly typed, else what the linked Place derives, else whatever last resort the
 *  caller has (`BookingSheet`'s type label, ADR-0163 §3; an Event has none, so its save
 *  still refuses). Blank is blank — whitespace-only text was never a title.
 *
 *  **One function because the three answers must not be able to disagree.** The visible
 *  value, the placeholder and the saved value are three `||` chains at three call sites
 *  otherwise, and #37 is what that costs: `EventForm` resolved the same question a fourth
 *  way and refused a save a person could not fix. */
export function effectiveTitle(...candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** **The title a form re-opens with after a place errand** (field report #30). The errand
 *  channel assigns the chosen place into the opaque draft (`assignErrandPlace`) and cannot
 *  know that anything derives from it, so the re-mounting form asks here: an untouched title
 *  follows the place that came back, a title a person typed is theirs and survives the trip.
 *
 *  **One caller left, and that is the whole story of #37.** `EventForm` no longer holds a
 *  derived name in its field at all — a blank box means the Place answers, so there is
 *  nothing for an errand to catch up on. `BookingSheet` still carries the derived name as
 *  its field's value, so it still needs this; the day the two forms author alike, this goes
 *  with the flag it serves. */
export function titleAfterErrand(
  places: Place[],
  placeId: string | undefined,
  draftTitle: string,
  touched: boolean,
): string {
  return touched ? draftTitle : (placeDerivedTitle(places, placeId) ?? draftTitle);
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
  /** **The display label for each endpoint, when the deriver had one** (ADR-0166 §18) — a
   *  nickname, or the city an airport serves. Beside the names rather than replacing them, because the two
   *  answer different questions and one surface needs both: `routeDisplay` puts the label
   *  inline and the destination's FULL name in the meta line under it.
   *
   *  Absent is the normal case (most places are not airports and carry no nickname) and means
   *  "shorten the name", which is what `shortRoute` then does. */
  fromLabel?: string;
  toLabel?: string;
}

/** The origin→destination route of a transport-linked event (ADR-0048/0059), or
 *  null when the event isn't a transport booking or has no endpoints — the caller
 *  then falls back to the event/booking title. A transport booking is the single
 *  authority for from/to; an unlinked event never carries a route. This is the
 *  shared derivation behind every route presentation (Index row, booking detail,
 *  and the board hero) so a flight reads the same wherever it appears — it shows
 *  where it goes, not a name (ADR-0059 §3). */
export function eventRoute(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
  labels?: PlaceLabels,
): Route | null {
  if (!event.bookingId) return null;
  const booking = bookings.find((b) => b.id === event.bookingId);
  // **Only a type NAMED by its route draws one** (ADR-0163 §3, extended here after the
  // owner reported the miss). Asking the category — or `carriesRoute` — was right while
  // every transport type was a journey: a car hire carries two counters and is called
  // Hertz, so re-deriving a route for display printed `נריטה ← נריטה` on the day row and
  // `נריטה ← -` whenever the return place was not set. §3 changed the STORED title and
  // these display derivations kept rebuilding one from the place FKs, which is the same
  // bug one layer down. A hire's pick-up and return live in its detail facts.
  if (!booking || !titlesFromRoute(booking.type)) return null;
  return bookingRoute(booking, places, labels);
}

/** A transport booking's route — the same resolution `eventRoute` does, for the surfaces that
 *  hold the booking rather than the event (`BookingTitle`). One function, so the two cannot
 *  disagree about which endpoint got a derived label. */
export function bookingRoute(
  booking: Pick<Booking, 'fromPlaceId' | 'toPlaceId'>,
  places: Place[],
  labels?: PlaceLabels,
): Route | null {
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  if (!from && !to) return null;
  return {
    from,
    to,
    fromLabel: booking.fromPlaceId ? labels?.[booking.fromPlaceId] : undefined,
    toLabel: booking.toPlaceId ? labels?.[booking.toPlaceId] : undefined,
  };
}

// ── Per-event display zones (ADR-0107 multi-zone time model) ────────────────
// "Which timezone is this event shown in" resolves here, beside the linked/
// unlinked place authority it rides on (ADR-0107 consequence: this is where the
// zone naturally lives). Pure + clock-free — callers own `now`. The now/next
// engine and stored instants are untouched; this is display/authoring only.

// ── THE ZONE MODEL MOVED TO `@waypoint/shared` (ADR-0197 §5, phase 2) ──────────────────
//
// `ZoneCrossing`, `placeTimezone`, `bookingZoneOverrides`, `bookingEndZones`,
// `tripZoneCrossings`, `segmentZoneAt` and `currentZone` are now `shared/src/zones.ts`,
// because the notification sweep asks the same question from the server and the answer has
// to come from the same code — a send time and a printed time that disagree is the 03:00
// notification.
//
// **And `eventDisplayZones` followed them on 2026-09-01, which the first sweep should have
// done.** Moving the primitives and leaving the composer here meant the server had the parts
// and not the answer, so it used `currentZone` — a different question — and the shared page
// printed every departure in the destination's zone. A promotion that stops at the primitives
// leaves the door it was closing open.
//
// **Re-exported here, and this file is not a second definition.** Every consumer keeps
// importing from `lib/places`, which is where they have always looked; `zones.ts` is the
// one implementation. When you need to change the behaviour, change it there.

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

/**
 * **WHERE THIS DAY IS LIVED, IN COORDINATES** — the sibling of
 * {@link dayAmbientZone}, and the one derivation the daylight feature adds.
 *
 * A sun time is a function of latitude and longitude, so "when does the sun
 * catch us" needs the same question `dayAmbientZone` already answers, asked in
 * degrees instead of zone ids. It therefore reads the SAME `ZoneEvidence`
 * bundle, on the same date, and inherits the rule that makes that bundle
 * evidence rather than a circular vote:
 *
 *   1. **The day's own placed events, when they agree.** `eventsOnDate`
 *      includes a multi-day stay on its middle nights, so the hotel votes on
 *      every day it covers — which is why an arrival day resolves to the bed
 *      without needing a separate rule for it: the flight abstains (below) and
 *      the destination hotel is the only voter left.
 *   2. **The trip's destination**, which ADR-0113 already stores from the
 *      creation pick.
 *
 * **A zone-crossing booking does not vote**, exactly as in `eventKnownZone`, and
 * for the identical reason: it is the thing that moves you between two places,
 * so it cannot testify about where the day sits. Here that means a booking whose
 * two ends are different places abstains entirely.
 *
 * `undefined` is a first-class answer — a trip with no destination coordinates
 * and no placed events gets no daylight at all rather than a wrong sunrise,
 * which is the same "a miss degrades, never a wrong answer" contract
 * `crossRate` and `COUNTRY_CURRENCY` carry.
 *
 * **The zone and the coordinate must be resolved from one evidence on one
 * date.** They are two derivations feeding one printed time — the instant comes
 * from here, the wall clock from `dayZoneContext` — so resolving them from
 * different days is how an app prints a sunrise at 21:40 and nobody notices.
 */
export function dayAnchorCoord(
  date: string,
  evidence: ZoneEvidence,
  destination?: LatLng,
): LatLng | undefined {
  const { events, bookings, places } = evidence;
  const voters = eventsOnDate(events, date)
    .map((event) => eventKnownCoord(event, bookings, places))
    .filter((at): at is LatLng => at != null);

  if (voters.length > 0) {
    // Same cell = same weather model grid square and the same sun to well under
    // a minute, so "agree" is a distance rather than an equality — two stops in
    // one city must not read as a mixed day.
    const first = voters[0];
    if (voters.every((at) => haversineMeters(first, at) <= DAY_ANCHOR_AGREE_M)) return first;
  }

  return destination;
}

/** An event's coordinate **only when something actually says so** — the mirror
 *  of `eventKnownZone`, including its abstention: a booking whose two ends are
 *  different places is transport between them and testifies about neither. */
function eventKnownCoord(
  event: TripEvent,
  bookings: Booking[],
  places: Place[],
): LatLng | undefined {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  if (booking) {
    const from = coordOf(places, booking.fromPlaceId ?? undefined);
    const to = coordOf(places, booking.toPlaceId ?? undefined);
    if (from && to && haversineMeters(from, to) > DAY_ANCHOR_AGREE_M) return undefined;
    return coordOf(places, bookingPlaceId(booking)) ?? from ?? to;
  }
  return coordOf(places, event.placeId ?? undefined);
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

/**
 * **Re-exported from `@waypoint/shared`, where it now lives** (2026-09-01).
 *
 * It was defined here, and the server answered the same question with `currentZone` alone —
 * so the shared page and the PDF printed every flight departure in the destination's zone and
 * an Iceland hotel's check-in in Vienna. ADR-0197 §5's sweep had already moved the zone
 * primitives into `shared/zones.ts` for exactly this reason and left this composer behind;
 * `zones.ts` now carries both, and its docblock is the one to read.
 *
 * Kept as a named re-export rather than asking ~10 call sites to change their import: this
 * module is the frontend's zone door, and the point of the move is that there is one
 * implementation, not that everyone learns a new path.
 */
/* Re-exported in the block at the top of this file, beside the primitives it composes —
   this module is the frontend's zone door, and the point of the move is that there is one
   implementation, not that ~10 call sites learn a new import path. */

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
 *  on a post-crossing day starts in that day's segment rather than the primary.
 *
 *  **A day it cannot read is no evidence, not a crash.** Forms call this on every
 *  render with whatever their date field holds, so it is the one place a date that
 *  never should have existed still arrives — and `zonedIso` on one throws `RangeError`
 *  in that render (field report #38). Without a day there is no instant to place
 *  against a crossing, so the trip's primary zone is the honest answer, and the form
 *  stays on screen to be corrected. `DateField` makes this unreachable from the
 *  platform's Clear; the guard is what keeps the next caller from re-finding it. */
export function authoringZone(
  base: Partial<TripEvent>,
  at: { date: string; time?: string },
  evidence: ZoneEvidence,
): string {
  if (!isCalendarDay(at.date)) return evidence.primaryZone;
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

/** **The two zones a JOURNEY between two rows reads in** (ADR-0107 §4, ADR-0159's
 *  _"a leg reads in its own two zones"_, ADR-0206 §AQ).
 *
 *  A departure is a moment on the wrist of whoever is leaving, so it reads where they are
 *  standing — the ORIGIN row's own end zone. An arrival is read where they get to, which is the
 *  destination's start zone. Identical on a single-zone day, which is every day of most trips;
 *  they part on the one day that crosses a zone, and there each clock then agrees with the card
 *  it is about rather than with the trip's primary.
 *
 *  **The origin's end, and the two ends are not interchangeable** — the same inversion
 *  `endpointPlaceId` makes one file over: you leave a flight where it LANDS, so the origin's zone
 *  is its `end`. `fromEdge: 'start'` is the exception that proves it (`DayLeg.fromEdge`): a leg off
 *  a hire's PICKUP edge leaves from the counter it was collected at, which is the span's start.
 *
 *  Beside `eventEdgeZone` because it is the same question asked of two rows at once, and shared
 *  rather than answered at each day surface because ADR-0159 §1 forbids them differing about a
 *  fact — and a clock is one. */
export function legDisplayZones(
  leg: { from: TripEvent; to: TripEvent; fromEdge?: 'start' | 'end' },
  ctx: ZoneContext,
): { depart: string; arrive: string } {
  const from = eventDisplayZones(leg.from, ctx);
  return {
    depart: leg.fromEdge === 'start' ? from.start : from.end,
    arrive: eventDisplayZones(leg.to, ctx).start,
  };
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
  const transport = booking ? isTransport(booking) : false;
  if (!transport && zones.deltaMinutes == null) return undefined;
  const minutes = (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000;
  return formatDuration(minutes, eventDurationUnit(event)) ?? undefined;
}

/**
 * **The distance label for a carried row** (ADR-0212), or `undefined` where there is none —
 * `eventDurationLabel`'s sibling, and here for the same reason: both day surfaces need one
 * answer, and ADR-0159 §1 lets them differ in posture but never about a fact.
 *
 * The rule about which bookings have a distance is `carriedLegMeters`', the coordinates are
 * `carriedBookingMeters`', and the wording is `formatDistance`'s. This only joins them up.
 */
export function eventDistanceLabel(
  booking: Booking | undefined,
  places: readonly Place[],
): string | undefined {
  const metres = booking ? carriedBookingMeters(booking, places) : null;
  return metres === null ? undefined : formatDistance(metres);
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

/** **`עוד בגוגל` — what Google knows about a place we already hold** (ADR-0166 §13,
 *  ADR-0167 §6). The answer to enrichment's coverage hole: open sources described 0 of 7
 *  Tokyo restaurants, and this hands over everything Google has for them — hours, photos,
 *  reviews, phone, live busy-ness — for free, with no API call and no key.
 *
 *  **Not the retired `mapsPlaceUrl` coming back.** That one meant "view the location", which
 *  is our map's job now (see the note above, ADR-0121 §8). This answers a different question,
 *  which is why §6 insists the label is `עוד בגוגל` and never `מפה` or `צפה` — and why the
 *  row's one Google exit is still `נווט`.
 *
 *  `query_place_id` is what opens Google's own panel for the place rather than a search, so a
 *  place we picked from Google lands exactly on itself. Without one — a pin dropped by hand —
 *  the address or the point disambiguates a name that could be anywhere. Never null: a name
 *  search is a worse answer than a place panel and a much better one than no way through, and
 *  §6 wants this present even when we know nothing at all. */
export function mapsKnowledgeUrl(place: Place): string {
  if (place.googlePlaceId) return mapsSearchUrl(place.name, place.googlePlaceId);
  const where = place.address ?? (hasCoords(place) ? `${place.lat},${place.lng}` : undefined);
  return mapsSearchUrl([place.name, where].filter(Boolean).join(' '));
}

/** "View this candidate" for a Google search result, which carries a name and a
 *  `googlePlaceId` but no coordinates until it is picked (ADR-0115 §2). */
export function mapsPredictionUrl(prediction: PlacePrediction): string {
  const label = [prediction.primaryText, prediction.secondaryText].filter(Boolean).join(', ');
  return mapsSearchUrl(label, prediction.googlePlaceId);
}

/** **A point, for a human to read** — the confirmation line on a place that has coordinates and
 *  no address, which is exactly what a pin dropped on the canvas is: a reverse geocode is paid
 *  and refused (ADR-0147 §7), so the point itself is what says the pin fell where the finger
 *  was.
 *
 *  The WHOLE pair is one LTR island (ADR-0118). Digits and the comma are all bidi-neutral, so
 *  in the RTL flow there is no strong character to anchor them and the two numeric runs can
 *  swap sides — the same class of defect that read `ק״מ 9`. It is not a `measure`: there is no
 *  Hebrew unit here for the number to read in front of.
 *
 *  Four decimals ≈ 11 m, which is finer than a long press can aim and short enough to sit on
 *  one line of a card. */
export const COORD_LABEL_DECIMALS = 4;

export function coordLabel(at: { lat: number; lng: number }): string {
  return ltrIsolate(
    `${at.lat.toFixed(COORD_LABEL_DECIMALS)}, ${at.lng.toFixed(COORD_LABEL_DECIMALS)}`,
  );
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
  /** **Which end of a route this surface is about** (2026-08-06). A transport event has two
   *  places and `eventPlaceId` answers with the ORIGIN, so a day card labelled `נחיתה` sent you
   *  to the airport you took off from — owner: _"the map centers around the departure and not
   *  the landing, which is wrong in this case. It should be aware of the relevant node."_
   *  Omitted, the origin is still the answer: that is right for a surface about the booking as
   *  a whole, and only a per-EDGE row knows better. */
  edge?: 'start' | 'end',
): Place | undefined {
  const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
  const place = places.find((p) => p.id === eventPlaceId(event, booking, edge === 'end'));
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
  /** See {@link eventMapPlace} — a per-edge row passes its own end so a `נחיתה` row goes to
   *  where you landed. Every other caller is about the booking, and omits it. */
  edge?: 'start' | 'end',
): (() => void) | undefined {
  const place = eventMapPlace(event, bookings, places, edge);
  return place && show ? () => show(place.id) : undefined;
}

/**
 * **The JOURNEY peer of {@link eventShowOnMap}** (owner, 2026-08-27) — the way from a leg in the
 * day list to that leg on the canvas.
 *
 * It shows the leg's **destination** stop, and that is ADR-0206 §AB2/§AC2 rather than a choice
 * made here: the map marks the leg ARRIVING at the stop you asked about and dims the rest, so
 * asking for the arrival is asking for this leg. Handing it the origin would light the leg
 * before this one.
 *
 * Takes the pair `useDayTravelReads.pairFor` already resolved rather than two events, because
 * `endpointPlaceId`'s transport inversion (you leave a flight where it LANDS) is exactly the rule
 * that goes wrong when it is answered twice — the mode override is keyed on the same pair for the
 * same reason.
 *
 * `undefined` on either of the two ordinary absences, collapsed here like its three siblings so
 * no call site has to remember them: a leg whose ends do not both resolve to a place, and a host
 * outside the trip shell where there is no Map tab to route to ("absent, not broken", ADR-0121 §8).
 */
export function legShowOnMap(
  pair: { fromPlaceId: string; toPlaceId: string } | undefined,
  show: ShowPlaceOnMap,
): (() => void) | undefined {
  return pair && show ? () => show(pair.toPlaceId) : undefined;
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
 * **The shelf-idea peer** (ADR-0121 §8's 2026-08-04 amendment), and the entity that most
 * needed one: every place added from the map outside an errand becomes an idea, so the shelf
 * is where map research accumulates — and it was the one host with no way back to the pin.
 *
 * Simpler than the two above because an idea's place is not derived from anything: it holds
 * the `placeId` itself. What it shares with them is the part worth sharing — the coords check
 * and the null-hook check collapsing into one `undefined`, so a call site never has to
 * remember either.
 */
export function ideaShowOnMap(
  item: { placeId?: string },
  places: Place[],
  show: ShowPlaceOnMap,
): (() => void) | undefined {
  const place = places.find((p) => p.id === item.placeId);
  return hasCoords(place) && show ? () => show(place.id) : undefined;
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
