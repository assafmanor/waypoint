import { describe, expect, it } from 'vitest';
import {
  TRAVEL_BUFFER_SECONDS,
  TRAVEL_FIT,
  TRAVEL_FIT_TOLERANCE_SECONDS,
  daySequenceFits,
  floorTravelSeconds,
  freeAfterTravel,
  leaveBy,
  reachableWithin,
} from './travel-time';

const AT = (hhmm: string) => Date.parse(`2026-08-25T${hhmm}:00Z`);
const MINUTES = 60;

/* ── LEAVE BY (ADR-0206 §V1.2 / §D5) ─────────────────────────────────────────────────────── */
describe('leaveBy', () => {
  it('subtracts the journey AND the buffer, because a leave-by is a suggestion', () => {
    // 19:00 arrival, a 23-minute walk: the naive answer is 18:37 and the honest one is earlier
    // by the buffer, which is what keeps §D5's "never state a confidence we do not have".
    const naive = AT('19:00') - 23 * MINUTES * 1000;
    expect(leaveBy(AT('19:00'), 23 * MINUTES)).toBe(naive - TRAVEL_BUFFER_SECONDS * 1000);
  });

  it("takes a caller's buffer, which is what M3 will measure", () => {
    expect(leaveBy(AT('19:00'), 10 * MINUTES, 0)).toBe(AT('18:50'));
  });

  it('answers an instant already past rather than clamping the fact away', () => {
    // The late-risk mark (§V1.4) exists only because this is allowed to be behind `now`.
    expect(leaveBy(AT('12:00'), 4 * 60 * MINUTES, 0)).toBe(AT('08:00'));
  });
});

/* ── GAP MINUS TRAVEL (ADR-0206 §V1.1) ───────────────────────────────────────────────────── */
describe('freeAfterTravel', () => {
  it('takes the journey out of the free time, which is the correction', () => {
    // ADR-0159 renders this slot as `פנוי · 2:40 שע׳` today. Forty of those minutes are the walk.
    const window = freeAfterTravel(AT('12:00'), AT('14:40'), 40 * MINUTES);
    expect(window.availableSeconds).toBe(160 * MINUTES);
    expect(window.freeSeconds).toBe(120 * MINUTES);
    expect(window.overrunSeconds).toBe(0);
    expect(window.fit).toBe(TRAVEL_FIT.FITS);
  });

  it('leaves the whole gap free when there is no estimate, exactly as the app reads today', () => {
    const window = freeAfterTravel(AT('12:00'), AT('14:40'), null);
    expect(window.freeSeconds).toBe(160 * MINUTES);
    expect(window.travelSeconds).toBeNull();
    expect(window.overrunSeconds).toBe(0);
    // Not a pessimistic guess and not a failure: absent is absent (§D4).
    expect(window.fit).toBe(TRAVEL_FIT.UNKNOWN);
  });

  it('reports an overrun instead of a negative free time', () => {
    const window = freeAfterTravel(AT('12:00'), AT('12:30'), 50 * MINUTES);
    expect(window.freeSeconds).toBe(0);
    expect(window.overrunSeconds).toBe(20 * MINUTES);
    expect(window.fit).toBe(TRAVEL_FIT.OVERRUNS);
  });

  it('fits exactly when the journey uses the whole slot', () => {
    const window = freeAfterTravel(AT('12:00'), AT('12:30'), 30 * MINUTES);
    expect(window.freeSeconds).toBe(0);
    expect(window.overrunSeconds).toBe(0);
    expect(window.fit).toBe(TRAVEL_FIT.FITS);
  });

  it('carries a slot that is already negative through to the overrun', () => {
    // Two stops that overlap is a real state of the data and not travel's fault, so the
    // arithmetic reports it rather than special-casing it away.
    const window = freeAfterTravel(AT('12:30'), AT('12:00'), 0);
    expect(window.availableSeconds).toBe(-30 * MINUTES);
    expect(window.overrunSeconds).toBe(30 * MINUTES);
    expect(window.fit).toBe(TRAVEL_FIT.OVERRUNS);
  });
});

/* ── DOES THE DAY FIT (ADR-0206 §V1.7) ───────────────────────────────────────────────────── */
describe('daySequenceFits', () => {
  const day = [
    { startsAtMs: AT('09:00'), endsAtMs: AT('10:30') },
    { startsAtMs: AT('11:00'), endsAtMs: AT('12:00') },
    { startsAtMs: AT('12:30') },
  ];

  it('measures each leg from the end of one stop to the start of the next', () => {
    const verdict = daySequenceFits(day, [20 * MINUTES, 20 * MINUTES]);
    expect(verdict.fits).toBe(true);
    expect(verdict.overrunSeconds).toBe(0);
    expect(verdict.legs.map((leg) => [leg.fromIndex, leg.toIndex])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(verdict.legs[0]!.availableSeconds).toBe(30 * MINUTES);
    expect(verdict.legs[0]!.freeSeconds).toBe(10 * MINUTES);
  });

  it('says no on evidence, and says how much', () => {
    const verdict = daySequenceFits(day, [45 * MINUTES, 40 * MINUTES]);
    expect(verdict.fits).toBe(false);
    expect(verdict.legs[0]!.overrunSeconds).toBe(15 * MINUTES);
    expect(verdict.legs[1]!.overrunSeconds).toBe(10 * MINUTES);
    expect(verdict.overrunSeconds).toBe(25 * MINUTES);
  });

  it('never says no about a leg it cannot measure', () => {
    // A leg with no estimate, and a leg into a stop with no start time. Plan mode refusing a day
    // it cannot measure would be felt as refusal rather than help.
    const verdict = daySequenceFits([day[0]!, { endsAtMs: AT('11:00') }, day[2]!], [null, null]);
    expect(verdict.fits).toBe(true);
    expect(verdict.legs[0]!.fit).toBe(TRAVEL_FIT.UNKNOWN);
    expect(verdict.legs[1]!.fit).toBe(TRAVEL_FIT.UNKNOWN);
    expect(verdict.overrunSeconds).toBe(0);
  });

  it('leaves a stop with no end time departing at its start', () => {
    const verdict = daySequenceFits(
      [{ startsAtMs: AT('09:00') }, { startsAtMs: AT('10:00') }],
      [30 * MINUTES],
    );
    expect(verdict.legs[0]!.availableSeconds).toBe(60 * MINUTES);
    expect(verdict.legs[0]!.freeSeconds).toBe(30 * MINUTES);
  });

  it('treats a missing estimate at the tail as no estimate, not as zero travel', () => {
    const verdict = daySequenceFits(day, [20 * MINUTES]);
    expect(verdict.legs[1]!.travelSeconds).toBeNull();
    expect(verdict.legs[1]!.fit).toBe(TRAVEL_FIT.UNKNOWN);
  });

  it('has nothing to verdict for a day with one stop', () => {
    expect(daySequenceFits([day[0]!], [])).toEqual({ legs: [], fits: true, overrunSeconds: 0 });
  });
});

/* ── THE TOLERANCE (ADR-0206 §AH2) ───────────────────────────────────────────────────────── */
describe('freeAfterTravel — the tolerance a very short leg gets', () => {
  it('does not call a twenty-metre hop impossible', () => {
    // The field report: two stops ⁦20m⁩ apart with no gap between them read `אין זמן לדרך`, which
    // is arithmetically true and useless — nobody schedules the twenty seconds it takes to walk
    // out of a door. RED before the tolerance: `fit` was `overruns` for any shortfall at all.
    const window = freeAfterTravel(AT('18:30'), AT('18:30'), 24);
    expect(window.fit).toBe(TRAVEL_FIT.FITS);
    expect(window.overrunSeconds).toBe(0);
  });

  it('still refuses a shortfall somebody could act on', () => {
    // The tolerance is the app's admitted error bar, not optimism: past it there is a number a
    // person can move something by, so it is still reported.
    const window = freeAfterTravel(AT('18:30'), AT('18:30'), 8 * MINUTES);
    expect(window.fit).toBe(TRAVEL_FIT.OVERRUNS);
    expect(window.overrunSeconds).toBe(8 * MINUTES);
  });

  it('is the buffer, so the device pass cannot retune one and leave the other', () => {
    // Derived rather than written twice (§AH2): the buffer is the uncertainty this app has already
    // admitted to, and a shortfall inside it is indistinguishable from none.
    expect(TRAVEL_FIT_TOLERANCE_SECONDS).toBe(TRAVEL_BUFFER_SECONDS);
  });

  it('graces the TIME and not the distance — a one-minute drive over a kilometre is fine', () => {
    // Owner, 2026-08-26: a ⁦1.2km⁩ drive between two stops with no gap read `אין זמן לדרך`. The
    // comparison is seconds against seconds; how far the leg looks never enters it.
    expect(freeAfterTravel(AT('18:30'), AT('18:30'), 1 * MINUTES).fit).toBe(TRAVEL_FIT.FITS);
    // …and the same distance on foot, at twenty minutes, still does not fit.
    expect(freeAfterTravel(AT('18:30'), AT('18:30'), 20 * MINUTES).fit).toBe(TRAVEL_FIT.OVERRUNS);
  });

  it('reports the whole shortfall once it is past the tolerance, not the excess over it', () => {
    // A 20-minute shortfall is 20 minutes of moving to do, never 18. The tolerance decides
    // WHETHER to speak, and changes nothing about what is said.
    const window = freeAfterTravel(AT('12:00'), AT('12:30'), 50 * MINUTES);
    expect(window.overrunSeconds).toBe(20 * MINUTES);
  });

  it('keeps free time truthful inside the tolerance — there is none', () => {
    const window = freeAfterTravel(AT('18:30'), AT('18:30'), 24);
    expect(window.freeSeconds).toBe(0);
    expect(window.availableSeconds).toBe(0);
  });
});

// ── WHETHER A DETOUR COULD HAPPEN AT ALL (ADR-0216) ───────────────────────────────────────
describe('reachableWithin', () => {
  /** ⁦65⁩ free minutes with ⁦15⁩ owed to being there: ⁦50⁩ minutes of driving, which at ⁦130 km/h⁩ is
   *  ⁦108.3 ק״מ⁩ of crow round trip. The reported hole, once ADR-0206 §AY corrects it. */
  const slot = { freeSeconds: 65 * MINUTES, staySeconds: 15 * MINUTES };

  it('offers a detour the window could cover', () => {
    expect(reachableWithin({ ...slot, detourMeters: 52_000 })).toBe(true);
  });

  it('refuses one it could not', () => {
    expect(reachableWithin({ ...slot, detourMeters: 364_000 })).toBe(false);
  });

  // The bound is `crow / ceiling` and the ceiling is deliberately absurd (§4): what it refuses is
  // refused on physics, so the boundary is worth pinning rather than approximating.
  it('puts the boundary where the arithmetic does', () => {
    expect(reachableWithin({ ...slot, detourMeters: 108_000 })).toBe(true);
    expect(reachableWithin({ ...slot, detourMeters: 109_000 })).toBe(false);
  });

  // **The stay is part of it** — reachable and not a visit is not reachable (§2).
  it('counts the time you have to be there', () => {
    const there = { freeSeconds: 19 * MINUTES, detourMeters: 10_000 };
    expect(reachableWithin(there)).toBe(true);
    expect(reachableWithin({ ...there, staySeconds: 15 * MINUTES })).toBe(false);
  });

  // §D4 read from the other end: **nothing may be dropped on an absence.** A missing coordinate
  // is not a long journey, and `NaN` is not a verdict.
  it('answers yes to anything it cannot measure', () => {
    expect(reachableWithin({ freeSeconds: 60, detourMeters: NaN })).toBe(true);
    expect(reachableWithin({ freeSeconds: NaN, detourMeters: 1_000_000 })).toBe(true);
  });

  it('is a lower bound on the journey, never an estimate of it', () => {
    // ⁦130 km⁩ at ⁦130 km/h⁩ is an hour — the fastest it could conceivably go, which is the only
    // claim the crow line supports.
    expect(floorTravelSeconds(130_000)).toBeCloseTo(3600, 5);
  });
});
