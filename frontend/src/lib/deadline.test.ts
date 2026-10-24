import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestEffort, PhaseTimeoutError, standInAfter, withDeadline } from './deadline';

const NEVER = new Promise<never>(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('passes work that finishes in time straight through', async () => {
    await expect(withDeadline('p', 1000, async () => 'ok')).resolves.toBe('ok');
  });

  it("passes work's own rejection through untouched", async () => {
    const boom = new Error('boom');
    await expect(withDeadline('p', 1000, () => Promise.reject(boom))).rejects.toBe(boom);
  });

  // The whole point: before this, a phase that never settled was indistinguishable from one
  // still working, forever. `PhaseTimeoutError` is what makes silence catchable.
  it('rejects with PhaseTimeoutError when work never settles', async () => {
    vi.useFakeTimers();
    const guarded = withDeadline('doc-fetch', 1000, () => NEVER).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await guarded;
    expect(err).toBeInstanceOf(PhaseTimeoutError);
    expect((err as PhaseTimeoutError).phase).toBe('doc-fetch');
  });

  it('does not fire early', async () => {
    vi.useFakeTimers();
    let settled = false;
    void withDeadline('p', 1000, () => NEVER).catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
  });

  // An abortable phase must actually stop, not merely stop being listened to — a fetch left
  // running holds a connection open for a read nobody is waiting for any more.
  it('aborts the signal it handed to work', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    void withDeadline('p', 1000, (signal) => {
      seen = signal;
      return NEVER;
    }).catch(() => {});
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen?.aborted).toBe(true);
  });

  it('clears its timer when work wins, so a bound never outlives the phase', async () => {
    vi.useFakeTimers();
    await withDeadline('p', 1000, async () => 'ok');
    expect(vi.getTimerCount()).toBe(0);
  });
});

// A bound must not cost a caller the cancellation it already had: the searches pass their own
// signal so a superseded keystroke aborts, and `fetch` takes exactly one signal.
describe('withDeadline with a caller signal (field-report #22)', () => {
  it("relays the caller's abort to the signal work is holding", async () => {
    const outer = new AbortController();
    let seen: AbortSignal | undefined;
    void withDeadline(
      'p',
      1000,
      (signal) => {
        seen = signal;
        return NEVER;
      },
      outer.signal,
    ).catch(() => {});
    expect(seen?.aborted).toBe(false);
    outer.abort();
    expect(seen?.aborted).toBe(true);
  });

  it('starts aborted when the caller was already aborted before the call', async () => {
    const outer = new AbortController();
    outer.abort();
    let seen: AbortSignal | undefined;
    void withDeadline(
      'p',
      1000,
      (signal) => {
        seen = signal;
        return NEVER;
      },
      outer.signal,
    ).catch(() => {});
    expect(seen?.aborted).toBe(true);
  });

  it('stops listening to a caller signal once the phase is over', async () => {
    const outer = new AbortController();
    const removeSpy = vi.spyOn(outer.signal, 'removeEventListener');
    await withDeadline('p', 1000, async () => 'ok', outer.signal);
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe('bestEffort', () => {
  it('answers the fallback when the store never replies, rather than waiting on it', async () => {
    vi.useFakeTimers();
    const guarded = bestEffort('local', 1000, () => NEVER, null);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(guarded).resolves.toBeNull();
  });

  it('answers the fallback when the store throws, too', async () => {
    await expect(bestEffort('local', 1000, () => Promise.reject(new Error('x')), 7)).resolves.toBe(
      7,
    );
  });

  it('passes a healthy answer through', async () => {
    await expect(bestEffort('local', 1000, async () => 'hit', null)).resolves.toBe('hit');
  });
});

describe('standInAfter', () => {
  it('offers the cached answer once the live read is late, and still resolves live', async () => {
    vi.useFakeTimers();
    let settle!: (v: string) => void;
    const live = new Promise<string>((res) => {
      settle = res;
    });
    const onStandIn = vi.fn();
    const result = standInAfter(1000, live, async () => 'cached', onStandIn);

    await vi.advanceTimersByTimeAsync(999);
    expect(onStandIn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onStandIn).toHaveBeenCalledWith('cached');

    settle('live');
    await expect(result).resolves.toBe('live');
  });

  it('never stands in for a live read that answered in time', async () => {
    vi.useFakeTimers();
    const cached = vi.fn(async () => 'cached');
    const onStandIn = vi.fn();
    await expect(standInAfter(1000, Promise.resolve('live'), cached, onStandIn)).resolves.toBe(
      'live',
    );

    await vi.advanceTimersByTimeAsync(5000);
    expect(cached).not.toHaveBeenCalled();
    expect(onStandIn).not.toHaveBeenCalled();
  });

  // A first-ever boot: nothing cached, so there is nothing to show and the wait continues.
  it('stays quiet when the cache has no answer', async () => {
    vi.useFakeTimers();
    const onStandIn = vi.fn();
    const result = standInAfter(1000, NEVER as Promise<string>, async () => null, onStandIn);

    await vi.advanceTimersByTimeAsync(5000);
    expect(onStandIn).not.toHaveBeenCalled();
    void result;
  });

  it('treats a cache read that throws as no answer', async () => {
    vi.useFakeTimers();
    const onStandIn = vi.fn();
    void standInAfter(
      1000,
      NEVER as Promise<string>,
      () => Promise.reject(new Error('x')),
      onStandIn,
    );

    await vi.advanceTimersByTimeAsync(5000);
    expect(onStandIn).not.toHaveBeenCalled();
  });

  it("passes the live read's own rejection through untouched", async () => {
    vi.useFakeTimers();
    const boom = new Error('boom');
    await expect(
      standInAfter(1000, Promise.reject(boom), async () => 'cached', vi.fn()),
    ).rejects.toBe(boom);
  });
});
