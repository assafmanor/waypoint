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
import {
  carriesRoute,
  isMultiDay,
  CHANGE_ACTION,
  ENTITY_TYPE,
  type Booking,
  type EntityType,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { bookingPlaceId, eventPlaceId } from './places';

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
      booking && carriesRoute(booking.type)
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
    const ids = carriesRoute(booking.type)
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

/** **The idea a scheduled place consumes — or none** (ADR-0135 §5).
 *
 *  With **exactly one** live idea on the place, scheduling it is the shelf's own
 *  consume-on-schedule reached from a new surface: leaving the idea parked would
 *  leave the same place both scheduled and shelved, which is two rows in the list
 *  and two pins on the canvas with one of them a lie.
 *
 *  With **two or more, nothing is consumed, and that is the decision, not an
 *  oversight.** Two ideas on one place are two intentions ("a meal there",
 *  "drinks there"), and scheduling one must not eat the other. Nothing on screen
 *  can tell them apart — a shipped idea entry reads `על המדף · <day>` and nothing
 *  else — so the screen does not guess.
 *
 *  Deliberately NOT day-scoped: an idea pencilled in for another day is still a
 *  second intention, and consuming "the one in scope" would eat it silently.
 *  A simplification to "any idea" has to argue with this comment first. */
export function soleIdeaFor(placeId: string, maybeItems: MaybeItem[]): MaybeItem | null {
  const live = maybeItems.filter((m) => !m.consumed && m.placeId === placeId);
  return live.length === 1 ? live[0] : null;
}

// --- Deleting a place: what points at it, and what that costs (ADR-0157) ------------------
// `placeRefs` above answers "why is this place in the trip" for a HUMAN — it merges a
// booking with its event, orders by the clock and drops what is out of day scope. A delete
// needs the other question, and none of those three readings survive it: every row holding
// the FK, once each, whatever day it is on. So this is a second derivation rather than a
// filter over the first, and the two are not interchangeable.

/** **Which fields point at a place, per entity** — the `onDelete: SetNull` set in
 *  `schema.prisma`, named once so the local cascade, its undo and the confirm's count can
 *  never disagree about what a delete touches. A sixth FK is a line here. */
export const PLACE_FK = {
  [ENTITY_TYPE.EVENT]: ['placeId'],
  [ENTITY_TYPE.BOOKING]: ['placeId', 'fromPlaceId', 'toPlaceId'],
  [ENTITY_TYPE.MAYBE_ITEM]: ['placeId'],
} as const satisfies Partial<Record<EntityType, readonly string[]>>;

export type PlaceFkOwner = keyof typeof PLACE_FK;

/** One row that loses its location, and exactly which of its fields did. Two for the one
 *  case that has two: a round trip whose origin and destination are the same station. */
export interface PlaceLink {
  owner: PlaceFkOwner;
  id: string;
  fields: string[];
}

/** The `Change` fields these cascade rules read — the same structural subset `notes.ts`'s
 *  `HostChange` names, and for the same reason: a live WS echo and an offline optimistic
 *  write both fit it. */
type PlaceChange = { entityType: EntityType; entityId: string; action: string };

/** The place this change deletes, or `null` for every other change — the one test both
 *  halves of the cascade start from. */
export function deletedPlaceId(change: PlaceChange): string | null {
  return change.entityType === ENTITY_TYPE.PLACE && change.action === CHANGE_ACTION.DELETE
    ? change.entityId
    : null;
}

const fkValue = (row: object, field: string): unknown => (row as Record<string, unknown>)[field];

/** Every row that would lose a location if `placeId` were deleted — what the confirm
 *  counts, and what the undo re-links. Includes CONSUMED ideas, unlike `placeRefs`: a
 *  consumed idea still holds the FK, so Postgres still nulls it and an undo that skipped it
 *  would restore the place with one link quietly missing. */
export function placeLinks(placeId: string, source: PlaceRefSource): PlaceLink[] {
  const of = (owner: PlaceFkOwner, rows: { id: string }[]): PlaceLink[] =>
    rows
      .map((row) => ({
        owner,
        id: row.id,
        fields: PLACE_FK[owner].filter((field) => fkValue(row, field) === placeId),
      }))
      .filter((link) => link.fields.length > 0);
  return [
    ...of(ENTITY_TYPE.EVENT, source.events),
    ...of(ENTITY_TYPE.BOOKING, source.bookings),
    ...of(ENTITY_TYPE.MAYBE_ITEM, source.maybeItems),
  ];
}

/** **A link as the reader knows it** — its kind in the confirm's vocabulary, and what the
 *  row is called (ADR-0157 §8). One link is one ROW, so a round trip that both starts and
 *  ends at the place is one booking here, named once. The label is looked up rather than
 *  carried on the link, because only the screen holds the lists — and this file stays
 *  i18n-free: the WORDS for `kind` are the caller's. */
export function placeRefSubject(
  link: PlaceLink,
  source: PlaceRefSource,
): { kind: 'event' | 'booking' | 'idea'; label?: string } {
  if (link.owner === ENTITY_TYPE.EVENT) {
    return { kind: 'event', label: source.events.find((e) => e.id === link.id)?.title };
  }
  if (link.owner === ENTITY_TYPE.BOOKING) {
    return { kind: 'booking', label: source.bookings.find((b) => b.id === link.id)?.title };
  }
  return { kind: 'idea', label: source.maybeItems.find((m) => m.id === link.id)?.title };
}

/**
 * **The place cascade's sync half** — the twin of `dropNotesForHostChange` (ADR-0152 §2),
 * and it exists for the identical reason: the four place FKs are `onDelete: SetNull`, so
 * Postgres nulls them **without writing `Change` rows**. A peer holding the trip in memory
 * or in Dexie would keep rendering an event pinned to a place that no longer exists.
 *
 * So a place's `delete` change clears the FKs it leaves dangling, applied in both places a
 * change is mirrored — the memory channels in `state/trip-state.tsx` and `CACHE_CHANNELS`'s
 * applier in `lib/cache.ts`.
 *
 * Returns the SAME array reference when nothing was cleared, so every change that is not a
 * place delete cannot cause a re-render.
 */
export function clearPlaceRefsForChange<T extends object>(
  rows: T[],
  owner: PlaceFkOwner,
  change: PlaceChange,
): T[] {
  const placeId = deletedPlaceId(change);
  return placeId ? clearPlaceRefs(rows, owner, placeId) : rows;
}

/** The same clear, from the id rather than from a change — what our OWN delete applies
 *  optimistically, before there is any change to hear back. Same reference discipline. */
export function clearPlaceRefs<T extends object>(
  rows: T[],
  owner: PlaceFkOwner,
  placeId: string,
): T[] {
  let touched = false;
  const next = rows.map((row) => {
    const cleared = PLACE_FK[owner].filter((field) => fkValue(row, field) === placeId);
    if (cleared.length === 0) return row;
    touched = true;
    return { ...row, ...Object.fromEntries(cleared.map((field) => [field, undefined])) };
  });
  return touched ? next : rows;
}
