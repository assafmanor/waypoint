// **A suggestion is a table of SOURCES, not a feature** (ADR-0203 §5/§8).
//
// One shape for every suggestion a booking form makes, and an ordered list of sources per
// field. "At most one suggestion" then becomes a property of the mechanism — take the first
// source that answers — rather than a rule each call site has to remember.
//
// This is the idiom ADR-0154 §5 already chose for the round-trip relation, in its own words:
// *"a table of relation rules rather than a hard-coded `||`, so a second relation is an
// entry."* `BOOKING_TYPE_PROFILE` and `NOTE_HOST_FIELD` are the same pattern. A future
// source is a row here — a cross-trip place memory, a PNR parsed out of Gmail (ADR-0004:
// integrations are pipes, and this is a pipe's mouth), a Places call for the destination's
// own airports — and none of them is a new mechanism.
//
// Two invariants, and both are what make a suggestion safe on a hard commitment:
//
//  - **A source may answer null, and all of them answering null is the ordinary case.** A
//    form with nothing to infer from shows no pill and behaves exactly as it does today.
//  - **A suggestion is only ever offered into an EMPTY field.** It is never corrected onto a
//    filled one, which is the line between offering a day (sanctioned — `booking-prefill.ts`:
//    "no clock may be guessed, but the DAY still may") and guessing a value on a commitment
//    ADR-0171 §1 refuses.
import { reachesDestination, type DestinationRef, type Place } from '@waypoint/shared';

/** What a suggestion offers, and where it came from. `value` is what a tap writes. */
export interface Suggestion<V> {
  value: V;
  /** The pill's own words — a place's name, or what the date IS ("תחילת הטיול"). */
  label: string;
  /** The quieter half: a date's numerals, or which leg a place was read off. */
  detail?: string;
  /** True when `detail` is a figure and belongs in the mono face. A Hebrew word in that
   *  face has no glyphs and falls back to different metrics — the trap `value-token.css`
   *  keeps a whole `word` tone for. */
  mono?: boolean;
  /** Which source answered. Carried so a spec can assert WHY a suggestion appeared, not
   *  only that one did. */
  source: string;
}

/** A source: a name, and a question it answers about the form's current facts. */
export interface SuggestSource<C, V> {
  id: string;
  of: (context: C) => Omit<Suggestion<V>, 'source'> | null;
}

/** Take the first source that answers. */
export function suggest<C, V>(
  sources: readonly SuggestSource<C, V>[],
  context: C,
): Suggestion<V> | null {
  for (const source of sources) {
    const hit = source.of(context);
    if (hit) return { ...hit, source: source.id };
  }
  return null;
}

/** One leg the trip already holds, reduced to what a suggestion needs to read off it. */
export interface KnownLeg {
  from?: Place;
  to?: Place;
}

/** What the sources may ask about. Everything is passed in; nothing is read from state. */
export interface SuggestContext {
  /** This journey's two outer endpoints, as far as they are known. */
  from?: Place;
  to?: Place;
  destination: DestinationRef;
  trip: { startDate: string; endDate: string };
  /** Transport legs the trip ALREADY has — the corpus §8 reads a place off. */
  legs: readonly KnownLeg[];
  /** Which end of THIS journey is being suggested for. */
  role?: 'from' | 'to';
  /** The day the leg before this journey landed on, when there is one. */
  previousLanded?: string;
  /** Copy, passed in because `@waypoint/shared` holds no UI strings and this module is
   *  imported by a component that has them. */
  words: {
    tripStart: string;
    tripEnd: string;
    afterPrevious: string;
    fromOutbound: string;
    fromReturn: string;
  };
}

/** **Which EDGE of the trip this journey is** (§5), decided by the predicate that already
 *  answers it for the Plan readiness count.
 *
 *  The destination reaches the trip's destination ⇒ this is the way there ⇒ the trip's first
 *  day. The origin does ⇒ the way home ⇒ its last. **Both ends inside** ⇒ an internal hop,
 *  for which the trip's edges are precisely the wrong answer ⇒ nothing. Neither placeable ⇒
 *  nothing, and the traveller types the date exactly as today.
 *
 *  `reachesDestination` cannot answer NO — an unplaceable endpoint is unconfirmed — so this
 *  can only ever REMOVE a suggestion, never add a wrong one. */
export function tripEdgeFor(c: SuggestContext): 'out' | 'back' | null {
  const outward = reachesDestination(c.to, c.destination);
  const homeward = reachesDestination(c.from, c.destination);
  if (outward && !homeward) return 'out';
  if (homeward && !outward) return 'back';
  return null;
}

/** Sources for a journey's one absolute DATE, in priority order. */
export const DATE_SOURCES: readonly SuggestSource<SuggestContext, string>[] = [
  {
    // A journey opens where the one before it landed — the rule `BookingSheet`'s
    // `defaultDate: previous?.end` already follows inside one form ("each leg opens on the
    // day the one before it landed"), read off the trip's own legs instead.
    id: 'previous-leg',
    of: (c) =>
      c.previousLanded
        ? { value: c.previousLanded, label: c.words.afterPrevious, detail: undefined }
        : null,
  },
  {
    id: 'trip-edge',
    of: (c) => {
      const edge = tripEdgeFor(c);
      if (!edge) return null;
      const value = edge === 'out' ? c.trip.startDate : c.trip.endDate;
      return { value, label: edge === 'out' ? c.words.tripStart : c.words.tripEnd, mono: true };
    },
  },
  // ← a future date source is one row
];

/** Sources for a transport ENDPOINT (§8).
 *
 *  The owner's own example: _"suggest the arrival airport for the return flight if we have
 *  the flight to the destination"_. A leg that reaches the destination is the way there
 *  (`hasOutbound`'s own test), so a journey authored while one exists is probably the way
 *  back — its origin is that leg's landing and its destination is that leg's start.
 *
 *  Read off the trip's EXISTING legs, so it works for a return authored weeks after its
 *  outbound, in a different form, with no round-trip control involved. And it avoids the Map
 *  errand entirely: one tap in the form, no unmount, no network call. */
export const PLACE_SOURCES: readonly SuggestSource<SuggestContext, Place>[] = [
  {
    id: 'mirror-existing-leg',
    of: (c) => {
      if (!c.role || !c.legs.length) return null;
      const there = c.legs.find(
        (l) =>
          reachesDestination(l.to, c.destination) && !reachesDestination(l.from, c.destination),
      );
      if (there) {
        const place = c.role === 'from' ? there.to : there.from;
        return place ? { value: place, label: place.name, detail: c.words.fromOutbound } : null;
      }
      const home = c.legs.find(
        (l) =>
          reachesDestination(l.from, c.destination) && !reachesDestination(l.to, c.destination),
      );
      if (home) {
        const place = c.role === 'from' ? home.to : home.from;
        return place ? { value: place, label: place.name, detail: c.words.fromReturn } : null;
      }
      return null;
    },
  },
  // ← the sources a later decision would add, each one row and none a new mechanism: a
  //   cross-trip "the airport you usually fly from" (needs a user-level place, which `Place`
  //   deliberately is not — see ADR-0203 §8), a PNR parsed out of Gmail, a Places call for
  //   the destination's own airports.
];
