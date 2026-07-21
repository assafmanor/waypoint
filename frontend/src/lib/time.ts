// Trip-timezone formatting + client-side "now" derivation.
// "Now" is never stored (ADR-0018) — it's computed from event startsAt/endsAt vs the clock.
import { EVENT_KIND, EVENT_STATUS, eventEndBoundary, type TripEvent } from '@waypoint/shared';
import {
  COUNTDOWN_MONTHS_THRESHOLD,
  DAY_WINDOW,
  DAYS_PER_MONTH,
  MINUTES_PER_HOUR,
  MINUTES_PER_DAY,
} from '../constants';
import { dayCount, dayPhrase, monthCount } from './hebrew';

/** "Today" in a specific timezone as YYYY-MM-DD — the trip's own calendar day,
 *  not the browser's (mirrors backend/prisma/seed.mjs's todayInTz). `at` is
 *  required (no `new Date()` default, ADR-0026): callers must source it from
 *  `useClock()`/`getNow()` so dev time-travel stays authoritative everywhere. */
export function todayInTz(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/** Add whole days to a YYYY-MM-DD date string. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Clamp a YYYY-MM-DD date string into [min, max] — lexical compare is valid
 *  since ISO date strings sort chronologically. */
export function clampDate(date: string, min: string, max: string): string {
  return date < min ? min : date > max ? max : date;
}

const monthAbbrev = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });

/** Month label for a day-strip pill: shown only on the first pill (no
 *  `prevDate`) and the first pill after a month rollover — null otherwise. */
export function monthLabelFor(date: string, prevDate: string | undefined): string | null {
  if (prevDate && date.slice(0, 7) === prevDate.slice(0, 7)) return null;
  return monthAbbrev.format(new Date(`${date}T00:00:00Z`));
}

/** Wall-clock parts for an instant, rendered in a specific IANA timezone. */
export function tzParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    year: +get('year'),
    month: +get('month'),
    day: +get('day'),
    hour: +get('hour'),
    minute: +get('minute'),
    weekday: get('weekday'),
  };
}

/** HH:MM in the trip timezone, for a Date or an ISO instant. */
export function formatTime(at: Date | string, timeZone: string) {
  const d = typeof at === 'string' ? new Date(at) : at;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export interface NowNext {
  /** The primary in-progress event (see byPrimaryNow), or undefined in a gap. */
  now?: TripEvent;
  /** The primary of the next upcoming (concurrent) start, or undefined at day's end. */
  next?: TripEvent;
  /** Every event in progress right now, primary-first — the board's "ועוד N" set. */
  nowAll: TripEvent[];
  /** Every event sharing the earliest upcoming start, primary-first. */
  nextAll: TripEvent[];
}

/** Orders concurrent events so the "loudest" is first: a hard commitment beats a
 *  soft plan; then the one ending soonest (most urgent to leave); then the
 *  earliest start; then sortOrder. Drives which event owns the board hero. */
function byPrimaryNow(a: TripEvent, b: TripEvent): number {
  const hard = (e: TripEvent) => (e.kind === EVENT_KIND.HARD ? 0 : 1);
  if (hard(a) !== hard(b)) return hard(a) - hard(b);
  const endOf = (e: TripEvent) => Date.parse(e.endsAt ?? e.startsAt!);
  if (endOf(a) !== endOf(b)) return endOf(a) - endOf(b);
  const startOf = (e: TripEvent) => Date.parse(e.startsAt!);
  if (startOf(a) !== startOf(b)) return startOf(a) - startOf(b);
  return a.sortOrder - b.sortOrder;
}

/** The events in progress (start ≤ now < end) and the next upcoming ones. Returns
 *  the full concurrent sets (nowAll/nextAll) plus their primaries (now/next) so
 *  the board can show one hero + "ועוד N". Derived from the clock, never stored
 *  (ADR-0018). */
export function deriveNow(events: TripEvent[], at: Date): NowNext {
  const t = at.getTime();
  const timed = events.filter((e) => e.startsAt && e.status === EVENT_STATUS.PLANNED);
  const nowAll = timed
    .filter((e) => {
      const start = Date.parse(e.startsAt!);
      const end = e.endsAt ? Date.parse(e.endsAt) : start;
      return start <= t && t < end;
    })
    .sort(byPrimaryNow);
  const future = timed
    .filter((e) => Date.parse(e.startsAt!) > t)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  const nextStart = future.length ? Date.parse(future[0].startsAt!) : undefined;
  const nextAll =
    nextStart === undefined
      ? []
      : future.filter((e) => Date.parse(e.startsAt!) === nextStart).sort(byPrimaryNow);
  return { now: nowAll[0], next: nextAll[0], nowAll, nextAll };
}

/** The day-view lifecycle phase of an event, derived from the clock (ADR-0027 /
 *  ADR-0043) — never stored. A human-set status wins (done/skipped); otherwise a
 *  planned event is placed against `at`: before its start (`upcoming`), within
 *  its span (`now`), or after its end (`passed`). An untimed planned event has no
 *  span to place, so it reads `upcoming` (neutral). Mirrors deriveNow's
 *  start ≤ at < end window, so the now-line and the board agree on "now". */
export type EventPhase = 'upcoming' | 'now' | 'passed' | 'done' | 'skipped';

export function eventPhase(event: TripEvent, at: Date): EventPhase {
  if (event.status === EVENT_STATUS.DONE) return 'done';
  if (event.status === EVENT_STATUS.SKIPPED) return 'skipped';
  if (!event.startsAt) return 'upcoming';
  const t = at.getTime();
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start;
  if (t < start) return 'upcoming';
  if (t < end) return 'now';
  return 'passed';
}

/** Whether an event's occupancy is behind you at `at`, in the trip timezone —
 *  the single trip-wide "is this past?" rule (ADR-0049), used to file bookings
 *  under the Index's past-bookings list. Resolves the shared, type-agnostic
 *  `eventEndBoundary`: an instant boundary crosses on the clock (a flight is past
 *  once it lands, a hotel once its check-out passes), a day boundary only once its
 *  day is strictly before today (an untimed booking lingers till midnight, a
 *  mid-stay hotel never drops early). Distinct from `eventPhase`'s `passed`, which
 *  is single-day-scoped (start ≤ at < end within one day) for the now-line; this
 *  one spans the whole trip and honours multi-day `endDate`. */
export function isEventPast(
  event: Pick<TripEvent, 'date' | 'endDate' | 'startsAt' | 'endsAt'>,
  at: Date,
  timeZone: string,
): boolean {
  const boundary = eventEndBoundary(event);
  return boundary.kind === 'instant'
    ? boundary.at < at.getTime()
    : boundary.date < todayInTz(timeZone, at);
}

/** Whole minutes until an instant (floored at 0). */
export function minutesUntil(iso: string, at: Date): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - at.getTime()) / 60000));
}

export interface Countdown {
  value: string;
  unit: string;
}

/** Formats a minute count for the "time to next event" board widget — the
 *  next event isn't always today (deriveNow looks across the whole trip), so
 *  a raw minute count can run into the thousands. Steps up to H:MM hours past
 *  an hour, then a Hebrew day count (dayCount's dual/plural forms) past a day. */
export function formatCountdown(totalMinutes: number): Countdown {
  if (totalMinutes < MINUTES_PER_HOUR) {
    return { value: String(totalMinutes), unit: totalMinutes === 1 ? 'דקה' : 'דקות' };
  }
  if (totalMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    return { value: `${hours}:${String(minutes).padStart(2, '0')}`, unit: 'שעות' };
  }
  return dayCount(Math.floor(totalMinutes / MINUTES_PER_DAY));
}

/** Calendar-relative day phrasing (ADR-0085): a whole-day offset from today
 *  (target − today) as a standalone label — the Index booking rows read this so
 *  "when is this?" answers relative to now, not as a trip day-number. Near days
 *  get their own Hebrew words in both directions (מחר/מחרתיים, אתמול/שלשום);
 *  farther out counts up ("עוד N ימים" / "לפני N ימים", dual/plural via dayPhrase). */
export function relativeDay(delta: number): string {
  if (delta === 0) return 'היום';
  if (delta === 1) return 'מחר';
  if (delta === 2) return 'מחרתיים';
  if (delta === -1) return 'אתמול';
  if (delta === -2) return 'שלשום';
  return delta > 0 ? `עוד ${dayPhrase(delta)}` : `לפני ${dayPhrase(-delta)}`;
}

/** Forward countdown to a future date, split for display (ADR-0085): the board
 *  hero's next-event countdown, the trip-list "בעוד" chip, the header
 *  "יוצאים בעוד", the join ticket, the Plan departure count all read this. The
 *  next calendar day is "מחר", the one after "מחרתיים" — standalone words that
 *  drop the "בעוד" connective (there is no "בעוד מחר"); from three days up it's a
 *  count with the connective, rounding to months past COUNTDOWN_MONTHS_THRESHOLD.
 *  `value`/`unit` keep the numeral separable for the surfaces that style it LTR;
 *  `prefix` is the connective to render before the count (empty for the words). */
export function countdownParts(days: number): { value: string; unit: string; prefix: string } {
  if (days <= 0) return { value: '', unit: 'היום', prefix: '' };
  if (days === 1) return { value: '', unit: 'מחר', prefix: '' };
  if (days === 2) return { value: '', unit: 'מחרתיים', prefix: '' };
  const months = days / DAYS_PER_MONTH;
  const count =
    months > COUNTDOWN_MONTHS_THRESHOLD ? monthCount(Math.round(months)) : dayCount(days);
  return { ...count, prefix: 'בעוד' };
}

/** The countdownParts split as one plain string ("בעוד 3 ימים" / "מחר") — for the
 *  text-only surfaces (trip-list chip, header) that don't style the numeral. */
export function countdownText(days: number): string {
  const { prefix, value, unit } = countdownParts(days);
  return [prefix, value, unit].filter(Boolean).join(' ');
}

/** 0..1 position of `at` across the active day's waking window, in the trip timezone. */
export function dayProgress(
  at: Date,
  timeZone: string,
  startHour = DAY_WINDOW.START_HOUR,
  endHour = DAY_WINDOW.END_HOUR,
): number {
  const { hour, minute } = tzParts(at, timeZone);
  const cur = hour * 60 + minute;
  const span = endHour * 60 - startHour * 60;
  return Math.min(1, Math.max(0, (cur - startHour * 60) / span));
}

/** Shift an ISO instant by whole minutes, preserving the instant semantics. */
export function shiftIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

/** UTC offset (e.g. "+09:00") for a timezone at a specific instant — the IANA
 *  tzdata behind `Intl` is the authoritative source, not a hand-maintained table. */
function offsetAt(at: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  return !name || name === 'GMT' ? '+00:00' : name.replace('GMT', '');
}

/** Combine a form's `date` (YYYY-MM-DD) + `time` (HH:MM) inputs, read as wall-clock
 *  in `timeZone`, into a UTC ISO instant.
 *
 *  The offset for a given wall-clock reading depends on the instant itself (DST),
 *  which is exactly what we're trying to compute — so this resolves the
 *  chicken-and-egg by fixed-point iteration: guess an offset, recompute the
 *  instant, re-derive the offset *at that instant*, repeat until it stops
 *  moving (verified against real DST boundaries in time.test.ts; converges in
 *  at most 2 steps in practice). A single noon-anchored guess (the obvious
 *  shortcut) is silently wrong by up to an hour for any wall time on the same
 *  calendar day as a transition — don't reintroduce that.
 *
 *  ponytail: the one input this can't resolve correctly is a wall-clock
 *  reading that's ambiguous (repeated) or nonexistent (skipped) *during* the
 *  transition hour itself (e.g. 02:30 on a spring-forward day). It returns a
 *  stable, well-defined instant rather than looping or throwing, just not
 *  necessarily the one the user meant — every timezone library needs an
 *  explicit disambiguation policy for that hour; add one (e.g. "prefer
 *  standard time") if trip dates ever land there in practice. */
export function zonedIso(date: string, time: string, timeZone: string): string {
  let candidate = new Date(`${date}T${time}:00Z`);
  for (let i = 0; i < 3; i++) {
    const next = new Date(`${date}T${time}:00${offsetAt(candidate, timeZone)}`);
    if (next.getTime() === candidate.getTime()) break;
    candidate = next;
  }
  return candidate.toISOString();
}

/** Inverse of the date/time split zonedIso() combines — HH:MM in the trip timezone,
 *  for prefilling a form's time input from an existing event. */
export function isoToTimeInput(iso: string, timeZone: string): string {
  const { hour, minute } = tzParts(new Date(iso), timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** End instant for a form's start/end HH:MM on `date`: the next calendar day
 *  when the end reads earlier than the start — an overnight event that still
 *  belongs to its start day (ADR-0037). The TimePicker only emits an earlier
 *  end for a valid overnight span, so this needs no cutoff check of its own. */
export function resolveEndIso(date: string, start: string, end: string, timeZone: string): string {
  return zonedIso(end < start ? addDays(date, 1) : date, end, timeZone);
}

/** True when the event's end lands on a later calendar day than its start, in
 *  the trip timezone — the signal for the "＋1 / next day" display marker. */
export function crossesMidnight(startsAt: string, endsAt: string, timeZone: string): boolean {
  return todayInTz(timeZone, new Date(startsAt)) !== todayInTz(timeZone, new Date(endsAt));
}

/** Same-day hard event(s) whose span overlaps this soft event's current span.
 *  Two soft events overlapping is expected/unguarded (ADR-0011) — only hard-vs-soft
 *  matters, since a hard event can never move to resolve it. */
export function hardConflicts(event: TripEvent, dayEvents: TripEvent[]): TripEvent[] {
  if (event.kind !== EVENT_KIND.SOFT || !event.startsAt || !event.endsAt) return [];
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  return dayEvents.filter((e) => {
    if (e.id === event.id || e.kind !== EVENT_KIND.HARD || !e.startsAt) return false;
    const eStart = Date.parse(e.startsAt);
    const eEnd = e.endsAt ? Date.parse(e.endsAt) : eStart;
    return eStart < end && eEnd > start;
  });
}

// ── Concurrency layout: containment forest + per-level clustering (ADR-0041) ──
// Overlapping events aren't a flat list. We build a containment forest — each
// event's parent is the *smallest* event that strictly contains it — then, among
// siblings at every level, group the ones that *partially* overlap into clusters.
// Nesting and clustering compose (a nest can hold a cluster; a cluster member can
// itself be a nest). Pure and clock-independent: the day view renders the tree,
// and callers can flatten it. `end === start` (back-to-back) is not overlap;
// equal spans are cluster peers, never nested under each other.

/** One event plus the laid-out groups of events nested inside it (empty = leaf). */
export interface TimeItem {
  event: TripEvent;
  children: TimeGroup[];
}

/** A sibling-level unit: a lone item, or a cluster of items that overlap in time. */
export type TimeGroup =
  | { kind: 'single'; item: TimeItem }
  | { kind: 'cluster'; startMs: number; endMs: number; items: TimeItem[] };

interface Span {
  start: number;
  end: number;
}

const spanOf = (e: TripEvent): Span => {
  const start = Date.parse(e.startsAt!);
  return { start, end: e.endsAt ? Date.parse(e.endsAt) : start };
};

/** `a` strictly contains `b` — one edge must differ, so equal spans do NOT
 *  contain each other (they become cluster peers instead). */
const spanContains = (a: Span, b: Span): boolean =>
  a.start <= b.start && a.end >= b.end && (a.start < b.start || a.end > b.end);

/** True time overlap; touching (one's end === the other's start) is not overlap. */
const spansOverlap = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

/** Groups the day's timed events into the concurrency forest the day view renders.
 *  Returns the top-level groups (roots), each carrying its nested subtree. */
export function buildTimeTree(events: TripEvent[]): TimeGroup[] {
  // Layout includes done events (they still occupy their slot) but not skipped
  // ones (parked on the shelf, ADR-0027) or untimed ones (no span to place).
  const timed = events.filter((e) => e.startsAt && e.status !== EVENT_STATUS.SKIPPED);
  const span = new Map(timed.map((e) => [e.id, spanOf(e)]));
  const duration = (id: string) => span.get(id)!.end - span.get(id)!.start;

  // parent = smallest strict container; ties break on earliest start, then sortOrder.
  const isSmaller = (candidate: TripEvent, best: TripEvent): boolean => {
    const c = span.get(candidate.id)!;
    const b = span.get(best.id)!;
    if (duration(candidate.id) !== duration(best.id))
      return duration(candidate.id) < duration(best.id);
    if (c.start !== b.start) return c.start < b.start;
    return candidate.sortOrder < best.sortOrder;
  };
  const parentId = new Map<string, string | null>();
  for (const e of timed) {
    let best: TripEvent | undefined;
    for (const c of timed) {
      if (c.id === e.id || !spanContains(span.get(c.id)!, span.get(e.id)!)) continue;
      if (!best || isSmaller(c, best)) best = c;
    }
    parentId.set(e.id, best?.id ?? null);
  }

  const childrenOf = new Map<string | null, TripEvent[]>();
  for (const e of timed) {
    const p = parentId.get(e.id) ?? null;
    const arr = childrenOf.get(p);
    if (arr) arr.push(e);
    else childrenOf.set(p, [e]);
  }

  // Lay out one sibling set: cluster the partial overlaps (union-find over the
  // overlap graph), then emit groups in start order. Recurses into each item.
  const layout = (siblings: TripEvent[]): TimeGroup[] => {
    const ordered = [...siblings].sort(
      (a, b) => span.get(a.id)!.start - span.get(b.id)!.start || a.sortOrder - b.sortOrder,
    );
    const root = ordered.map((_, i) => i);
    const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
    for (let i = 0; i < ordered.length; i++)
      for (let j = i + 1; j < ordered.length; j++)
        if (spansOverlap(span.get(ordered[i].id)!, span.get(ordered[j].id)!))
          root[find(i)] = find(j);

    const toItem = (e: TripEvent): TimeItem => ({
      event: e,
      children: layout(childrenOf.get(e.id) ?? []),
    });

    const groups: TimeGroup[] = [];
    const emitted = new Set<number>();
    for (let i = 0; i < ordered.length; i++) {
      const r = find(i);
      if (emitted.has(r)) continue;
      emitted.add(r);
      const members = ordered.filter((_, j) => find(j) === r);
      if (members.length === 1) {
        groups.push({ kind: 'single', item: toItem(members[0]) });
      } else {
        groups.push({
          kind: 'cluster',
          startMs: Math.min(...members.map((e) => span.get(e.id)!.start)),
          endMs: Math.max(...members.map((e) => span.get(e.id)!.end)),
          items: members.map(toItem),
        });
      }
    }
    return groups;
  };

  return layout(childrenOf.get(null) ?? []);
}
