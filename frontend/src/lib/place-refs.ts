// Why a place is in the trip — the way through from a pin to the entity that put
// it there (ADR-0121 §8).
//
// A `Place` holds name/address/coords/timezone/rating. The confirmation code, the
// notes, the documents and the real times live on the **reference**, which is
// also the only reason the place is in the trip at all (ADR-0112). So a selected
// place needs a route to it, labelled in the reference's own words.
//
// `DayUsage` already points at ONE reference per date — the one owning that day's
// moment, added in session 108 so the row could say what happens here. That is
// deliberately a single pointer (the derivation merges same-date references), and
// §8 asks for **one entry per in-scope reference**. So this resolves the full set,
// through the same authority rule `buildPlaceUsageIndex` gathers by
// (`eventPlaceId` / `bookingPlaceId`, transport contributing both endpoints) —
// never a second opinion about which place a reference points at.
//
// Pure and clock-free: the screen supplies the wording and the zone, exactly as
// it does for the row's meta line.
import { isMultiDay, type Booking, type MaybeItem, type TripEvent } from '@waypoint/shared';
import { bookingPlaceId, eventPlaceId, isTransportBooking } from './places';

/** What kind of thing references the place — which decides where the entry goes:
 *  a booking → `BookingDetail`, an event → its day, an idea → the shelf. */
export const PLACE_REF_KIND = { booking: 'booking', event: 'event', idea: 'idea' } as const;
export type PlaceRefKind = (typeof PLACE_REF_KIND)[keyof typeof PLACE_REF_KIND];

export interface PlaceRef {
  kind: PlaceRefKind;
  /** Stable identity for React, since one event can reference one place twice
   *  (a station that is one leg's origin and another's destination). */
  key: string;
  /** The event this reference rides on — absent for an unlinked booking or a
   *  dateless idea, which carry no time (and so no day facet). */
  eventId?: string;
  /** The booking holding the code/notes/documents, when there is one. */
  bookingId?: string;
  maybeId?: string;
  /** The date this reference lands on, for an event target. */
  date?: string;
  /** Which end of the event this is: a departure/check-in (`start`) or an
   *  arrival/check-out (`end`). Undefined mid-span, where neither happens. */
  edge?: 'start' | 'end';
  /** The moment it happens here — the ordering key, so the moment's owner leads. */
  at?: number;
}

/** Snapshot slice the resolution reads. Bundled so a call site can't supply three
 *  of the four and quietly lose a reference kind. */
export interface PlaceRefSource {
  events: TripEvent[];
  bookings: Booking[];
  maybeItems: MaybeItem[];
}

/** Which calendar dates an event touches, inclusive of a multi-day span. */
const touchesDate = (event: TripEvent, date: string): boolean =>
  event.date === date || (event.endDate != null && event.date <= date && date <= event.endDate);

/** The edge a reference sits at ON a date. A span's own ends are its two moments
 *  whatever endpoint asked (the first day departs/checks in, the last
 *  arrives/checks out, the middle nights have neither) — the same reading
 *  `spanDays` applies, so the entry's wording matches the row's. */
function edgeOnDate(
  event: TripEvent,
  endpointEdge: 'start' | 'end',
  date: string | undefined,
): 'start' | 'end' | undefined {
  if (!isMultiDay(event)) return endpointEdge;
  if (date == null) return endpointEdge;
  if (date === event.date) return 'start';
  if (date === event.endDate) return 'end';
  return undefined;
}

/**
 * Every reference to `placeId`, in the order they are shown: the moment's owner
 * leads, then the rest of the day's clocked references, then whatever carries no
 * clock at all.
 *
 * `onDate` scopes it the way the tab is scoped. Day-scoped, a reference is kept
 * when it touches that date **or** when it has no date at all — a dateless
 * reference belongs to no day, so no day excludes it, which is the same reading
 * the list's `dayless` block applies.
 */
export function placeRefs(
  placeId: string,
  source: PlaceRefSource,
  opts: { onDate?: string } = {},
): PlaceRef[] {
  const { events, bookings, maybeItems } = source;
  const { onDate } = opts;
  const refs: PlaceRef[] = [];

  for (const event of events) {
    const booking = event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;
    // Transport contributes BOTH endpoints, each at its own moment: the origin
    // when you depart, the destination when you land.
    const endpoints: { id?: string | null; edge: 'start' | 'end' }[] =
      booking && isTransportBooking(booking)
        ? [
            { id: booking.fromPlaceId, edge: 'start' },
            { id: booking.toPlaceId, edge: 'end' },
          ]
        : [{ id: eventPlaceId(event, booking), edge: 'start' }];
    for (const endpoint of endpoints) {
      if (endpoint.id !== placeId) continue;
      if (onDate && !touchesDate(event, onDate)) continue;
      const date = onDate ?? event.date;
      const edge = edgeOnDate(event, endpoint.edge, date);
      const iso = edge === 'end' ? (event.endsAt ?? event.startsAt) : event.startsAt;
      refs.push({
        // A booking is what a traveller wants when there is one — the code and
        // the documents are there, not on the event that schedules it.
        kind: booking ? PLACE_REF_KIND.booking : PLACE_REF_KIND.event,
        key: `${event.id}:${endpoint.edge}`,
        eventId: event.id,
        bookingId: booking?.id,
        date,
        edge,
        at: iso ? Date.parse(iso) : undefined,
      });
    }
  }

  // Unlinked bookings carry no time, so no day facet and no date — the same
  // reason they sit in the list's `dayless` block.
  const linked = new Set(events.map((e) => e.bookingId).filter(Boolean));
  for (const booking of bookings) {
    if (linked.has(booking.id)) continue;
    const ids = isTransportBooking(booking)
      ? [
          { id: booking.fromPlaceId, edge: 'start' as const },
          { id: booking.toPlaceId, edge: 'end' as const },
        ]
      : [{ id: bookingPlaceId(booking), edge: 'start' as const }];
    for (const endpoint of ids) {
      if (endpoint.id !== placeId) continue;
      refs.push({
        kind: PLACE_REF_KIND.booking,
        key: `bk:${booking.id}:${endpoint.edge}`,
        bookingId: booking.id,
        edge: endpoint.edge,
      });
    }
  }

  for (const maybe of maybeItems) {
    if (maybe.consumed || maybe.placeId !== placeId) continue;
    // A pencilled-in target day is the idea's only date; a "someday" idea has
    // none, and neither is excluded by a day scope it was never on.
    if (onDate && maybe.targetDate != null && maybe.targetDate !== onDate) continue;
    refs.push({
      kind: PLACE_REF_KIND.idea,
      key: `mb:${maybe.id}`,
      maybeId: maybe.id,
      date: maybe.targetDate ?? undefined,
    });
  }

  // Clocked references first, earliest leading; the clockless ones trail in the
  // order they were gathered (events, then bookings, then ideas), which is also
  // most-committed first.
  return refs
    .map((ref, i) => ({ ref, i }))
    .sort((a, b) => {
      if (a.ref.at != null && b.ref.at != null && a.ref.at !== b.ref.at) return a.ref.at - b.ref.at;
      if ((a.ref.at == null) !== (b.ref.at == null)) return a.ref.at == null ? 1 : -1;
      return a.i - b.i;
    })
    .map(({ ref }) => ref);
}
