// Trip-timezone formatting + client-side "now" derivation.
// "Now" is never stored (ADR-0018) — it's computed from event startsAt/endsAt vs the clock.
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { DAY_WINDOW } from '../constants';

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
  now?: TripEvent;
  next?: TripEvent;
}

/** The event currently in progress (start ≤ now < end) and the first upcoming one. */
export function deriveNow(events: TripEvent[], at: Date): NowNext {
  const t = at.getTime();
  const timed = events
    .filter((e) => e.startsAt && e.status === EVENT_STATUS.PLANNED)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
  let now: TripEvent | undefined;
  let next: TripEvent | undefined;
  for (const e of timed) {
    const start = new Date(e.startsAt!).getTime();
    const end = e.endsAt ? new Date(e.endsAt).getTime() : start;
    if (start <= t && t < end) now = e;
    if (start > t && !next) next = e;
  }
  return { now, next };
}

/** Whole minutes until an instant (floored at 0). */
export function minutesUntil(iso: string, at: Date): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - at.getTime()) / 60000));
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
