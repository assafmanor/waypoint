// @vitest-environment jsdom
//
// The contract is narrow and the second half is the point: a chunk that is gone
// because the build moved gets exactly ONE reload, and a chunk that is gone
// because it was never deployed gets an error rather than a spin (ADR-0185).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healChunkFailure } from './lazy-chunk';
import { CHUNK_RELOAD_COOLDOWN_MS } from '../constants';
import { getNow } from './useClock';

const RELOAD_STAMP_KEY = 'waypoint:chunk-reload';

/** Resolves if the healer reloaded (its promise never settles), rejects if it
 *  gave up and re-threw. Racing a timer is what tells "never settles" apart. */
function outcome(error: unknown): Promise<'reloaded' | 'rethrown' | 'settled'> {
  return Promise.race([
    healChunkFailure(error).then(
      () => 'settled' as const,
      () => 'rethrown' as const,
    ),
    Promise.resolve().then(() => 'reloaded' as const),
  ]);
}

describe('a route chunk that is no longer there', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reloads once, and keeps the loading state up rather than flashing an error', async () => {
    await expect(outcome(new Error('Failed to fetch dynamically imported module'))).resolves.toBe(
      'reloaded',
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses to reload a second time inside the cooldown, so it cannot spin', async () => {
    await outcome(new Error('gone'));
    expect(reload).toHaveBeenCalledTimes(1);

    await expect(outcome(new Error('still gone'))).resolves.toBe('rethrown');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('cures again once the cooldown has passed, for an unrelated failure later', async () => {
    await outcome(new Error('gone'));
    window.sessionStorage.setItem(
      RELOAD_STAMP_KEY,
      String(getNow() - CHUNK_RELOAD_COOLDOWN_MS - 1),
    );

    await expect(outcome(new Error('a different chunk'))).resolves.toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload at all when storage refuses, since it could not count', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('no storage (Safari private mode)');
    });

    await expect(outcome(new Error('gone'))).resolves.toBe('rethrown');
    expect(reload).not.toHaveBeenCalled();
  });
});
