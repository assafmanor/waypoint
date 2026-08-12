// Board-hero booking presentation (ADR-0059, applying ADR-0063's `bracketed`
// profile). A bracketed booking surfaces on the Home hero ONLY at its transition
// moments, never across its whole span: a hotel around check-in / check-out, a
// flight at departure / arrival (arrival emphasized), and a flight in the air
// fills the NOW slot ("in transit"). Pure and clock-driven — nothing stored
// (ADR-0018). The Home component renders from the discriminated result.
import {
  EVENT_STATUS,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  isJourney,
  windowBoundOf,
  type TripEvent,
} from '@waypoint/shared';

const MS_PER_MIN = 60_000;

// Transition windows (ADR-0059 accepted defaults, tunable here without a new ADR).
/** Hotel check-in lingers on the hero this long AFTER check-in ("just checked in").
 *
 *  **This number is a stand-in for a ceiling nobody authored**, and it always disagreed
 *  with ADR-0171 §6, which keeps a floor pending until it is settled or the day ends.
 *  Nobody noticed because neither number was real. Since ADR-0184 an edge can carry its
 *  OWN ceiling, and where it does this is not consulted at all — the grace survives only
 *  for a check-in that is still just "from 17:00". */
export const CHECKIN_GRACE_MIN = 120;

/** How close to a window shutting counts as urgent — the state the hero exists for
 *  ("what do I need in the next 30 minutes"). A feel call, tunable here. */
export const WINDOW_CLOSING_MIN = 60;
/** Hotel check-out surfaces on the hero from this long BEFORE check-out. */
export const CHECKOUT_LEAD_MIN = 180;
/** Transport departure surfaces on the hero from this long BEFORE departure. */
export const DEPARTURE_LEAD_MIN = 180;
/** Arrival is emphasized once the flight is within this long of landing. */
export const ARRIVAL_EMPHASIS_MIN = 45;

export type HeroBookingKind =
  | 'transition-checkin'
  | 'transition-checkout'
  | 'transition-departure'
  | 'transition-arrival'
  | 'in-transit'
  | 'none';

export interface HeroBooking {
  kind: HeroBookingKind;
  /** The bracketed event surfacing (absent only for 'none'). */
  event?: TripEvent;
  /** **When this edge's window shuts**, for an edge that has one (ADR-0184 §6). The
   *  countdown the board shows is to THIS, not to the floor the row is labelled with. */
  closesAt?: string;
  /** Inside the window and within `WINDOW_CLOSING_MIN` of it shutting. */
  closing?: boolean;
  /** The window shut and nobody settled it — the first time a lodging edge can fail at
   *  all (a floor had no way to, ADR-0171 §6). */
  missed?: boolean;
  /** i18n transition key for the surfaced end, by mode via `eventTransitionKeys`
   *  (`checkIn`/`checkOut`/`departure`/`arrival`/`flightDeparture`/`flightArrival`). */
  labelKey?: string;
}

const startMs = (e: TripEvent) => Date.parse(e.startsAt!);
const endMs = (e: TripEvent) => (e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt!));

// Most urgent (where you literally are) first; drives which booking owns the hero
// when several qualify at once.
const RANK: Record<HeroBookingKind, number> = {
  'transition-arrival': 0,
  'in-transit': 1,
  'transition-departure': 2,
  'transition-checkout': 3,
  'transition-checkin': 4,
  none: 9,
};

/** How a single bracketed event surfaces right now, or null if it doesn't. */
function classify(e: TripEvent, nowMs: number, today: string): HeroBooking | null {
  if (!isBracketed(e) || !e.startsAt || e.category == null) return null;
  const trans = eventTransitionKeys(e);
  if (!trans) return null;
  const s = startMs(e);
  const end = endMs(e);

  // Ambient span (a multi-day hotel, a multi-day car hire): only the two ends surface on
  // the hero; the settled middle recedes to the ambient strip / backdrop (ADR-0054/0059 §2).
  //
  // **`isJourney` is the exemption, and it is the fix for a red-eye** (owner: _"when the
  // flight crossed the day boundary, the hero doesn't recognize it as currently happening
  // and just has the landing as the next event"_). `ambientWhenMultiDay` describes how a
  // span RENDERS across the days it covers; it says nothing about what its middle IS. An
  // overnight flight is both — a backdrop on the day it lands, and a journey you are
  // sitting inside — and this branch only knows check-in/check-out windows, so a flight in
  // the air could at best surface near its end as a check-out-shaped transition. Which is
  // the landing, offered as something upcoming.
  //
  // So a journey never takes this branch, however many calendar days it crosses: it falls
  // through to the bracketed-point path below, whose windows are instants and have never
  // cared what day it is. A held span (a hire, a stay) still recedes exactly as before.
  if (isAmbient(e) && !isJourney(e)) {
    if (e.date === today) {
      // **A REAL CEILING REPLACES THE GUESS** (ADR-0184 §6). With a window the check-in
      // stays on the hero for exactly as long as it can still be done, rather than for
      // an invented two hours; without one nothing changes at all.
      const shuts = windowBoundOf(e, 'start');
      const closesMs = shuts ? Date.parse(shuts) : null;
      const until = closesMs ?? s + CHECKIN_GRACE_MIN * MS_PER_MIN;
      if (nowMs <= until) {
        return {
          kind: 'transition-checkin',
          event: e,
          labelKey: trans.startKey,
          closesAt: shuts,
          // Urgent only INSIDE the window: before the floor there is nothing to hurry.
          closing:
            closesMs != null && nowMs >= s && closesMs - nowMs <= WINDOW_CLOSING_MIN * MS_PER_MIN,
        };
      }
      // Past the ceiling, and only a window HAS one — so this branch cannot fire for an
      // ordinary floor, which is what keeps ADR-0171 §6's "a floor never fails" intact.
      // A settled check-in is not a miss; it is done.
      if (closesMs != null && e.status !== EVENT_STATUS.DONE) {
        return {
          kind: 'transition-checkin',
          event: e,
          labelKey: trans.startKey,
          closesAt: shuts,
          missed: true,
        };
      }
    }
    const endDay = e.endDate ?? e.date;
    if (
      endDay === today &&
      e.endsAt &&
      nowMs >= end - CHECKOUT_LEAD_MIN * MS_PER_MIN &&
      nowMs < end
    ) {
      return { kind: 'transition-checkout', event: e, labelKey: trans.endKey };
    }
    return null;
  }

  // Bracketed point (a flight): departure lead → in-transit → arrival emphasis.
  if (nowMs < s) {
    return nowMs >= s - DEPARTURE_LEAD_MIN * MS_PER_MIN
      ? { kind: 'transition-departure', event: e, labelKey: trans.startKey }
      : null;
  }
  if (e.endsAt && nowMs < end) {
    const arriving = end - nowMs <= ARRIVAL_EMPHASIS_MIN * MS_PER_MIN;
    return {
      kind: arriving ? 'transition-arrival' : 'in-transit',
      event: e,
      labelKey: trans.endKey,
    };
  }
  return null;
}

/** **Where you literally are, and a shutting window is exactly that.** `RANK` orders the
 *  kinds; this promotes the one STATE that outranks its own kind — a check-in you have
 *  40 minutes left to make beats a departure three hours out. One function rather than a
 *  second kind, because the row is still a check-in and still says so. */
const rankOf = (c: HeroBooking): number => (c.closing ? -1 : RANK[c.kind]);

/** The single bracketed booking that owns/decorates the hero right now, if any.
 *  `today` is the trip-local calendar day (todayInTz) — a hotel check-in only
 *  surfaces on its own check-in day. */
export function deriveHeroBooking(events: TripEvent[], nowMs: number, today: string): HeroBooking {
  let best: HeroBooking | null = null;
  for (const e of events) {
    const c = classify(e, nowMs, today);
    if (!c) continue;
    if (!best || rankOf(c) < rankOf(best)) best = c;
  }
  return best ?? { kind: 'none' };
}
