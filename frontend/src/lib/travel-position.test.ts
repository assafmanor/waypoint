import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_FRACTION,
  POSITION_FRESH_MS,
  POSITION_MIN_LEG_M,
  POSITION_RADIUS_FLOOR_M,
  TRAVEL_STANCE,
  remainingTravelSeconds,
  travelStance,
  type PositionFix,
} from './travel-position';

const NOW = Date.parse('2026-08-26T11:57:00Z');

/** Tel Aviv, and the two ends are ~1.5 km apart — the shape of the reported day. `lat` degrees are
 *  ~111 km, so the offsets below are metres divided by that. */
const M_PER_DEG = 111_320;
const at = (metresNorth: number): { lat: number; lng: number } => ({
  lat: 32.07 + metresNorth / M_PER_DEG,
  lng: 34.79,
});

const FROM = at(0);
const TO = at(1500);

const fix = (metresNorth: number, over: Partial<PositionFix> = {}): PositionFix => ({
  coords: at(metresNorth),
  fixedAt: NOW,
  ...over,
});

const stance = (f: PositionFix | undefined, from = FROM, to = TO) =>
  travelStance({ fix: f, from, to, nowMs: NOW });

describe('travelStance — what a fix lets a read claim (ADR-0207 §2)', () => {
  // §2: `unknown` is the DEFAULT, not the error. No permission, a refusal, no API — every one of
  // them leaves every consumer reading exactly what it read before this file existed.
  it('is unknown with no fix at all', () => {
    expect(stance(undefined).stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });

  // **§4, and this is the dangerous direction.** A stale fix at the origin would EARN a late mark
  // for somebody who left a quarter of an hour ago — a hedge turned into an assertion.
  it('expires a stale fix into unknown rather than trusting it', () => {
    const fresh = fix(0, { fixedAt: NOW - POSITION_FRESH_MS + 1_000 });
    const stale = fix(0, { fixedAt: NOW - POSITION_FRESH_MS - 1_000 });
    expect(stance(fresh).stance).toBe(TRAVEL_STANCE.AT_ORIGIN);
    expect(stance(stale).stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });

  it('is unknown for a fix with no usable timestamp', () => {
    expect(stance(fix(0, { fixedAt: Number.NaN })).stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });

  // **The reported case.** 200m from the door of a 1.5km leg: 200 is under 12% of 1500 (=180)?
  // No — so this is deliberately measured against the FLOOR too, and it is the arm that matters.
  it('reads a fix at the destination as ARRIVED, which is the reported bug', () => {
    expect(stance(fix(1500)).stance).toBe(TRAVEL_STANCE.ARRIVED);
    expect(stance(fix(1460)).stance).toBe(TRAVEL_STANCE.ARRIVED);
  });

  it('reads a fix at the first stop as AT_ORIGIN, which is what EARNS the mark', () => {
    const answer = stance(fix(0));
    expect(answer.stance).toBe(TRAVEL_STANCE.AT_ORIGIN);
    expect(answer.remainingFraction).toBe(1);
  });

  it('reads a fix along the leg as EN_ROUTE, and says how much is left', () => {
    const answer = stance(fix(1000));
    expect(answer.stance).toBe(TRAVEL_STANCE.EN_ROUTE);
    // A third of the way still to go.
    expect(answer.remainingFraction).toBeCloseTo(1 / 3, 2);
  });

  // §5: **where neither end answers, the stance is unknown rather than a guess.** A fix that is no
  // closer to the destination than the origin is a traveller who went somewhere else — which the
  // position genuinely does not settle.
  it('refuses to guess when the fix settles nothing', () => {
    // 400m the WRONG way: outside both radii, and further from the destination than the origin is.
    expect(stance(fix(-400)).stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });

  // §5, the physics half, and the first build got it backwards: taking the MINIMUM of the accuracy
  // and the leg's fraction let the fraction cap the radius below the error bar. A ±300m fix cannot
  // resolve a 180m circle, so a sloppy fix must not be able to claim the traveller left.
  it('never lets the radius fall below the fix’s own error bar', () => {
    const sloppy = fix(200, { accuracyMeters: 300 });
    const precise = fix(200, { accuracyMeters: 5 });
    // Inside a 300m radius, so the sloppy fix still reads the origin.
    expect(stance(sloppy).stance).toBe(TRAVEL_STANCE.AT_ORIGIN);
    // The precise fix resolves the same 200m as real progress out of the origin's 180m circle,
    // so it reads en route — the same position, two different claims, decided by the error bar.
    expect(stance(precise).stance).toBe(TRAVEL_STANCE.EN_ROUTE);
    // …and an accuracy below the floor never shrinks the radius past it.
    expect(stance(fix(POSITION_RADIUS_FLOOR_M - 10, { accuracyMeters: 1 })).stance).toBe(
      TRAVEL_STANCE.AT_ORIGIN,
    );
  });

  // §5, the relative half — the owner's own proposal. The same 200m fix means different things on
  // legs of different lengths, because the radius scales with the leg.
  it('scales the radius with the leg, so one distance means different things', () => {
    const longLeg = travelStance({ fix: fix(200), from: FROM, to: at(40_000), nowMs: NOW });
    expect(longLeg.stance).toBe(TRAVEL_STANCE.AT_ORIGIN);
    // On a 600m walk the radius is 72m, so the same 200m is real progress rather than "at" it.
    const shortLeg = travelStance({ fix: fix(200), from: FROM, to: at(600), nowMs: NOW });
    expect(shortLeg.stance).toBe(TRAVEL_STANCE.EN_ROUTE);
    expect(ARRIVAL_FRACTION).toBeLessThan(0.5);
  });

  // The midpoint rule, which replaced an arbitrary ceiling: a radius that reaches half the leg
  // cannot tell the two ends apart, so a sloppy fix on a short leg settles nothing at all rather
  // than confidently answering "arrived" about somebody who has not moved.
  it('is unknown when the radius reaches the leg’s midpoint', () => {
    const answer = travelStance({
      fix: fix(300, { accuracyMeters: 400 }),
      from: FROM,
      to: at(600),
      nowMs: NOW,
    });
    expect(answer.stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });

  // A leg whose crow distance is the same order as the error bar measures the fix, not the walker.
  it('is unknown on a leg too short to measure', () => {
    const tiny = travelStance({
      fix: fix(10),
      from: FROM,
      to: at(POSITION_MIN_LEG_M - 50),
      nowMs: NOW,
    });
    expect(tiny.stance).toBe(TRAVEL_STANCE.UNKNOWN);
  });
});

describe('remainingTravelSeconds — §6, an approximation that says so', () => {
  it('scales the estimate by what is left, never re-routing', () => {
    const enRoute = stance(fix(1000));
    expect(remainingTravelSeconds(enRoute, 30 * 60)).toBeCloseTo(10 * 60, -1);
  });

  // Every one of these renders as absence (§D4), which is a complete state — where a fabricated
  // number would not be.
  it('answers null for every stance but en-route, and for no estimate', () => {
    expect(remainingTravelSeconds(stance(fix(0)), 30 * 60)).toBeNull();
    expect(remainingTravelSeconds(stance(fix(1500)), 30 * 60)).toBeNull();
    expect(remainingTravelSeconds(stance(undefined), 30 * 60)).toBeNull();
    expect(remainingTravelSeconds(stance(fix(1000)), null)).toBeNull();
  });
});
