// `nextGoldenHour` — which of the day's two golden hours the widget names.
//
// **The defect this file was opened for** (owner, off the deployed app, 01:18
// local in Tbilisi): the widget printed the EVENING golden hour ⁦17⁩ hours away
// while the morning's was ⁦4½⁩ hours off. The first build passed
// `goldenEvening*` unconditionally — the mockup only ever drew that one and the
// port took it literally, even though the brief's feature list said "golden hour
// (start/end, **both ends of the day**)". So the rule below is the missing
// specification, not a new idea.
import { describe, expect, it } from 'vitest';
import { dayLight } from '@waypoint/shared';
import { nextGoldenHour } from './daylight-view';

/** Tbilisi, where the report came from. */
const TBILISI = { lat: 41.7151, lng: 44.8271 };
const TROMSO = { lat: 69.6492, lng: 18.9553 };
/** Svalbard, ⁦78°N⁩ — deep enough that the December sun never climbs to the −4°
 *  golden threshold at all. Tromsø is NOT deep enough, which is the correction
 *  below. */
const LONGYEARBYEN = { lat: 78.2232, lng: 15.6267 };

const localMidnight = (iso: string, offsetHours: number) =>
  Date.parse(`${iso}T00:00:00.000Z`) - offsetHours * 3_600_000;

const OFFSET = 4; // Georgia, UTC+4, no DST
const DAY_START = localMidnight('2026-09-03', OFFSET);
const at = (h: number, m = 0) => DAY_START + (h * 60 + m) * 60_000;
const light = dayLight(TBILISI, DAY_START);

const hhmm = (ms: number | null) =>
  ms === null ? null : new Date(ms + OFFSET * 3_600_000).toISOString().slice(11, 16);

describe('nextGoldenHour — the one still ahead', () => {
  it('at 01:18, names the MORNING golden hour (the reported defect)', () => {
    const gold = nextGoldenHour(light, at(1, 18));
    expect(gold?.which).toBe('morning');
    // Before sunrise, which is the whole point: this is the one you can still catch.
    expect(gold!.startMs!).toBeLessThan(light.sunriseMs!);
  });

  it('at 09:00, the morning is spent, so it names the evening', () => {
    expect(nextGoldenHour(light, at(9))?.which).toBe('evening');
  });

  it('names the evening while the evening is in progress', () => {
    // Mid-band: still the one you are in, not the next day's.
    const mid = (light.goldenEveningStartMs! + light.goldenEveningEndMs!) / 2;
    expect(nextGoldenHour(light, mid)?.which).toBe('evening');
  });

  it('switches exactly when the morning band ENDS, not at sunrise', () => {
    // Sunrise is inside the morning band, so the light is still golden after it —
    // switching at sunrise would drop the half of it people actually shoot in.
    const justAfterSunrise = light.sunriseMs! + 60_000;
    expect(justAfterSunrise).toBeLessThan(light.goldenMorningEndMs!);
    expect(nextGoldenHour(light, justAfterSunrise)?.which).toBe('morning');
    expect(nextGoldenHour(light, light.goldenMorningEndMs! + 60_000)?.which).toBe('evening');
  });

  it('after both are spent, names the evening as the day’s own', () => {
    // 23:00: nothing on THIS day is ahead. The widget is a day surface, so it
    // states the day's headline gold rather than reaching into tomorrow, which
    // would disagree with the arc drawn above it.
    expect(nextGoldenHour(light, at(23))?.which).toBe('evening');
  });

  it('on a day being browsed rather than lived, names the evening', () => {
    // No clock for a future day (the arc draws no sun disc either), so there is
    // no "next" — the evening is the one a person plans around.
    expect(nextGoldenHour(light, null)?.which).toBe('evening');
  });
});

describe('nextGoldenHour — the edges', () => {
  it('is null when the day has no golden hour at all', () => {
    const deepPolarNight = dayLight(LONGYEARBYEN, localMidnight('2026-12-21', 1));
    expect(deepPolarNight.polar).toBe('night');
    expect(deepPolarNight.goldenMorningStartMs).toBeNull();
    expect(deepPolarNight.goldenEveningEndMs).toBeNull();
    expect(nextGoldenHour(deepPolarNight, null)).toBeNull();
  });

  /**
   * **A polar night is not automatically a night without gold**, and the first
   * draft of this file assumed it was. At Tromsø on the solstice the sun peaks
   * at about −3.1°, which is ABOVE the −4° golden threshold — so the bands are
   * real and the sky genuinely glows, even though the sun never rises. What
   * keeps the chip off that widget is `light.polar`, which the foot branches on
   * first, not an absence of bands.
   */
  it('a shallow polar night still has golden bands', () => {
    const tromso = dayLight(TROMSO, localMidnight('2026-12-21', 1));
    expect(tromso.polar).toBe('night');
    expect(nextGoldenHour(tromso, null)).not.toBeNull();
  });

  /** A half-open band still counts as ahead: at Tromsø in June the sun enters
   *  gold and never leaves, so "has it ended" has no answer and the band is
   *  live for the rest of the day. */
  it('treats a band with no end as still ahead', () => {
    const start = localMidnight('2026-06-21', 2);
    const midnightSun = dayLight(TROMSO, start);
    expect(midnightSun.goldenEveningStartMs).not.toBeNull();
    expect(midnightSun.goldenEveningEndMs).toBeNull();
    const gold = nextGoldenHour(midnightSun, start + 23 * 3_600_000);
    expect(gold?.which).toBe('evening');
    expect(gold?.endMs).toBeNull();
  });

  it('the times it returns are the day’s own, unformatted', () => {
    const gold = nextGoldenHour(light, at(1, 18))!;
    expect(hhmm(gold.startMs)).toBe(hhmm(light.goldenMorningStartMs));
    expect(hhmm(gold.endMs)).toBe(hhmm(light.goldenMorningEndMs));
  });
});
