// **The derivation ADR-0203 §2 is built on.** The specs that matter are the ones a
// wall-clock comparison would pass or fail for the wrong reason — see the first two.
import { describe, expect, it } from 'vitest';
import { elapsedMinutes, resolveJourneyDays, type JourneyMoment } from './journey-days';

const TLV = 'Asia/Jerusalem'; // +3 in summer
const KEF = 'Atlantic/Reykjavik'; // +0
const NRT = 'Asia/Tokyo'; // +9
const HNL = 'Pacific/Honolulu'; // −10
const AMS = 'Europe/Amsterdam'; // +2

const DATE = '2026-08-12';
const at = (time: string, timeZone: string, dayOffset?: number): JourneyMoment => ({
  time,
  timeZone,
  dayOffset,
});
const offsets = (moments: JourneyMoment[], date = DATE) =>
  resolveJourneyDays(date, moments).map((m) => m.dayOffset);

describe('resolveJourneyDays — the day is derived, never a second date', () => {
  it('rolls to the next day when the clock cannot follow the one before it', () => {
    // The owner's own words for this: a later checkpoint whose time is earlier than the
    // previous one moves from "same day" to "next day" on its own.
    expect(offsets([at('23:40', TLV), at('04:25', KEF)])).toEqual([0, 1]);
  });

  it('stays on the SAME day when a westward crossing makes an earlier clock later', () => {
    // Tokyo 21:00 → Honolulu 09:00: twelve hours earlier by the clock, nineteen hours of
    // zone shift against a seven-hour flight, and the same calendar day. A wall-clock
    // comparison says `למחרת` here and is wrong by a full day — this is the spec that
    // separates the two implementations, and the reason the module resolves instants.
    const resolved = resolveJourneyDays(DATE, [at('21:00', NRT), at('09:00', HNL)]);
    expect(resolved.map((m) => m.dayOffset)).toEqual([0, 0]);
    expect(elapsedMinutes(resolved[0], resolved[1])).toBe(7 * 60);
  });

  it('gets the eastbound case right too, which wall clocks manage by luck', () => {
    // 23:40 in Tel Aviv to 23:55 in Reykjavík is later by the clock AND the same day, so a
    // naive rule agrees — kept so the pair above is a contrast rather than an assertion.
    const resolved = resolveJourneyDays(DATE, [at('23:40', TLV), at('23:55', KEF)]);
    expect(resolved.map((m) => m.dayOffset)).toEqual([0, 0]);
    expect(elapsedMinutes(resolved[0], resolved[1])).toBe(3 * 60 + 15);
  });

  it('counts every offset from the JOURNEY date, not from the moment above it', () => {
    // Amsterdam lands 19:40 the SAME day, leaves 00:00 the next, and Keflavík lands 02:10 —
    // which is still `למחרת` and not `+2`. Offsets chained off each predecessor would make
    // that last one the latter, which is the whole reason they count from the date.
    expect(
      offsets([at('15:30', TLV), at('19:40', AMS), at('00:00', AMS), at('02:10', KEF)]),
    ).toEqual([0, 0, 1, 1]);
  });

  it('never moves a moment backwards, so a journey cannot run in reverse', () => {
    // A stop leaving at 19:05 after landing at 19:40 is not an error to refuse (ADR-0150
    // §8) — it is tomorrow. This is the refusal §2 retires, stated as behaviour.
    expect(offsets([at('15:30', TLV), at('19:40', AMS), at('19:05', AMS)])).toEqual([0, 0, 1]);
  });
});

describe('resolveJourneyDays — the override, and its floor', () => {
  it('takes an explicit offset for the leg longer than a day', () => {
    // The one case the derivation cannot see: a sleeper train, a ferry.
    expect(offsets([at('23:40', TLV), at('04:25', KEF, 2)])).toEqual([0, 2]);
    const resolved = resolveJourneyDays(DATE, [at('23:40', TLV), at('04:25', KEF, 2)]);
    expect(elapsedMinutes(resolved[0], resolved[1])).toBe(31 * 60 + 45);
  });

  /** **This spec found a real bug and is kept for it.** The first implementation applied an
   *  override as `max(override, previousOffset)` and stopped, which guarantees the offset is
   *  not lower than its predecessor's — and says nothing about the INSTANT. Keflavík
   *  overridden to the same day as an Amsterdam departure, but at an earlier clock, resolved
   *  to a moment before it: a journey running backwards. An override is a floor on where the
   *  forward search starts, not an answer that replaces it. */
  it('will not let an override make the journey run backwards', () => {
    expect(offsets([at('15:30', TLV), at('19:40', AMS, 0), at('02:10', KEF, 0)])).toEqual([
      0, 0, 1,
    ]);
  });

  it('does not resolve past the bound, because further away is a typo not a leg', () => {
    // MAX_JOURNEY_DAY_SPAN is 2. Nothing real needs more, and an override says a real one.
    const far = offsets([at('12:00', TLV), at('11:59', TLV)]);
    expect(far[1]).toBe(1);
  });
});

describe('resolveJourneyDays — a half-filled journey invents nothing', () => {
  it('leaves a moment with no clock unresolved and stops the chain', () => {
    const resolved = resolveJourneyDays(DATE, [at('15:30', TLV), at('', AMS), at('02:10', KEF)]);
    expect(resolved[1].dayOffset).toBe(0);
    expect(Number.isFinite(resolved[1].at)).toBe(false);
    expect(elapsedMinutes(resolved[0], resolved[1])).toBeNull();
  });

  it('resolves nothing at all before the journey has its date', () => {
    const resolved = resolveJourneyDays('', [at('15:30', TLV), at('19:40', AMS)]);
    expect(resolved.every((m) => !Number.isFinite(m.at))).toBe(true);
  });
});
