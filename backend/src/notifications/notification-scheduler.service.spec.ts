import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUSH_DISABLED } from '../common/env';
import type { NotificationKind } from './notification-kind';
import type { NotificationSweepService } from './notification-sweep.service';

// Same mocked registry as the sweep's spec, for the same reason: production ships it empty
// (phase 3's point), and the one behaviour worth pinning here — no timer while nothing is
// registered — can only be told apart from its opposite by registering something.
const hoisted = vi.hoisted(() => ({ kinds: [] as unknown[] }));
const kinds = hoisted.kinds as NotificationKind[];
vi.mock('./notification-registry', () => ({ NOTIFICATION_KINDS: hoisted.kinds }));

import {
  NotificationSchedulerService,
  PRUNE_INTERVAL_MS,
  SWEEP_INTERVAL_MS,
} from './notification-scheduler.service';

const aKind = () =>
  ({
    id: 'test',
    timeCritical: false,
    staleAfterMs: 0,
    dedup: 'byInstant',
    pref: null,
    due: async () => [],
  }) as NotificationKind;

function build() {
  const sweep = {
    sweep: vi.fn().mockResolvedValue(undefined),
    pruneLedger: vi.fn().mockResolvedValue(0),
  };
  return {
    sweep,
    scheduler: new NotificationSchedulerService(sweep as unknown as NotificationSweepService),
  };
}

describe('NotificationSchedulerService', () => {
  beforeEach(() => {
    kinds.length = 0;
    delete process.env[PUSH_DISABLED];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env[PUSH_DISABLED];
  });

  describe('the timer', () => {
    it('starts NO timer while no kind is registered', () => {
      // Phase 3 ships in exactly this state. A no-op firing every minute for the life of the
      // process is not the same thing as idle, and the log line would lie about it.
      const { scheduler, sweep } = build();
      scheduler.onApplicationBootstrap();
      vi.advanceTimersByTime(10 * SWEEP_INTERVAL_MS);
      expect(sweep.sweep).not.toHaveBeenCalled();
      scheduler.onModuleDestroy();
    });

    it('ticks once per interval once a kind exists', async () => {
      const { scheduler, sweep } = build();
      kinds.push(aKind());
      scheduler.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(3 * SWEEP_INTERVAL_MS);
      expect(sweep.sweep).toHaveBeenCalledTimes(3);
      scheduler.onModuleDestroy();
    });

    it('stops on shutdown, so an in-flight tick cannot query a closed pool', async () => {
      // ADR-0072's graceful shutdown closes the Prisma pool; a surviving interval would query
      // through it.
      const { scheduler, sweep } = build();
      kinds.push(aKind());
      scheduler.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
      scheduler.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(5 * SWEEP_INTERVAL_MS);
      expect(sweep.sweep).toHaveBeenCalledTimes(1);
    });
  });

  describe('the ledger’s retention rides the sweep’s timer', () => {
    it('prunes on the first tick, then not again until its own interval', async () => {
      // Once per six hours off a sixty-second timer: a `deleteMany` over a date range has
      // nothing to do 1,439 minutes out of every 1,440.
      const { scheduler, sweep } = build();
      await scheduler.tick(0);
      expect(sweep.pruneLedger).toHaveBeenCalledTimes(1);

      await scheduler.tick(SWEEP_INTERVAL_MS);
      await scheduler.tick(PRUNE_INTERVAL_MS - 1);
      expect(sweep.pruneLedger).toHaveBeenCalledTimes(1);

      await scheduler.tick(PRUNE_INTERVAL_MS);
      expect(sweep.pruneLedger).toHaveBeenCalledTimes(2);
    });

    it('does not run while PUSH_DISABLED is set', async () => {
      // The kill switch stops the whole tick, housekeeping included — one switch, one answer.
      const { scheduler, sweep } = build();
      process.env[PUSH_DISABLED] = '1';
      await scheduler.tick(0);
      expect(sweep.pruneLedger).not.toHaveBeenCalled();
    });

    it('keeps retrying after a failure rather than going quiet for six hours', async () => {
      // `lastPrunedAtMs` advances only on success.
      const { scheduler, sweep } = build();
      sweep.pruneLedger.mockRejectedValueOnce(new Error('db down'));
      await scheduler.tick(0);
      await scheduler.tick(SWEEP_INTERVAL_MS);
      expect(sweep.pruneLedger).toHaveBeenCalledTimes(2);
    });

    it('never stops a send: a failing prune is dropped like a failing tick', async () => {
      const { scheduler, sweep } = build();
      sweep.pruneLedger.mockRejectedValue(new Error('db down'));
      await expect(scheduler.tick(0)).resolves.toBeUndefined();
      expect(sweep.sweep).toHaveBeenCalledOnce();
    });
  });

  describe('tick', () => {
    it('sweeps at the instant it is given, not at the wall clock', async () => {
      const { scheduler, sweep } = build();
      await scheduler.tick(1_234);
      expect(sweep.sweep).toHaveBeenCalledWith(1_234);
    });

    it('does nothing while PUSH_DISABLED is set', async () => {
      const { scheduler, sweep } = build();
      process.env[PUSH_DISABLED] = '1';
      await scheduler.tick(1);
      expect(sweep.sweep).not.toHaveBeenCalled();
    });

    it('is read per tick, so the switch works without a deploy', async () => {
      const { scheduler, sweep } = build();
      process.env[PUSH_DISABLED] = '1';
      await scheduler.tick(1);
      delete process.env[PUSH_DISABLED];
      await scheduler.tick(2);
      expect(sweep.sweep).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('treats ANY value as off, including the ones that look like a negation', async () => {
      // The footgun this branch's doc fix names: a kill switch is turned off by DELETING it.
      // `PUSH_DISABLED=0` reads as "disabled", the same as every other switch in `env.ts`.
      const { scheduler, sweep } = build();
      for (const value of ['1', '0', 'false', 'true']) {
        process.env[PUSH_DISABLED] = value;
        await scheduler.tick(1);
      }
      expect(sweep.sweep).not.toHaveBeenCalled();
    });

    it('runs one tick at a time', async () => {
      // A sweep that outruns its interval must not get a second copy of itself racing the
      // ledger against its own claims.
      const { scheduler, sweep } = build();
      let release = () => {};
      sweep.sweep.mockImplementation(() => new Promise<void>((r) => (release = () => r())));
      const first = scheduler.tick(1);
      await scheduler.tick(2);
      expect(sweep.sweep).toHaveBeenCalledExactlyOnceWith(1);
      release();
      await first;
    });

    it('accepts the next tick after one finishes', async () => {
      const { scheduler, sweep } = build();
      await scheduler.tick(1);
      await scheduler.tick(2);
      expect(sweep.sweep).toHaveBeenCalledTimes(2);
    });

    it('survives a failing sweep, and the NEXT tick still runs', async () => {
      // The interval dying on an unhandled rejection is the failure that turns a degraded
      // feature into a silently absent one. A failed tick is dropped, never retried: the next
      // one re-derives everything.
      const { scheduler, sweep } = build();
      sweep.sweep.mockRejectedValueOnce(new Error('db down'));
      await expect(scheduler.tick(1)).resolves.toBeUndefined();
      await scheduler.tick(2);
      expect(sweep.sweep).toHaveBeenCalledTimes(2);
    });
  });
});
