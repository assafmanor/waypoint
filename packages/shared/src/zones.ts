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
import { carriesRoute } from './icons';
import type { Booking, Place, TripEvent } from './entities';

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
 * The calendar day an instant falls on, in a named zone, as `YYYY-MM-DD`.
 *
 * `en-CA` because its short date format *is* ISO order — the one locale that gives a
 * sortable, comparable day string with no formatting of our own. The zone is an argument, so
 * the answer depends on nothing ambient.
 */
export function todayInTz(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}
