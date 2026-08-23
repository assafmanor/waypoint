// **The rail is a VIEW over `LegTimes[]`, not a replacement for it** (ADR-0203 §1/§3).
//
// `JourneyField` asks for one absolute date and a clock-plus-offset per moment; the form
// holds `LegTimes[]` — a `start` and an `end` per leg, each `YYYY-MM-DDTHH:MM`. This module
// is the conversion, in both directions, and it exists rather than the form changing shape
// for one reason: **everything downstream of the schedule reads legs.** `buildSpanSeed`, the
// per-end zone patches (ADR-0107), the note host (ADR-0154 §6), `legBooking`'s per-leg
// write, and every refusal name (ADR-0150) are all keyed to that array.
//
// The first attempt at this wiring replaced the state model instead of adapting to it, and
// failed 32 of `BookingSheet`'s 86 specs — most of them nothing to do with the rail. Keeping
// legs as the source of truth is what makes this a render change plus an adapter, which is
// what it should have been.
//
// **Days are not stored as offsets.** A leg keeps its absolute day, so the save path is
// untouched and a journey re-opened for an edit reads back correctly. The offset the rail
// shows is derived on read (`dayDiff` from the journey's date) and resolved on write.
import { addDays } from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';
import type { LegTimes } from './booking-draft';

const dayOf = (v: string) => v.split('T')[0] ?? '';
const timeOf = (v: string) => v.split('T')[1] ?? '';
const join = (day: string, time: string) => (day ? (time ? `${day}T${time}` : day) : '');

/** Whole-day difference, UTC-anchored so DST never shifts a calendar count. */
const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/** One moment as the rail reads it: the clock, and how many days after the journey's date. */
export interface MomentView {
  time: string;
  dayOffset: number;
}

/** The journey's date, and its moments in rail order: node 0's departure, then each later
 *  node's arrival and — for an interior node — its departure. */
export interface JourneyView {
  date: string;
  moments: MomentView[];
}

/**
 * **Legs → the rail's view.** The journey's date is its first departure's day; every moment
 * after it states its distance from that day (§2: offsets count from the journey's date,
 * never from the moment above).
 *
 * A leg with no day yet contributes offset 0, so a half-filled journey shows no invented
 * days — the same posture `resolveJourneyDays` takes for a moment with no clock.
 */
export function journeyViewOf(legs: LegTimes[]): JourneyView {
  const date = dayOf(legs[0]?.start ?? '');
  const offset = (v: string) => (date && dayOf(v) ? dayDiff(date, dayOf(v)) : 0);
  const moments: MomentView[] = [{ time: timeOf(legs[0]?.start ?? ''), dayOffset: 0 }];
  legs.forEach((leg, i) => {
    // Node i+1's arrival is this leg's end.
    moments.push({ time: timeOf(leg.end), dayOffset: offset(leg.end) });
    // An interior node also departs — on the NEXT leg's start.
    const next = legs[i + 1];
    if (next) moments.push({ time: timeOf(next.start), dayOffset: offset(next.start) });
  });
  return { date, moments };
}

/** Which leg endpoint a rail moment writes to. `node` is the rail's node index. */
const targetOf = (node: number, which: 'arrive' | 'depart') =>
  which === 'depart'
    ? ({ leg: node, edge: 'start' } as const)
    : ({ leg: node - 1, edge: 'end' } as const);

/**
 * **The rail's date → legs.** Moving the journey's date moves every moment with it, keeping
 * each one's offset — which is what makes one date the anchor rather than one of N.
 */
export function withJourneyDate(legs: LegTimes[], date: string): LegTimes[] {
  const before = journeyViewOf(legs);
  if (!before.date) {
    // Nothing to preserve relative to: the first departure simply gains the day, and any
    // clock already typed elsewhere keeps its own (absent) day rather than being invented.
    return legs.map((leg, i) => ({
      start: i === 0 ? join(date, timeOf(leg.start)) : leg.start,
      end: leg.end,
    }));
  }
  const shift = (v: string) =>
    dayOf(v) ? join(addDays(date, dayDiff(before.date, dayOf(v))), timeOf(v)) : v;
  return legs.map((leg) => ({ start: shift(leg.start), end: shift(leg.end) }));
}

/**
 * **One moment's clock → legs.** The day it lands on is the journey's date plus the offset
 * the caller resolved (`resolveJourneyDays`), so this module never decides a day either —
 * it only writes the one it is given.
 */
export function withMomentTime(
  legs: LegTimes[],
  node: number,
  which: 'arrive' | 'depart',
  time: string,
  dayOffset: number,
): LegTimes[] {
  const { date } = journeyViewOf(legs);
  const { leg, edge } = targetOf(node, which);
  if (leg < 0 || leg >= legs.length) return legs;
  // With no journey date yet a clock still lands: node 0's departure is what SETS the date,
  // and any other moment holds its clock until one exists (`join` keeps it dateless).
  const day = date ? addDays(date, dayOffset) : '';
  return legs.map((l, i) => (i === leg ? { ...l, [edge]: join(day, time) } : l));
}

/** **One moment's day offset → legs**, for the override token. Same write, the clock kept. */
export function withMomentDayOffset(
  legs: LegTimes[],
  node: number,
  which: 'arrive' | 'depart',
  dayOffset: number,
): LegTimes[] {
  const { date } = journeyViewOf(legs);
  const { leg, edge } = targetOf(node, which);
  if (!date || leg < 0 || leg >= legs.length) return legs;
  const current = legs[leg][edge];
  if (!timeOf(current)) return legs;
  return legs.map((l, i) =>
    i === leg ? { ...l, [edge]: join(addDays(date, dayOffset), timeOf(current)) } : l,
  );
}
