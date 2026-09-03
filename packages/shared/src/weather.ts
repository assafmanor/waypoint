// The forecast, as a shape, a cell key and two derived facts (ADR-0218).
//
// The store is **global and keyed by (cell, day)** — `PlaceEnrichment`'s shape
// rather than `FxRateSet`'s, because a forecast is many bounded, expiring rows
// and a rate set is one document (§1). What it borrows from FX is the *policy*,
// which lives in `weather.service.ts`, not here.
//
// Three things live in this package rather than in either app, each because both
// apps need the same answer (`packages/shared/CLAUDE.md`):
//
//   - **the cell key**, because the backend writes rows by it and the frontend
//     looks rows up by it, and two roundings that disagree is a card that is
//     permanently absent for no visible reason;
//   - **the wire shape**;
//   - **`forecastCondition` + `FORECAST_GLYPH`**, the `symbol_code` lookup
//     ADR-0218 §7 fixes as the condition mark. The mark stays an EMOJI: the app
//     does not compute a condition, MET Norway does, so it is a fact received
//     and belongs with the per-entity badges rather than with the marks the app
//     draws (`SunGlyph`). §7's tripwire is the one thing that reopens it — if the
//     card ever grows an illustration, the mark joins it and becomes chrome.
//
// **No Hebrew here.** `forecastCondition` returns a stable key and the frontend
// looks its own word up by it, exactly as `IconGroup.id` does (ADR-0009).
import { z } from 'zod';

/**
 * **The cache key's grid, in degrees** (ADR-0218 §3).
 *
 * ⁦0.1°⁩ is ~⁦11km⁩ of latitude — the same distance the frontend already calls
 * `DAY_ANCHOR_AGREE_M`, and deliberately so: two stops the day anchor treats as
 * one place must not fetch two forecasts. It throws nothing away, because the
 * providers snap to their own grids first and at some sites that grid is
 * **coarser** than this (Athens comes back as a flat `38,23.75`).
 *
 * Keyed on a cell rather than a `placeId` because `Place` is trip-scoped by
 * decision, so a `placeId` key fetches the same hotel twice for two trips.
 */
export const FORECAST_CELL_DEG = 0.1;

/** Decimals in a cell key. Derived from the grid above rather than written twice. */
const CELL_DECIMALS = Math.max(0, Math.ceil(-Math.log10(FORECAST_CELL_DEG)));

/**
 * The row key for a coordinate: `"35.7,139.7"`.
 *
 * A **string** rather than a pair, because it is a primary-key column, a `Map`
 * key and a JSON object key on three different sides of the wire, and every one
 * of those wants one scalar. Rounded half-away-from-zero by `toFixed`, and `-0`
 * is normalised — `(-0).toFixed(1)` is `"-0.0"`, which would key the same cell
 * twice on the equator and the prime meridian.
 */
export function forecastCell(lat: number, lng: number): string {
  const round = (n: number) => {
    const rounded = Number(n.toFixed(CELL_DECIMALS));
    // Normalised AFTER rounding, not before: `-0.02` is not `-0`, but it rounds
    // to one, and `(-0).toFixed(1)` is `"-0.0"` — which would key the cell on the
    // equator and the prime meridian twice.
    return (rounded === 0 ? 0 : rounded).toFixed(CELL_DECIMALS);
  };
  return `${round(lat)},${round(lng)}`;
}

/** The centre of a cell, for the request that fills it. Rounding the request to
 *  the cell — rather than sending the caller's exact point — is what makes two
 *  places in one cell one fetch instead of two identical rows' worth of traffic. */
export function forecastCellCoord(cell: string): { lat: number; lng: number } | undefined {
  const [lat, lng] = cell.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

/**
 * **What a condition IS, as a stable key.**
 *
 * MET publishes ~⁦45⁩ `symbol_code`s that are one of these nine crossed with an
 * intensity (`light`/`heavy`), a shower flag, a thunder flag and a day/night
 * variant — plus two the source itself misspells (`lightssleetshowersandthunder`).
 * So the classifier below reads the code rather than enumerating it, and the
 * **glyph** table is the exhaustive `Record` ADR-0218 §7 asks for. Enumerating 45
 * codes with two known typos in them is the more fragile of the two, not the more
 * rigorous.
 *
 * Showers are kept apart from steady rain and nothing else is: `ממטרים` and
 * `גשום` are different answers to "do I need an umbrella for the afternoon", and
 * intensity is not — `heavyrain` and `lightrain` both mean carry it.
 */
export const FORECAST_CONDITION = {
  CLEAR: 'clear',
  FAIR: 'fair',
  PARTLY_CLOUDY: 'partlycloudy',
  CLOUDY: 'cloudy',
  FOG: 'fog',
  RAIN_SHOWERS: 'rainshowers',
  RAIN: 'rain',
  SLEET: 'sleet',
  SNOW: 'snow',
  THUNDER: 'thunder',
} as const satisfies Record<string, string>;

export type ForecastCondition = (typeof FORECAST_CONDITION)[keyof typeof FORECAST_CONDITION];

/**
 * **Severity order, most severe first** — and it is a product decision, not a
 * meteorological one. The day's mark answers "do I need a jacket or an umbrella
 * in the next few hours" (brief §3.3), so one thunderstorm in an otherwise clear
 * day is the fact worth the glyph. A mean condition would print ☀️ over a day
 * you get soaked in.
 */
const CONDITION_SEVERITY: readonly ForecastCondition[] = [
  FORECAST_CONDITION.THUNDER,
  FORECAST_CONDITION.SNOW,
  FORECAST_CONDITION.SLEET,
  FORECAST_CONDITION.RAIN,
  FORECAST_CONDITION.RAIN_SHOWERS,
  FORECAST_CONDITION.FOG,
  FORECAST_CONDITION.CLOUDY,
  FORECAST_CONDITION.PARTLY_CLOUDY,
  FORECAST_CONDITION.FAIR,
  FORECAST_CONDITION.CLEAR,
];

/** How severe, as a sortable number. Lower is worse.
 *
 *  There is **one** degradation rule and it is `forecastCondition`'s: a code MET
 *  adds tomorrow reads as `cloudy`, so it ranks as cloudy here too and cannot
 *  outrank rain for the day's mark. A second fallback in this function would be a
 *  second answer to the same question. */
export function forecastSeverity(symbolCode: string): number {
  return CONDITION_SEVERITY.indexOf(forecastCondition(symbolCode));
}

/** Ordered because the tests overlap: `sleet` contains no `rain`, but
 *  `heavyrainshowersandthunder` contains all of thunder, rain and showers, and
 *  the first match must be the most severe. */
const CONDITION_MARKERS: readonly (readonly [marker: string, condition: ForecastCondition])[] = [
  ['thunder', FORECAST_CONDITION.THUNDER],
  ['snow', FORECAST_CONDITION.SNOW],
  ['sleet', FORECAST_CONDITION.SLEET],
  ['rainshowers', FORECAST_CONDITION.RAIN_SHOWERS],
  ['rain', FORECAST_CONDITION.RAIN],
  ['fog', FORECAST_CONDITION.FOG],
  ['partlycloudy', FORECAST_CONDITION.PARTLY_CLOUDY],
  ['cloudy', FORECAST_CONDITION.CLOUDY],
  ['fair', FORECAST_CONDITION.FAIR],
  ['clearsky', FORECAST_CONDITION.CLEAR],
];

/** A MET `symbol_code` (`partlycloudy_day`, `heavysleetshowersandthunder`) to the
 *  nine-value key a surface renders. Falls back to `CLOUDY` — a mark we cannot
 *  read must degrade to something unremarkable, never to a sun. */
export function forecastCondition(symbolCode: string): ForecastCondition {
  const code = symbolCode.toLowerCase();
  for (const [marker, condition] of CONDITION_MARKERS) {
    if (code.includes(marker)) return condition;
  }
  return FORECAST_CONDITION.CLOUDY;
}

/** Whether a code names the night variant. MET carries `_day` / `_night` /
 *  `_polartwilight` natively, which is what lets the lookup be right after dark
 *  **without the app computing anything** — the property ADR-0218 §7 leans on. */
export function isNightSymbol(symbolCode: string): boolean {
  return symbolCode.toLowerCase().endsWith('_night');
}

/**
 * The mark itself. Exhaustive over `ForecastCondition`, so a tenth condition is a
 * compile error here rather than a blank square on the card — the property
 * `BOOKING_TYPE_PROFILE` has and the reason this is a `Record` and not a `Map`.
 *
 * Only four conditions actually differ after dark; the rest repeat themselves
 * rather than being special-cased at the call site.
 */
export const FORECAST_GLYPH = {
  clear: { day: '☀️', night: '🌙' },
  fair: { day: '🌤️', night: '🌙' },
  partlycloudy: { day: '⛅', night: '☁️' },
  cloudy: { day: '☁️', night: '☁️' },
  fog: { day: '🌫️', night: '🌫️' },
  rainshowers: { day: '🌦️', night: '🌧️' },
  rain: { day: '🌧️', night: '🌧️' },
  sleet: { day: '🌨️', night: '🌨️' },
  snow: { day: '❄️', night: '❄️' },
  thunder: { day: '⛈️', night: '⛈️' },
} as const satisfies Record<ForecastCondition, { day: string; night: string }>;

/** The emoji for a `symbol_code`, honouring its own day/night variant. */
export function forecastGlyph(symbolCode: string): string {
  const glyph = FORECAST_GLYPH[forecastCondition(symbolCode)];
  return isNightSymbol(symbolCode) ? glyph.night : glyph.day;
}

export const forecastDaySchema = z.object({
  /** `YYYY-MM-DD` **in the day's own zone**, which is the zone below and not UTC
   *  (ADR-0107). Every instant the provider publishes is `Z`, so the roll-up's
   *  whole job is putting them in the right local day. */
  date: z.string(),
  /** The provider's own code, stored verbatim rather than pre-mapped: it is the
   *  provenance, it carries the day/night variant, and a change to the glyph
   *  table must not require a re-fetch. */
  symbolCode: z.string(),
  tempMax: z.number(),
  tempMin: z.number(),
  /** **An amount in millimetres, and there is no probability** (ADR-0218's
   *  consequences). MET publishes no `probability_of_precipitation`, so no copy
   *  on any surface may imply a chance. */
  precipMm: z.number().nonnegative(),
});
export type ForecastDay = z.infer<typeof forecastDaySchema>;

export const forecastCellSchema = z.object({
  /** `forecastCell(lat, lng)` — see above. */
  cell: z.string(),
  /** The IANA zone the days below were bucketed in, resolved from the cell's own
   *  coordinate. Carried so a reader can tell what "Tuesday" meant. */
  zone: z.string(),
  /** **The model's issue time (`meta.updated_at`), not our fetch time**, and the
   *  distinction is the whole of ADR-0218 §4: the shelf life runs from when the
   *  forecast was *made*. A `304` refresh moves our fetch clock and leaves this
   *  alone, which is correct — nothing new was published. */
  issuedAt: z.string(),
  /** Ascending by date, and only the days the provider actually reaches: a
   *  trailing partial day is beyond the horizon (§5), not a mild high. */
  days: z.array(forecastDaySchema),
});
export type ForecastCell = z.infer<typeof forecastCellSchema>;

export const forecastSchema = z.object({
  /** The attribution the source's terms make mandatory, carried on the data
   *  rather than hardcoded at a surface — the same call ADR-0180 §7 made, and for
   *  the same reason: a second provider must not need a frontend change to be
   *  credited correctly. */
  provider: z.string(),
  providerUrl: z.string(),
  /** One entry per coordinate cell this trip can ask about. */
  cells: z.array(forecastCellSchema),
});
export type Forecast = z.infer<typeof forecastSchema>;

/**
 * **How long a forecast is worth showing** (ADR-0218 §4, owner 2026-09-03).
 *
 * ADR-0180 §4 keys a rate's absence on existence, not age — a three-day-old
 * published rate is still the rate. **This inverts that**, and only that: a
 * five-day-old forecast is not stale, it is wrong, and wrong on the surface a
 * person checks *instead of* looking out of the window.
 *
 * Today earns the tighter bound because today's weather is the fact being
 * substituted for a window; a day-4 forecast barely moves in a day. The accepted
 * cost is stated rather than smoothed: on a patchy connection abroad the card
 * disappears after ~⁦6⁩ hours offline. That is the honest failure, and it is a
 * visible one.
 */
export const FORECAST_MAX_AGE_TODAY_MS = 6 * 60 * 60 * 1000;
export const FORECAST_MAX_AGE_AHEAD_MS = 24 * 60 * 60 * 1000;

/** Is a cell's forecast still worth showing for a day at this distance?
 *
 *  Clock-injected, like everything else in this package: the caller owns `now`
 *  and owns which day counts as today (that is a zone question, ADR-0107). */
export function isForecastFresh(issuedAt: string, nowMs: number, isToday: boolean): boolean {
  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued)) return false;
  const age = nowMs - issued;
  // A forecast issued in the future is a clock disagreement, not a fresher
  // forecast — negative ages read as fresh rather than as an error.
  return age <= (isToday ? FORECAST_MAX_AGE_TODAY_MS : FORECAST_MAX_AGE_AHEAD_MS);
}

/** One day at one cell, or `undefined` — which is the state for "beyond the
 *  provider's horizon" as much as for "we hold nothing yet", because the surface
 *  renders the same dashed placeholder for both (§5). */
export function forecastDayAt(
  forecast: Forecast | null | undefined,
  cell: string | undefined,
  date: string,
): { day: ForecastDay; cell: ForecastCell } | undefined {
  if (!forecast || !cell) return undefined;
  const found = forecast.cells.find((c) => c.cell === cell);
  const day = found?.days.find((d) => d.date === date);
  return found && day ? { day, cell: found } : undefined;
}
