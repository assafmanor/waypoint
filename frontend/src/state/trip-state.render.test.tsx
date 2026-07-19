// @vitest-environment jsdom
// Provider-level coverage for the two shell/state changes in this wave: the
// day-in-URL round-trip through the real TripProvider (J7 / review Q5) and the
// chrome-preserving snapshot error state with a working retry (U-10). The pure
// resolver is unit-tested in nav-state.test.ts; here we exercise it end-to-end
// with the router + a probe reading the live `activeDate`.
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { TripSnapshot } from '@waypoint/shared';
import { TRIP } from '../fixtures';
import { t } from '../i18n/he';

// Controllable snapshot fetch; everything else the provider touches at mount is
// stubbed to a harmless no-op (offline, so the boot catch-up never runs).
const h = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  readCachedSnapshot: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchSnapshot: h.fetchSnapshot,
  fetchChanges: vi.fn().mockResolvedValue([]),
  isHardEventConfirmError: () => false,
}));
vi.mock('../lib/cache', () => ({
  cacheSnapshot: vi.fn().mockResolvedValue(undefined),
  readCachedSnapshot: h.readCachedSnapshot,
  applyChangeToCache: vi.fn(),
  clearTripCache: vi.fn(),
}));
vi.mock('../lib/outbox', () => ({
  isOffline: () => true, // skip the mount catch-up path entirely
  flushOutbox: vi.fn().mockResolvedValue(undefined),
  getSyncFailures: () => [],
  subscribeSyncFailures: () => () => {},
  restOrQueue: vi.fn(),
}));
vi.mock('../lib/ws', () => ({ openTripStream: () => () => {} }));
// Pin the clock inside the trip so "today" is a deterministic in-range day.
vi.mock('../lib/useClock', () => ({
  getNow: () => Date.parse('2026-07-08T12:00:00+09:00'),
}));
vi.mock('./auth-state', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../ui/Toast', () => ({ useToast: () => () => {} }));

import { TripProvider, useTrip } from './trip-state';

const SNAPSHOT: TripSnapshot = {
  trip: TRIP, // 2026-07-05 .. 2026-07-14, Asia/Tokyo
  members: [],
  users: [],
  events: [],
  bookings: [],
  documents: [],
  maybeItems: [],
  places: [],
  latestSeq: '0',
};

function DayProbe() {
  const { activeDate } = useTrip();
  return <div>DAY:{activeDate}</div>;
}

function renderAt(path: string, children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TripProvider tripId={TRIP.id}>{children}</TripProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.fetchSnapshot.mockReset().mockResolvedValue(SNAPSHOT);
  h.readCachedSnapshot.mockReset().mockResolvedValue(null);
});
afterEach(() => cleanup());

describe('day-in-URL round-trip (J7 / review Q5)', () => {
  it('seeds activeDate from a valid in-range ?day= param', async () => {
    renderAt('/?day=2026-07-10', <DayProbe />);
    expect(await screen.findByText('DAY:2026-07-10')).toBeTruthy();
  });

  it('falls back to today for an invalid/out-of-range ?day= param', async () => {
    renderAt('/?day=bogus', <DayProbe />);
    // getNow is pinned to 2026-07-08 in Asia/Tokyo → today, and it is in range.
    expect(await screen.findByText('DAY:2026-07-08')).toBeTruthy();
  });
});

describe('snapshot error state (U-10)', () => {
  it('renders ErrorState with a retry that re-runs the fetch and recovers', async () => {
    h.fetchSnapshot.mockReset().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(SNAPSHOT);

    renderAt('/', <div>CONTENT</div>);

    // Chrome-preserving error, not the old dead-end <h1>.
    expect(await screen.findByText(t.snapshot.errorTitle)).toBeTruthy();
    const retry = screen.getByText(t.feedback.retry);

    fireEvent.click(retry); // re-runs the boot fetch (now resolving)

    expect(await screen.findByText('CONTENT')).toBeTruthy();
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(2);
  });
});
