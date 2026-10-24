// The roll-up's spec, and it is mostly a spec about the four traps the brief measured
// (2026-09-02, "The provider's contract, as measured"). Each of them looks correct in a test
// written against tomorrow, which is why each has a case here written against day 6.
import { describe, expect, it, vi } from 'vitest';
import {
  MetNoProvider,
  UnsupportedForecastError,
  rollUp,
  type ForwardBlock,
} from './weather.provider';
import type { EnrichmentFetcher } from '../enrichment/outbound-fetch';

const HOUR_MS = 3_600_000;

interface Row {
  time: string;
  data: { next_6_hours?: ForwardBlock };
}

const block = (symbol: string, max: number, min: number, precip = 0): ForwardBlock => ({
  summary: { symbol_code: symbol },
  details: { air_temperature_max: max, air_temperature_min: min, precipitation_amount: precip },
});

/**
 * **The measured shape of a real `complete` response**, rebuilt rather than pasted: 87 rows
 * running `2026-09-03T07:00Z` → `2026-09-12T12:00Z` (~9.2 days), **hourly for the first 59 rows
 * and 6-hourly for the remaining 28**, with `next_6_hours` on every row except the last — which
 * carries no forward block at all, because nothing follows it to summarise.
 *
 * Every row gets the same `0.5mm`, so a roll-up that counted the OVERLAPPING hourly blocks
 * instead of a disjoint cover would show it immediately: hour-by-hour there are 24 six-hour
 * windows a day, and 12mm of rain a day is not what the provider said.
 */
function measuredSeries(opts: { symbolOf?: (t: Date) => string } = {}): Row[] {
  const start = Date.parse('2026-09-03T07:00:00Z');
  const end = Date.parse('2026-09-12T12:00:00Z');
  const times: number[] = [];
  for (let i = 0; i < 59; i++) times.push(start + i * HOUR_MS);
  for (let t = times[times.length - 1] + HOUR_MS; t <= end; t += 6 * HOUR_MS) times.push(t);

  return times.map((t, i) => {
    const day = Math.floor((t - start) / (24 * HOUR_MS));
    const symbol = opts.symbolOf?.(new Date(t)) ?? 'partlycloudy_day';
    return {
      time: new Date(t).toISOString(),
      // The final row has no forward block — trap 3.
      data: i === times.length - 1 ? {} : { next_6_hours: block(symbol, 25 + day, 15 + day, 0.5) },
    };
  });
}

describe('rollUp', () => {
  it('produces one entry per local day, ascending, with the day’s own extremes', () => {
    const days = rollUp(measuredSeries(), 'Asia/Tokyo');
    expect(days.length).toBeGreaterThan(5);
    expect([...days].sort((a, b) => a.date.localeCompare(b.date))).toEqual(days);
    expect(days[0].date).toBe('2026-09-03');
    for (const day of days) expect(day.tempMax).toBeGreaterThanOrEqual(day.tempMin);
  });

  it('takes a DISJOINT 6-hour cover, so overlapping hourly blocks do not multiply the rain', () => {
    const days = rollUp(measuredSeries(), 'Asia/Tokyo');
    // At most four disjoint 6-hour blocks fit in a day, each carrying 0.5mm. Reading every
    // hourly row's `next_6_hours` would give ~12mm — four times the truth, and only on the days
    // inside the hourly window, which is what makes it look right in a test against tomorrow.
    for (const day of days) expect(day.precipMm).toBeLessThanOrEqual(2);
    const inHourlyWindow = days.find((d) => d.date === '2026-09-04');
    expect(inHourlyWindow?.precipMm).toBe(2);
  });

  it('reads the same resolution on day 6 as on day 1 — the instant-roll-up trap', () => {
    // An `instant`-based roll-up computes day 1 from 24 samples and day 6 from 4, and nothing
    // about the output says so. `next_6_hours` spans both halves of the series, so a late day is
    // built from the same kind of block as an early one.
    const days = rollUp(measuredSeries(), 'Asia/Tokyo');
    const early = days.find((d) => d.date === '2026-09-04');
    const late = days.find((d) => d.date === '2026-09-09');
    expect(early?.precipMm).toBe(late?.precipMm);
  });

  it('drops the trailing PARTIAL day rather than reporting a suspiciously mild high', () => {
    // The series ends at 12:00Z, mid-day in every zone this app cares about. A partial day's
    // max/min is not a daily extreme, so it is beyond the horizon (§5's placeholder).
    const days = rollUp(measuredSeries(), 'Asia/Tokyo');
    expect(days.map((d) => d.date)).not.toContain('2026-09-12');
    expect(days[days.length - 1].date).toBe('2026-09-11');
  });

  it('survives the final row carrying no forward block', () => {
    const series = measuredSeries();
    expect(series[series.length - 1].data.next_6_hours).toBeUndefined();
    const days = rollUp(series, 'Asia/Tokyo');
    for (const day of days) {
      expect(Number.isFinite(day.tempMax)).toBe(true);
      expect(Number.isFinite(day.tempMin)).toBe(true);
      expect(day.symbolCode).toBeTruthy();
    }
  });

  it('buckets UTC instants into the DAY’S OWN zone, not into UTC', () => {
    // 07:00Z is already 16:00 in Tokyo and still 09:00 in Paris, so the two zones cut the same
    // series into different days. A UTC roll-up would agree with Paris and be wrong in Tokyo.
    const tokyo = rollUp(measuredSeries(), 'Asia/Tokyo');
    const honolulu = rollUp(measuredSeries(), 'Pacific/Honolulu');
    expect(tokyo[0].date).toBe('2026-09-03');
    // 07:00Z on the 3rd is 21:00 on the 2nd in Honolulu.
    expect(honolulu[0].date).toBe('2026-09-02');
    expect(tokyo.map((d) => d.date)).not.toEqual(honolulu.map((d) => d.date));
  });

  it('marks the day with its most SEVERE block, not its most common one', () => {
    // One thunderstorm in an otherwise clear day is the fact worth the glyph (brief §3.3).
    const days = rollUp(
      measuredSeries({
        symbolOf: (t) =>
          t.getTime() === Date.parse('2026-09-04T01:00:00Z')
            ? 'heavyrainandthunder'
            : 'clearsky_day',
      }),
      'Asia/Tokyo',
    );
    // 01:00Z on the 4th is 10:00 JST on the 4th.
    expect(days.find((d) => d.date === '2026-09-04')?.symbolCode).toBe('heavyrainandthunder');
    expect(days.find((d) => d.date === '2026-09-05')?.symbolCode).toBe('clearsky_day');
  });

  it('breaks a calm day’s tie toward the daylight variant', () => {
    const days = rollUp(
      measuredSeries({
        symbolOf: (t) => (t.getUTCHours() < 12 ? 'clearsky_night' : 'clearsky_day'),
      }),
      'Asia/Tokyo',
    );
    expect(days.find((d) => d.date === '2026-09-05')?.symbolCode).toBe('clearsky_day');
  });

  it('answers an empty list rather than throwing on a series with nothing forward-looking', () => {
    expect(rollUp([{ time: '2026-09-03T07:00:00Z', data: {} }], 'Asia/Tokyo')).toEqual([]);
  });

  it('drops a day whose blocks carry no temperatures at all', () => {
    const rows: Row[] = [
      { time: '2026-09-03T00:00:00Z', data: { next_6_hours: { summary: { symbol_code: 'fog' } } } },
      { time: '2026-09-03T06:00:00Z', data: { next_6_hours: block('fog', 12, 8) } },
      { time: '2026-09-04T00:00:00Z', data: {} },
    ];
    // Only the 06:00Z block has temperatures, and the 3rd is not covered to its end, so nothing
    // survives — an absent day, never a day with a blank number.
    expect(rollUp(rows, 'UTC')).toEqual([]);
  });
});

/** A fetcher stub that records what was asked and answers with a canned response. */
function stubFetcher(response: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}): { fetcher: EnrichmentFetcher; calls: { url: string; headers?: Record<string, string> }[] } {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fetcher = {
    async fetch(url: string, options?: { headers?: Record<string, string> }) {
      calls.push({ url, headers: options?.headers });
      return {
        url,
        status: response.status,
        contentType: 'application/json',
        headers: new Headers(response.headers ?? {}),
        body: Buffer.from(JSON.stringify(response.body ?? {})),
      };
    },
  } as unknown as EnrichmentFetcher;
  return { fetcher, calls };
}

const OK_BODY = {
  properties: {
    meta: { updated_at: '2026-09-03T06:32:11Z', units: { air_temperature: 'celsius' } },
    timeseries: measuredSeries(),
  },
};

const OK_HEADERS = {
  expires: 'Thu, 03 Sep 2026 07:22:00 GMT',
  'last-modified': 'Thu, 03 Sep 2026 06:32:11 GMT',
};

describe('MetNoProvider', () => {
  it('asks the `complete` endpoint at the cell’s own coordinate', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: OK_BODY, headers: OK_HEADERS });
    await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo');
    // `compact` publishes ZERO of 87 rows with `air_temperature_max`; `complete` publishes 81.
    expect(calls[0].url).toBe(
      'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=35.7&lon=139.7',
    );
  });

  it('identifies the app with a repo URL, and never with a person’s email', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: OK_BODY, headers: OK_HEADERS });
    await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo');
    const ua = calls[0].headers?.['User-Agent'] ?? '';
    expect(ua).toContain('github.com/assafmanor/waypoint');
    expect(ua).not.toMatch(/@/);
  });

  it('reads the ISSUE time off `meta.updated_at`, not off our clock', async () => {
    const { fetcher } = stubFetcher({ status: 200, body: OK_BODY, headers: OK_HEADERS });
    const result = await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo');
    expect(result.notModified).toBe(false);
    if (result.notModified) return;
    expect(result.issuedAt).toBe('2026-09-03T06:32:11Z');
    expect(result.expiresAt.toISOString()).toBe('2026-09-03T07:22:00.000Z');
    expect(result.lastModified).toBe('Thu, 03 Sep 2026 06:32:11 GMT');
  });

  it('echoes the previous `Last-Modified` back verbatim, and reads a 304 as a refresh', async () => {
    const { fetcher, calls } = stubFetcher({ status: 304, headers: OK_HEADERS });
    const previous = 'Thu, 03 Sep 2026 05:00:00 GMT';
    const result = await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo', previous);
    expect(calls[0].headers?.['If-Modified-Since']).toBe(previous);
    expect(result.notModified).toBe(true);
    expect(result.expiresAt.toISOString()).toBe('2026-09-03T07:22:00.000Z');
  });

  it('omits `If-Modified-Since` when nothing is held', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: OK_BODY, headers: OK_HEADERS });
    await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo');
    expect(calls[0].headers).not.toHaveProperty('If-Modified-Since');
  });

  it('falls back to a short expiry rather than "never re-ask" when `Expires` is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T07:00:00Z'));
    try {
      const { fetcher } = stubFetcher({ status: 200, body: OK_BODY, headers: {} });
      const result = await new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo');
      expect(result.expiresAt.toISOString()).toBe('2026-09-03T07:20:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a temperature unit the app has no surface for, rather than assuming', async () => {
    const { fetcher } = stubFetcher({
      status: 200,
      headers: OK_HEADERS,
      body: {
        properties: {
          ...OK_BODY.properties,
          meta: { updated_at: '2026-09-03T06:32:11Z', units: { air_temperature: 'fahrenheit' } },
        },
      },
    });
    await expect(
      new MetNoProvider(fetcher).fetch('35.7,139.7', 'Asia/Tokyo'),
    ).rejects.toBeInstanceOf(UnsupportedForecastError);
  });

  it('refuses an unparseable cell before it opens a socket', async () => {
    const { fetcher, calls } = stubFetcher({ status: 200, body: OK_BODY, headers: OK_HEADERS });
    await expect(new MetNoProvider(fetcher).fetch('nonsense', 'Asia/Tokyo')).rejects.toBeInstanceOf(
      UnsupportedForecastError,
    );
    expect(calls).toHaveLength(0);
  });
});
