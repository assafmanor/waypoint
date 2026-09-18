// @vitest-environment jsdom
// **Field report #22 — the boot that never ends on a phone with no reception.**
//
// The condition is the one the report names and it is NOT airplane mode: the radios are on,
// so `navigator.onLine` is `true` and `fetch` neither resolves nor rejects — it simply never
// answers. `isOffline()` is mocked to `false` here for exactly that reason; a fixture that
// says "offline" tests a case the app already survived.
//
// The real `lib/api` runs (only the Dexie cache is mocked), so this exercises the actual boot
// read rather than a stub of it: with no bound on that fetch, neither branch of the boot
// effect's `.then(resolve, reject)` ever fires and the app sits on its skeleton forever.
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TripSnapshot } from '@waypoint/shared';
import { TRIP } from '../fixtures';
import { API_TIMEOUT_MS, STAND_IN_AFTER_MS } from '../constants';
import { t } from '../i18n/he';

const h = vi.hoisted(() => ({ readCachedSnapshot: vi.fn() }));

vi.mock('../lib/cache', () => ({
  cacheSnapshot: vi.fn().mockResolvedValue(undefined),
  readCachedSnapshot: h.readCachedSnapshot,
  cacheEnrichment: vi.fn().mockResolvedValue(undefined),
  applyChangeToCache: vi.fn(),
  applyOutboxOpToCache: vi.fn(),
  clearTripCache: vi.fn(),
  coerceClearedFields: (x: unknown) => x,
  coerceTripPatch: (x: unknown) => x,
}));
vi.mock('../lib/outbox', () => ({
  isOffline: () => false, // radios on, no upstream — the reported condition
  isNetworkError: () => true,
  flushOutbox: vi.fn().mockResolvedValue(undefined),
  getSyncFailures: () => [],
  subscribeSyncFailures: () => () => {},
  restOrQueue: vi.fn(),
  OUTBOX_VERB: {},
}));
vi.mock('../lib/ws', () => ({ openTripStream: () => () => {} }));
vi.mock('../lib/useClock', () => ({
  getNow: () => Date.parse('2026-07-08T12:00:00+09:00'),
  useClock: () => Date.parse('2026-07-08T12:00:00+09:00'),
  setSimulatedNow: () => {},
}));
vi.mock('./auth-state', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../ui/Toast', () => ({ useToast: () => () => {} }));

import { TripProvider } from './trip-state';

const CACHED: TripSnapshot = {
  trip: TRIP,
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  notes: [],
  tasks: [],
  travelModeOverrides: [],
  documentAttachments: [],
  enrichments: {},
  fxRates: null,
  forecast: null,
  latestSeq: '0',
};

/** A fetch that neither resolves nor rejects — a connected radio with no upstream. */
const NEVER = new Promise<never>(() => {});

beforeEach(() => {
  vi.useFakeTimers();
  h.readCachedSnapshot.mockReset().mockResolvedValue(CACHED);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => NEVER),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderBoot(children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TripProvider tripId={TRIP.id}>{children}</TripProvider>
    </MemoryRouter>,
  );
}

describe('boot with no reception (field report #22)', () => {
  it('falls back to the cached snapshot instead of spinning forever', async () => {
    renderBoot(<div>CONTENT</div>);
    expect(screen.getByLabelText(t.snapshot.loading)).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAND_IN_AFTER_MS - 1);
    });
    expect(screen.queryByText('CONTENT')).toBeNull(); // a moment's wait is still a boot

    // The cache stands in here, `API_TIMEOUT_MS.FETCH` before the read it is standing in for
    // would have been allowed to fail (owner report, low reception abroad).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('CONTENT')).toBeTruthy();
  });

  // The stand-in is a wait, not a preference: a link that answers inside it renders LIVE data
  // and never shows the cached frame at all.
  it('never stands in when the network answers first', async () => {
    const live: TripSnapshot = { ...CACHED, latestSeq: '9' };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(live) } as Response),
      ),
    );
    renderBoot(<div>CONTENT</div>);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAND_IN_AFTER_MS * 2);
    });

    expect(screen.getByText('CONTENT')).toBeTruthy();
    expect(h.readCachedSnapshot).not.toHaveBeenCalled();
  });

  // The true last resort — this trip was never cached, so there is nothing to fall back to.
  // It still has to END: a retryable error, which is what a rejection has always produced.
  it('lands on the retryable error when nothing was ever cached', async () => {
    h.readCachedSnapshot.mockResolvedValue(null);
    renderBoot(<div>CONTENT</div>);

    // Nothing to stand in with, so this one still waits out the full bound — a skeleton is a
    // better answer than an error screen while the read might yet deliver.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STAND_IN_AFTER_MS + 1);
    });
    expect(screen.queryByText(t.snapshot.errorTitle)).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS.FETCH + 1);
    });

    expect(screen.getByText(t.snapshot.errorTitle)).toBeTruthy();
    expect(screen.getByText(t.feedback.retry)).toBeTruthy();
  });
});
