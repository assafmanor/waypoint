// Trip-timezone formatting + client-side "now" derivation.
// "Now" is never stored (ADR-0018) — it's computed from event startsAt/endsAt vs the clock.
import { EVENT_STATUS, type TripEvent } from '@waypoint/shared';
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
