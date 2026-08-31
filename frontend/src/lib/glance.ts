// Day-at-a-glance rail model (ADR-0045 + the 2026-07-16 proportional rework).
// Pure and clock-driven: turns a day's events into a proportional timeline of
// top-level blocks over a window that runs 07:00→23:00 but stretches to the
// earliest/latest event (overnight ends included, ADR-0037 — never padded past
// the last event). Overlap/containment collapses to top-level roots
// (buildTimeTree, ADR-0041); full nesting/cluster fidelity stays in the day
// view. Skipped events are excluded from buildTimeTree, so they're layered back
// in as struck segments (never counted in "remaining", never given an anchor).
// "remaining" counts same-day blocks plus an ambient span's own edges on this day
// (ADR-0164) — a stay's middle nights still count nothing.
import {
  CATEGORY_DEFAULT_ICON,
  edgeMeaning,
  windowBoundOf,
  EVENT_STATUS,
  eventDurationUnit,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  TIME_MEANING,
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
import { chosenIcon, DEFAULT_EVENT_ICON, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';

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
  /** **The event draws no block on the rail**, so a surface that wants the moment visible has
   *  to draw it itself (ADR-0215 §2). True exactly for an ambient span's own edge (a stay's
   *  check-in / check-out, a car's pick-up / return, ADR-0054): those are excluded from the
   *  counted rail while ADR-0164 still counts them in `remaining` — so dropping the pill
   *  without drawing the instant would have made a check-out vanish from a card whose number
   *  is still counting it. Resolved here because this is where both halves are known. */
  standalone: boolean;
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
  /** See {@link GlancePointAnchor.standalone}. A same-day bracket is on the rail, so this is
   *  false for every span the derivation can produce today; carried on both shapes so a
   *  consumer never has to ask which kind it is holding. */
  standalone: boolean;
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
  /** **A bracketed booking's transitions on this day** — the model ADR-0077 built to place amber
   *  pills above the rail, kept whole; what ADR-0215 withdrew is the PLACEMENT, not the facts.
   *  The Home rail now draws `standalone` anchors as ticks (`lib/glance-track.ts`) and the words,
   *  the times and each edge's own zone (ADR-0107) read on the day's rows, one tap away, where
   *  there is room for them. */
  anchors: GlanceAnchor[];
  /** Now's position in the window (0..1), or null when now is outside it
   *  (i.e. a past/future day being browsed). */
  nowFrac: number | null;
  /** **What you can still miss today** (ADR-0045, widened by ADR-0164): top-level blocks
   *  still now/upcoming — skipped/done/passed drop out — PLUS an ambient span's own edge
   *  landing today and not yet reached (a check-in, a check-out, a car's pick-up or
   *  return). A multi-day booking's MIDDLE days still count nothing. */
  remaining: number;
}

/** A composite's count chip renders only when its block spans at least this
 *  fraction of the rail — narrower composites drop the number (keeping the
 *  layered cue) so two short, close-by composites can't overlap chips. */
const MIN_COUNT_FRAC = 0.14;

/** An anchor's centre on the rail (0..1): a point is its instant; a span is the
 *  midpoint of its bar, where its pill sits. */
const anchorCenter = (a: GlanceAnchor): number =>
  a.kind === 'span' ? (a.startFrac + a.endFrac) / 2 : a.frac;

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

/** **Is this ambient span counted in nights** — i.e. is it a stay? (ADR-0163 §4.)
 *  Read off `eventDurationUnit`, so the answer comes from ADR-0162's profile rather
 *  than from a `category === 'lodging'` at a call site.
 *
 *  Exported because Home's mid-stay strip needs the same answer in a different shape:
 *  its markup is a mono fraction with a dismiss control, not this one string, and it
 *  also swaps a VERB — `שוהים ב־` is true of a hotel and false of a car. */
export const countsNights = (event: Pick<TripEvent, 'category' | 'icon'>): boolean =>
  eventDurationUnit(event) === 'nights';

/** **The stays that bracket a day** — the one you woke in and the one you sleep in
 *  (ADR-0054's 2026-08-25 amendment; ADR-0206 §AD). */
/** **An event's display glyph** — what the group chose, else its category's default, else the
 *  generic one. Lifted out of `buildDayGlance`'s own body when the tomorrow strip needed the
 *  same answer (ADR-0214): it was already the rule for a mark on a day surface, and a second
 *  copy at the new call site is how two surfaces start disagreeing about which glyph an event
 *  has. A placeholder pick counts as no pick, which is `chosenIcon`'s own rule. */
export const eventDisplayIcon = (e: TripEvent): string =>
  chosenIcon(e.icon) ??
  (e.category != null ? CATEGORY_DEFAULT_ICON[e.category] : DEFAULT_EVENT_ICON);

export interface DayBookendStays {
  /** The stay whose span began BEFORE this day, so you woke there. */
  woke?: TripEvent;
  /** The stay whose span runs PAST this day, so you sleep there. */
  sleeps?: TripEvent;
}

/**
 * **Which stays bookend `date`** — the two stops nobody schedules and everybody makes.
 *
 * Owner, off the shipped canvas: _"on most days you can infer for certain that you're gonna start
 * the day in a hotel and end in a hotel."_ ADR-0054's amendment made that the route's first and
 * last position; **this is the same fact for the day LIST**, which needs it for a different
 * reason: the day's journey blocks sit between two ROWS (ADR-0206 §V1.3), and the first row of a
 * mid-stay day has no row above it — so the walk out of the hotel is the one leg the list could
 * never draw (§AD, and §AE3 named it as the first thing M6a should reconcile).
 *
 * **Which end needs no third rule, exactly as it does not on the route:** the span covered last
 * night → you woke there; it covers tonight → you end there. A check-in day is `sleeps` only, a
 * check-out day `woke` only, a middle night both, and a day you change hotels gets A's and B's for
 * free because each answers about its own span.
 *
 * Both halves of the gate are load-bearing and neither is new here: `isAmbient` (through
 * `ambientEventsOnDate`) is what makes a stay backdrop rather than a stop, and `countsNights` is
 * what separates a hotel from a car hire — you sleep in one, so it brackets your day, and you
 * merely hold the other, so its pickup and return are ordinary stops at their own instants. Both
 * read ADR-0162's profile, so a future ambient category inherits the answer.
 *
 * **This is deliberately NOT a second copy of `map-pins.ts`'s `stayEnds`.** That one asks the
 * inverse question — _does THIS place's stay bookend the day_ — over a place's own moments, for a
 * sequence of stops; this one asks _which stay does_, for a leg. The rule they share is the two
 * comparisons plus `ambientEventsOnDate`, and it is shared. What holds them together is a spec:
 * `glance.test.ts` asserts the stay named here is the one `buildDayStopSequence` puts first, which
 * is a cheaper guard against drift than a refactor of a function two field reports have been fixed
 * inside (M7c).
 */
export function dayBookendStays(events: TripEvent[], date: string): DayBookendStays {
  const stays = ambientEventsOnDate(events, date).filter(countsNights);
  return {
    woke: stays.find((e) => e.date < date),
    sleeps: stays.find((e) => date < e.endDate!),
  };
}

/** **Where you are inside an ambient span, and how long the whole span is** — the
 *  `2` and the `4` of `לילה 2 מתוך 4` (ADR-0054 / ADR-0163).
 *
 *  **One derivation, and it used to be three.** `DayView`, `PlanDay` and `Home` each
 *  carried a hand-copied `stayNight`/`stayNights` pair with identical arithmetic — the
 *  shape ADR-0096 exists to stop, and it had to be collapsed before the phrase could
 *  take a per-type unit: three copies means three places to pass a unit through, and
 *  three chances for one of them to keep saying "night".
 *
 *  UTC-anchored `Date.parse` on the two YYYY-MM-DD strings, so a DST boundary inside
 *  the span cannot shift the count. The `total` floors at 1 (a same-day `endDate` is not
 *  an ambient span at all, but the arithmetic should not answer 0) and `position` is
 *  clamped to it, so a date outside the span cannot read `5 מתוך 4`. */
export function ambientSpanPosition(
  event: Pick<TripEvent, 'category' | 'icon' | 'date' | 'endDate'>,
  date: string,
): { position: number; total: number } {
  const spanDays = Math.round((Date.parse(event.endDate!) - Date.parse(event.date)) / MS_PER_DAY);
  // **NIGHTS are the gaps between the dates; DAYS are the dates themselves** (ADR-0163 §4's
  // 2026-08-04 amendment). A stay checked in on day 1 and out of on day 3 is TWO nights —
  // you slept twice — and a car collected on day 1 and returned on day 3 is THREE days,
  // because you have it on all three. The total was a night count for both, so a hire read
  // `יום 1 מתוך 2` for a three-day rental.
  //
  // The same inclusive count `formatBookingDuration` already makes for a date-only span
  // ("an all-day event across N calendar dates reads in those (inclusive) days"), which is
  // why the +1 belongs to the UNIT rather than to the caller.
  const total = Math.max(1, countsNights(event) ? spanDays : spanDays + 1);
  // Already inclusive and 1-based, so it needs no unit: day 1 of the span is `1` whether
  // you are counting the nights after it or the days it is one of.
  const position = Math.min(
    total,
    Math.max(1, Math.round((Date.parse(date) - Date.parse(event.date)) / MS_PER_DAY) + 1),
  );
  return { position, total };
}

/** The ambient strip's right-hand read-out, in the unit the event's own type reads in
 *  (ADR-0163 §4). `nights` for a stay — the traveller's unit, and a stay always crosses
 *  one — and days for everything else, which today means the car hire: you hold a car
 *  for days, and `לילה 2 מתוך 5` was lodging's word on a vehicle.
 *
 *  The unit comes from `eventDurationUnit`, i.e. from ADR-0162's profile tables, so this
 *  is not a second place deciding what a type is measured in. */
export function ambientSpanLabel(
  event: Pick<TripEvent, 'category' | 'icon' | 'date' | 'endDate'>,
  date: string,
): string {
  const { position, total } = ambientSpanPosition(event, date);
  return countsNights(event)
    ? t.glance.ambientNight(position, total)
    : t.glance.ambientDay(position, total);
}

/** A bracketed booking's transition landing on `date` (ADR-0064): its start
 *  (check-in / departure) when the event's own `date` is `date`, and/or its end
 *  (check-out / arrival) when `endDate ?? date` is `date`. The single shared
 *  derivation behind BOTH the Home glance markers and the day-screen transition
 *  entries, so the two can never diverge. Reads `isBracketed` + the event's
 *  `transitions` — by mode, not just category (ADR-0063); nothing is stored.
 *
 *  A **skipped** booking has no transitions: it is on the shelf, not on the day
 *  (ADR-0027 §2), and an amber pill is a statement of time & commitment
 *  (ADR-0028) that a skipped bus leg no longer makes. Filtered here, in the one
 *  shared derivation, so the glance's anchors and the day's transition rows drop
 *  it together. The skipped event keeps its struck *block* on the glance rail —
 *  that is ADR-0045's texture, and it is deliberately a different statement. */
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
    if (e.status === EVENT_STATUS.SKIPPED) continue;
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

  // **What is still ahead of you today** (ADR-0045), and it counts two different things
  // for one reason — a thing you can still miss (ADR-0164).
  //
  // The counted BLOCKS: top-level groups still now/upcoming, so overlaps never inflate the
  // day (ADR-0041) and a passed-unmarked event drops out.
  const remainingBlocks = tree.filter((g) => {
    const p = groupPhase(g, nowMs);
    return p === 'now' || p === 'upcoming';
  }).length;
  // …plus an AMBIENT span's own EDGE landing today and not yet reached: a check-in with
  // luggage, a check-out by 10:00, a car collected at 10:00 or due back at 10:00. ADR-0054
  // rightly keeps a multi-night stay off the counted rail so it cannot distort the day, and
  // ADR-0077 said "marking a transition is not counting a block" — but a day whose only real
  // commitment was returning the car read `0 נותרו היום`, which is the opposite of what this
  // number is for (owner report 2026-08-04). Middle days still count nothing, because
  // nothing about the room or the car needs doing on them.
  //
  // **`isAmbient` is the guard against double-counting**, not a hire-shaped special case: a
  // same-day flight is already a block in `tree` AND has anchors, so counting its
  // transitions too would say 2 for one journey. Only spans that were EXCLUDED above can
  // add themselves back here, and each edge is one thing to do.
  //
  // **A FLOOR PASSING IS NOT THE THING HAPPENING** (ADR-0171 §6). `t.atMs > nowMs` is
  // the right test for a deadline — at 11:01 a check-out is not pending, it is missed —
  // and the wrong one for a floor: 15:01 does not mean anybody has checked in. So a
  // `not-before` edge stays counted for the whole day and leaves the count the way it
  // was always going to leave it, by being settled. `bookingTransitionsOnDate` already
  // drops settled events, so that is not a second rule here.
  const remainingEdges = transitions.filter((t) => {
    if (!isAmbient(t.event)) return false;
    const meaning = edgeMeaning(t.event, t.edge);
    // A floor is still ahead of you until somebody says otherwise. `transitions` is
    // already scoped to `activeDate`, so "or the day ends" needs no condition — but
    // "settled" does: `bookingTransitionsOnDate` drops only SKIPPED, and a check-in you
    // have actually done is the whole reason this branch is settleable at all.
    if (meaning === TIME_MEANING.NOT_BEFORE) return t.event.status !== EVENT_STATUS.DONE;
    // **A WINDOW DOES expire, and that is the whole of what closing it buys** (ADR-0184
    // §6). This is the one branch that had to change here, and it is the one place in
    // the app that asked `edgeMeaning` for a specific FLEXIBLE value rather than testing
    // `exact` — so without it a windowed check-in fell into the clock test below against
    // its FLOOR, and stopped counting at 17:01 while its window ran to 21:00. The end
    // edge needs nothing: a check-out window's ceiling is the deadline it already had.
    if (meaning === TIME_MEANING.WINDOW && t.edge === 'start') {
      const shuts = windowBoundOf(t.event, t.edge);
      return t.event.status !== EVENT_STATUS.DONE && (!shuts || Date.parse(shuts) > nowMs);
    }
    return t.atMs > nowMs;
  }).length;
  const remaining = remainingBlocks + remainingEdges;

  // Time-anchors (ADR-0077) derive from the one shared function (ADR-0064) —
  // every bracketed booking's start/end that lands on this day, grouped by
  // event and paired: both edges today → a span (a same-day flight/ferry), a
  // single edge today → a point (a multi-day hotel's check-in / check-out).
  // Marking a transition is not counting a block; an ambient stay stays off the
  // counted rail.
  const iconOf = eventDisplayIcon;
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
        standalone: isAmbient(e),
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
        standalone: isAmbient(e),
        zone: edge?.zone,
        deltaMinutes: edge?.deltaMinutes,
      });
    }
  }
  anchors.sort((a, b) => anchorCenter(a) - anchorCenter(b));

  const nowFrac = nowMs >= windowStartMs && nowMs <= windowEndMs ? frac(nowMs) : null;

  return {
    empty: false,
    windowStartMs,
    windowEndMs,
    segs,
    anchors,
    nowFrac,
    remaining,
  };
}
