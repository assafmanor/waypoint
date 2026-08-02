// Day-timeline entries (ADR-0064 §B): a multi-day bracketed booking (a hotel, a
// red-eye flight) is ambient — off `dayEvents` — so on its edge days it would
// otherwise show nothing in the list. We interleave discrete, read-only
// *transition* points (check-in / check-out, departure / arrival) at their real
// clock time among the day's event groups, sorted by instant. We deliberately
// do NOT fabricate synthetic TripEvents (they'd leak into ripple / verbs /
// conflict / write paths); a typed derived entry keeps transitions read-only and
// honours "derive, never store" (ADR-0043/0054/0018). Same-day brackets are
// unchanged — they stay their single spanning event row (ADR-0064).
import { isMultiDay, type TripEvent } from '@waypoint/shared';
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
