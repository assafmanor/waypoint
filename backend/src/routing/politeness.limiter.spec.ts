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
import { PolitenessLimiter } from './politeness.limiter';

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
});
