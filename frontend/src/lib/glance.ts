// Day-at-a-glance rail model (ADR-0045 + the 2026-07-16 proportional rework).
// Pure and clock-driven: turns a day's events into a proportional timeline of
// top-level blocks over a window that runs 07:00→23:00 but stretches to the
// earliest/latest event (overnight ends included, ADR-0037 — never padded past
// the last event). Overlap/containment collapses to top-level roots
// (buildTimeTree, ADR-0041); full nesting/cluster fidelity stays in the day
// view. Skipped events are excluded from buildTimeTree, so they're layered back
// in as struck segments (never counted in "remaining").
import {
  CATEGORY_DEFAULT_ICON,
  EVENT_STATUS,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  type TripEvent,
} from '@waypoint/shared';
import { buildTimeTree, crossesMidnight, type TimeGroup, type TimeItem } from './time';

export type SegPhase = 'done' | 'passed' | 'now' | 'upcoming' | 'skipped';

export interface GlanceSeg {
  key: string;
  /** Position from the window start (earliest / the RTL right edge), 0..1. */
  startFrac: number;
  endFrac: number;
  phase: SegPhase;
  /** A cluster of peers or an envelope with nested children — drawn as one
   *  block with a layered cue + count. */
  composite: boolean;
  /** true = cluster ("×N" parallel); false = envelope ("כולל N" nested). */
  clusterLike: boolean;
  count: number;
  /** Whether the count chip has room to render. A too-narrow composite keeps
   *  only the layered cue (no number) so adjacent chips can't collide/overlap —
   *  the exact count is one tap away in the day view. */
  showCount: boolean;
  /** Zero-width event (no end) — rendered as a min-width tick. */
  point: boolean;
  /** End lands on the next calendar day (ADR-0037) — carries the "+1" marker. */
  nextDay: boolean;
}

/** A transition marker on the rail's dedicated upper lane (ADR-0054 amendment,
 *  rebased on ADR-0063): a bracketed event's start/end (check-in/check-out,
 *  departure/arrival) as an amber time-anchor chip. A marker is a *point* that
 *  happens in the day, not a counted block — an ambient hotel's markers stay
 *  uncounted; a flight's are edge markers on its counted block. */
export interface GlanceMarker {
  key: string;
  /** Position from the window start (0..1), same scale as the block segments. */
  frac: number;
  /** i18n transition key from the category profile (`checkIn`/`departure`…). */
  labelKey: string;
  /** The transition instant, for the mono time label. */
  timeMs: number;
  /** The event's own icon (or its category default) — the shared badge glyph. */
  icon: string;
  /** Stacking row (0 = nearest the bar). Markers whose chips would overlap are
   *  pushed to a higher lane so labels never collide — a departure + arrival a
   *  short flight apart can't smear into each other (ADR-0054 amendment). */
  lane: number;
}

export interface DayGlance {
  empty: boolean;
  windowStartMs: number;
  windowEndMs: number;
  segs: GlanceSeg[];
  /** Amber transition markers above the block bar (ADR-0054 amendment). */
  markers: GlanceMarker[];
  /** How many stacked lanes the markers occupy (0 when there are none) — the
   *  render sizes the marker lane from this. */
  markerLaneCount: number;
  /** Now's position in the window (0..1), or null when now is outside it
   *  (i.e. a past/future day being browsed). */
  nowFrac: number | null;
  /** Top-level blocks still ahead (now + upcoming); skipped/done/passed drop out. */
  remaining: number;
}

/** A composite's count chip renders only when its block spans at least this
 *  fraction of the rail — narrower composites drop the number (keeping the
 *  layered cue) so two short, close-by composites can't overlap chips. */
const MIN_COUNT_FRAC = 0.14;

/** Two transition-marker chips closer than this fraction of the rail would
 *  overlap, so the later one is pushed up a lane (stacked, not smeared). Sized
 *  a touch above a chip's own width so a departure + arrival a short flight
 *  apart always separate. */
const MARKER_MIN_GAP_FRAC = 0.28;

/** Stack markers (pre-sorted by frac) into lanes: each goes in the lowest lane
 *  whose last chip is at least a chip-width away, else a new lane. Returns the
 *  lane count. Pure and width-independent — the render only needs the lane index
 *  and total to size the marker band. */
function assignMarkerLanes(markers: GlanceMarker[]): number {
  const laneLastFrac: number[] = [];
  for (const m of markers) {
    let lane = 0;
    while (lane < laneLastFrac.length && m.frac - laneLastFrac[lane] < MARKER_MIN_GAP_FRAC) lane++;
    laneLastFrac[lane] = m.frac;
    m.lane = lane;
  }
  return laneLastFrac.length;
}

const startMsOf = (e: TripEvent) => Date.parse(e.startsAt!);
const endMsOf = (e: TripEvent) => (e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt!));

/** Ambient-span events (a hotel / multi-day booking) active on `date` — i.e.
 *  `event.date ≤ date ≤ event.endDate` (ADR-0054, rebased on ADR-0063). Rendered
 *  as a backdrop on every day they cover (check-in through check-out), not on the
 *  counted rail. Keyed on the category time-profile (`isAmbient`), not booking
 *  type, so any future ambient category gets the same treatment. Takes the full
 *  trip event list, since a stay shows on nights the event's own `date` doesn't
 *  match. */
export function ambientEventsOnDate(events: TripEvent[], date: string): TripEvent[] {
  return events.filter((e) => isAmbient(e) && e.date <= date && date <= e.endDate!);
}

/** A bracketed booking's transition landing on `date` (ADR-0064): its start
 *  (check-in / departure) when the event's own `date` is `date`, and/or its end
 *  (check-out / arrival) when `endDate ?? date` is `date`. The single shared
 *  derivation behind BOTH the Home glance markers and the day-screen transition
 *  entries, so the two can never diverge. Reads `isBracketed` + the event's
 *  `transitions` — by mode, not just category (ADR-0063); nothing is stored. */
export interface BookingTransition {
  event: TripEvent;
  edge: 'start' | 'end';
  /** The transition instant, in ms. */
  atMs: number;
  /** i18n transition key for this end, by mode (`checkIn`/`departure`/
   *  `flightDeparture`…), from `eventTransitionKeys`. */
  labelKey: string;
}

export function bookingTransitionsOnDate(events: TripEvent[], date: string): BookingTransition[] {
  const out: BookingTransition[] = [];
  for (const e of events) {
    if (!isBracketed(e) || e.category == null) continue;
    const trans = eventTransitionKeys(e);
    if (!trans) continue;
    if (e.date === date && e.startsAt) {
      out.push({ event: e, edge: 'start', atMs: Date.parse(e.startsAt), labelKey: trans.startKey });
    }
    if ((e.endDate ?? e.date) === date && e.endsAt) {
      out.push({ event: e, edge: 'end', atMs: Date.parse(e.endsAt), labelKey: trans.endKey });
    }
  }
  return out;
}

function itemEvents(item: TimeItem): TripEvent[] {
  return [item.event, ...item.children.flatMap(groupEvents)];
}
function groupEvents(g: TimeGroup): TripEvent[] {
  return g.kind === 'single' ? itemEvents(g.item) : g.items.flatMap(itemEvents);
}
function groupSpan(g: TimeGroup): [number, number] {
  if (g.kind === 'cluster') return [g.startMs, g.endMs];
  return [startMsOf(g.item.event), endMsOf(g.item.event)];
}
function groupKey(g: TimeGroup): string {
  return g.kind === 'single' ? g.item.event.id : g.items[0].event.id;
}

/** A block's single phase (ADR-0045 collapse rule): explicit all-done wins
 *  (green, like a single done event and the board's PLANNED-only "now");
 *  otherwise placed by the block's span against the clock. */
function groupPhase(g: TimeGroup, nowMs: number): SegPhase {
  if (groupEvents(g).every((e) => e.status === EVENT_STATUS.DONE)) return 'done';
  const [s, e] = groupSpan(g);
  if (nowMs >= s && nowMs < e) return 'now';
  if (e <= nowMs) return 'passed';
  return 'upcoming';
}

export function buildDayGlance(
  events: TripEvent[],
  activeDate: string,
  nowMs: number,
  day07Ms: number,
  day23Ms: number,
  timeZone: string,
): DayGlance {
  const dayEvents = events.filter((e) => e.date === activeDate);
  // Ambient-span events (a multi-day hotel — `isAmbient`, ADR-0063) are backdrop,
  // not counted blocks: they're excluded from the rail, the window math, and
  // "remaining", so a multi-night stay can't distort the day. An overnight tail
  // (ADR-0037, no `endDate`) stays an ordinary block.
  const sameDay = dayEvents.filter((e) => !isAmbient(e));
  const tree = buildTimeTree(sameDay); // excludes skipped + untimed
  const skipped = sameDay.filter((e) => e.status === EVENT_STATUS.SKIPPED && e.startsAt);
  const timed = sameDay.filter((e) => e.startsAt);

  // Transition markers are derived first so their instants can join the window
  // math below — an ambient booking's transition (an overnight flight's
  // departure/arrival, a hotel's check-in/out) contributes no counted block to
  // stretch the window, so without this a late-night marker would land past the
  // rail's edge and clip. A day is non-empty if it carries any of these too.
  const transitions = bookingTransitionsOnDate(events, activeDate);

  if (tree.length === 0 && skipped.length === 0 && transitions.length === 0) {
    return {
      empty: true,
      windowStartMs: day07Ms,
      windowEndMs: day23Ms,
      segs: [],
      markers: [],
      markerLaneCount: 0,
      nowFrac: null,
      remaining: 0,
    };
  }

  // Window: 07:00→23:00, stretched to the earliest start / latest end (ADR-0037
  // overnight ends included; skipped events count for the window so they stay
  // on-rail) and to every transition instant (so no marker falls off the rail).
  const transitionMs = transitions.map((tr) => tr.atMs);
  const windowStartMs = Math.min(day07Ms, ...timed.map(startMsOf), ...transitionMs);
  const windowEndMs = Math.max(day23Ms, ...timed.map(endMsOf), ...transitionMs);
  const span = windowEndMs - windowStartMs || 1;
  const frac = (t: number) => (t - windowStartMs) / span;
  const nextDayOf = (evs: TripEvent[]) =>
    evs.some((e) => e.endsAt != null && crossesMidnight(e.startsAt!, e.endsAt, timeZone));

  const segs: GlanceSeg[] = [];

  for (const g of tree) {
    const [s, e] = groupSpan(g);
    const evs = groupEvents(g);
    const composite = g.kind === 'cluster' || (g.kind === 'single' && g.item.children.length > 0);
    const clusterLike = g.kind === 'cluster';
    segs.push({
      key: groupKey(g),
      startFrac: frac(s),
      endFrac: frac(e),
      phase: groupPhase(g, nowMs),
      composite,
      clusterLike,
      count: clusterLike ? g.items.length : evs.length - 1,
      showCount: composite && frac(e) - frac(s) >= MIN_COUNT_FRAC,
      point: !composite && g.kind === 'single' && g.item.event.endsAt == null,
      nextDay: nextDayOf(evs),
    });
  }

  for (const e of skipped) {
    segs.push({
      key: e.id,
      startFrac: frac(startMsOf(e)),
      endFrac: frac(endMsOf(e)),
      phase: 'skipped',
      composite: false,
      clusterLike: false,
      count: 0,
      showCount: false,
      point: e.endsAt == null,
      nextDay: e.endsAt != null && crossesMidnight(e.startsAt!, e.endsAt, timeZone),
    });
  }

  const remaining = tree.filter((g) => {
    const p = groupPhase(g, nowMs);
    return p === 'now' || p === 'upcoming';
  }).length;

  // Transition markers (ADR-0054 amendment) derive from the one shared function
  // (ADR-0064) — every bracketed event's start/end that lands on this day: a
  // same-day flight's departure + arrival (edge markers on its counted block),
  // an ambient hotel's check-in / check-out (uncounted). Marking a transition
  // point is not counting a block; the ambient stay stays off the counted rail.
  const markers: GlanceMarker[] = transitions.map((tr) => ({
    key: `${tr.event.id}-${tr.edge === 'start' ? 's' : 'e'}`,
    frac: frac(tr.atMs),
    labelKey: tr.labelKey,
    timeMs: tr.atMs,
    icon:
      tr.event.icon ??
      (tr.event.category != null ? CATEGORY_DEFAULT_ICON[tr.event.category] : '📌'),
    lane: 0,
  }));
  markers.sort((a, b) => a.frac - b.frac);
  const markerLaneCount = assignMarkerLanes(markers);

  const nowFrac = nowMs >= windowStartMs && nowMs <= windowEndMs ? frac(nowMs) : null;

  return {
    empty: false,
    windowStartMs,
    windowEndMs,
    segs,
    markers,
    markerLaneCount,
    nowFrac,
    remaining,
  };
}
