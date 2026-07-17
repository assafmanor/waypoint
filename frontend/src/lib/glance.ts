// Day-at-a-glance rail model (ADR-0045 + the 2026-07-16 proportional rework).
// Pure and clock-driven: turns a day's events into a proportional timeline of
// top-level blocks over a window that runs 07:00→23:00 but stretches to the
// earliest/latest event (overnight ends included, ADR-0037 — never padded past
// the last event). Overlap/containment collapses to top-level roots
// (buildTimeTree, ADR-0041); full nesting/cluster fidelity stays in the day
// view. Skipped events are excluded from buildTimeTree, so they're layered back
// in as struck segments (never counted in "remaining").
import { EVENT_STATUS, type TripEvent } from '@waypoint/shared';
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

export interface DayGlance {
  empty: boolean;
  windowStartMs: number;
  windowEndMs: number;
  segs: GlanceSeg[];
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

const startMsOf = (e: TripEvent) => Date.parse(e.startsAt!);
const endMsOf = (e: TripEvent) => (e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt!));

/** Ambient-span events (a hotel / multi-day booking) active on `date` — i.e.
 *  `event.date ≤ date ≤ event.endDate` (ADR-0054). Rendered as a backdrop on
 *  every day they cover (check-in through check-out), not on the counted rail.
 *  Keyed on `endDate` (the multi-day property), not on booking type, so any
 *  future multi-day span gets the same treatment. Takes the full trip event list,
 *  since a stay shows on nights the event's own `date` doesn't match. */
export function ambientEventsOnDate(events: TripEvent[], date: string): TripEvent[] {
  return events.filter((e) => e.endDate != null && e.date <= date && date <= e.endDate);
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
  dayEvents: TripEvent[],
  nowMs: number,
  day07Ms: number,
  day23Ms: number,
  timeZone: string,
): DayGlance {
  // Ambient-span events (a hotel / multi-day booking, `endDate` set — ADR-0054)
  // are backdrop, not counted blocks: they're excluded from the rail, the window
  // math, and "remaining", so a multi-night stay can't distort the day. An
  // overnight tail (ADR-0037, no `endDate`) stays an ordinary block.
  const sameDay = dayEvents.filter((e) => !e.endDate);
  const tree = buildTimeTree(sameDay); // excludes skipped + untimed
  const skipped = sameDay.filter((e) => e.status === EVENT_STATUS.SKIPPED && e.startsAt);
  const timed = sameDay.filter((e) => e.startsAt);

  if (tree.length === 0 && skipped.length === 0) {
    return {
      empty: true,
      windowStartMs: day07Ms,
      windowEndMs: day23Ms,
      segs: [],
      nowFrac: null,
      remaining: 0,
    };
  }

  // Window: 07:00→23:00, stretched to the earliest start / latest end (ADR-0037
  // overnight ends included; skipped events count for the window so they stay on-rail).
  const windowStartMs = Math.min(day07Ms, ...timed.map(startMsOf));
  const windowEndMs = Math.max(day23Ms, ...timed.map(endMsOf));
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

  const nowFrac = nowMs >= windowStartMs && nowMs <= windowEndMs ? frac(nowMs) : null;

  return { empty: false, windowStartMs, windowEndMs, segs, nowFrac, remaining };
}
