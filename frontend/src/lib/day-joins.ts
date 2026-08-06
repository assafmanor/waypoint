// **What sits between two consecutive rows of the day** (ADR-0159).
//
// Two answers, and they are opposites. A **gap** is absence — free time, the same hole
// Plan mode already draws as a `שבץ` chip, read here through the same `gapBetween` and
// the same `GAP_MIN_MINUTES` so the two modes cannot disagree about what a hole IS; only
// about what you can do with it. A **connection** is presence: the two rows are legs of
// one journey (`connectionMinutes`, `@waypoint/shared`), you are inside a commitment for
// the whole of it, and nothing about it is free. It therefore ignores the gap floor — a
// 12-minute change of train is the join you most need to see and the one no free-time
// threshold would ever surface.
//
// Pure: no clock, no React. The day view hands it entries and gets back what to draw.
import {
  connectionMinutes,
  isTightConnection,
  type Booking,
  type BookingType,
  type BookingWhen,
  type TripEvent,
} from '@waypoint/shared';
import { gapBetween, type Gap } from './gaps';
import { routeEndpointDay } from './place-usage';
import type { DayEntry } from './day-entries';
import { groupEndEvent, groupStartEvent } from './day-entries';

export type DayJoin =
  | {
      kind: 'gap';
      minutes: number;
      /** **The free time here, and the slot a fill lands on** (ADR-0161 §9) — `gapBetween`'s
       *  own `Gap`, which the strip used to derive and throw away. Carried whole because Trip
       *  mode's gap is tappable now: the tap has to open the SAME slot Plan mode's chip offers
       *  (two derivations of "where does this drop land" is what §2 collapsed into one), and
       *  the ROOM is what caps a category's length there (§5). */
      free: Gap;
    }
  | {
      kind: 'connection';
      minutes: number;
      /** Where you wait. Absent when the endpoint has no place picked. */
      stopPlaceId?: string;
      /** Short by this transport mode's own measure (`isTightConnection`). */
      tight: boolean;
      /** Which mode, because the word differs: a train changes, a flight stops over. */
      type: BookingType;
    };

export interface JoinContext {
  bookings: readonly Booking[];
  /** When each booking happens — `bookingWhen(events)`, the one provider (ADR-0159). */
  when: BookingWhen;
  /** The day's base zone, for the gap arithmetic `gapBetween` already does. */
  tz: string;
}

const bookingOf = (event: TripEvent, bookings: readonly Booking[]) =>
  event.bookingId ? bookings.find((b) => b.id === event.bookingId) : undefined;

/**
 * The join between two consecutive events, or `null` when there is nothing to say.
 *
 * A connection is asked first and wins outright: two legs of one journey are never
 * "free time", however long the wait, and asking the gap rule first would label a
 * seven-hour layover as an empty afternoon.
 */
export function joinBetween(prev: TripEvent, next: TripEvent, ctx: JoinContext): DayJoin | null {
  const from = bookingOf(prev, ctx.bookings);
  const to = bookingOf(next, ctx.bookings);
  if (from && to) {
    const minutes = connectionMinutes(from, to, ctx.when);
    if (minutes != null) {
      return {
        kind: 'connection',
        minutes,
        stopPlaceId: from.toPlaceId ?? undefined,
        tight: isTightConnection(from.type, minutes),
        type: from.type,
      };
    }
  }
  const gap = gapBetween(prev, next, ctx.tz);
  return gap ? { kind: 'gap', minutes: gap.minutes, free: gap } : null;
}

/** One row of the day, with whatever sits above it. */
export interface DayBlockEntry {
  entry: DayEntry;
  /** Its index in the merged list — what the now-line is placed against. */
  index: number;
  /** The join between the previous row and this one; absent on the first. */
  join?: DayJoin;
}

/** A run of rows drawn as one thing. `journey: true` means every entry after the first
 *  is joined by a connection, so the whole run renders inside one container with the
 *  bands between its legs — which is the design's answer to "a mark that sits between
 *  two cards has nothing to hold onto" (ADR-0159 §3). */
export interface DayBlock {
  entries: DayBlockEntry[];
  journey: boolean;
}

/**
 * Group the day's entries into blocks, computing each join once.
 *
 * **Adjacency is the same rule Plan uses for its gap chips**: joins are measured between
 * consecutive EVENT entries, and a leaf group at that — a cluster is two things at once,
 * so "the gap after it" is not a single fact, and a transition point (a hotel check-out
 * interleaved by instant, ADR-0064 §B) neither opens nor closes one. Anything that is
 * not a leaf event entry simply ends the current run and starts a new block.
 */
export function dayBlocks(entries: readonly DayEntry[], ctx: JoinContext): DayBlock[] {
  const blocks: DayBlock[] = [];
  let prevEnd: TripEvent | null = null;

  entries.forEach((entry, index) => {
    const leaf = entry.kind === 'event' && entry.group.kind !== 'cluster';
    const start = leaf ? groupStartEvent(entry.group) : null;
    const join = prevEnd && start ? (joinBetween(prevEnd, start, ctx) ?? undefined) : undefined;
    const last = blocks[blocks.length - 1];
    // A connection continues the block above it; everything else starts a new one.
    if (join?.kind === 'connection' && last && last.entries.length > 0) {
      last.journey = true;
      last.entries.push({ entry, index, join });
    } else {
      blocks.push({ entries: [{ entry, index, join }], journey: false });
    }
    prevEnd = entry.kind === 'event' ? groupEndEvent(entry.group) : null;
  });

  return blocks;
}

/** A place where one leg hands over to the next, on a given day. Two dates can name the
 *  same stop — an overnight connection arrives on one and leaves on the next — and both
 *  are true of it, so both are listed. */
export interface ConnectionStop {
  placeId: string;
  date: string;
  minutes: number;
  tight: boolean;
  type: BookingType;
}

/** The key a surface looks a stop up by: a place is only a connection **on the day the
 *  connection happens**. Without the date, an airport you change planes at on the way
 *  out would still claim to be a layover on the day you fly home from it. */
export const connectionStopKey = (placeId: string, date: string) => `${placeId}|${date}`;

/**
 * **Every connection stop in the trip**, from the same rule the day list draws its bands
 * from (`connectionMinutes`) — so the Map's pin, the Map's row and the day's band cannot
 * disagree about whether a place is a stop or where you are simply landing (ADR-0141's
 * property, extended by ADR-0159).
 *
 * O(n²) over bookings and deliberately so: a trip has a handful, and the alternative is
 * an index keyed by place that would have to be kept in step with two mutable lists.
 */
export function connectionStops(
  bookings: readonly Booking[],
  events: readonly TripEvent[],
  when: BookingWhen,
): ConnectionStop[] {
  // **THE DAY THE LEG ENDS, not the day it began** (2026-08-06). `dateOf` read the event's own
  // `date`, which for an overnight inbound leg is the day you took OFF — so a layover you sit
  // through at 02:00 was filed under the previous day, when you were at the origin airport. The
  // two dates this function means to list are named in its own doc ("arrives on one and leaves
  // on the next"): the **arrival** of the leg that brings you in, and the **departure** of the
  // one that takes you out. `routeEndpointDay` is the same rule `spanDays` and `placeRefs` read,
  // so a third derivation of "which day does this end happen on" cannot drift from the other two.
  const dateOf = (booking: Booking, edge: 'start' | 'end') => {
    const event = events.find((e) => e.bookingId === booking.id);
    return event ? routeEndpointDay(event, edge)?.date : undefined;
  };
  const stops: ConnectionStop[] = [];
  for (const from of bookings) {
    for (const to of bookings) {
      const minutes = connectionMinutes(from, to, when);
      if (minutes == null || !from.toPlaceId) continue;
      const dates = [
        ...new Set([dateOf(from, 'end'), dateOf(to, 'start')].filter(Boolean) as string[]),
      ];
      for (const date of dates) {
        stops.push({
          placeId: from.toPlaceId,
          date,
          minutes,
          tight: isTightConnection(from.type, minutes),
          type: from.type,
        });
      }
    }
  }
  return stops;
}
