// **What a note or an attachment is really about** (ADR-0172, reused by ADR-0173).
//
// A linked Booking + Event is ONE thing to the person looking at it — ADR-0047 §2 already
// gave the pair one merged edit surface — so its notes are one list. That relationship is
// strict 1:1 (ADR-0047 §1), which is why this is a read-time derivation and not a join
// table: there is no note that needs two hosts, only two rows that need to be read as one.
//
// Two answers, and every surface takes both from here so they cannot drift:
//   • `members` — every host whose rows this surface DISPLAYS.
//   • `anchor`  — the single host a new row is WRITTEN to.
//
// Pure over the snapshot: no React, no Dexie, and deliberately no clock (§3's relevance
// test is not date-scoped, so a place's sharing cannot change while nobody is writing).
import type { Booking, MaybeItem, TripEvent } from '@waypoint/shared';
import { ENTITY_TYPE } from '@waypoint/shared';
import type { NoteHostKind } from './notes';

/** One host, named the way `NOTE_HOST_FIELD` names it. */
export interface HostRef {
  kind: NoteHostKind;
  id: string;
}

export interface HostContext {
  /** Where a new note/attachment written from ANY surface in this context lands.
   *
   *  The Booking, whenever the pair is linked — and that is forced rather than preferred:
   *  ADR-0093 materializes a booking's derived event server-side from a seed, so at the
   *  moment `BookingSheet` commits there is no client-held event id to host anything on
   *  (ADR-0172 §2). Event-as-anchor cannot serve the create path at all. */
  anchor: HostRef;
  /** Every host this surface reads, anchor included. A note may sit on either row of a
   *  pair — one written before the event was booked keeps its `eventId` — and the union
   *  is what makes that invisible to the reader (ADR-0172 §2, no backfill). */
  members: HostRef[];
}

const keyOf = (ref: HostRef) => `${ref.kind}:${ref.id}`;

/** The pair map plus the per-place verdict, built once per snapshot change rather than per
 *  row: a day of twelve events asks for a context twelve times. */
export interface HostContextIndex {
  /** eventId → the booking it backs. */
  bookingOfEvent: Map<string, string>;
  /** bookingId → the event it backs. */
  eventOfBooking: Map<string, string>;
  /** placeId → its ONE relevant Booking/Event context, present only when there is exactly
   *  one. A place with none, or with two, is absent — which is the safe fallback in both
   *  directions (ADR-0172 §3). */
  soleContextOfPlace: Map<string, HostRef>;
  /** `kind:id` → the places this event/booking/idea is AT, authority rule applied. What makes
   *  a place's own notes read on every use of it (§3's 2026-09-27 amendment). */
  placesOfHost: Map<string, string[]>;
}

export function buildHostContextIndex(
  events: Pick<TripEvent, 'id' | 'bookingId' | 'placeId'>[],
  bookings: Pick<Booking, 'id' | 'placeId' | 'fromPlaceId' | 'toPlaceId'>[],
  maybeItems: Pick<MaybeItem, 'id' | 'placeId'>[] = [],
): HostContextIndex {
  const bookingOfEvent = new Map<string, string>();
  const eventOfBooking = new Map<string, string>();
  for (const event of events) {
    if (!event.bookingId) continue;
    bookingOfEvent.set(event.id, event.bookingId);
    eventOfBooking.set(event.bookingId, event.id);
  }

  // Keyed by context rather than counted, so a transport booking whose origin and
  // destination are the same place still counts ONCE: the unit of "a context" is the
  // referencing entity, not the FK (ADR-0172 §3).
  const contextsByPlace = new Map<string, Map<string, HostRef>>();
  const placesOfHost = new Map<string, string[]>();
  const locate = (placeId: string | null | undefined, ref: HostRef) => {
    if (!placeId) return;
    const places = placesOfHost.get(keyOf(ref));
    if (!places) placesOfHost.set(keyOf(ref), [placeId]);
    else if (!places.includes(placeId)) places.push(placeId);
  };
  const link = (placeId: string | undefined, ref: HostRef) => {
    locate(placeId, ref);
    if (!placeId) return;
    let refs = contextsByPlace.get(placeId);
    if (!refs) contextsByPlace.set(placeId, (refs = new Map()));
    refs.set(keyOf(ref), ref);
  };

  for (const booking of bookings) {
    const ref: HostRef = { kind: ENTITY_TYPE.BOOKING, id: booking.id };
    link(booking.placeId, ref);
    link(booking.fromPlaceId, ref);
    link(booking.toPlaceId, ref);
  }
  for (const event of events) {
    // **ADR-0048's authority rule, and skipping this is what kills the feature.** A LINKED
    // event's `placeId` is not authoritative — its booking's is. Counting it too would make
    // one hotel and the event it backs two references to one place, so no place would ever
    // be unique and nothing would ever inherit.
    if (event.bookingId) continue;
    link(event.placeId, { kind: ENTITY_TYPE.EVENT, id: event.id });
  }
  // An idea pointing at the place is deliberately NOT counted (owner's call, ADR-0172 §3):
  // a stray "maybe we eat here" would otherwise hide a restaurant's notes with no visible
  // cause on the surface the reader is on. It still READS the place's own notes.
  for (const item of maybeItems)
    locate(item.placeId, { kind: ENTITY_TYPE.MAYBE_ITEM, id: item.id });

  const soleContextOfPlace = new Map<string, HostRef>();
  for (const [placeId, refs] of contextsByPlace) {
    if (refs.size !== 1) continue;
    soleContextOfPlace.set(placeId, refs.values().next().value!);
  }
  return { bookingOfEvent, eventOfBooking, soleContextOfPlace, placesOfHost };
}

/** The context a surface reads and writes through.
 *
 *  **A place's OWN rows read on every use of it** (ADR-0172 §3, amended 2026-09-27 on the
 *  owner's report): a note written on a place from the Map is about the place, so the event
 *  or idea later made there shows it. A place is still never an anchor from that side — a
 *  row written on the event stays the event's — and a place never reads ANOTHER place's rows
 *  through a transport booking it inherits. */
export function resolveHostContext(index: HostContextIndex, host: HostRef): HostContext {
  if (host.kind === ENTITY_TYPE.PLACE) {
    const sole = index.soleContextOfPlace.get(host.id);
    if (!sole) return { anchor: host, members: [host] };
    const inherited = resolveHostContext(index, sole);
    // The place leads its own list, and writes go to the inherited anchor.
    return {
      anchor: inherited.anchor,
      members: [host, ...inherited.members.filter((m) => m.kind !== ENTITY_TYPE.PLACE)],
    };
  }

  const pair = resolvePair(index, host);
  const seen = new Set(pair.members.map(keyOf));
  const members = [...pair.members];
  for (const member of pair.members)
    for (const placeId of index.placesOfHost.get(keyOf(member)) ?? []) {
      const place: HostRef = { kind: ENTITY_TYPE.PLACE, id: placeId };
      if (seen.has(keyOf(place))) continue;
      seen.add(keyOf(place));
      members.push(place);
    }
  return { anchor: pair.anchor, members };
}

/** The Booking/Event pair (ADR-0172 §1/§2), or a context of one. */
function resolvePair(index: HostContextIndex, host: HostRef): HostContext {
  const self = { anchor: host, members: [host] };

  if (host.kind === ENTITY_TYPE.EVENT) {
    const bookingId = index.bookingOfEvent.get(host.id);
    if (!bookingId) return self;
    const anchor: HostRef = { kind: ENTITY_TYPE.BOOKING, id: bookingId };
    return { anchor, members: [anchor, host] };
  }

  if (host.kind === ENTITY_TYPE.BOOKING) {
    const eventId = index.eventOfBooking.get(host.id);
    if (!eventId) return self;
    return { anchor: host, members: [host, { kind: ENTITY_TYPE.EVENT, id: eventId }] };
  }

  return self;
}

/** Does this row (a note, an attachment) belong to any host in the context? Takes the
 *  per-host predicate so notes and attachments — which store their host differently
 *  (ADR-0173 §1) — share the union without sharing a row shape. */
export function inContext<T>(
  context: HostContext,
  row: T,
  isHostedBy: (row: T, kind: NoteHostKind, id: string) => boolean,
): boolean {
  return context.members.some((member) => isHostedBy(row, member.kind, member.id));
}
