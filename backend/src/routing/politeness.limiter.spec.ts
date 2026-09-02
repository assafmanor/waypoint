// **That a three-mode warm is paced rather than burst** (ADR-0205 §2/§Y2) — one of M4's exit
// criteria, and the only way to assert it is on the clock.
//
// The reason this is worth a spec rather than a comment: §Z4 measured that FOSSGIS does not
// enforce the limit — six concurrent day matrices all answered 200 with no `429`. Nothing will
// ever tell us we broke this, so a test has to.
//
// **The clock is fake, and that is not a convenience.** The two pacing cases first shipped
// asserting REAL elapsed `Date.now()` gaps with a ±5 ms tolerance, and CI read `19` for a 30 ms
// gap — a gap shorter than the `setTimeout` that produced it, which a loaded runner cannot cause
// by being slow. A wall clock under NTP correction can step backwards; a tolerance cannot be
// widened enough to cover that, only enough to hide it. On a fake clock the gaps are exact, so
// these read `toEqual` rather than `toBeGreaterThanOrEqual` — do not put a tolerance back.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolitenessLimiter, RoutingUnavailableError } from './politeness.limiter';

/** The RATE is configuration (`ROUTING_MIN_CALL_GAP_MS` is the shipped 1 call/s); the QUEUEING is
 *  the behaviour under test. Any value works now that no real time passes. */
const GAP_MS = 30;

describe('PolitenessLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('paces a three-mode warm instead of bursting it', async () => {
    vi.useFakeTimers();
    const limiter = new PolitenessLimiter(GAP_MS);
    const at: number[] = [];
    const start = Date.now();

    // Exactly §Y2's case: one day, three modes, three upstream calls started together.
    const warming = Promise.all(
      (['walking', 'driving', 'cycling'] as const).map((mode) =>
        limiter.run(() => {
          at.push(Date.now() - start);
          return Promise.resolve(mode);
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(GAP_MS * 3);
    await warming;

    expect(at).toEqual([0, GAP_MS, GAP_MS * 2]);
  });

  it('is a queue, not a bucket — an idle spell does not buy a burst', async () => {
    // The difference matters at this rate. A token bucket refills while nothing is happening and
    // then lets several calls leave at once, which is the one thing this exists to prevent.
    vi.useFakeTimers();
    const limiter = new PolitenessLimiter(GAP_MS);
    await limiter.run(() => Promise.resolve());
    await vi.advanceTimersByTimeAsync(GAP_MS * 4);

    const at: number[] = [];
    const start = Date.now();
    const running = Promise.all(
      [0, 1, 2].map(() =>
        limiter.run(() => {
          at.push(Date.now() - start);
          return Promise.resolve();
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(GAP_MS * 3);
    await running;

    // The idle spell has already paid the first call's gap, so it leaves at once — and the second
    // and third still queue behind it, which is the claim.
    expect(at).toEqual([0, GAP_MS, GAP_MS * 2]);
  });

  it('does not let one failed call poison every later one', async () => {
    // The tail swallows rejections so the chain survives; the caller still sees its own.
    const limiter = new PolitenessLimiter(GAP_MS);
    await expect(limiter.run(() => Promise.reject(new Error('upstream down')))).rejects.toThrow(
      'upstream down',
    );
    await expect(limiter.run(() => Promise.resolve('fine'))).resolves.toBe('fine');
  });

  it('reports its depth, which is what an honest Retry-After is derived from', async () => {
    const limiter = new PolitenessLimiter(GAP_MS);
    expect(limiter.depth).toBe(0);
    const running = Promise.all([0, 1, 2].map(() => limiter.run(() => Promise.resolve())));
    expect(limiter.depth).toBe(3);
    await running;
    expect(limiter.depth).toBe(0);
  });

  it('swallows a warm failure, because nothing is waiting on the answer', async () => {
    const limiter = new PolitenessLimiter(GAP_MS);
    await expect(
      limiter.runQuietly('matrix walking', () => Promise.reject(new Error('boom'))),
    ).resolves.toBeUndefined();
  });
  // ── THE BREAKER (ADR-0205 §Y3) ────────────────────────────────────────────────────────────
  //
  // Written against the 2026-09-02 outage: FOSSGIS reset every connection, and with no breaker a
  // single day view sent ~54 calls that could not succeed — 3 modes × 6 client rounds × the day
  // plus both peeked neighbours — each holding the one seat above for its full timeout.
  //
  // **The gap is 0 in these, deliberately.** The pacing is asserted by the cases above; what is
  // under test here is admission, so the clock only has to move for the COOLDOWN.
  describe('the breaker', () => {
    const THRESHOLD = 3;
    const COOLDOWN_MS = 60_000;
    const open = () => new PolitenessLimiter(0, THRESHOLD, COOLDOWN_MS);
    const fail = () => Promise.reject(new Error('fetch failed'));

    it('opens after the threshold of consecutive failures and stops calling out', async () => {
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) {
        await limiter.runQuietly(`matrix ${i}`, fail);
      }
      expect(limiter.isOpen).toBe(true);

      // The task is never invoked, which is the whole saving — not a fast failure, no call.
      let invoked = 0;
      await limiter.runQuietly('matrix suppressed', () => {
        invoked++;
        return Promise.resolve();
      });
      expect(invoked).toBe(0);
    });

    it('rejects a suppressed call with RoutingUnavailableError, so a warm can tell it apart', async () => {
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) await limiter.runQuietly(`matrix ${i}`, fail);
      await expect(limiter.run(() => Promise.resolve('never'))).rejects.toBeInstanceOf(
        RoutingUnavailableError,
      );
    });

    it('counts CONSECUTIVE failures — a success in between resets it', async () => {
      // Two failures, a success, two more. Five failures total, never three in a row.
      const limiter = open();
      await limiter.runQuietly('a', fail);
      await limiter.runQuietly('b', fail);
      await limiter.run(() => Promise.resolve());
      await limiter.runQuietly('c', fail);
      await limiter.runQuietly('d', fail);
      expect(limiter.isOpen).toBe(false);
    });

    it('admits exactly ONE probe once the cooldown has elapsed, not the whole queue', async () => {
      vi.useFakeTimers();
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) await limiter.runQuietly(`matrix ${i}`, fail);

      // Still shut a millisecond short of the cooldown: a pause, not a slower poll.
      await vi.advanceTimersByTimeAsync(COOLDOWN_MS - 1);
      let invoked = 0;
      const count = () => {
        invoked++;
        return Promise.reject(new Error('still down'));
      };
      await limiter.runQuietly('early', count);
      expect(invoked).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      // Three warms arrive together, as a day's three modes do. One leaves.
      await Promise.all([
        limiter.runQuietly('p1', count),
        limiter.runQuietly('p2', count),
        limiter.runQuietly('p3', count),
      ]);
      expect(invoked).toBe(1);
    });

    it('re-arms the full cooldown when the probe also fails', async () => {
      vi.useFakeTimers();
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) await limiter.runQuietly(`matrix ${i}`, fail);

      await vi.advanceTimersByTimeAsync(COOLDOWN_MS);
      await limiter.runQuietly('probe', fail);

      // Without the re-stamp this would let one call per cooldown through forever.
      let invoked = 0;
      await vi.advanceTimersByTimeAsync(COOLDOWN_MS - 1);
      await limiter.runQuietly('too early', () => {
        invoked++;
        return Promise.resolve();
      });
      expect(invoked).toBe(0);
      expect(limiter.isOpen).toBe(true);
    });

    it('closes on a successful probe, so recovery needs no restart', async () => {
      vi.useFakeTimers();
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) await limiter.runQuietly(`matrix ${i}`, fail);

      await vi.advanceTimersByTimeAsync(COOLDOWN_MS);
      await expect(limiter.run(() => Promise.resolve('back'))).resolves.toBe('back');
      expect(limiter.isOpen).toBe(false);

      // And the seat is fully open again — no lingering half-open state.
      let invoked = 0;
      await Promise.all(
        [0, 1, 2].map(() =>
          limiter.run(() => {
            invoked++;
            return Promise.resolve();
          }),
        ),
      );
      expect(invoked).toBe(3);
    });

    it('does not leak queue depth on a suppressed call', async () => {
      const limiter = open();
      for (let i = 0; i < THRESHOLD; i++) await limiter.runQuietly(`matrix ${i}`, fail);
      await limiter.runQuietly('suppressed', () => Promise.resolve());
      expect(limiter.depth).toBe(0);
    });
  });
});
