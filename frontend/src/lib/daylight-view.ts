// The daylight widget's view model (design brief 2026-09-02, mockup
// `daylight-on-the-day-v1.html`).
//
// Pure and injected, the same shape as `lib/glance-track.ts` and
// `lib/gap-character.ts`: instants in, fractions out. No formatting, no zone
// resolution, no `Date.now()`, nothing that measures the DOM — the widget only
// renders what this returns, which is what keeps `ui/domain` prop-fed
// (`frontend/CLAUDE.md`'s component layering).
//
// **Why the arc is sampled rather than approximated by a curve.** A sine bell
// costs exactly the same pixels and loses the two states the feature exists to
// show honestly: above the polar circles the sun's altitude either never reaches
// the horizon or never drops to it, and a decorative curve drawn through
// sunrise/sunset cannot express a day that has neither. Sampling the real
// altitude means the picture is the fact.
import { sunAltitude, type DayLight, type LatLng } from '@waypoint/shared';
import { SUN_ARC } from '../constants';

const MS_PER_DAY = 86_400_000;

/** One point on the arc: `frac` across the local day, `altitude` in degrees. */
export interface SunArcPoint {
  frac: number;
  altitude: number;
}

/** A golden-hour band, as fractions of the local day. */
export interface SunArcBand {
  from: number;
  to: number;
}

export interface SunArc {
  points: SunArcPoint[];
  /** Where the sun is right now, or `null` when this day is not today — a future
   *  day has no "now" to mark, exactly as `buildDayGlance` returns a null
   *  `nowFrac` for one. */
  now: SunArcPoint | null;
  /** Morning and evening gold, each clamped into the day. A HALF-OPEN interval
   *  (the sun enters gold and never leaves it, which happens every Arctic
   *  summer) runs to the day's edge rather than being dropped. */
  bands: SunArcBand[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The arc for one day at one place.
 *
 * `dayStartMs` is local midnight and `nowMs` is `null` unless this day is today
 * — both are the caller's to know, because both depend on the day's zone.
 */
export function sunArc(
  at: LatLng,
  dayStartMs: number,
  light: DayLight,
  nowMs: number | null,
): SunArc {
  const points: SunArcPoint[] = [];
  for (let i = 0; i <= SUN_ARC.SAMPLES; i++) {
    const frac = i / SUN_ARC.SAMPLES;
    points.push({ frac, altitude: sunAltitude(at, dayStartMs + frac * MS_PER_DAY) });
  }

  const fracOf = (ms: number) => clamp01((ms - dayStartMs) / MS_PER_DAY);
  const band = (fromMs: number | null, toMs: number | null): SunArcBand | null => {
    // Neither end present is no band at all; ONE end present is a real band that
    // runs to the edge of the day. Dropping it would silently delete the Arctic
    // summer's whole evening.
    if (fromMs === null && toMs === null) return null;
    const from = fromMs === null ? 0 : fracOf(fromMs);
    const to = toMs === null ? 1 : fracOf(toMs);
    return to > from ? { from, to } : null;
  };

  const bands = (
    light.polar === 'night'
      ? []
      : [
          band(light.goldenMorningStartMs, light.goldenMorningEndMs),
          band(light.goldenEveningStartMs, light.goldenEveningEndMs),
        ]
  ).filter((b): b is SunArcBand => b !== null);

  return {
    points,
    now: nowMs === null ? null : { frac: fracOf(nowMs), altitude: sunAltitude(at, nowMs) },
    bands,
  };
}

/**
 * **The sky's eight gradient stops**, as fractions of the local day.
 *
 * Four a side, and they are real astronomical positions rather than an even
 * ramp: night holds until civil dawn, turns through twilight, warms across the
 * horizon crossing itself, and settles into day once the sun clears golden
 * hour — then the reverse. Two stops a side was tried first and renders as hard
 * vertical stripes, because a gradient needs a position to interpolate TOWARD;
 * the extra pair is what makes it a sky instead of a flag.
 *
 * A polar day is all day and a polar night all night, expressed as degenerate
 * stops so the widget keeps one drawing path instead of branching.
 */
export interface SkyStops {
  dawnNight: number;
  dawnTwilight: number;
  dawnWarm: number;
  dawnDay: number;
  duskDay: number;
  duskWarm: number;
  duskTwilight: number;
  duskNight: number;
}

/** How long before civil dawn (and after civil dusk) the sky has fully
 *  committed to night — the outermost stop, so the twilight band has somewhere
 *  to ramp from. */
const TWILIGHT_LEAD_MS = 30 * 60_000;

export function skyStops(dayStartMs: number, light: DayLight): SkyStops {
  const all = (n: number): SkyStops => ({
    dawnNight: n,
    dawnTwilight: n,
    dawnWarm: n,
    dawnDay: n,
    duskDay: n,
    duskWarm: n,
    duskTwilight: n,
    duskNight: n,
  });
  if (light.polar === 'day')
    return { ...all(0), duskDay: 1, duskWarm: 1, duskTwilight: 1, duskNight: 1 };
  if (light.polar === 'night') return all(1);

  const fracOf = (ms: number | null, fallback: number) =>
    ms === null ? fallback : clamp01((ms - dayStartMs) / MS_PER_DAY);
  const civilDawn = light.civilDawnMs ?? light.sunriseMs;
  const civilDusk = light.civilDuskMs ?? light.sunsetMs;
  return {
    dawnNight: fracOf(civilDawn === null ? null : civilDawn - TWILIGHT_LEAD_MS, 0),
    dawnTwilight: fracOf(civilDawn, 0),
    dawnWarm: fracOf(light.sunriseMs, 0),
    dawnDay: fracOf(light.goldenMorningEndMs ?? light.sunriseMs, 0),
    duskDay: fracOf(light.goldenEveningStartMs ?? light.sunsetMs, 1),
    duskWarm: fracOf(light.sunsetMs, 1),
    duskTwilight: fracOf(civilDusk, 1),
    duskNight: fracOf(civilDusk === null ? null : civilDusk + TWILIGHT_LEAD_MS, 1),
  };
}
