// @vitest-environment jsdom
// **The first await of the whole app, and what happens when nobody answers it** (field
// report #22). `AuthProvider` runs a refresh + `GET /me` before any trip is fetched, so a
// phone with its radios on and no upstream never reached the snapshot the report describes —
// it sat on the boot screen. The offline cold-load path this file guards was already
// designed (`sync-and-offline.md` "Read"): fall back to the last-known identity rather than
// bouncing to /login. It just needed those two awaits to be able to END.
//
// The other half is the one to read twice: silence must arrive at the app as a NETWORK
// failure, not an auth one. If a timeout reached the sign-out branch, the fix for a hang
// would be a forced sign-out with the cached identity wiped — strictly worse than the bug.
//
// Each case mounts a FRESH module graph. `lib/api`'s shared in-flight refresh is
// module-level and only clears in a `.finally()`, so one silent refresh poisons every later
// call in the same graph — the wedge this fix deliberately does not touch (it is a sign-out
// trade-off, backlogged separately), and which would otherwise leak between these tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { Me } from '@waypoint/shared';
import { USERS } from '../fixtures';
import { API_TIMEOUT_MS, ME_STORAGE_KEY } from '../constants';

vi.mock('../lib/cache', () => ({ wipeLocalData: vi.fn().mockResolvedValue(undefined) }));

const ME: Me = { user: USERS[0], memberships: [] };

/** A fetch that neither resolves nor rejects — the reported condition, not airplane mode. */
const NEVER = new Promise<never>(() => {});

/** Duck-typed rather than a real `Response`: reading a real body runs through streams that
 *  faked timers stall, and only these three members are ever touched. */
const answers = (status: number) =>
  vi.fn(() => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve({}) }));

async function mountAuth() {
  vi.resetModules();
  const { AuthProvider, useAuth } = await import('./auth-state');
  function Probe() {
    const { status, me } = useAuth();
    return <div>{`${status}:${me?.user.displayName ?? '-'}`}</div>;
  }
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

/** Past both bounds: the boot's wait on the refresh, then `GET /me`. */
async function waitOutTheBoot() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS.FETCH * 2 + 2);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(ME));
  vi.stubGlobal(
    'fetch',
    vi.fn(() => NEVER),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('boot with no reception (field report #22)', () => {
  it('reaches a decision instead of sitting on the boot screen forever', async () => {
    await mountAuth();
    expect(screen.getByText('loading:-')).toBeTruthy();

    await waitOutTheBoot();

    expect(screen.queryByText('loading:-')).toBeNull();
  });

  it('renders signed-in from the cached identity rather than signing the user out', async () => {
    await mountAuth();
    await waitOutTheBoot();

    expect(screen.getByText(`authed:${ME.user.displayName}`)).toBeTruthy();
    // The identity a timeout must never throw away — it is the whole offline session.
    expect(localStorage.getItem(ME_STORAGE_KEY)).toBeTruthy();
  });

  // The other side of the same branch, so the bound above cannot be read as "a timeout is
  // always tolerated": a server that ANSWERS and refuses is still a real sign-out.
  it('still drops to anon when the server actually answers with a rejection', async () => {
    vi.stubGlobal('fetch', answers(401));
    await mountAuth();
    await waitOutTheBoot();

    expect(screen.getByText('anon:-')).toBeTruthy();
    expect(localStorage.getItem(ME_STORAGE_KEY)).toBeNull();
  });

  it('signs in normally when the network is healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(url.endsWith('/auth/refresh') ? { accessToken: 'tok' } : ME),
        }),
      ),
    );
    await mountAuth();
    await waitOutTheBoot();

    expect(screen.getByText(`authed:${ME.user.displayName}`)).toBeTruthy();
  });
});
