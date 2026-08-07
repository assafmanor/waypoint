// Day-timeline entries (ADR-0064 §B): a multi-day bracketed booking (a hotel, a
// red-eye flight) is ambient — off `dayEvents` — so on its edge days it would
// otherwise show nothing in the list. We interleave discrete, read-only
// *transition* points (check-in / check-out, departure / arrival) at their real
// clock time among the day's event groups, sorted by instant. We deliberately
// do NOT fabricate synthetic TripEvents (they'd leak into ripple / verbs /
// conflict / write paths); a typed derived entry keeps transitions read-only and
// honours "derive, never store" (ADR-0043/0054/0018). Same-day brackets are
// unchanged — they stay their single spanning event row (ADR-0064).
import { edgeMeaning, isJourney, isMultiDay, EVENT_KIND, type TripEvent } from '@waypoint/shared';
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

/** A row of the day that holds **no position in its sequence** (ADR-0171 §10a) — a
 *  span's edge whose time is a floor, or an event with no clock at all. Both carry
 *  their event, so both get the same affordances; what differs is only whether there
 *  is a word and a number to say. */
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
 *  **One derivation, two placements.** "Does this hold a position?" is asked once —
 *  a floor is open on the side you act, so it does not; a clockless event does not
 *  either. Then *where the unpositioned go* is decided by the axis that already
 *  exists: `hard` is a claim on your day and reads at the **top**, `soft` is spare
 *  capacity and reads in the **tail**.
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

/** **Where a deadline actually sits** (ADR-0171 §10b). A ceiling is closed on the side
 *  you act — "by 11:00" means before, full stop — so unlike a floor it can be
 *  intersected with the day's other hard bounds, and there is no reading of the data in
 *  which you check out after you have flown.
 *
 *  So: the earlier of the ceiling and the first **journey** that leaves before it. Two
 *  hard bounds, the earlier wins, and nothing is guessed — with nothing to intersect
 *  against it does not move, which is the test §4 failed from the other side. */
function deadlineAt(ceilingMs: number, groups: TimeGroup[]): number {
  const departures = groups
    .filter((g) => isJourney(groupStartEvent(g)))
    .map(groupStartMs)
    .filter((ms) => ms < ceilingMs);
  return departures.length > 0 ? Math.min(...departures) : ceilingMs;
}

/**
 * Split the day's merged entries and its clockless events into the three placements.
 *
 * Runs **before** the join derivation, and that ordering is load-bearing: `dayBlocks`
 * ends a run on anything that is not a leaf event entry, so a check-in sitting between
 * two flights used to suppress the join between them entirely — no gap and no
 * connection band could be derived for that window at all. Taking it out of the list is
 * what lets those two rows be measured against each other for the first time.
 */
export function placeDayEntries(
  merged: DayEntry[],
  untimed: readonly TripEvent[],
  groups: TimeGroup[],
): DayPlacement {
  const placement: DayPlacement = { positioned: [], commitments: [], ideas: [] };
  const park = (row: UnplacedRow) =>
    (row.event.kind === EVENT_KIND.HARD ? placement.commitments : placement.ideas).push(row);
  // A deadline pinned to a departure has to read BEFORE it — "be out by then" is the
  // whole claim. `mergeDayEntries` puts an event group first at a shared instant, which
  // is right for every other transition and backwards for exactly this one.
  const pinned = new WeakSet<DayEntry>();

  for (const entry of merged) {
    if (entry.kind !== 'transition') {
      placement.positioned.push(entry);
      continue;
    }
    const meaning = edgeMeaning(entry.event, entry.edge);
    if (meaning === 'not-before') {
      park({ event: entry.event, labelKey: entry.labelKey, edge: entry.edge, atMs: entry.atMs });
      continue;
    }
    if (meaning !== 'not-after') {
      placement.positioned.push(entry);
      continue;
    }
    const atMs = deadlineAt(entry.atMs, groups);
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
