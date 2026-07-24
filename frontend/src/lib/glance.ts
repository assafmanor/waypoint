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
import {
  buildTimeTree,
  crossesMidnight,
  crossesMidnightZoned,
  type TimeGroup,
  type TimeItem,
} from './time';
import { eventEdgeZone, eventZones, type EventZones, type ZoneContext } from './places';

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
  /** This block is a same-day bracketed booking also drawn as a span anchor
   *  above (ADR-0077): tint it amber to tie block↔span, and let the span pill
   *  own the "+1" so it isn't shown twice. */
  spanned: boolean;
}

/** A time-anchor above the block bar (ADR-0077): a bracketed booking's
 *  transition(s) that land on the day, amber = time & commitment (ADR-0028).
 *  Two shapes share the amber pill primitive, differing only by connector:
 *   - a `point` (single instant, stem) — one edge lands today (a multi-day
 *     hotel's check-in / check-out; a bracket whose other end is another day);
 *     it carries the transition *word* (no partner edge to imply direction).
 *   - a `span` (two instants, a bar + feet) — both edges land today (a same-day
 *     flight / ferry); it carries icon + range, order implying dep/arr. */
export interface GlancePointAnchor {
  kind: 'point';
  key: string;
  /** Position from the window start (0..1), same scale as the block segments. */
  frac: number;
  /** i18n transition key from the category profile (`checkIn`/`departure`…). */
  labelKey: string;
  /** The transition instant, for the mono time label. */
  timeMs: number;
  /** The event's own icon (or its category default) — the shared badge glyph. */
  icon: string;
  /** Stacking row (0 = nearest the bar). Anchors whose pills would overlap are
   *  pushed to a higher lane so labels never collide (ADR-0077). */
  lane: number;
  /** This edge's display zone (ADR-0107) — a departure reads its origin zone, an
   *  arrival its destination. Absent when the caller passed no zone context; the
   *  render then falls back to the card's base zone, exactly as before. */
  zone?: string;
  /** That zone vs the day's ambient → the amber shift pill. Absent = no pill. */
  deltaMinutes?: number;
}
export interface GlanceSpanAnchor {
  kind: 'span';
  key: string;
  /** The two edges' positions from the window start (0..1). */
  startFrac: number;
  endFrac: number;
  /** The two transition instants, for the mono time labels in the pill. */
  startMs: number;
  endMs: number;
  /** i18n keys for the two edges — not rendered by default (order implies
   *  direction; ADR-0077 keeps span words off), kept so a start-edge word is a
   *  one-line addition if testing wants it. */
  startLabelKey: string;
  endLabelKey: string;
  icon: string;
  /** The arrival crosses midnight (ADR-0037) — the pill carries the "+1". With
   *  zones resolved this is the **zoned** crossing (each end on its own clock),
   *  so an eastbound overnight flight isn't marked "+1" when it lands the same
   *  local day (ADR-0107). */
  nextDay: boolean;
  lane: number;
  /** Both ends' display zones + the shift between them (ADR-0107): a same-day
   *  zone-crossing flight renders its departure in the origin's clock and its
   *  arrival in the destination's, with the delta as a pill. Absent when the
   *  caller passed no zone context. */
  zones?: EventZones;
}
export type GlanceAnchor = GlancePointAnchor | GlanceSpanAnchor;

export interface DayGlance {
  empty: boolean;
  windowStartMs: number;
  windowEndMs: number;
  segs: GlanceSeg[];
  /** Amber time-anchors above the block bar (ADR-0077) — spans + points. */
  anchors: GlanceAnchor[];
  /** How many stacked lanes the anchors occupy (0 when there are none) — the
   *  render sizes the anchor band from this. */
  anchorLaneCount: number;
  /** The anchor band would exceed `MAX_ANCHOR_LANES` (a crowded first/last trip
   *  day): the render collapses the positioned anchors to a flow "legs line"
   *  below the rail instead, where overlap is impossible (ADR-0077 §D). */
  anchorsCollapsed: boolean;
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

/** Two anchor pills whose centres are closer than this fraction of the rail
 *  would overlap, so the later one is pushed up a lane (stacked, not smeared) —
 *  and past `MAX_ANCHOR_LANES` the whole band collapses to the legs line. This
 *  is what makes "would cover another" the real collapse trigger, so it has to
 *  match a real pill's width, not undershoot it. Sized to the phone (mobile-
 *  first, ADR-0017): a heavy pill (icon + Hebrew word + mono time, or icon +
 *  two times + arrow) is ~116px, and the glance rail is ~320px inside the card
 *  at a 360px viewport → ~0.36. The old 0.28 undershot this, so two pills that
 *  actually overlapped still shared a lane and smeared (ADR-0077). */
const MARKER_MIN_GAP_FRAC = 0.36;

/** Past this many anchor lanes the band is too tall for a glance, so the render
 *  collapses to the flow legs line instead (ADR-0077 §D). */
const MAX_ANCHOR_LANES = 2;

/** An anchor's centre on the rail (0..1): a point is its instant; a span is the
 *  midpoint of its bar, where its pill sits. */
const anchorCenter = (a: GlanceAnchor): number =>
  a.kind === 'span' ? (a.startFrac + a.endFrac) / 2 : a.frac;

/** Stack anchors (pre-sorted by centre) into lanes: each goes in the lowest lane
 *  whose last pill centre is at least a pill-width away, else a new lane. Mutates
 *  `lane` and returns the lane count. Pure and width-independent — the render only
 *  needs the lane index and total to size the band. */
function assignAnchorLanes(anchors: GlanceAnchor[]): number {
  const laneLastCenter: number[] = [];
  for (const a of anchors) {
    const c = anchorCenter(a);
    let lane = 0;
    while (lane < laneLastCenter.length && c - laneLastCenter[lane] < MARKER_MIN_GAP_FRAC) lane++;
    laneLastCenter[lane] = c;
    a.lane = lane;
  }
  return laneLastCenter.length;
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
  /** Multi-zone context (ADR-0107). Passed → each anchor carries its own
   *  display zone(s) + shift, so the rail's pills read like the day timeline's
   *  rows. Omitted → the whole card renders in `timeZone`, as before. */
  zoneCtx?: ZoneContext,
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
      anchors: [],
      anchorLaneCount: 0,
      anchorsCollapsed: false,
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

  // A same-day bracket contributes two transitions on this day → it is drawn as
  // a span anchor above, so its counted block is tinted + yields the "+1" to the
  // pill (ADR-0077). Events with a single transition today (a multi-day hotel's
  // one edge) are points, not spans.
  const transitionsByEvent = new Map<string, number>();
  for (const tr of transitions)
    transitionsByEvent.set(tr.event.id, (transitionsByEvent.get(tr.event.id) ?? 0) + 1);
  const isSpanEvent = (id: string) => (transitionsByEvent.get(id) ?? 0) >= 2;

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
      spanned: g.kind === 'single' && isSpanEvent(g.item.event.id),
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
      spanned: false,
    });
  }

  const remaining = tree.filter((g) => {
    const p = groupPhase(g, nowMs);
    return p === 'now' || p === 'upcoming';
  }).length;

  // Time-anchors (ADR-0077) derive from the one shared function (ADR-0064) —
  // every bracketed booking's start/end that lands on this day, grouped by
  // event and paired: both edges today → a span (a same-day flight/ferry), a
  // single edge today → a point (a multi-day hotel's check-in / check-out).
  // Marking a transition is not counting a block; an ambient stay stays off the
  // counted rail.
  const iconOf = (e: TripEvent) =>
    e.icon ?? (e.category != null ? CATEGORY_DEFAULT_ICON[e.category] : '📌');
  const byEvent = new Map<string, BookingTransition[]>();
  for (const tr of transitions) {
    const list = byEvent.get(tr.event.id);
    if (list) list.push(tr);
    else byEvent.set(tr.event.id, [tr]);
  }
  const anchors: GlanceAnchor[] = [];
  for (const trs of byEvent.values()) {
    const e = trs[0].event;
    if (trs.length >= 2) {
      const start = trs.find((tr) => tr.edge === 'start') ?? trs[0];
      const end = trs.find((tr) => tr.edge === 'end') ?? trs[1];
      const zones = zoneCtx ? eventZones(e, zoneCtx) : undefined;
      anchors.push({
        kind: 'span',
        key: e.id,
        startFrac: frac(start.atMs),
        endFrac: frac(end.atMs),
        startMs: start.atMs,
        endMs: end.atMs,
        startLabelKey: start.labelKey,
        endLabelKey: end.labelKey,
        icon: iconOf(e),
        nextDay:
          e.startsAt != null &&
          e.endsAt != null &&
          (zones
            ? crossesMidnightZoned(e.startsAt, e.endsAt, zones.startZone, zones.endZone)
            : crossesMidnight(e.startsAt, e.endsAt, timeZone)),
        lane: 0,
        zones,
      });
    } else {
      const tr = trs[0];
      const edge = zoneCtx ? eventEdgeZone(e, tr.edge, zoneCtx) : undefined;
      anchors.push({
        kind: 'point',
        key: `${e.id}-${tr.edge === 'start' ? 's' : 'e'}`,
        frac: frac(tr.atMs),
        labelKey: tr.labelKey,
        timeMs: tr.atMs,
        icon: iconOf(e),
        lane: 0,
        zone: edge?.zone,
        deltaMinutes: edge?.deltaMinutes,
      });
    }
  }
  anchors.sort((a, b) => anchorCenter(a) - anchorCenter(b));
  const anchorLaneCount = assignAnchorLanes(anchors);
  const anchorsCollapsed = anchorLaneCount > MAX_ANCHOR_LANES;

  const nowFrac = nowMs >= windowStartMs && nowMs <= windowEndMs ? frac(nowMs) : null;

  return {
    empty: false,
    windowStartMs,
    windowEndMs,
    segs,
    anchors,
    anchorLaneCount,
    anchorsCollapsed,
    nowFrac,
    remaining,
  };
}
