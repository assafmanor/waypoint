import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FxRates } from '@waypoint/shared';
import { FX_DISABLED } from '../common/env';
import { FxService } from './fx.service';
import type { FxProvider } from './fx.provider';

const SET: FxRates = {
  base: 'USD',
  rates: { USD: 1, ILS: 3.7, JPY: 152 },
  publishedAt: '2026-08-09T00:02:31.000Z',
  nextUpdateAt: '2026-08-10T00:02:31.000Z',
  provider: 'Exchange Rate API',
  providerUrl: 'https://www.exchangerate-api.com',
};

/** A stored row as Prisma hands it back — JSON column, Date columns. */
const row = (over: Partial<Record<string, unknown>> = {}) => ({
  base: SET.base,
  rates: SET.rates,
  publishedAt: new Date(SET.publishedAt),
  nextUpdateAt: new Date(SET.nextUpdateAt),
  fetchedAt: new Date(SET.publishedAt),
  provider: SET.provider,
  providerUrl: SET.providerUrl,
  ...over,
});

function harness(opts: { stored?: unknown; fetch?: FxProvider['fetch'] } = {}) {
  const upsert = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    fxRateSet: { findFirst: vi.fn().mockResolvedValue(opts.stored ?? null), upsert },
  };
  const fetch = opts.fetch ?? vi.fn().mockResolvedValue(SET);
  const provider: FxProvider = {
    id: 'test',
    attribution: SET.provider,
    attributionUrl: SET.providerUrl,
    fetch: fetch as FxProvider['fetch'],
  };
  return { service: new FxService(prisma as never, provider), upsert, fetch, prisma };
}

beforeEach(() => {
  vi.useRealTimers();
  delete process.env[FX_DISABLED];
});

describe('FxService.readAndRefresh — serve stale, never block', () => {
  it('returns the stored set even when it is past its next-update time', async () => {
    // The whole contract: an old rate is still the last published rate, and a
    // read never waits on a third party to say so.
    const { service } = harness({ stored: row({ nextUpdateAt: new Date('2000-01-01') }) });
    const fx = await service.readAndRefresh();
    expect(fx?.rates.ILS).toBe(3.7);
  });

  it('returns null when nothing is stored, rather than fetching inline', async () => {
    // **The source never answers**, which is what makes this exact: a read that awaited the
    // refresh could not resolve at all. It used to be a `Date.now()` budget of 50 ms, and a
    // budget is a guess about a loaded runner rather than a statement about the code
    // (backend/`CLAUDE.md`'s testing rule). Deliberately left pending — settling it would run
    // the background upsert this case is not about.
    const pending = new Promise<FxRates>(() => {
      // never settles
    });
    const fetch = vi.fn().mockReturnValue(pending);
    const { service } = harness({ stored: null, fetch: fetch as FxProvider['fetch'] });

    await expect(service.readAndRefresh()).resolves.toBeNull();
    // The refresh was STARTED, but the read did not await it.
    expect(fetch).toHaveBeenCalled();
  });

  it('never lets a failing source fail the read', async () => {
    const { service } = harness({
      stored: null,
      fetch: vi.fn().mockRejectedValue(new Error('source down')),
    });
    await expect(service.readAndRefresh()).resolves.toBeNull();
  });

  it('serves none rather than junk when the stored row does not validate', async () => {
    // A row written by a past version, or hand-edited. The surfaces reading this
    // have no other guard, and "no rates" is already a designed state.
    const { service } = harness({ stored: row({ rates: { ILS: -1 } }) });
    await expect(service.readAndRefresh()).resolves.toBeNull();
  });
});

describe('FxService.readAndRefresh — the read is the trigger', () => {
  it('refreshes when the source says a newer set should exist', async () => {
    const { service, fetch } = harness({ stored: row({ nextUpdateAt: new Date('2000-01-01') }) });
    await service.readAndRefresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT refresh while the stored set is still current', async () => {
    const { service, fetch } = harness({
      stored: row({ nextUpdateAt: new Date(Date.now() + 60 * 60 * 1000) }),
    });
    await service.readAndRefresh();
    expect(fetch).not.toHaveBeenCalled();
  });

  // The bound that exists because `fetchedAt` is written only on success: while
  // the source is down, `nextUpdateAt` stays in the past forever, so without an
  // attempt clock every snapshot in the fleet would start another pass.
  it('does not re-attempt on every read while the source is down', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('source down'));
    const { service } = harness({ stored: row({ nextUpdateAt: new Date('2000-01-01') }), fetch });
    await service.readAndRefresh();
    await service.readAndRefresh();
    await service.readAndRefresh();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stores what the provider returned, publication dates included', async () => {
    const { service, upsert } = harness({ stored: null });
    await service.refresh();
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ base: 'USD' });
    expect(arg.update.publishedAt).toEqual(new Date(SET.publishedAt));
    expect(arg.update.nextUpdateAt).toEqual(new Date(SET.nextUpdateAt));
    // Attribution travels with the data, so a second provider needs no UI change.
    expect(arg.update.provider).toBe(SET.provider);
    expect(arg.update.providerUrl).toBe(SET.providerUrl);
  });
});

describe('FxService.read — the same value, with no trigger', () => {
  it('returns the stored set without scheduling anything', async () => {
    // The refresh route's read: it has just AWAITED a pass, so triggering a
    // second one on the way out would be work with nothing to find.
    const { service, fetch } = harness({ stored: row({ nextUpdateAt: new Date('2000-01-01') }) });
    const fx = await service.read();
    expect(fx?.rates.ILS).toBe(3.7);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('applies the same validation as the snapshot read', async () => {
    const { service } = harness({ stored: row({ rates: { ILS: -1 } }) });
    await expect(service.read()).resolves.toBeNull();
  });
});

describe('FxService — the kill switch', () => {
  it('stops the app talking to the third party, without touching reads', async () => {
    process.env[FX_DISABLED] = '1';
    const { service, fetch } = harness({ stored: row({ nextUpdateAt: new Date('2000-01-01') }) });
    const fx = await service.readAndRefresh();
    // Frozen, not removed — the stored set still serves.
    expect(fx?.rates.ILS).toBe(3.7);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('FxService.refresh — surplus work is dropped, never queued', () => {
  it('does not start a second pass while one is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn().mockImplementation(async () => {
      await gate;
      return SET;
    });
    const { service } = harness({ stored: null, fetch });
    const a = service.refresh();
    const b = service.refresh();
    release();
    await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
