import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhaseTimeoutError, withDeadline } from './deadline';

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
