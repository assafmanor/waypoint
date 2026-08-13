// Day-timeline entries (ADR-0064 §B): a multi-day bracketed booking (a hotel, a
// red-eye flight) is ambient — off `dayEvents` — so on its edge days it would
// otherwise show nothing in the list. We interleave discrete, read-only
// *transition* points (check-in / check-out, departure / arrival) at their real
// clock time among the day's event groups, sorted by instant. We deliberately
// do NOT fabricate synthetic TripEvents (they'd leak into ripple / verbs /
// conflict / write paths); a typed derived entry keeps transitions read-only and
// honours "derive, never store" (ADR-0043/0054/0018). Same-day brackets are
// unchanged — they stay their single spanning event row (ADR-0064).
import {
  edgeMeaning,
  eventMidSpan,
  isAmbient,
  isJourney,
  isMultiDay,
  EVENT_KIND,
  type TripEvent,
} from '@waypoint/shared';
import { bookingTransitionsOnDate, type BookingTransition } from './glance';
import type { TimeGroup, TimeItem } from './time';

/** The events a group holds — one, or a cluster's several (ADR-0041). */
export const groupMembers = (g: TimeGroup): TimeItem[] =>
  g.kind === 'cluster' ? g.items : [g.item];
const startMsOf = (e: TripEvent) => Date.parse(e.startsAt!);
const endMsOf = (e: TripEvent) => Date.parse(e.endsAt ?? e.startsAt!);
/** The member a group STARTS with, and the one it ENDS with — which is what anything
 *  measuring the space between two groups has to ask (a gap, a connection). Written
 *  once in `PlanDay` while it was the only surface measuring that space; moved here
 *  when the Day view began measuring it too (root rule 8: generalise the one-off). */
export const groupStartEvent = (g: TimeGroup): TripEvent =>
  groupMembers(g).reduce((a, b) => (startMsOf(b.event) < startMsOf(a.event) ? b : a)).event;
export const groupEndEvent = (g: TimeGroup): TripEvent =>
  groupMembers(g).reduce((a, b) => (endMsOf(b.event) > endMsOf(a.event) ? b : a)).event;

export type DayEntry =
  | { kind: 'event'; group: TimeGroup; atMs: number }
  | { kind: 'transition'; event: TripEvent; edge: 'start' | 'end'; atMs: number; labelKey: string };

export type TransitionEntry = Extract<DayEntry, { kind: 'transition' }>;

/** A top-level group's start instant — the key it sorts by against a transition
 *  point. Groups from `buildTimeTree` are always timed (untimed events are
 *  excluded), so `startsAt` is present. */
function groupStartMs(g: TimeGroup): number {
  return g.kind === 'cluster' ? g.startMs : Date.parse(g.item.event.startsAt!);
}

/** The transition points to interleave on `activeDate`: the shared derivation
 *  (`bookingTransitionsOnDate`) narrowed to MULTI-DAY brackets. A same-day
 *  bracket keeps its single span row and gets no transition rows (ADR-0064). */
export function dayTransitions(events: TripEvent[], activeDate: string): BookingTransition[] {
  return bookingTransitionsOnDate(events, activeDate).filter((tr) => isMultiDay(tr.event));
}

/** The transition entry a given stay has in TODAY's placed list, if any. The ambient strip
 *  reads this so it can say the edge (`צ׳ק-אאוט · עד 09:40`) instead of the day count, and so
 *  the strip and the row below it read ONE derivation — the entry's clock is the one `edgeAt`
 *  bounded, which is not the authored one. */
export function edgeEntryOf(
  positioned: readonly DayEntry[],
  eventId: string,
): TransitionEntry | undefined {
  return positioned.find(
    (e): e is TransitionEntry => e.kind === 'transition' && e.event.id === eventId,
  );
}

/** **The ambient-span stays covering `date`, edges INCLUDED** (owner, 2026-08-13, amending
 *  ADR-0064 §C): the strip above the list, on every day of a stay rather than only its
 *  strictly-middle nights. The strip and the edge row answer different questions — where you
 *  are sleeping tonight, versus what you do at 15:00 — so showing both is not showing the
 *  stay twice, which is what the old restriction was avoiding at the cost of a hotel
 *  vanishing from the top of its own first and last day.
 *
 *  Shared rather than inlined because both day screens read it, and a day-surface
 *  derivation changed in `DayView` only has cost a release twice (ADR-0171 §10e). */
export function staysOnDate(events: readonly TripEvent[], date: string): TripEvent[] {
  return events.filter((e) => isAmbient(e) && e.date <= date && date <= (e.endDate ?? e.date));
}

/** Merge the day's top-level event groups with the transition points, ordered by
 *  instant. Points have no span, so they never enter the concurrency forest
 *  (`buildTimeTree`, ADR-0041) — they sort in by time only. A stable sort keeps
 *  an event group before a transition sharing the same instant. */
export function mergeDayEntries(groups: TimeGroup[], transitions: BookingTransition[]): DayEntry[] {
  const entries: DayEntry[] = [
    ...groups.map((group): DayEntry => ({ kind: 'event', group, atMs: groupStartMs(group) })),
    ...transitions.map((tr): DayEntry => ({ kind: 'transition', ...tr })),
  ];
  return entries.sort((a, b) => a.atMs - b.atMs);
}

/** A row of the day that holds **no position in its sequence** (ADR-0171 §10a) — which
 *  since ADR-0184's 2026-08-13 amendment means an event with **no clock at all**, and
 *  nothing else. A span's edge always has one bound to place it by, so it stays in the
 *  list. The three optional fields are what an edge used to fill; `UnplacedCommitment`
 *  still renders them, so nothing here forbids parking one again. */
export interface UnplacedRow {
  event: TripEvent;
  /** The transition word, when this row is a span's edge (`checkIn`). Absent when the
   *  event simply has no time. */
  labelKey?: string;
  /** Which end this is — what `edgeMeaning` was asked about. */
  edge?: 'start' | 'end';
  /** The floor instant, when there is one to print (`מ-15:00`). */
  atMs?: number;
}

/** The day, split three ways (ADR-0171 §10a/§10a-i).
 *
 *  **One derivation, two placements.** "Does this hold a position?" is asked once, and
 *  since ADR-0184's 2026-08-13 amendment only a clockless event answers no — a span's
 *  edge has a bound, and `edgeAt` places it somewhere it can defend. Then *where the
 *  unpositioned go* is decided by the axis that already exists: `hard` is a claim on your
 *  day and reads at the **top**, `soft` is spare capacity and reads in the **tail**.
 *
 *  Collapsing those two into one list was this design's own first answer and it is
 *  the thing ADR-0011 forbids: a real commitment buried under an optional errand. */
export interface DayPlacement {
  /** The ordered list — everything that names a position it can defend. */
  positioned: DayEntry[];
  /** Unpositioned **commitments**: the strip above the list. */
  commitments: UnplacedRow[];
  /** Unpositioned **ideas**: the tail below it, under one line. */
  ideas: UnplacedRow[];
}

/** **Where a flexible edge actually sits** (ADR-0171 §10b, both ends since ADR-0184's
 *  2026-08-13 amendment). A floor and a ceiling are both intersected with the day's other
 *  hard facts, because a row that names a position has to name one it can defend — a
 *  check-in reading above the flight that brought you is the same defect as a check-out
 *  reading below the flight that took you away.
 *
 *  Two clauses, different in kind:
 *
 *  - **A hard event you are INSIDE bounds either end.** You cannot check in while you are
 *    on the train, and you cannot still be in the room once you are somewhere else. Any
 *    hard event whose span overlaps the bound, not journeys only (owner, 2026-08-13:
 *    _"it could be any hard event (train or anything really)"_) — **except a `held` one,
 *    which is the distinction ADR-0063's profile already draws and the existing test for
 *    §10b already defended.** Being carried along a leg or standing in a museum occupies
 *    you; merely HOLDING a car from 09:00 does not, so a hire spanning the check-out
 *    deadline must not drag it to the counter's opening time.
 *  - **A JOURNEY bounds the edge from OUTSIDE its own span**, because it is what moves you
 *    between places: a departure before the ceiling means you were out by then whatever the
 *    hotel's deadline says, and a landing after the floor means you were not there to check
 *    in before it. Overlap alone is not enough here and the reported case proves it — the
 *    flight sorted under a 15:00 check-in DEPARTED at 15:30, so nothing straddled anything.
 *
 *  **THE KNOWN COST, and it is the owner's own gotcha rather than a discovery:** the second
 *  clause reads a landing as "you have arrived HERE", and only the place graph knows whether
 *  a leg relocated you. A same-day round trip returning at 18:00 therefore pushes a 10:00
 *  check-in to 18:00, though you could have dropped your bags before leaving. That is
 *  accepted deliberately, because the failure it replaces is worse and not symmetric: a
 *  floor above the flight that brings you reads as "check into your Iceland hotel, then fly
 *  to Iceland", where the round-trip case merely reads late. Comparing a leg's endpoint to
 *  the stay's is not the fix it looks like — a flight lands at an airport and the hotel is
 *  in a city, so the ids never match and city-level grouping does not exist here.
 *
 *  ponytail: one pass, not a fixpoint. Back-to-back hard events could bound it further;
 *  every case that prompted this is a single hop. */
function edgeAt(atMs: number, edge: 'start' | 'end', groups: TimeGroup[]): number {
  const inside = groups
    .flatMap(groupMembers)
    .map((item) => item.event)
    .filter(
      (e) =>
        e.kind === EVENT_KIND.HARD &&
        eventMidSpan(e)?.kind !== 'held' &&
        startMsOf(e) < atMs &&
        endMsOf(e) > atMs,
    );
  const legs = groups.filter((g) => isJourney(groupStartEvent(g)));
  if (edge === 'start') {
    const landings = legs.map((g) => endMsOf(groupEndEvent(g))).filter((endMs) => endMs > atMs);
    return Math.max(atMs, ...landings, ...inside.map(endMsOf));
  }
  const departures = legs.map(groupStartMs).filter((ms) => ms < atMs);
  return Math.min(atMs, ...departures, ...inside.map(startMsOf));
}

/**
 * Split the day's merged entries and its clockless events into the three placements.
 *
 * Runs **before** the join derivation, and that ordering is load-bearing: `dayBlocks`
 * ends a run on anything that is not a leaf event entry, so a check-in sitting between
 * two flights used to suppress the join between them entirely — no gap and no
 * connection band could be derived for that window at all. That half of the fix now
 * rests entirely on `day-joins.ts`'s own rule (a FLEXIBLE edge is transparent to the
 * measurement), because a floor no longer leaves the list to help: every edge is
 * positioned here, and only an `exact` one ends a run.
 */
export function placeDayEntries(
  merged: DayEntry[],
  untimed: readonly TripEvent[],
  groups: TimeGroup[],
): DayPlacement {
  const placement: DayPlacement = { positioned: [], commitments: [], ideas: [] };
  const park = (row: UnplacedRow) =>
    (row.event.kind === EVENT_KIND.HARD ? placement.commitments : placement.ideas).push(row);
  // An edge pinned to a hard fact has to read on the near side of it — "be out by then"
  // is the whole claim of a deadline, and a check-in pushed to a landing reads once you
  // are there. `mergeDayEntries` puts an event group first at a shared instant, which is
  // right for every unmoved transition and backwards for exactly these.
  const pinned = new WeakSet<DayEntry>();

  for (const entry of merged) {
    if (entry.kind !== 'transition') {
      placement.positioned.push(entry);
      continue;
    }
    // **EVERY edge holds a position** (owner, 2026-08-13, reversing ADR-0171 §10a and
    // ADR-0184 §4 for span edges): the row reads in the list at the instant the day's
    // hard facts allow, and the stay's own ambient line above it says the room is yours
    // all day regardless. The split those two ADRs made — floor to the strip, window to
    // the list — was one hotel reading two different ways depending on whether a second
    // number had been typed.
    //
    // An `exact` edge IS its instant and is never moved; a floor or a ceiling is placed
    // where `edgeAt` can defend it. The strip now holds only what has no clock at all.
    const atMs =
      edgeMeaning(entry.event, entry.edge) === 'exact'
        ? entry.atMs
        : edgeAt(entry.atMs, entry.edge, groups);
    const moved: DayEntry = { ...entry, atMs };
    if (atMs !== entry.atMs) pinned.add(moved);
    placement.positioned.push(moved);
  }
  // A deadline may have moved above a row it was below, so the list is re-ordered
  // rather than assumed sorted. Everything else kept the instant it arrived with, and
  // the sort is stable, so nothing else changes relative order.
  placement.positioned.sort(
    (a, b) => a.atMs - b.atMs || Number(pinned.has(b)) - Number(pinned.has(a)),
  );

  for (const event of untimed) park({ event });
  return placement;
}
