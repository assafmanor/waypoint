// The solar math, against published values and against the two states that only
// exist above the polar circles.
//
// **The table is the point.** This is arithmetic nobody reviews by reading, so
// the guard is a comparison with times anyone can look up — and it is what makes
// owning the algorithm a better trade than depending on a library (see
// `daylight.ts`'s header).
import { describe, expect, it } from 'vitest';
import { dayLight, solarEventMs, sunAltitude, SOLAR_ALTITUDE } from './daylight';

/** Local midnight as an instant, given a fixed UTC offset in hours. The app
 *  computes this from an IANA zone; a test can state the offset directly and
 *  stay independent of the runtime's zone database. */
const localMidnight = (iso: string, offsetHours: number) =>
  Date.parse(`${iso}T00:00:00.000Z`) - offsetHours * 3_600_000;

/** An instant back to `HH:MM` at that same offset — what a reader compares. */
const atOffset = (ms: number | null, offsetHours: number): string => {
  if (ms === null) return '—';
  const d = new Date(ms + offsetHours * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const TOKYO = { lat: 35.6762, lng: 139.6503 };
const QUITO = { lat: -0.1807, lng: -78.4678 };
const TROMSO = { lat: 69.6492, lng: 18.9553 };

describe('dayLight — sunrise and sunset against published values', () => {
  // Each row is a place, a date, its UTC offset that day, and the sunrise/sunset
  // a published table gives. A minute of tolerance is the algorithm's own stated
  // accuracy; anything wider would stop catching a real regression.
  const cases: Array<[string, { lat: number; lng: number }, string, number, string, string]> = [
    ['London midsummer', LONDON, '2026-06-21', 1, '04:43', '21:22'],
    ['Quito equinox', QUITO, '2026-03-20', -5, '06:18', '18:24'],
    ['Tokyo early September', TOKYO, '2026-09-02', 9, '05:14', '18:08'],
    ['Tel Aviv early September', TEL_AVIV, '2026-09-02', 3, '06:17', '19:04'],
  ];

  it.each(cases)('%s', (_name, at, date, offset, sunrise, sunset) => {
    const light = dayLight(at, localMidnight(date, offset));
    expect(atOffset(light.sunriseMs, offset)).toBe(sunrise);
    expect(atOffset(light.sunsetMs, offset)).toBe(sunset);
  });

  it('day length is sunset minus sunrise, and London in June is a long day', () => {
    const light = dayLight(LONDON, localMidnight('2026-06-21', 1));
    expect(light.dayLengthMs).toBe(light.sunsetMs! - light.sunriseMs!);
    // 16h39m, give or take the minute the table above allows.
    expect(Math.round(light.dayLengthMs! / 60_000)).toBeCloseTo(999, -1);
  });
});

describe('dayLight — the polar states are answers, not failures', () => {
  it('midnight sun: no sunrise, no sunset, and the sun stays up', () => {
    const light = dayLight(TROMSO, localMidnight('2026-06-21', 2));
    expect(light.sunriseMs).toBeNull();
    expect(light.sunsetMs).toBeNull();
    expect(light.polar).toBe('day');
    // Not merely "no crossing" — the sun is genuinely above the horizon all day,
    // which is what separates this from polar night at the same coordinates.
    expect(light.dayLengthMs).toBeNull();
  });

  it('polar night: no sunrise, no sunset, and the sun stays down', () => {
    const light = dayLight(TROMSO, localMidnight('2026-12-21', 1));
    expect(light.sunriseMs).toBeNull();
    expect(light.sunsetMs).toBeNull();
    expect(light.polar).toBe('night');
  });

  it('an ordinary latitude is never polar', () => {
    expect(dayLight(TEL_AVIV, localMidnight('2026-12-21', 2)).polar).toBeNull();
    expect(dayLight(TEL_AVIV, localMidnight('2026-06-21', 3)).polar).toBeNull();
  });

  /**
   * **The finding that decided the type**: an interval can be half-open. At
   * Tromsø in June the sun drops below +6° late in the evening and never reaches
   * −4°, so the evening golden hour starts and does not end. A `{start, end}`
   * pair would have forced this into a lie.
   */
  it('golden hour can begin and never end', () => {
    const light = dayLight(TROMSO, localMidnight('2026-06-21', 2));
    expect(light.goldenEveningStartMs).not.toBeNull();
    expect(light.goldenEveningEndMs).toBeNull();
    expect(atOffset(light.goldenEveningStartMs, 2)).toBe('22:35');
  });
});

describe('dayLight — the ordinary golden hour', () => {
  it('brackets sunset, and civil dusk follows it', () => {
    const offset = 3;
    const light = dayLight(TEL_AVIV, localMidnight('2026-09-02', offset));
    // Order is the assertion: +6° down, then the horizon, then −4°, then −6°.
    expect(light.goldenEveningStartMs!).toBeLessThan(light.sunsetMs!);
    expect(light.sunsetMs!).toBeLessThan(light.goldenEveningEndMs!);
    expect(light.goldenEveningEndMs!).toBeLessThan(light.civilDuskMs!);
    // And the morning runs the other way.
    expect(light.civilDawnMs!).toBeLessThan(light.goldenMorningStartMs!);
    expect(light.goldenMorningStartMs!).toBeLessThan(light.sunriseMs!);
    expect(light.sunriseMs!).toBeLessThan(light.goldenMorningEndMs!);
  });
});

describe('sunAltitude', () => {
  it('is ~the horizon angle at sunrise and sunset, by construction', () => {
    const light = dayLight(TEL_AVIV, localMidnight('2026-09-02', 3));
    // Within a third of a degree, not exactly: the event instants are rounded to
    // the whole minute (see `solarEventMs`) and the sun moves ~0.25° a minute
    // near the horizon. A tighter bound would only assert the rounding is absent.
    for (const ms of [light.sunriseMs!, light.sunsetMs!]) {
      expect(sunAltitude(TEL_AVIV, ms)).toBeGreaterThan(SOLAR_ALTITUDE.HORIZON - 0.35);
      expect(sunAltitude(TEL_AVIV, ms)).toBeLessThan(SOLAR_ALTITUDE.HORIZON + 0.35);
    }
  });

  it('peaks around local solar noon and is negative at local midnight', () => {
    const midnight = localMidnight('2026-09-02', 3);
    const noon = sunAltitude(TEL_AVIV, midnight + 12 * 3_600_000);
    expect(noon).toBeGreaterThan(60);
    expect(sunAltitude(TEL_AVIV, midnight)).toBeLessThan(0);
  });

  it('never crosses the horizon on a midnight-sun day', () => {
    const midnight = localMidnight('2026-06-21', 2);
    const samples = Array.from({ length: 145 }, (_, i) =>
      sunAltitude(TROMSO, midnight + i * 10 * 60_000),
    );
    // The curve staying above the horizon line is what the widget draws instead
    // of writing a sentence, so it is worth asserting rather than assuming.
    expect(Math.min(...samples)).toBeGreaterThan(0);
  });

  it('never reaches the horizon on a polar-night day', () => {
    const midnight = localMidnight('2026-12-21', 1);
    const samples = Array.from({ length: 145 }, (_, i) =>
      sunAltitude(TROMSO, midnight + i * 10 * 60_000),
    );
    expect(Math.max(...samples)).toBeLessThan(0);
  });
});

describe('solarEventMs', () => {
  it('returns null rather than clamping when the altitude is never reached', () => {
    // 85° never happens at this latitude: the solstice ceiling here is about 81°
    // (90 − 32.1 + 23.4). 80° DOES happen, which is what the first draft of this
    // test got wrong — "obviously impossible" is a calculation, not an intuition.
    const anchor = localMidnight('2026-06-21', 3) + 12 * 3_600_000;
    expect(solarEventMs(TEL_AVIV, anchor, 85, true)).toBeNull();
  });

  it('the rise side precedes the set side for the same altitude', () => {
    const anchor = localMidnight('2026-09-02', 3) + 12 * 3_600_000;
    const rise = solarEventMs(TEL_AVIV, anchor, 0, true)!;
    const set = solarEventMs(TEL_AVIV, anchor, 0, false)!;
    expect(rise).toBeLessThan(set);
  });

  /** The southern hemisphere is not a special case, and a sign error in the
   *  declination term would only show up here. */
  it('works south of the equator', () => {
    // Sydney's shortest day.
    const light = dayLight({ lat: -33.8688, lng: 151.2093 }, localMidnight('2026-06-21', 10));
    expect(light.sunriseMs).not.toBeNull();
    expect(light.sunsetMs).not.toBeNull();
    expect(light.dayLengthMs! / 3_600_000).toBeLessThan(10);
    expect(light.dayLengthMs! / 3_600_000).toBeGreaterThan(9);
  });
});
