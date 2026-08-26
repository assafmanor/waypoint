// **What a device position lets a travel read CLAIM** (ADR-0207) — and the thesis is the whole of
// this file: a fix decides what we may **claim**, and is never an input to an estimate (§1).
//
// Nothing here routes, requests, stores or sends anything. Pure: a fix, two stops, a clock and a
// duration in; a discriminant out. `hero-travel.ts` next door is the same shape for the arithmetic
// the clock alone licenses, and this is the layer that can take a claim BACK.
//
// **Why it may not route from a position** (§1, stated here because this is where somebody would
// try): ADR-0205 §4 keys the route cache on rounded coordinates of PLACES, so a live position is a
// fresh key on every fix — a cache miss forever and a request per fix, for a number that is stale
// the moment the traveller takes another step. And withdrawal needs no estimate at all: the report
// was never "your number is imprecise", it was "you are calling me late when you can see I am not".
import { haversineMeters, type LatLng } from '@waypoint/shared';

/**
 * **How long a fix may speak for.**
 *
 * `useGeolocation` is one-shot by design and holds its answer for the life of the screen, so
 * without an expiry this layer would let a twenty-minute-old position at the leg's origin **earn**
 * a late mark for somebody who left fifteen minutes ago (§4). That is the one direction in which
 * being wrong is worse than saying nothing, because it turns a hedge into an assertion.
 *
 * Two minutes: long enough that a fix taken as the screen opened still answers while the traveller
 * reads it, short enough that it cannot outlive a walk. `GEOLOCATION_OPTIONS.maximumAge` already
 * caps how stale the PLATFORM's answer may be at one minute, so this is the second minute — ours.
 */
export const POSITION_FRESH_MS = 2 * 60_000;

/** **The smallest radius worth measuring**, in metres. Urban GPS is routinely ±⁦20–50m⁩, so a radius
 *  under the error bar flickers between stances while nobody moves. The fix's own `accuracy`
 *  outranks this where the platform reports one (§5); this is the floor when it does not. */
export const POSITION_RADIUS_FLOOR_M = 60;

/** **How much of the leg counts as "at" either end** (§5, the owner's "relative to the total
 *  distance"). A fixed radius is nonsense at both extremes: ⁦500m⁩ from the end of a ⁦40km⁩ drive is
 *  not arrival, and ⁦500m⁩ on a ⁦300m⁩ walk is the entire leg. */
export const ARRIVAL_FRACTION = 0.12;

/** **A ceiling on what "at" can mean, whatever the leg's length.** Without it a ⁦300km⁩ Iceland leg
 *  would call a traveller arrived ⁦36km⁩ short of Vík. ⁦2km⁩ is "in the same place as the stop" and it
 *  is a judgement rather than a measurement — the same standing as §D5's buffer, and owed to the
 *  same device pass. */
export const ARRIVAL_RADIUS_MAX_M = 2_000;

/** **A leg too short for a fraction to mean anything.** Below this the crow distance is the same
 *  order as the error bar, so neither the stance nor §6's remaining fraction is measuring the
 *  traveller — it is measuring the fix. `unknown`, which is a complete state. */
export const POSITION_MIN_LEG_M = 250;

export const TRAVEL_STANCE = {
  /** **No usable fix — and this is the DEFAULT, not the error** (§2). No permission, a refusal, no
   *  API, a stale fix, a leg too short, or a position that settles nothing. Every consumer reads
   *  exactly what it read before this file existed. */
  UNKNOWN: 'unknown',
  /** The fix puts the traveller at the leg's first stop. **The only arm that makes the app louder**,
   *  and the one that earns it: a passed leave-by stops being a claim about a clock and becomes one
   *  the app has actually checked. */
  AT_ORIGIN: 'at-origin',
  /** Along the leg. The leave-by question is answered by the world, so the mark is withdrawn with
   *  nobody having to press anything — v2 §3d's _"נענה מעצמו"_. */
  EN_ROUTE: 'en-route',
  /** At the leg's second stop. There is no journey left to report, so nothing is reported. */
  ARRIVED: 'arrived',
} as const;
export type TravelStance = (typeof TRAVEL_STANCE)[keyof typeof TRAVEL_STANCE];

/** A fix, as the hook hands it over. Deliberately not the hook's own type: this file is pure and
 *  takes what it reads, so a spec builds one with a literal. */
export interface PositionFix {
  coords: LatLng;
  /** The platform's own timestamp, never one stamped on arrival — with `maximumAge` set the
   *  browser may return a fix it took earlier, and re-stamping would call that fresh. */
  fixedAt: number;
  accuracyMeters?: number;
}

export interface TravelPosition {
  stance: TravelStance;
  /** How much of the leg is still ahead, 0..1, and **only for `en-route`**. `null` everywhere
   *  else — including on an `en-route` leg too short for the fraction to mean anything, which is
   *  §6's refusal rather than an omission. */
  remainingFraction: number | null;
}

const UNKNOWN: TravelPosition = { stance: TRAVEL_STANCE.UNKNOWN, remainingFraction: null };

/**
 * **Which of §2's four stances the leg is in.**
 *
 * The order of the tests is the decision: `arrived` before `at-origin` before `en-route`, and
 * anything that answers none of them is `unknown` rather than the nearest guess. A fix outside both
 * radii and no closer to the destination than the origin is a traveller who went somewhere else,
 * which the position genuinely does not settle — the same refusal §Z5 §M4 makes about the clock,
 * applied to place.
 */
export function travelStance(input: {
  fix?: PositionFix;
  /** The leg's two scheduled stops, as `hero-travel.ts` resolved them. */
  from: LatLng;
  to: LatLng;
  nowMs: number;
  freshMs?: number;
}): TravelPosition {
  const { fix, from, to, nowMs, freshMs = POSITION_FRESH_MS } = input;
  if (!fix || !Number.isFinite(fix.fixedAt) || nowMs - fix.fixedAt > freshMs) return UNKNOWN;
  const legMeters = haversineMeters(from, to);
  if (!Number.isFinite(legMeters) || legMeters < POSITION_MIN_LEG_M) return UNKNOWN;

  // **The MOST generous of the three, not the least** — and getting this backwards was the first
  // build's bug. Taking the minimum let the leg's fraction cap the radius below the fix's own error
  // bar, which is precisely the noise §5 exists to refuse: a ±⁦300m⁩ fix cannot resolve a ⁦180m⁩
  // circle, so it would flicker between stances while the traveller stood still. The radius is
  // therefore as wide as the least certain consideration demands, and only the absolute ceiling
  // narrows it.
  const radius = Math.min(
    Math.max(fix.accuracyMeters ?? 0, POSITION_RADIUS_FLOOR_M, ARRIVAL_FRACTION * legMeters),
    ARRIVAL_RADIUS_MAX_M,
  );
  // **A radius that reaches the leg's midpoint cannot tell the two ends apart**, so the fix
  // settles nothing however precise the arithmetic looks. This is the real rule the arbitrary
  // ceiling above was standing in for, and it is what stops a sloppy fix on a short leg from
  // answering "arrived" about a traveller who has not moved.
  if (radius >= legMeters / 2) return UNKNOWN;
  const toDestination = haversineMeters(fix.coords, to);
  const toOrigin = haversineMeters(fix.coords, from);

  // **Arrived outranks at-origin**, for the leg whose two ends are close enough that both could
  // answer: being at where you are going is the more specific fact, and it is the one that removes
  // a claim rather than sharpening one.
  if (toDestination <= radius) return { stance: TRAVEL_STANCE.ARRIVED, remainingFraction: 0 };
  if (toOrigin <= radius) return { stance: TRAVEL_STANCE.AT_ORIGIN, remainingFraction: 1 };
  // **Left the origin's circle AND closed at least a radius of the gap.** The obvious test —
  // "closer to the destination than to the origin" — is wrong by being twice as strict as it
  // reads: it only fires past the leg's MIDPOINT, so somebody a third of the way along a walk
  // still reads `unknown` and keeps a late mark they have plainly answered. One radius of real
  // progress is the honest bar, and the wrong-way case still fails it: a traveller who went
  // ⁦400m⁩ the other way is further from the destination than the origin is, so they fall
  // through to `unknown` exactly as they should.
  if (toDestination <= legMeters - radius) {
    return {
      stance: TRAVEL_STANCE.EN_ROUTE,
      // Clamped, because the crow ratio is not a route: a traveller who walked around a bay can
      // sit further from the destination than the origin does.
      remainingFraction: Math.min(1, toDestination / legMeters),
    };
  }
  return UNKNOWN;
}

/**
 * **What is left of the journey, in seconds** — §6, and an approximation of an approximation.
 *
 * Scaled by the remaining crow fraction rather than re-routed (§1). Admissible for exactly two
 * reasons: §D5's `~` already says the number is hedged, and the alternative — the untouched total
 * beside `בדרך` — is not more honest but **less**, because `~44 דק׳` on a two-minute approach is
 * confidently wrong where this is approximately right.
 *
 * `null` when there is nothing defensible to say, which every consumer already renders as absence
 * (§D4): any stance but `en-route`, no estimate, or a fraction this leg is too short to support.
 */
export function remainingTravelSeconds(
  position: TravelPosition,
  travelSeconds: number | null,
): number | null {
  if (position.stance !== TRAVEL_STANCE.EN_ROUTE) return null;
  if (travelSeconds === null || !Number.isFinite(travelSeconds)) return null;
  if (position.remainingFraction === null) return null;
  const remaining = travelSeconds * position.remainingFraction;
  return remaining > 0 ? remaining : null;
}
