import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENRICHMENT_DISABLED } from '../common/env';
import type { PlaceIdentity } from './enrichment.provider';
import { EnrichmentScheduler } from './enrichment.scheduler';
import type { EnrichmentService } from './enrichment.service';

const SENSOJI: PlaceIdentity = {
  name: 'Sensō-ji',
  googlePlaceId: 'ChIJ-sensoji',
  lat: 35.7148,
  lng: 139.7967,
};

const place = (googlePlaceId: string): PlaceIdentity => ({ ...SENSOJI, googlePlaceId });

/** A stub pass whose completion the test controls, so in-flight state can be observed. */
function controllablePass() {
  const settle: (() => void)[] = [];
  const calls: PlaceIdentity[] = [];
  const enrich = vi.fn(async (identity: PlaceIdentity) => {
    calls.push(identity);
    await new Promise<void>((resolve) => settle.push(resolve));
    return {} as never;
  });
  return {
    service: { enrich } as unknown as EnrichmentService,
    calls,
    /** Let every started pass finish, and give the microtask queue a turn. */
    finishAll: async () => {
      settle.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('EnrichmentScheduler', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('starts a pass for a picked place', () => {
    const { service, calls } = controllablePass();
    new EnrichmentScheduler(service).schedule(SENSOJI);
    expect(calls).toEqual([SENSOJI]);
  });

  it('returns synchronously, so no request ever waits on a third party (§6)', () => {
    const { service } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);
    // A `void` return is what makes awaiting it impossible even by accident.
    expect(scheduler.schedule(SENSOJI)).toBeUndefined();
    expect(scheduler.activePasses).toBe(1);
  });

  it('never throws into its caller when a pass fails', async () => {
    const service = {
      enrich: vi.fn(async () => {
        throw new Error('the store is on fire');
      }),
    } as unknown as EnrichmentService;
    const scheduler = new EnrichmentScheduler(service);

    // A failing pass is a field that stays empty — never a pick that fails.
    expect(() => scheduler.schedule(SENSOJI)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    // And it releases its slot, or one bad place would wedge the scheduler forever.
    expect(scheduler.activePasses).toBe(0);
  });

  it('does nothing at all when the kill switch is set', () => {
    vi.stubEnv(ENRICHMENT_DISABLED, '1');
    const { service, calls } = controllablePass();
    new EnrichmentScheduler(service).schedule(SENSOJI);
    expect(calls).toEqual([]);
  });

  it('reads the kill switch per call, so flipping it needs no redeploy', () => {
    const { service, calls } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    vi.stubEnv(ENRICHMENT_DISABLED, '1');
    scheduler.schedule(place('ChIJ-a'));
    expect(calls).toHaveLength(0);

    vi.stubEnv(ENRICHMENT_DISABLED, '');
    scheduler.schedule(place('ChIJ-b'));
    expect(calls).toHaveLength(1);
  });

  it('collapses concurrent passes for the same place', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    // A pick immediately followed by a snapshot read, or two members opening one trip. The
    // store is global, so the duplicate would be cross-trip too.
    scheduler.schedule(SENSOJI);
    scheduler.schedule(SENSOJI);
    scheduler.schedule(SENSOJI);
    expect(calls).toHaveLength(1);

    // Once it finishes, the place is schedulable again (its TTL decides, not this guard).
    await finishAll();
    scheduler.schedule(SENSOJI);
    expect(calls).toHaveLength(2);
  });

  it('caps concurrency and DROPS the surplus rather than queueing it', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    for (const id of ['a', 'b', 'c', 'd', 'e']) scheduler.schedule(place(`ChIJ-${id}`));
    expect(calls).toHaveLength(3);
    expect(scheduler.activePasses).toBe(3);

    // Dropped, not queued: finishing the in-flight three starts nothing new. Safe because the
    // read trigger re-fires and `attemptedAt` was never written for the dropped ones.
    await finishAll();
    expect(calls).toHaveLength(3);
    expect(scheduler.activePasses).toBe(0);
  });

  it('frees its slots as passes finish', async () => {
    const { service, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    scheduler.schedule(place('ChIJ-a'));
    scheduler.schedule(place('ChIJ-b'));
    expect(scheduler.activePasses).toBe(2);

    await finishAll();
    expect(scheduler.activePasses).toBe(0);
    scheduler.schedule(place('ChIJ-c'));
    expect(scheduler.activePasses).toBe(1);
  });

  it('skips a place with no Google id', () => {
    const { service, calls } = controllablePass();
    // Nothing to dedupe on, and a coordless Place-lite is not matchable yet (§10).
    new EnrichmentScheduler(service).schedule({ name: 'A pin I dropped' });
    expect(calls).toEqual([]);
  });

  it('bounds how many stale places one snapshot read may start', () => {
    const { service, calls } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    // A trip whose 40 places are all unattempted must not try all 40 on first open; it fills
    // in over the next few reads instead.
    scheduler.scheduleMany(Array.from({ length: 40 }, (_, i) => place(`ChIJ-${i}`)));
    expect(calls.length).toBeLessThanOrEqual(3);
  });

  it('schedules nothing for a trip with no stale places', () => {
    const { service, calls } = controllablePass();
    new EnrichmentScheduler(service).scheduleMany([]);
    expect(calls).toEqual([]);
  });
});
