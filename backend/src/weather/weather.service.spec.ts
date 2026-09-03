import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WEATHER_DISABLED } from '../common/env';
import { forecastCells, WeatherService, type CellRequest } from './weather.service';
import type { ProviderForecast, WeatherProvider } from './weather.provider';

const TOKYO: CellRequest = { cell: '35.7,139.7', lat: 35.6762, lng: 139.6503 };
const HAKONE: CellRequest = { cell: '35.2,139.1', lat: 35.2324, lng: 139.1069 };

const ISSUED = '2026-09-03T06:32:11Z';
const EXPIRES = new Date('2026-09-03T07:22:00Z');

/** A stored row as Prisma hands it back. */
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  cell: TOKYO.cell,
  date: '2026-09-03',
  zone: 'Asia/Tokyo',
  symbolCode: 'partlycloudy_day',
  tempMax: 29,
  tempMin: 21,
  precipMm: 0.4,
  issuedAt: new Date(ISSUED),
  fetchedAt: new Date(ISSUED),
  expiresAt: EXPIRES,
  lastModified: 'Thu, 03 Sep 2026 06:32:11 GMT',
  ...over,
});

const fetched = (over: Partial<ProviderForecast> = {}): ProviderForecast =>
  ({
    notModified: false,
    issuedAt: ISSUED,
    expiresAt: EXPIRES,
    lastModified: 'Thu, 03 Sep 2026 06:32:11 GMT',
    days: [
      { date: '2026-09-03', symbolCode: 'partlycloudy_day', tempMax: 29, tempMin: 21, precipMm: 0 },
      { date: '2026-09-04', symbolCode: 'lightrain', tempMax: 24, tempMin: 19, precipMm: 3.2 },
    ],
    ...over,
  }) as ProviderForecast;

function harness(opts: { stored?: unknown[]; fetch?: WeatherProvider['fetch'] } = {}) {
  const findMany = vi.fn().mockResolvedValue(opts.stored ?? []);
  const deleteMany = vi.fn().mockResolvedValue(undefined);
  const createMany = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    weatherForecast: { findMany, deleteMany, createMany, updateMany },
    $transaction: vi.fn().mockResolvedValue(undefined),
  };
  const fetch = opts.fetch ?? vi.fn().mockResolvedValue(fetched());
  const provider: WeatherProvider = {
    id: 'test',
    attribution: 'Data from MET Norway',
    attributionUrl: 'https://www.met.no/en',
    fetch: fetch as WeatherProvider['fetch'],
  };
  return {
    service: new WeatherService(prisma as never, provider),
    prisma,
    fetch,
    createMany,
    updateMany,
  };
}

beforeEach(() => {
  vi.useRealTimers();
  delete process.env[WEATHER_DISABLED];
});

describe('forecastCells', () => {
  it('is exactly the set the day anchor can resolve to: the destination, then the places', () => {
    const cells = forecastCells({ destinationLat: 35.6762, destinationLng: 139.6503 }, [
      { lat: 35.2324, lng: 139.1069 },
      // Two stops in one city are one cell — the same 11km the day anchor treats as one place.
      { lat: 35.6595, lng: 139.7005 },
    ]);
    expect(cells.map((c) => c.cell)).toEqual(['35.7,139.7', '35.2,139.1']);
  });

  it('leads with the destination, because it anchors every day nothing else places', () => {
    const cells = forecastCells({ destinationLat: 48.8566, destinationLng: 2.3522 }, [
      { lat: 41.9028, lng: 12.4964 },
    ]);
    expect(cells[0].cell).toBe('48.9,2.4');
  });

  it('skips coordless places and a trip with no destination', () => {
    expect(
      forecastCells({ destinationLat: null, destinationLng: null }, [{ lat: null, lng: null }]),
    ).toEqual([]);
  });

  it('bounds a trip at 12 cells rather than fanning out one request per place', () => {
    const places = Array.from({ length: 40 }, (_, i) => ({ lat: i * 0.5, lng: i * 0.5 }));
    expect(forecastCells({ destinationLat: null, destinationLng: null }, places)).toHaveLength(12);
  });
});

describe('WeatherService.readAndRefresh — serve stale, never block', () => {
  it('serves what is stored even when the provider’s Expires has passed', async () => {
    const { service } = harness({ stored: [row({ expiresAt: new Date('2000-01-01') })] });
    const forecast = await service.readAndRefresh([TOKYO]);
    expect(forecast?.cells[0].days[0].tempMax).toBe(29);
  });

  it('never awaits the refresh — a source that never answers cannot stall the snapshot', async () => {
    // A promise that never settles, which is the shape `fx.service.spec.ts` uses for the same
    // claim: no clock, no budget, no flake.
    const { service } = harness({
      stored: [row({ expiresAt: new Date('2000-01-01') })],
      fetch: vi.fn(() => new Promise<never>(() => {})),
    });
    const forecast = await service.readAndRefresh([TOKYO]);
    expect(forecast?.cells).toHaveLength(1);
  });

  it('returns null for a trip with no cells and for cells we hold nothing for', async () => {
    const { service, prisma } = harness();
    expect(await service.readAndRefresh([])).toBeNull();
    expect(prisma.weatherForecast.findMany).not.toHaveBeenCalled();
    expect(await service.readAndRefresh([TOKYO])).toBeNull();
  });

  it('carries the provider’s own attribution on the data, not at a surface', async () => {
    const { service } = harness({ stored: [row()] });
    const forecast = await service.readAndRefresh([TOKYO]);
    expect(forecast?.provider).toBe('Data from MET Norway');
    expect(forecast?.providerUrl).toBe('https://www.met.no/en');
  });

  it('groups rows by cell and keeps each cell’s days together', async () => {
    const { service } = harness({
      stored: [
        row(),
        row({ date: '2026-09-04', tempMax: 24 }),
        row({ cell: HAKONE.cell, zone: 'Asia/Tokyo', tempMax: 21 }),
      ],
    });
    const forecast = await service.readAndRefresh([TOKYO, HAKONE]);
    expect(forecast?.cells.map((c) => c.cell)).toEqual([TOKYO.cell, HAKONE.cell]);
    expect(forecast?.cells[0].days).toHaveLength(2);
  });

  it('reports a cell’s OLDEST issue time, so a half-written cell is not flattered', async () => {
    const older = new Date('2026-09-03T00:00:00Z');
    const { service } = harness({
      stored: [row(), row({ date: '2026-09-04', issuedAt: older })],
    });
    const forecast = await service.readAndRefresh([TOKYO]);
    expect(forecast?.cells[0].issuedAt).toBe(older.toISOString());
  });

  it('serves nothing for a cell whose stored rows are malformed, rather than throwing', async () => {
    const { service } = harness({ stored: [row({ tempMax: 'warm' })] });
    expect(await service.readAndRefresh([TOKYO])).toBeNull();
  });
});

describe('WeatherService — the read is the trigger', () => {
  it('starts a pass for a cell whose Expires has passed', async () => {
    const { service, fetch } = harness({ stored: [row({ expiresAt: new Date('2000-01-01') })] });
    await service.readAndRefresh([TOKYO]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('starts a pass for a cell nothing is stored for', async () => {
    const { service, fetch } = harness();
    await service.readAndRefresh([TOKYO]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('starts nothing while the stored rows are still inside the provider’s Expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T07:00:00Z'));
    const { service, fetch } = harness({ stored: [row()] });
    await service.readAndRefresh([TOKYO]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not start a second pass for a cell already in flight', async () => {
    const { service, fetch } = harness({ fetch: vi.fn(() => new Promise<never>(() => {})) });
    await service.readAndRefresh([TOKYO]);
    await service.readAndRefresh([TOKYO]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-attempts a cell no sooner than the retry floor, so an outage is not hammered', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T07:00:00Z'));
    const fetch = vi.fn().mockRejectedValue(new Error('down'));
    const { service } = harness({ fetch });
    await service.readAndRefresh([TOKYO]);
    await vi.advanceTimersByTimeAsync(14 * 60 * 1000);
    await service.readAndRefresh([TOKYO]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await service.readAndRefresh([TOKYO]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('starts at most three cells per read, and drops the surplus rather than queueing it', async () => {
    const cells: CellRequest[] = Array.from({ length: 6 }, (_, i) => ({
      cell: `1${i}.0,1.0`,
      lat: 10 + i,
      lng: 1,
    }));
    const { service, fetch } = harness({ fetch: vi.fn(() => new Promise<never>(() => {})) });
    await service.readAndRefresh(cells);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('starts nothing at all when the kill switch is on', async () => {
    vi.stubEnv(WEATHER_DISABLED, '1');
    const { service, fetch } = harness();
    // Reads are unaffected — the switch stops us calling out, not us answering.
    expect(await service.readAndRefresh([TOKYO])).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('does not let a failed pass remove what is stored', async () => {
    const { service, prisma } = harness({
      stored: [row({ expiresAt: new Date('2000-01-01') })],
      fetch: vi.fn().mockRejectedValue(new Error('down')),
    });
    await service.readAndRefresh([TOKYO]);
    await vi.waitFor(() => expect(prisma.weatherForecast.deleteMany).not.toHaveBeenCalled());
  });
});

describe('WeatherService.refresh — writing a pass', () => {
  it('replaces a cell’s rows rather than upserting them, because the horizon moves', async () => {
    const { service, prisma, createMany } = harness();
    await service.refresh(TOKYO);
    expect(prisma.weatherForecast.deleteMany).toHaveBeenCalledWith({
      where: { cell: TOKYO.cell },
    });
    expect(createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('buckets in the CELL’s own zone, resolved from its coordinate', async () => {
    const { service, fetch, createMany } = harness();
    await service.refresh(TOKYO);
    expect(fetch).toHaveBeenCalledWith(TOKYO.cell, 'Asia/Tokyo', undefined);
    expect(createMany.mock.calls[0][0].data[0].zone).toBe('Asia/Tokyo');
  });

  it('treats a 304 as a successful refresh that moves the caching clocks and NOT the issue time', async () => {
    const { service, updateMany, prisma } = harness({
      fetch: vi.fn().mockResolvedValue({
        notModified: true,
        expiresAt: new Date('2026-09-03T08:00:00Z'),
        lastModified: 'Thu, 03 Sep 2026 06:32:11 GMT',
      } satisfies ProviderForecast),
    });
    await service.refresh(TOKYO, 'Thu, 03 Sep 2026 05:00:00 GMT');
    expect(prisma.weatherForecast.deleteMany).not.toHaveBeenCalled();
    const data = updateMany.mock.calls[0][0].data;
    expect(data.expiresAt.toISOString()).toBe('2026-09-03T08:00:00.000Z');
    // Nothing was published, so ADR-0218 §4's shelf life keeps running from the old issue time.
    expect(data).not.toHaveProperty('issuedAt');
  });

  it('never throws, whatever the provider does', async () => {
    const { service } = harness({ fetch: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(service.refresh(TOKYO)).resolves.toBeUndefined();
  });

  it('does not fetch for a coordinate with no resolvable zone', async () => {
    const { service, fetch } = harness();
    // A cell whose coordinate geo-tz cannot place has no day boundaries, so it has no days.
    await service.refresh({ cell: '91.0,0.0', lat: 91, lng: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
