// Plan/Trip mode derivation (ADR-0016) — derived from trip dates + now, never
// stored on the Trip (docs/architecture/data-model.md). The manual override
// (state/mode-state.tsx) is session-only, in-memory UI state, not persisted —
// the app always comes back to auto-derived on a fresh load.
import { eventMidSpan, type Trip, type TripEvent, type ZoneEvidence } from '@waypoint/shared';
import { DEVICE_TIMEZONE } from '../constants';
import { liveToday } from './places';
import { calendarDaysBetween, deriveNow, todayInTz } from './time';

export type Mode = 'plan' | 'trip';

/** Where the trip sits relative to trip-local "today": before it starts (`pre`),
 *  within [startDate, endDate] (`live`), or after it ends (`past`). Trip mode is
 *  a live-window-only state (ADR-0040) — pre and past are always Plan. */
export type TripPhase = 'pre' | 'live' | 'past';

type TripWindow = Pick<Trip, 'startDate' | 'endDate' | 'timezone'>;

/** **The calendar day the trip's clock is on** — the one `liveToday` answers for every other
 *  surface (ADR-0107 §4, mode-free): home before the outbound flight, the far side after it.
 *  Reading it off `trip.timezone` instead put the destination's midnight on the countdown, so at
 *  00:58 at home on the 9th the hero still said the trip was three days out (owner, 2026-09-09).
 *  `evidence` is optional only for a trip whose itinerary is not loaded — the pre-snapshot
 *  skeleton's first mode — where the primary zone is all there is to read. A screen with no trip
 *  loaded at all counts from the device instead (`daysUntilStartOnDevice`). */
export function tripToday(
  trip: TripWindow,
  now: Date,
  evidence?: ZoneEvidence,
  events?: readonly TripEvent[],
): string {
  const today = evidence ? liveToday(now.getTime(), evidence) : todayInTz(trip.timezone, now);
  // **A trip you are still inside does not end at its last midnight** (ADR-0236 §1). The
  // clamp fires in ONE direction and only past the end: you can stay in a trip, never
  // arrive at one early (ADR-0040 §1's principle, intact).
  if (today <= trip.endDate || !events?.length) return today;
  return holdingCommitment(trip, events, now)?.date ?? today;
}

/**
 * **The commitment still running that BEGAN inside the trip** — or `undefined`, which is
 * what "the trip is over" means (ADR-0236 §1).
 *
 * It asks the board's own question with the board's own filter, rather than deriving a
 * second answer beside it:
 *
 *  - `deriveNow` decides what is running (instant-based, `PLANNED` only — so a leg marked
 *    `נחתנו` or skipped releases the window, which is the person saying they have arrived);
 *  - a **held** span you are inside is dropped first (`midSpan.kind === 'held'`, ADR-0227
 *    §B), because the board drops it too. A hotel whose check-out is the morning after the
 *    trip ends must not hold Trip mode open with a board that has nothing to stand on —
 *    the empty shell ADR-0040 §1 refused. A journey is exempt from that filter, which is
 *    exactly why the flight home holds the window and the hotel does not.
 *
 * **`e.date` inside the range is the "began inside" guard**, and it is load-bearing: an
 * event stranded past `endDate` by a date edit (§6) would otherwise hold a finished trip
 * live forever.
 */
function holdingCommitment(
  trip: TripWindow,
  events: readonly TripEvent[],
  now: Date,
): TripEvent | undefined {
  const nowMs = now.getTime();
  const began = events.filter((e) => e.date >= trip.startDate && e.date <= trip.endDate);
  const schedule = began.filter(
    (e) =>
      !(eventMidSpan(e)?.kind === 'held' && e.startsAt != null && nowMs >= Date.parse(e.startsAt)),
  );
  return deriveNow([...schedule], now).now;
}

export function tripPhase(
  trip: TripWindow,
  now: Date,
  evidence?: ZoneEvidence,
  events?: readonly TripEvent[],
): TripPhase {
  const today = tripToday(trip, now, evidence, events);
  if (today < trip.startDate) return 'pre';
  if (today > trip.endDate) return 'past';
  return 'live';
}

/** Trip mode runs the trip's local calendar days [startDate, endDate] inclusive — plus, while
 *  one is still running, the commitment that began inside them (ADR-0236 §1); Plan otherwise. */
export function deriveMode(
  trip: TripWindow,
  now: Date,
  evidence?: ZoneEvidence,
  events?: readonly TripEvent[],
): Mode {
  return tripPhase(trip, now, evidence, events) === 'live' ? 'trip' : 'plan';
}

/** Calendar days remaining before startDate, counted from {@link tripToday} — null once
 *  the trip has started (or ended), since a countdown to departure stops being
 *  meaningful then, whether or not the mode is currently overridden. */
export function daysUntilStart(
  trip: TripWindow,
  now: Date,
  evidence?: ZoneEvidence,
): number | null {
  const today = tripToday(trip, now, evidence);
  if (today >= trip.startDate) return null;
  return calendarDaysBetween(today, trip.startDate);
}

/** **Whole calendar days to `startDate` from the DEVICE's today** — for the screens with no
 *  trip loaded, the all-trips list and the join ticket, where the person is wherever the phone
 *  is and there is no itinerary to read (ADR-0107, 2026-09-09 amendment). The trip's primary
 *  zone is the far side's clock: at 00:34 at home the list said `מחרתיים` for a trip that started
 *  tomorrow (owner, 2026-09-10). Zero on the date itself and negative after it. */
export function daysUntilStartOnDevice(startDate: string, now: Date): number {
  return calendarDaysBetween(todayInTz(DEVICE_TIMEZONE, now), startDate);
}
