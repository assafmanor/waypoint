// Sunrise, sunset and golden hour, as arithmetic (design brief 2026-09-02 §2.4).
//
// **This is the half of "weather and sunrise hours" that needs no provider.** A
// solar position is a function of (latitude, longitude, instant) — no key, no
// store, no network, no cold state, and no horizon: it answers for a day a year
// out exactly as well as for today. That is why it ships separately from the
// forecast, and why root rule 5 (offline reads) is satisfied here by
// construction rather than by mirroring anything into Dexie.
//
// **The algorithm is NOAA's, owned rather than depended on.** `suncalc` is small
// and good, but this package carries exactly one runtime dependency (`zod`),
// both apps import it, and a test table was owed either way — so doubling the
// dependency surface for sixty lines of trigonometry was the wrong trade. It is
// accurate to about a minute below |lat| 65°, which is far finer than any
// surface here renders.
//
// **Everything returns absolute epoch milliseconds**, never a local wall time.
// The caller owns the zone (ADR-0107 derives it per day) and formats with it;
// this file never asks the environment what time it is or where it is, which is
// the rule `packages/shared/CLAUDE.md` states for impure logic. The one input
// that carries a zone is `dayStartMs` — the instant of local midnight, which the
// caller computes because only the caller knows the day's zone.
import type { LatLng } from './geo';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
/** Local noon, as an offset from local midnight — the anchor every event on a
 *  day is solved around. Noon rather than midnight because the sun's declination
 *  moves during a day, and noon is the point both halves are nearest to. */
const NOON_OFFSET_MS = MS_PER_DAY / 2;

/**
 * The sun's altitude, in degrees, at the moments this feature cares about.
 *
 * Named because they are the feature: every time the app prints is one of these
 * angles solved for an instant, and a bare `-0.833` at a call site says nothing
 * about why it is not zero.
 */
export const SOLAR_ALTITUDE = {
  /** Sunrise / sunset. Not `0`: the sun's own radius plus atmospheric refraction
   *  put its centre this far below the true horizon when its upper limb touches. */
  HORIZON: -0.833,
  /** Golden hour's outer edge — the sun descending past this is when the light
   *  turns. */
  GOLDEN: 6,
  /** Golden hour's inner edge, below which it is dusk rather than gold. */
  GOLDEN_END: -4,
  /** Civil twilight: the last light you can still read by. */
  CIVIL: -6,
} as const satisfies Record<string, number>;

/** Julian day for 00:00 UT of a Gregorian calendar date. */
function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** The sun's declination and the equation of time, at a Julian day. */
function solarParams(jd: number): { declination: number; equationOfTime: number } {
  const t = (jd - 2451545) / 36525;
  const meanLongitude = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre =
    Math.sin(meanAnomaly * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * RAD) * 0.000289;
  const apparentLongitude =
    meanLongitude + centre - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * RAD);
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);
  const declination =
    Math.asin(Math.sin(obliquity * RAD) * Math.sin(apparentLongitude * RAD)) * DEG;
  const y = Math.tan((obliquity / 2) * RAD) ** 2;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * meanLongitude * RAD) -
      2 * eccentricity * Math.sin(meanAnomaly * RAD) +
      4 * eccentricity * y * Math.sin(meanAnomaly * RAD) * Math.cos(2 * meanLongitude * RAD) -
      0.5 * y * y * Math.sin(4 * meanLongitude * RAD) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly * RAD));
  return { declination, equationOfTime };
}

/** UTC midnight of the calendar day an instant falls in, plus that date's parts. */
function utcDayOf(atMs: number): { midnightMs: number; jd: number } {
  const d = new Date(atMs);
  const jd = julianDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { midnightMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), jd };
}

/**
 * **The sun's altitude at an instant**, in degrees above the horizon.
 *
 * Negative below it. This is what a curve of the day is drawn from, and it is
 * exported because a picture of the sun's arc is the one rendering that cannot
 * be assembled from the event times alone.
 */
export function sunAltitude(at: LatLng, atMs: number): number {
  const { midnightMs, jd: dayJd } = utcDayOf(atMs);
  const utcMinutes = (atMs - midnightMs) / MS_PER_MINUTE;
  const { declination, equationOfTime } = solarParams(dayJd + utcMinutes / 1440);
  const trueSolarMinutes = utcMinutes + equationOfTime + 4 * at.lng;
  const hourAngle = trueSolarMinutes / 4 - 180;
  return (
    Math.asin(
      Math.sin(at.lat * RAD) * Math.sin(declination * RAD) +
        Math.cos(at.lat * RAD) * Math.cos(declination * RAD) * Math.cos(hourAngle * RAD),
    ) * DEG
  );
}

/**
 * **When the sun reaches `altitudeDeg`**, on the morning (`rise`) or evening side
 * of the solar day containing `anchorMs`, as an absolute instant.
 *
 * `null` when it never does that day — which above the polar circles is an
 * ordinary answer and not a failure, exactly as `crossRate` returns `undefined`
 * for a pair no source prices. A surface renders that state; it never clamps it
 * to a time, because a wrong answer wearing a clock is worse than no answer.
 *
 * Solved twice: the first pass uses local noon's declination, the second uses
 * the declination at the instant the first pass found. One pass is out by a few
 * seconds near the solstices; two is exact to the algorithm's own accuracy.
 *
 * **Rounded to the whole minute, deliberately.** The algorithm's own accuracy is
 * about a minute, so the seconds are noise — and carrying them would set a trap
 * at every consumer, because `Intl` (and so every clock this app prints)
 * TRUNCATES: a 06:16:52 sunrise would render `06:16` where every published table
 * says `06:17`. Rounding once, here, means the stored instant, the rendered time
 * and the test table all agree.
 */
export function solarEventMs(
  at: LatLng,
  anchorMs: number,
  altitudeDeg: number,
  rise: boolean,
): number | null {
  const { midnightMs, jd: dayJd } = utcDayOf(anchorMs);
  let jd = dayJd + 0.5;
  let eventMs: number | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const { declination, equationOfTime } = solarParams(jd);
    const cosHourAngle =
      (Math.sin(altitudeDeg * RAD) - Math.sin(at.lat * RAD) * Math.sin(declination * RAD)) /
      (Math.cos(at.lat * RAD) * Math.cos(declination * RAD));
    // Out of range in either direction is the polar answer: above 1 the sun never
    // climbs that high, below -1 it never falls that low. Both are "no crossing".
    if (cosHourAngle > 1 || cosHourAngle < -1) return null;
    const hourAngle = Math.acos(cosHourAngle) * DEG;
    const solarNoonMinutes = 720 - 4 * at.lng - equationOfTime;
    const minutes = rise ? solarNoonMinutes - 4 * hourAngle : solarNoonMinutes + 4 * hourAngle;
    eventMs = midnightMs + minutes * MS_PER_MINUTE;
    jd = dayJd + minutes / 1440;
  }
  return eventMs === null ? null : Math.round(eventMs / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/**
 * Whether the sun spends the whole day above the horizon, or never reaches it.
 *
 * Derived from the hour-angle cosine rather than by sampling altitudes, so it is
 * exact at the boundary instead of depending on how finely something was
 * sampled. `null` is the ordinary case: the sun rises and sets.
 */
function polarState(at: LatLng, anchorMs: number): 'day' | 'night' | null {
  const { jd } = utcDayOf(anchorMs);
  const { declination } = solarParams(jd + 0.5);
  const cosHourAngle =
    (Math.sin(SOLAR_ALTITUDE.HORIZON * RAD) -
      Math.sin(at.lat * RAD) * Math.sin(declination * RAD)) /
    (Math.cos(at.lat * RAD) * Math.cos(declination * RAD));
  if (cosHourAngle < -1) return 'day';
  if (cosHourAngle > 1) return 'night';
  return null;
}

/**
 * A day's daylight at a place.
 *
 * **Every field is independently optional, and that is not defensive typing.**
 * Above the polar circles the intervals genuinely come apart: at Tromsø on
 * 2026-06-21 the sun drops below +6° at 22:35 and never reaches −4°, so the
 * evening golden hour has a start and no end. A type of `{start, end} | null`
 * cannot express that, and a surface built on one prints `22:35–undefined`.
 */
export interface DayLight {
  sunriseMs: number | null;
  sunsetMs: number | null;
  /** The sun crossing −4° upward: the morning's golden hour begins. */
  goldenMorningStartMs: number | null;
  /** …and +6° upward, where it ends. */
  goldenMorningEndMs: number | null;
  /** The sun crossing +6° downward: the evening's golden hour begins. */
  goldenEveningStartMs: number | null;
  /** …and −4° downward, where it ends. */
  goldenEveningEndMs: number | null;
  civilDawnMs: number | null;
  civilDuskMs: number | null;
  /** Sunset − sunrise, or `null` on a polar day where the subtraction has no
   *  meaning rather than a large value. */
  dayLengthMs: number | null;
  /** `'day'` = the sun never sets, `'night'` = it never rises, `null` = ordinary. */
  polar: 'day' | 'night' | null;
}

/**
 * **The day's daylight**, solved around local noon.
 *
 * `dayStartMs` is the instant of **local midnight** — the caller supplies it
 * because only the caller knows which zone the day is lived in (ADR-0107), and
 * accepting a zone here would make this function ask the environment a question,
 * which is the line `packages/shared/CLAUDE.md` draws.
 */
export function dayLight(at: LatLng, dayStartMs: number): DayLight {
  const anchorMs = dayStartMs + NOON_OFFSET_MS;
  const event = (altitude: number, rise: boolean) => solarEventMs(at, anchorMs, altitude, rise);
  const sunriseMs = event(SOLAR_ALTITUDE.HORIZON, true);
  const sunsetMs = event(SOLAR_ALTITUDE.HORIZON, false);
  return {
    sunriseMs,
    sunsetMs,
    goldenMorningStartMs: event(SOLAR_ALTITUDE.GOLDEN_END, true),
    goldenMorningEndMs: event(SOLAR_ALTITUDE.GOLDEN, true),
    goldenEveningStartMs: event(SOLAR_ALTITUDE.GOLDEN, false),
    goldenEveningEndMs: event(SOLAR_ALTITUDE.GOLDEN_END, false),
    civilDawnMs: event(SOLAR_ALTITUDE.CIVIL, true),
    civilDuskMs: event(SOLAR_ALTITUDE.CIVIL, false),
    dayLengthMs: sunriseMs !== null && sunsetMs !== null ? sunsetMs - sunriseMs : null,
    polar: polarState(at, anchorMs),
  };
}
