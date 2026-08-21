// Index bookings: pair each booking with its linked event (if any) and split
// into past / upcoming for the during-trip view (ADR-0049). A booking's schedule
// lives on its 1:1 linked event (ADR-0047); an unlinked booking has no place on
// the timeline yet, so it's always "upcoming" (something still to schedule).
import {
  BOOKING_TYPE,
  matchesAnyTerm,
  type Booking,
  type BookingType,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  bookingDestinationId,
  bookingPlaceId,
  eventDisplayZones,
  placeName,
  type ZoneEvidence,
} from './places';
import { formatTime, isEventPast, relativeDayLabel, todayInTz } from './time';
import { plainTimingLabel, timingLabels } from './booking-timing';
import { revealRows, type Revealed } from './filter-reveal';
import { BOOKING_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';

/** **Does the type chip beside a booking's title say anything the title does not?**
 *  (ADR-0163's amendment, owner's call 2026-08-04.)
 *
 *  A row draws the title and a small type chip. That reads well while the two differ
 *  (`Shinjuku Granbell` + `לינה`), and badly when they are the same string — which
 *  ADR-0163 §3 made reachable: a hire with no company entered falls back to its **type
 *  label** for a title, so the row said `השכרת רכב` twice, adjacent, on a 360px phone.
 *
 *  The fallback itself is right — on the surfaces that receive only a title (the change
 *  feed, a confirm) `השכרת רכב` is self-describing where a bare counter name is not. So
 *  the fix is the chip, not the title: it is dropped exactly when it would repeat. Same
 *  rule `EventForm`'s `יש הזמנה` row already applies to its own missing label ("the same
 *  word twice for 20px").
 *
 *  Keyed on the rendered strings rather than on "is this a hire with no provider",
 *  because the redundancy is a property of the two labels — any type whose title happens
 *  to be its own name gets the same treatment, with no new branch.
 *
 *  **A second term, for when it repeats the BADGE** (ADR-0179 §2b). The row draws a
 *  category glyph beside the chip, so on almost every row `טיסה` sits next to ✈️ on an
 *  amber transport tint — the type said three times before the filter chip above the list
 *  says it a fourth. The chip survives exactly where the badge stops saying it:
 *  `chosenIcon(event?.icon)` lets an event override the glyph, so a hotel wearing ⭐ keeps
 *  its chip and nothing else does.
 *
 *  `badgeIcon` is optional because the term is only meaningful where a badge is actually
 *  drawn beside the chip. `BookingDetail` passes nothing on purpose: its subtitle sits under
 *  a heading with room to spare, and a read surface naming the type outright is not the
 *  redundancy this predicate exists to catch. */
export const typeChipAddsMeaning = (
  booking: Pick<Booking, 'type' | 'title'>,
  badgeIcon?: string,
): boolean =>
  booking.title.trim() !== t.index.bookingType[booking.type] &&
  badgeIcon !== BOOKING_TYPE_ICON[booking.type];

/** The bookings-screen category filter (ADR-0098 §2): every `BookingType` plus
 *  an "all" option. Kept beside the type it filters, not a bare string literal
 *  at each call site. */
export const CATEGORY_ALL = 'all';
export type CategoryFilter = BookingType | typeof CATEGORY_ALL;

/** Category-chip match: "all" passes everything, otherwise an exact type match. */
export function matchesCategory(booking: Booking, category: CategoryFilter): boolean {
  return category === CATEGORY_ALL || booking.type === category;
}

/** Per-type booking counts for the category chip row (ADR-0100 §2: each chip
 *  carries its own count, e.g. "רכבת 🚄 2"). Every `BookingType` is
 *  initialized to 0 so a type with no bookings yet still renders a chip. */
export function countByCategory(bookings: Booking[]): Record<BookingType, number> {
  const counts = Object.fromEntries(Object.values(BOOKING_TYPE).map((type) => [type, 0])) as Record<
    BookingType,
    number
  >;
  for (const booking of bookings) counts[booking.type]++;
  return counts;
}

/** A booking's searchable terms (ADR-0102): title, confirmation code, its
 *  type's Hebrew label in both grammatical numbers ("מסעדה"/"מסעדות" both find
 *  a restaurant booking), any alternate vocabulary for that type ("מלון"/
 *  "הוסטל"/"airbnb" all find a hotel booking), and its linked place's name — an
 *  array, not a fixed handful of `||`-chained fields, so the next searchable
 *  facet is a push here, not a new branch in `matchesQuery` itself.
 *
 *  **Both ends of a transport booking**, resolved through the same authority rule
 *  everything else reads (ADR-0048): searching `פרנקפורט` finds the flight that lands
 *  there, not only the ones leaving from it. A single-place booking resolves both
 *  calls to the same place, and that duplicate term costs nothing — `matchesAnyTerm`
 *  already tolerates repeats and `undefined`s — so neither case earns a branch. */
function searchTerms(booking: Booking, places: Place[]): (string | undefined)[] {
  return [
    booking.title,
    booking.confirmationCode,
    t.index.bookingType[booking.type],
    t.index.bookingTypePlural[booking.type],
    ...t.index.bookingTypeSynonyms[booking.type],
    placeName(places, bookingPlaceId(booking)),
    placeName(places, bookingDestinationId(booking)),
  ];
}

/** Search match: title, confirmation code, category label (singular or plural),
 *  or a linked place's name, case/punctuation-insensitive. An empty/blank query
 *  matches everything (ADR-0098 §2).
 *
 *  `places` defaults to none — honestly "no places known", which drops that one facet
 *  and leaves every other term as it was. The production path (`visibleRows`) takes
 *  them as required, so the facet can't go missing by omission there. */
export function matchesQuery(booking: Booking, query: string, places: Place[] = []): boolean {
  if (!query.trim()) return true;
  return matchesAnyTerm(query, searchTerms(booking, places));
}

export interface BookingRow {
  booking: Booking;
  event?: TripEvent; // the linked event, if this booking is scheduled
}

const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);

/** Sort key for a row: scheduled rows by their event's instant (ascending),
 *  unscheduled rows last (they still need placing on the itinerary). */
function byWhen(a: BookingRow, b: BookingRow): number {
  if (!a.event && !b.event) return a.booking.title.localeCompare(b.booking.title);
  if (!a.event) return 1;
  if (!b.event) return -1;
  return a.event.date.localeCompare(b.event.date) || ms(a.event.startsAt) - ms(b.event.startsAt);
}

/** Per-row visibility against the current category/search filter, plus the
 *  staggered reveal delay — the bookings predicate over the app's shared reveal
 *  derivation (`lib/filter-reveal.ts`, ADR-0120), not a stagger of its own.
 *  `startIndex` chains upcoming → past into one continuous stagger across both
 *  lists; the returned `nextIndex` is that chained call's `startIndex`. */
export function visibleRows(
  rows: BookingRow[],
  category: CategoryFilter,
  query: string,
  places: Place[],
  startIndex = 0,
): { rows: Revealed<BookingRow>[]; nextIndex: number } {
  return revealRows(
    rows,
    ({ booking }) => matchesCategory(booking, category) && matchesQuery(booking, query, places),
    startIndex,
  );
}

export function splitBookings(
  bookings: Booking[],
  events: TripEvent[],
  timezone: string,
  now: number,
): { upcoming: BookingRow[]; past: BookingRow[] } {
  const at = new Date(now);
  const rows: BookingRow[] = bookings.map((booking) => ({
    booking,
    event: events.find((e) => e.bookingId === booking.id),
  }));
  // A booking is behind you once its linked event's closing edge has passed
  // (ADR-0049): a flight at landing, a hotel at check-out, an untimed booking at
  // midnight. An unlinked booking has no place on the timeline yet, so it's never
  // past. The edge is derived type-agnostically by `eventEndBoundary`.
  const isPast = (r: BookingRow) => !!r.event && isEventPast(r.event, at, timezone);
  return {
    upcoming: rows.filter((r) => !isPast(r)).sort(byWhen),
    past: rows.filter(isPast).sort(byWhen),
  };
}

/** The row's schedule line, prefixed with what the time _is_ for this booking type
 *  (ADR-0053 refinement). A multi-day booking (endDate set) flips from its check-in
 *  to its check-out once the check-in day has passed: the check-out day during the
 *  stay, and the check-out _time_ on the check-out day itself.
 *
 *  A booking already behind you (ADR-0089) drops the transition verb: naming the
 *  action ("נחיתה", "צ׳ק-אאוט") only helps while it's still ahead of you — once
 *  it's in the past-bookings list the day + duration answer "when was it", and
 *  the verb is noise. Past-ness is the same edge `splitBookings` files on. */
export interface ScheduleParts {
  /** The transition verb (`המראה`, `צ׳ק-אאוט`), absent once the booking is behind you
   *  (ADR-0089). Whether it is *drawn* is the surface's call, not this function's — see
   *  `edge`. */
  verb?: string;
  /** The relative day. Always present, and on the Index row it never shrinks: it is the
   *  fact that tells one row from another in a list spanning the whole trip. */
  day: string;
  /** The clock, where this edge has one. */
  time?: string;
  /** **Which end of the span this reads.** `end` only once a multi-day booking's opening
   *  day has passed. The Index row draws the verb on `end` alone (ADR-0179 §2d): on a
   *  start edge the type→verb map is 1:1 with the badge glyph, so `המראה` beside ✈️ says
   *  the type twice, while on a closing edge the verb is the only thing that can say
   *  *which* end `11:00` is. */
  edge: 'start' | 'end';
}

/** The schedule as **parts**, which is what a surface needs to give them a hierarchy —
 *  a mono full-ink clock, a muted day, a quiet duration (ADR-0179 §3). Flex cannot style,
 *  protect or re-order half of a text node, so a joined string forces the whole line to one
 *  weight and one colour and makes the `…` eat whichever fact happens to be last. ADR-0152
 *  §6c hit the identical wall on the event card's meta line.
 *
 *  `scheduleLabel` below stays the joined form for surfaces that genuinely want one text
 *  run. */
export function scheduleParts(
  event: TripEvent,
  booking: Booking,
  evidence: ZoneEvidence,
  now: Date,
): ScheduleParts {
  // **The clock reads in the EDGE's own resolved zone** (ADR-0107) — a departure in its
  // origin, an arrival in its destination — which is what the day card and the two detail
  // sheets already do. This took the trip's primary zone, so on a multi-zone trip the row
  // stated a time no clock on the itinerary shows. The evidence replaced the `Trip` here
  // rather than joining it: `primaryZone` IS `trip.timezone`, and nothing else was read.
  const zones = eventDisplayZones(event, evidence);
  const today = todayInTz(evidence.primaryZone, now);
  const labels = timingLabels(booking.type);
  const multiDay = !!event.endDate && event.endDate !== event.date;
  const past = isEventPast(event, now, evidence.primaryZone);

  if (multiDay && today > event.date) {
    const day = relativeDayLabel(event.endDate!, today);
    const verb = past ? undefined : plainTimingLabel(labels.end);
    // Before the check-out day the day is enough; on the day itself, name the time.
    return event.endDate === today && event.endsAt
      ? { verb, day, time: formatTime(event.endsAt, zones.end), edge: 'end' }
      : { verb, day, edge: 'end' };
  }

  const day = relativeDayLabel(event.date, today);
  if (!event.startsAt) return { day, edge: 'start' };
  const verb = past ? undefined : plainTimingLabel(labels.start);
  return { verb, day, time: formatTime(event.startsAt, zones.start), edge: 'start' };
}

/** The parts as one run, `verb · day · time` — unchanged output, and still what the Index
 *  landing tile's one-line "next booking" preview wants. */
export function scheduleLabel(
  event: TripEvent,
  booking: Booking,
  evidence: ZoneEvidence,
  now: Date,
): string {
  const { verb, day, time } = scheduleParts(event, booking, evidence, now);
  return [verb, day, time].filter(Boolean).join(' · ');
}
