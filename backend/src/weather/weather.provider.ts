// Where a forecast comes from (ADR-0218 §2), and where the provider's measured contract is
// turned into code (design brief 2026-09-02, "The provider's contract, as measured").
//
// **A declared provider behind a token-bound interface with exactly one implementation** — the
// same shape `fx.provider.ts` took from ADR-0166 §5's registry, and for the same reason: the
// choice was made on measured terms rather than on data quality, so it can move. Open-Meteo is
// better on every axis that is not licensing and remains the first thing to price if the answer
// to paying ever changes; NWS is a good SECOND source for the one country it is best in the
// world at. One interface makes either a file. No interface makes it a rewrite.
//
// Nothing here touches the database, the clock's ambient zone, or Nest. It is
// `(cell, zone, previous Last-Modified) → days`, which is what lets the roll-up — the largest
// single piece of work this decision creates — be tested against a recorded response.
import { z } from 'zod';
import {
  forecastCellCoord,
  forecastSeverity,
  isNightSymbol,
  todayInTz,
  type ForecastDay,
} from '@waypoint/shared';
import { EnrichmentFetcher, OutboundHttpError } from '../enrichment/outbound-fetch';
import { WEATHER_FETCH_TIMEOUT_MS } from '../common/env';

/** DI token — Nest cannot inject a TypeScript interface. */
export const WEATHER_PROVIDER = Symbol('WEATHER_PROVIDER');

/** What one pass over one cell came back with.
 *
 *  `notModified` is a **successful** refresh, not a miss (MET's own wording): the model has not
 *  been re-run, so the stored days and their `issuedAt` stand and only our caching clocks move. */
export type ProviderForecast =
  | {
      notModified: false;
      /** `properties.meta.updated_at` — the model's ISSUE time, which is the clock ADR-0218 §4's
       *  shelf life runs from. Deliberately not our fetch time. */
      issuedAt: string;
      /** The response's `Expires`, honoured rather than replaced by a TTL of our own. */
      expiresAt: Date;
      /** The response's `Last-Modified`, verbatim, to echo back next time. */
      lastModified: string | null;
      days: ForecastDay[];
    }
  | { notModified: true; expiresAt: Date; lastModified: string | null };

export interface WeatherProvider {
  readonly id: string;
  /** The credit the source's terms require, carried on the data so a second provider needs no
   *  frontend change to be credited correctly (ADR-0180 §7's call, unchanged). */
  readonly attribution: string;
  readonly attributionUrl: string;
  /** Fetch one cell, or throw. The caller never lets a throw escape. */
  fetch(cell: string, zone: string, lastModified?: string | null): Promise<ProviderForecast>;
}

/**
 * **The `complete` endpoint, and the reason is a field rather than a preference.**
 *
 * `compact` is the obvious pick — smaller, and this app wants none of the pressure/humidity/UV
 * that `complete` adds. It is the wrong pick, measured: of 87 rows, `compact` carries
 * `next_6_hours.air_temperature_max` on **zero** and `complete` on **81**. 21 KB buys the daily
 * extremes; without them the roll-up would have to infer them from `instant` samples, which the
 * next comment explains it cannot do well.
 */
const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';

/**
 * **MET requires an identifying `User-Agent` with a contact, and their own example shape is
 * `AcmeWeatherApp/0.9 github.com/acmeweatherapp` — a repo URL, never a person's email.**
 *
 * Its own rather than the fetcher's default, which names enrichment: this is a different
 * application to a different provider, and an unidentified (or misidentified) client is the one
 * they throttle first.
 */
const USER_AGENT = 'Waypoint/1.0 (trip weather; +https://github.com/assafmanor/waypoint)';

/** A 6-hour block, in ms. Every window MET publishes forward is one of these. */
const BLOCK_MS = 6 * 60 * 60 * 1000;

/** How long a response is assumed good for when it arrives without an `Expires`. Measured, MET
 *  always sends one (~22 min out); this is the floor for the day they don't, and it is short
 *  because a missing header is not a licence to stop asking. */
const DEFAULT_EXPIRES_MS = 20 * 60 * 1000;

/** Only the fields the roll-up reads. Everything else in `complete` is ignored by zod's default
 *  stripping — this is a third party's JSON reaching a global row every trip reads. */
export type ForwardBlock = z.infer<typeof forwardBlockSchema>;

const forwardBlockSchema = z.object({
  /** **`symbol_code` is in `summary`, not in `details`** — and it carries the day/night variant
   *  natively (`clearsky_day`, `fair_night`), which is what lets the glyph lookup be right after
   *  dark without the app computing anything. */
  summary: z.object({ symbol_code: z.string() }).optional(),
  details: z
    .object({
      air_temperature_max: z.number().optional(),
      air_temperature_min: z.number().optional(),
      /** **An amount, in mm. There is no `probability_of_precipitation` at this endpoint**, so
       *  no surface may imply a chance the source does not publish. */
      precipitation_amount: z.number().optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  properties: z.object({
    meta: z.object({
      updated_at: z.string(),
      units: z.record(z.string(), z.string()).optional(),
    }),
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({ next_6_hours: forwardBlockSchema.optional() }),
      }),
    ),
  }),
});

/** One disjoint 6-hour window, resolved out of the series. */
interface Block {
  startMs: number;
  symbolCode: string;
  tempMax?: number;
  tempMin?: number;
  precipMm: number;
}

/** Thrown when the response is well-formed but says something we have no surface for — today,
 *  only a temperature unit that is not Celsius. Distinct from a parse failure because it is the
 *  provider changing its contract, which is worth reading in a log rather than inferring. */
export class UnsupportedForecastError extends Error {
  constructor(message: string) {
    super(`forecast unsupported: ${message}`);
    this.name = 'UnsupportedForecastError';
  }
}

export class MetNoProvider implements WeatherProvider {
  readonly id = 'met-no';
  /** MET's required credit, in their own wording. NLOD 2.0 / CC BY 4.0. */
  readonly attribution = 'Data from MET Norway';
  readonly attributionUrl = 'https://www.met.no/en';

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  async fetch(cell: string, zone: string, lastModified?: string | null): Promise<ProviderForecast> {
    const at = forecastCellCoord(cell);
    if (!at) throw new UnsupportedForecastError(`unparseable cell "${cell}"`);

    const res = await this.fetcher.fetch(`${ENDPOINT}?lat=${at.lat}&lon=${at.lng}`, {
      timeoutMs: WEATHER_FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        // **Verbatim, and only the previous value** — MET's docs call out that an arbitrary
        // timestamp here is not the contract. This is the third of the three things they ask.
        ...(lastModified ? { 'If-Modified-Since': lastModified } : {}),
      },
    });

    const expiresAt = parseExpires(res.headers.get('expires'));
    const nextLastModified = res.headers.get('last-modified');

    // A `304` is a successful refresh: the model has not been re-run, so the stored days and
    // their issue time stand and only the caching clocks move.
    if (res.status === 304) return { notModified: true, expiresAt, lastModified: nextLastModified };
    if (res.status < 200 || res.status >= 300) {
      throw new OutboundHttpError(res.status, 'api.met.no', res.body.toString('utf8'));
    }

    const parsed = responseSchema.parse(JSON.parse(res.body.toString('utf8')));
    const unit = parsed.properties.meta.units?.['air_temperature'];
    // **Read, not assumed.** The app has no Fahrenheit surface, and an assumption here is
    // invisible until it is not.
    if (unit !== undefined && unit !== 'celsius') {
      throw new UnsupportedForecastError(`air_temperature in "${unit}", expected celsius`);
    }

    return {
      notModified: false,
      issuedAt: parsed.properties.meta.updated_at,
      expiresAt,
      lastModified: nextLastModified,
      days: rollUp(parsed.properties.timeseries, zone),
    };
  }
}

/** `Expires` as a date, falling back to a short window rather than to "never re-ask". */
function parseExpires(header: string | null): Date {
  const parsed = header ? Date.parse(header) : NaN;
  return Number.isNaN(parsed) ? new Date(Date.now() + DEFAULT_EXPIRES_MS) : new Date(parsed);
}

/**
 * **The daily roll-up — the largest single piece of work ADR-0218 creates**, because MET
 * publishes no daily aggregate. Three measured properties shape it, and every one of them is a
 * bug that would look correct in a test written against tomorrow:
 *
 *  1. **It reads `next_6_hours`, never `instant`.** The series is hourly for ~2.4 days and then
 *     6-hourly, so an `instant` roll-up computes day 1 from 24 samples and day 6 from 4.
 *     `next_6_hours` is the only block spanning both resolutions (81 of 87 rows) and it hands
 *     over `air_temperature_max`/`_min` directly instead of making us infer extremes.
 *  2. **The blocks OVERLAP in the hourly half** — a `next_6_hours` on every hourly row is 24
 *     overlapping windows a day, which would quadruple a precipitation sum. So the cover is
 *     built greedily and disjointly: take a block, skip to the first one starting at or after
 *     its end, repeat. That works across the resolution change without knowing where it is,
 *     which a fixed "rows at 00/06/12/18 UTC" filter would not — the series starts at 07:00Z and
 *     such a filter would silently drop the first five hours of today.
 *  3. **The final row carries no forward block at all** (nothing follows it to summarise), so it
 *     contributes nothing and needs no special case beyond skipping blockless rows.
 *
 * And the day boundaries are the **local** day's, in the cell's own zone (ADR-0107): every
 * timestamp MET publishes is `Z`, so bucketing them is the whole of what "the day's own zone"
 * costs. A block is attributed to the local day it STARTS in.
 */
export function rollUp(
  timeseries: readonly { time: string; data: { next_6_hours?: ForwardBlock } }[],
  zone: string,
): ForecastDay[] {
  const blocks: Block[] = [];
  let coveredUntil = -Infinity;
  for (const row of timeseries) {
    const forward = row.data.next_6_hours;
    if (!forward?.summary?.symbol_code) continue;
    const startMs = Date.parse(row.time);
    if (Number.isNaN(startMs) || startMs < coveredUntil) continue;
    blocks.push({
      startMs,
      symbolCode: forward.summary.symbol_code,
      tempMax: forward.details?.air_temperature_max,
      tempMin: forward.details?.air_temperature_min,
      precipMm: forward.details?.precipitation_amount ?? 0,
    });
    coveredUntil = startMs + BLOCK_MS;
  }
  if (blocks.length === 0) return [];

  const byDate = new Map<string, Block[]>();
  for (const block of blocks) {
    const date = todayInTz(zone, new Date(block.startMs));
    const bucket = byDate.get(date);
    if (bucket) bucket.push(block);
    else byDate.set(date, [block]);
  }

  const days: ForecastDay[] = [];
  for (const [date, dayBlocks] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    const temps = dayBlocks.filter(
      (b): b is Block & { tempMax: number; tempMin: number } =>
        b.tempMax !== undefined && b.tempMin !== undefined,
    );
    // A day whose blocks carry no temperatures has no high and no low, and a card cannot print
    // one — so it is beyond the horizon rather than a day with a blank number.
    if (temps.length === 0) continue;
    days.push({
      date,
      symbolCode: dominantSymbol(dayBlocks),
      tempMax: Math.max(...temps.map((b) => b.tempMax)),
      tempMin: Math.min(...temps.map((b) => b.tempMin)),
      // Rounded because these are millimetres of rain summed from floats, and `0.30000000000004`
      // is a fact about IEEE-754 rather than about the weather.
      precipMm: round1(dayBlocks.reduce((sum, b) => sum + b.precipMm, 0)),
    });
  }

  // **The trailing day is partial, and a partial day's max/min is not a daily extreme** — the
  // series ends mid-day (measured: `12:00Z`), so its last day is beyond the horizon (ADR-0218
  // §5's dashed placeholder), not a day with a suspiciously mild high. The test is exact and
  // needs no midnight arithmetic: if the last instant the cover reaches still falls inside the
  // final day, that day is not covered to its end.
  //
  // The FIRST day is partial too and is deliberately kept: it is the rest of today, which is the
  // fact the card exists to state.
  const lastCoveredMs = blocks[blocks.length - 1].startMs + BLOCK_MS - 1;
  const lastCoveredDate = todayInTz(zone, new Date(lastCoveredMs));
  while (days.length > 0 && days[days.length - 1].date >= lastCoveredDate) days.pop();

  return days;
}

/** The day's mark: the most severe block, ties broken toward the daylight variant.
 *
 *  **Severity**, because the mark answers "do I need a jacket or an umbrella in the next few
 *  hours" (brief §3.3) — one thunderstorm in an otherwise clear day is the fact worth the glyph,
 *  where a mean condition would print a sun over a day you get soaked in.
 *
 *  **The tiebreak is the variant, not the hour**, and deliberately: on a calm day every block
 *  ties at `clearsky`, and the one the card should print is `clearsky_day`. Asking which block
 *  is nearest local noon would answer the same question by reconstructing an offset this
 *  function does not have, which is a second derivation of the day's zone. Earliest breaks the
 *  remaining ties, so the choice is stable. */
function dominantSymbol(dayBlocks: readonly Block[]): string {
  return [...dayBlocks].sort(
    (a, b) =>
      forecastSeverity(a.symbolCode) - forecastSeverity(b.symbolCode) ||
      Number(isNightSymbol(a.symbolCode)) - Number(isNightSymbol(b.symbolCode)) ||
      a.startMs - b.startMs,
  )[0].symbolCode;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
