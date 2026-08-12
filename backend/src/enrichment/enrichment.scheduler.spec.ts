import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
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

/** A stored payload with one field, in the shape `enrich` resolves to. */
const stored = (blobKey: string) =>
  ({
    id: 'enr-1',
    googlePlaceId: SENSOJI.googlePlaceId!,
    wikidataQid: null,
    osmRef: null,
    fields: {
      image: {
        state: 'present',
        value: {
          blobKey,
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          sizeBytes: 1000,
          source: 'commons',
          license: 'CC BY-SA 4.0',
          attribution: 'A photographer',
          fetchedAt: '2026-08-05T10:00:00.000Z',
          confidence: 1,
          method: 'settled_id',
        },
      },
    },
    attemptedAt: new Date('2026-08-05T10:00:00.000Z'),
  }) as never;

/** A stub pass whose completion the test controls, so in-flight state can be observed. */
function controllablePass() {
  const settle: ((value: unknown) => void)[] = [];
  const calls: PlaceIdentity[] = [];
  const enrich = vi.fn(async (identity: PlaceIdentity) => {
    calls.push(identity);
    return (await new Promise<unknown>((resolve) => settle.push(resolve))) as never;
  });
  const read = vi.fn(async () => null);
  return {
    service: { enrich, read } as unknown as EnrichmentService,
    calls,
    read,
    /** Let every started pass finish, and give the microtask queue a turn. */
    finishAll: async (value: unknown = stored('enr_a')) => {
      settle.splice(0).forEach((resolve) => resolve(value));
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

  it('caps concurrency and DROPS the surplus on the PICK path rather than queueing it', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    for (const id of ['a', 'b', 'c', 'd', 'e']) scheduler.schedule(place(`ChIJ-${id}`));
    expect(calls).toHaveLength(3);
    expect(scheduler.activePasses).toBe(3);

    // Dropped, not queued: finishing the in-flight three starts nothing new. `schedule` is the
    // PICK trigger — one place somebody just added — so there is no backlog for it to belong to;
    // the snapshot read's backlog is `scheduleMany`'s, below. Safe because the read trigger
    // re-fires and `attemptedAt` was never written for the dropped ones.
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

  it('starts a snapshot read’s stale places at the cap, not all forty at once', () => {
    const { service, calls } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    // The rate is unchanged and is the whole point of the cap: Wikimedia etiquette is about
    // requests in flight, not about how many a backlog holds.
    scheduler.scheduleMany(Array.from({ length: 40 }, (_, i) => place(`ChIJ-${i}`)));
    expect(calls).toHaveLength(3);
    expect(scheduler.activePasses).toBe(3);
  });

  // **The owner report this changed for** (2026-08-11): after `PlaceEnrichment` was cleared,
  // every place was stale at once and a read started three and discarded the other 37 — so a
  // 40-place trip needed fourteen app-opens, and looked like enrichment being slow when the
  // places were simply never being asked about.
  it('DRAINS the rest of a snapshot read’s backlog as slots free, from one read', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    scheduler.scheduleMany(Array.from({ length: 40 }, (_, i) => place(`ChIJ-${i}`)));
    expect(calls).toHaveLength(3);

    // No second read, no clock, no queue that outlives the process — each completion takes the
    // next one.
    for (let round = 1; round < 14; round++) await finishAll();
    expect(calls.length).toBeGreaterThan(3);

    while (scheduler.activePasses > 0) await finishAll();
    expect(calls).toHaveLength(40);
    expect(new Set(calls.map((c) => c.googlePlaceId)).size).toBe(40);
  });

  it('queues a place once however many reads offer it', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);
    const stale = Array.from({ length: 6 }, (_, i) => place(`ChIJ-${i}`));

    // Two members opening the same trip, or one member opening it twice.
    scheduler.scheduleMany(stale);
    scheduler.scheduleMany(stale);
    while (scheduler.activePasses > 0) await finishAll();

    expect(calls).toHaveLength(6);
  });

  it('drops a backlog past its memory bound rather than growing without limit', () => {
    const { service } = controllablePass();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const scheduler = new EnrichmentScheduler(service);

    scheduler.scheduleMany(Array.from({ length: 260 }, (_, i) => place(`ChIJ-${i}`)));

    // Logged rather than silently truncated — and what was dropped is still stale, so the next
    // snapshot read offers it again.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('enrichment backlog full'));
    warn.mockRestore();
  });

  it('abandons the backlog when the kill switch goes on mid-drain', async () => {
    const { service, calls, finishAll } = controllablePass();
    const scheduler = new EnrichmentScheduler(service);

    scheduler.scheduleMany(Array.from({ length: 20 }, (_, i) => place(`ChIJ-${i}`)));
    expect(calls).toHaveLength(3);

    vi.stubEnv(ENRICHMENT_DISABLED, '1');
    while (scheduler.activePasses > 0) await finishAll();

    // The three in flight finish; nothing else starts.
    expect(calls).toHaveLength(3);
  });

  // ── A PASS SOMEBODY IS WAITING FOR (§17) ─────────────────────────────────────────────
  // The deciding surface's trigger: a place the trip does not hold has no snapshot row and no
  // `placeId` to be nudged about, so its answer travels back down the request that asked.
  describe('enrichNow', () => {
    it('answers with what the pass stored, as the client read model', async () => {
      const { service, calls, finishAll } = controllablePass();
      const scheduler = new EnrichmentScheduler(service);

      const answer = scheduler.enrichNow(SENSOJI);
      expect(calls).toEqual([SENSOJI]);
      await finishAll();

      // Delivered, not stored: the blob key never leaves the server (the mapper's job).
      expect(await answer).toEqual({
        image: expect.objectContaining({
          url: '/enrichment/images/enr_a',
          license: 'CC BY-SA 4.0',
        }),
      });
    });

    it('joins a pass already running instead of starting a second', async () => {
      const { service, calls, finishAll } = controllablePass();
      const scheduler = new EnrichmentScheduler(service);

      // Two people tapping the same result, or a tap on a place a snapshot read is already
      // backfilling. One pass, two answers — which is why the in-flight map holds the promise.
      const first = scheduler.enrichNow(SENSOJI);
      const second = scheduler.enrichNow(SENSOJI);
      expect(calls).toHaveLength(1);

      await finishAll();
      expect(await first).toEqual(await second);
    });

    it('gives a waiter a slot the background cap would have refused', async () => {
      const { service, calls, finishAll } = controllablePass();
      const scheduler = new EnrichmentScheduler(service);

      // Three backfills hold every background slot — a cold-start snapshot read.
      for (const id of ['a', 'b', 'c']) scheduler.schedule(place(`ChIJ-${id}`));
      expect(calls).toHaveLength(3);
      // A further background pass is still dropped…
      scheduler.schedule(place('ChIJ-d'));
      expect(calls).toHaveLength(3);
      // …but a person waiting on a blank card is not, which is the whole distinction.
      const answer = scheduler.enrichNow(SENSOJI);
      expect(calls).toHaveLength(4);

      await finishAll();
      await answer;
    });

    it('answers with what the store holds when the pass outruns the wait', async () => {
      vi.useFakeTimers();
      try {
        const { service, read } = controllablePass();
        // A pass from a month ago left an image; this one is refreshing it and hangs.
        read.mockResolvedValue(stored('enr_from_before') as never);
        const scheduler = new EnrichmentScheduler(service);

        const answer = scheduler.enrichNow(SENSOJI);
        await vi.advanceTimersByTimeAsync(5000);

        // Never a hang, and never an empty answer when we hold something: the pass keeps
        // running into the store, so the next tap is instant.
        expect(await answer).toEqual({
          image: expect.objectContaining({ url: '/enrichment/images/enr_from_before' }),
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('answers with what the store holds when the kill switch refuses the pass', async () => {
      vi.stubEnv(ENRICHMENT_DISABLED, '1');
      const { service, calls, read } = controllablePass();
      read.mockResolvedValue(stored('enr_held') as never);

      // Switched off means no outbound fetch, not a blank read: what we already hold is ours.
      expect(await new EnrichmentScheduler(service).enrichNow(SENSOJI)).toEqual({
        image: expect.objectContaining({ url: '/enrichment/images/enr_held' }),
      });
      expect(calls).toEqual([]);
    });

    it('answers with nothing at all when nobody has ever looked and the pass fails', async () => {
      const service = {
        enrich: vi.fn(async () => {
          throw new Error('the store is on fire');
        }),
        read: vi.fn(async () => null),
      } as unknown as EnrichmentService;

      // The majority case's shape (ADR-0166 §11.3) and a failure's are deliberately the same:
      // an empty payload, which the surface renders as nothing rather than as an error.
      expect(await new EnrichmentScheduler(service).enrichNow(SENSOJI)).toEqual({});
    });

    it('never lets a failed pass throw into the request waiting on it', async () => {
      const service = {
        enrich: vi.fn(async () => {
          throw new Error('wikidata is down');
        }),
        read: vi.fn(async () => null),
      } as unknown as EnrichmentService;
      const scheduler = new EnrichmentScheduler(service);

      await expect(scheduler.enrichNow(SENSOJI)).resolves.toEqual({});
      // And the slot is released, exactly as for a scheduled pass.
      expect(scheduler.activePasses).toBe(0);
    });
  });

  it('schedules nothing for a trip with no stale places', () => {
    const { service, calls } = controllablePass();
    new EnrichmentScheduler(service).scheduleMany([]);
    expect(calls).toEqual([]);
  });
});
