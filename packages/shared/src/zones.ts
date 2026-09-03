// ADR-0107's zone model, and the reason it lives here rather than in the frontend
// (ADR-0197 §5, notifications phase 2).
//
// **A notification's send time and a row's printed time must be the same fact.** These
// functions were `frontend/src/lib/places.ts`'s, which was right while only screens asked
// what zone a time means. The sweep that decides when to fire a reminder asks the same
// question from the server, and the answer has to come from the same code — a notification
// firing at 03:00 local is the single bug that gets the feature disabled permanently, and
// two implementations that agree today are how you get there.
//
// Pure and clock-INJECTED throughout: every function takes the instant it is asking about.
// Nothing here reads `Date.now()`, an ambient locale, or the ambient time zone.
//
// **On `Intl`:** `todayInTz` uses it, with an explicit `timeZone`, which makes it
// deterministic in its arguments — see this package's `CLAUDE.md` for the rule that
// distinguishes that from reading the ambient environment (and `schemas.ts`, which has
// validated zone strings this way since before this file existed).
//
// **`dayAmbientZone` and its evidence followed on 2026-09-03 — the second time this door was
// left ajar the same way.** ADR-0197 §5 promoted the primitives and left the per-event composer
// behind, so the server answered a clock question with `currentZone` and the shared page
// printed every departure in the destination's zone (ADR-0213's sixteenth amendment). The
// composer moved; the DAY-level answer did not, so the same page then marked the wrong card
// as "now" and printed its clock in the destination's zone as well. What stays in
// `frontend/src/lib/places.ts` is only what no server asks: `liveZone` (where you are
// standing this second) and `authoringZone` (what a form's typed time means).
import { carriesRoute } from './icons';
import type { Booking, Place, TripEvent } from './entities';
import { DAY_NOON, zoneOffsetMinutes, zonedIso } from './trip-dates';

/** A zone-crossing transport event: the timeline splits into zone segments at its departure
 *  instant. Only transport whose origin and destination zones are both known **and differ**
 *  makes a crossing — a same-zone or coordless hop doesn't reorient anything. */
export interface ZoneCrossing {
  at: number; // departure instant (ms) — the boundary between the two segments
  fromZone: string;
  toZone: string;
}

/** Transport carries a route, so it has two ends that can be in different zones. */
const isTransport = (booking: Booking): boolean => carriesRoute(booking.type);

/** IANA zone cached on a place row (undefined for a coordless Place-lite). The public name
 *  for form authoring, where a time field is entered in its endpoint's own zone
 *  (ADR-0107 §2): a departure in `fromPlace`, an arrival in `toPlace`, a single-place
 *  booking/event in its place. */
export function placeTimezone(places: Place[], placeId?: string): string | undefined {
  if (!placeId) return undefined;
  return places.find((p) => p.id === placeId)?.timezone;
}

/** A booking's per-end zone overrides, resolved by the same authority rule as its place
 *  fields (ADR-0107 §6-7 session-99 amendment): transport pins its origin's zone on `start`
 *  and its destination's on `end`; a single-place booking uses only `start`, which then
 *  drives both ends. Undefined = nothing pinned. */
export function bookingZoneOverrides(booking: Booking | undefined): {
  start?: string;
  end?: string;
} {
  if (!booking) return {};
  const start = booking.startDisplayTimezone;
  const end = isTransport(booking) ? booking.endDisplayTimezone : start;
  return { start, end };
}

/** What zone each end of a booking is in **as far as we know**: the user's pinned override,
 *  else the endpoint place's cached zone, else undefined (a coordless Place-lite with
 *  nothing pinned — the caller falls back to the segment/primary). The one answer both the
 *  crossing detection and the event resolver read, so a pinned zone partitions the itinerary
 *  exactly like a real place does. */
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

/** The trip's zone-crossings in departure order (ADR-0107 §3). Everything before the first
 *  crossing sits in its origin zone (the home zone, known once the outbound flight's
 *  `fromPlace` is entered); each later segment takes the preceding crossing's destination
 *  zone. */
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

/** The itinerary-segment zone at an instant (ADR-0107 §3 step 2), or undefined when no
 *  transport anchors the timeline (caller falls back to the trip primary zone). Before the
 *  first crossing → its origin zone; at/after a crossing's departure → its destination zone
 *  (so a mid-flight instant reads the destination, ADR-0107 §8). */
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

/**
 * The zone an instant sits in (ADR-0107 §4): the itinerary segment holding it, falling back
 * to the trip primary zone when no crossing anchors the timeline. Trip mode reads the clock,
 * the now-line and "today" through this, so they track which side of a crossing you're on —
 * via the itinerary, never GPS.
 *
 * **Plan mode deliberately does not use it for the clock or the day grid**: planning is
 * framed in the trip primary zone (§4). That is NOT true of a task deadline, which ADR-0194
 * routes through `dueZone` on every surface — and before the first crossing this answers
 * `crossings[0].fromZone`, the departure origin, i.e. home. So a deadline written weeks
 * before the trip prints and fires in the same zone, with no special case (ADR-0197 §5).
 */
export function currentZone(nowMs: number, crossings: ZoneCrossing[], primaryZone: string): string {
  return segmentZoneAt(nowMs, crossings) ?? primaryZone;
}

/**
 * **THE ZONE AN EVENT'S CLOCK MEANS, PER END** — the composer over everything above, and the
 * one this file was missing.
 *
 * ADR-0197 §5's sweep moved the zone *primitives* here (`placeTimezone`, `bookingEndZones`,
 * `tripZoneCrossings`, `segmentZoneAt`, `currentZone`) so a notification and a row could not
 * disagree, and left the function that composes them in `frontend/src/lib/places.ts`. The
 * server then answered the same question with `currentZone` alone — which is a different
 * question — and ADR-0213's shared page duly printed every flight departure in the
 * DESTINATION's zone and an Iceland hotel's check-in in Vienna (owner, 2026-09-01:
 * _"The timezone derivation is simply wrong"_). Moving the primitives without the composer is
 * what left that gap open, so the composer lives here now.
 *
 * **`currentZone` is not a substitute for this, and the difference is the whole bug.**
 * `currentZone` answers _where are you now_: a crossing is stamped at the flight's DEPARTURE
 * and `segmentZoneAt` returns its destination from that instant on, deliberately, so a
 * mid-flight clock reads where you are going (ADR-0107 §8). Ask it what a departure's own
 * clock says and it answers with the far end; ask it about anything standing in a place the
 * itinerary says you have not reached yet — a hotel whose door opens at 15:00 local, hours
 * before you land — and it answers with the segment instead of the place. It has no place
 * rung at all, by design.
 *
 * Priority (ADR-0107 §3/§6, ADR-0110 §94-99):
 *   1. The event's `displayTimezone` manual override — both ends.
 *   2. The **booking's** per-end override — one per end, which is what a crossing pair needs.
 *   3. Attached place — transport renders start in `fromPlace`, end in `toPlace`; any other
 *      place (a hotel's own `placeId`) drives both ends.
 *   4. Placeless (or a coordless place) — the itinerary segment's zone.
 *   5. Nothing anchors it — the trip primary zone.
 *
 * Steps 2-3 are per-end, so a flight can take its origin from a pinned zone and its
 * destination from a real place, or vice versa.
 */
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

  // `bookingEndZones` already resolves a single-place booking through its own `placeId`, so
  // the event's own place is consulted only when nothing is booked — which is exactly what
  // the frontend's `eventPlaceId(event, undefined)` returned, one indirection ago.
  const single = booking
    ? bookingEndZones(booking, places).from
    : placeTimezone(places, event.placeId);
  if (single) return { start: single, end: single };

  const zone = zoneForInstant(event.startsAt);
  return { start: zone, end: zone };
}

/** Everything the zone questions resolve against. Bundled because "which zone is this day
 *  in" reads the day's own events, not only the transport crossings (ADR-0107 session-100
 *  amendment) — five arguments at four call sites otherwise. */
export interface ZoneEvidence {
  events: TripEvent[];
  bookings: Booking[];
  places: Place[];
  crossings: ZoneCrossing[];
  primaryZone: string;
}

/** An event's zone **only when something actually says so** — a manual pin or a place with
 *  coordinates — and `undefined` when it would fall back to the itinerary segment or the trip
 *  primary. This is what makes the day-consensus below evidence rather than a circular vote:
 *  a placeless event's zone *is* the segment zone, so letting it vote would only ever confirm
 *  the segment. Zone-crossing transport is excluded too: it is the thing that moves you
 *  between zones, so it can't testify about where a day sits. */
export function eventKnownZone(
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

/** Events that sit on `date` — including a multi-day stay on its middle nights, which is
 *  strong evidence about where you are (ADR-0054's ambient span).
 *
 *  **Day keys are compared as strings**, so a caller holding database rows must spell `date`
 *  and `endDate` as `YYYY-MM-DD` before it gets here. A `Date` object silently matches
 *  nothing, which reads as a day with no evidence rather than as a type error. */
export function eventsOnDate(events: TripEvent[], date: string): TripEvent[] {
  return events.filter(
    (e) => e.date === date || (e.endDate != null && e.date <= date && date <= e.endDate),
  );
}

/**
 * The **day's** ambient zone: the zone that day is lived in. This is what a day surface
 * measures an event's shift against (a pill shows only when an event differs from its day),
 * what decides whether a day is over for editing (ADR-0029 amendment), and — since
 * 2026-09-03 — what the shared itinerary's own cards say "now" in, so a public page marks the
 * day the travellers are having rather than the day the destination's clock is having.
 *
 * Resolution (ADR-0107 session-100 amendment):
 *   1. **The day's own events**, when the ones with a *known* zone agree on a UTC offset — a
 *      day whose bookings are all in Cyprus is a Cyprus day, whatever the last flight was.
 *      Sessions 89-90 keyed this to the crossing-derived segment alone, which framed every
 *      day after an outbound flight in the destination's zone forever: two same-offset events
 *      then each drew a shift pill against a zone neither of them was in.
 *   2. The **itinerary segment** at the day's noon — the honest answer for a real travel day,
 *      whose events genuinely span two zones (so step 1 abstains).
 *   3. The **trip primary** zone.
 *
 * Noon is sampled in `primaryZone`: only which calendar day it lands in matters, and every
 * zone agrees about noon-ish.
 */
export function dayAmbientZone(date: string, evidence: ZoneEvidence): string {
  const { events, bookings, places, crossings, primaryZone } = evidence;
  const noonMs = Date.parse(zonedIso(date, DAY_NOON, primaryZone));
  const noon = new Date(noonMs);

  const known = eventsOnDate(events, date)
    .map((e) => eventKnownZone(e, bookings, places))
    .filter((zone): zone is string => zone != null);
  if (known.length > 0) {
    const offset = zoneOffsetMinutes(noon, known[0]);
    // Offsets, not zone ids: Nicosia and Jerusalem are different zones that agree about what
    // time it is, and a day split between them is not a mixed day.
    if (known.every((zone) => zoneOffsetMinutes(noon, zone) === offset)) return known[0];
  }

  return segmentZoneAt(noonMs, crossings) ?? primaryZone;
}

/**
 * The calendar day an instant falls on, in a named zone, as `YYYY-MM-DD`.
 *
 * `en-CA` because its short date format *is* ISO order — the one locale that gives a
 * sortable, comparable day string with no formatting of our own. The zone is an argument, so
 * the answer depends on nothing ambient.
 */
export function todayInTz(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}
