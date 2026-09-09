// **What the prep hero says, derived once for both of its hosts** (ADR-0221). Plan Home
// renders the hero every day of the run-up; Trip Home renders it once, on the first
// morning, as the plan face that turns into the board. Two hosts reading one derivation is
// the rule ADR-0193 §2 set for the hero's numbers, extended to its tier and its clock.
import type { Trip, TripEvent, ZoneEvidence } from '@waypoint/shared';
import { daysUntilStart, tripToday } from './mode';
import { eventZones, liveZoneContext } from './places';
import {
  firstTimedOn,
  PREP_TIER,
  prepTier,
  runwayLamps,
  tripStartMs,
  type PrepTier,
} from './prep-tier';
import { countdownParts, formatTime } from './time';
import type { PrepHeroCountdown, PrepHeroEve } from '../ui/domain/PrepHero';

export interface PrepHeroFacts {
  /** Calendar days to departure; `0` on day 1 itself (the morph face); `null` once the
   *  trip is past its first day, when there is no countdown to print. */
  days: number | null;
  tier: PrepTier;
  countdown: PrepHeroCountdown | null;
  runway: boolean[] | null;
  eve: PrepHeroEve | null;
}

type TripWindow = Pick<Trip, 'startDate' | 'endDate' | 'timezone'>;

export function prepHeroFacts(input: {
  trip: TripWindow;
  events: TripEvent[];
  now: Date;
  zoneEvidence: ZoneEvidence;
}): PrepHeroFacts {
  const { trip, events, now, zoneEvidence } = input;
  // `daysUntilStart` is null from day 1 on; day 1 itself is the first morning's face, which
  // says `היום` over a clock to the first thing — so it is a countdown of zero, not none.
  const days =
    daysUntilStart(trip, now, zoneEvidence) ??
    (tripToday(trip, now, zoneEvidence) === trip.startDate ? 0 : null);
  if (days === null) {
    return { days, tier: PREP_TIER.FAR, countdown: null, runway: null, eve: null };
  }
  const tier = prepTier(days);
  const countdown = countdownParts(days);
  const runway = tier === PREP_TIER.WEEK ? runwayLamps(days) : null;
  let eve: PrepHeroEve | null = null;
  if (tier === PREP_TIER.EVE) {
    // The clock counts to the trip's start; on day 1 itself that instant has passed and the
    // clock reads `00:00:00` — the count IS over, which is what the first morning's face says.
    eve = { targetMs: tripStartMs(trip.startDate, trip.timezone) };
    const first = firstTimedOn(events, trip.startDate);
    if (first) {
      // The event's own zone, the way every other surface prints a clock (ADR-0107 §2).
      const zones = eventZones(first, liveZoneContext(now.getTime(), zoneEvidence));
      eve.title = first.title;
      eve.icon = first.icon;
      eve.time = formatTime(first.startsAt!, zones.startZone);
    }
  }
  return { days, tier, countdown, runway, eve };
}
