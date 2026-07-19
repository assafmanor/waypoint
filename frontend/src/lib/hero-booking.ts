// Board-hero booking presentation (ADR-0059, applying ADR-0063's `bracketed`
// profile). A bracketed booking surfaces on the Home hero ONLY at its transition
// moments, never across its whole span: a hotel around check-in / check-out, a
// flight at departure / arrival (arrival emphasized), and a flight in the air
// fills the NOW slot ("in transit"). Pure and clock-driven — nothing stored
// (ADR-0018). The Home component renders from the discriminated result.
import { eventTransitionKeys, isAmbient, isBracketed, type TripEvent } from '@waypoint/shared';

const MS_PER_MIN = 60_000;

// Transition windows (ADR-0059 accepted defaults, tunable here without a new ADR).
/** Hotel check-in lingers on the hero this long AFTER check-in ("just checked in"). */
export const CHECKIN_GRACE_MIN = 120;
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

  // Ambient span (a multi-day hotel): only the two ends surface on the hero; the
  // settled middle recedes to the ambient strip / backdrop (ADR-0054/0059 §2).
  if (isAmbient(e)) {
    if (e.date === today && nowMs <= s + CHECKIN_GRACE_MIN * MS_PER_MIN) {
      return { kind: 'transition-checkin', event: e, labelKey: trans.startKey };
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

/** The single bracketed booking that owns/decorates the hero right now, if any.
 *  `today` is the trip-local calendar day (todayInTz) — a hotel check-in only
 *  surfaces on its own check-in day. */
export function deriveHeroBooking(events: TripEvent[], nowMs: number, today: string): HeroBooking {
  let best: HeroBooking | null = null;
  for (const e of events) {
    const c = classify(e, nowMs, today);
    if (!c) continue;
    if (!best || RANK[c.kind] < RANK[best.kind]) best = c;
  }
  return best ?? { kind: 'none' };
}
