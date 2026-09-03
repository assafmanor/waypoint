// @vitest-environment jsdom
// Provider-level coverage for the two shell/state changes in this wave: the
// day-in-URL round-trip through the real TripProvider (J7 / review Q5) and the
// chrome-preserving snapshot error state with a working retry (U-10). The pure
// resolver is unit-tested in nav-state.test.ts; here we exercise it end-to-end
// with the router + a probe reading the live `activeDate`.
//
// It is also where the REMEMBERED DAY is asserted across real tab moves (field
// report #39): the day is the `?day=` param and `activeDate` derives from it, so
// "switching views does not reset the date" is exactly a claim about this pair —
// `useTripTab`'s navigation and this provider's derivation — and cannot be made by
// either alone.
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
import { useTripTab } from './nav-state';
import type { TabId } from '../constants';

const SNAPSHOT: TripSnapshot = {
  trip: TRIP, // 2026-07-05 .. 2026-07-14, Asia/Tokyo
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

describe('day-in-URL round-trip (J7 / review Q5, single-source day ADR-0035 §4)', () => {
  it('seeds activeDate from a valid in-range ?day= param on the days tab', async () => {
    renderAt('/?tab=days&day=2026-07-10', <DayProbe />);
    expect(await screen.findByText('DAY:2026-07-10')).toBeTruthy();
  });

  it('falls back to today for an invalid/out-of-range ?day= param', async () => {
    renderAt('/?tab=days&day=bogus', <DayProbe />);
    // getNow is pinned to 2026-07-08 in Asia/Tokyo → today, and it is in range.
    expect(await screen.findByText('DAY:2026-07-08')).toBeTruthy();
  });

  it('is today-anchored on the Home tab: a stray ?day= cannot make Home show another day', async () => {
    renderAt('/?day=2026-07-10', <DayProbe />); // no ?tab= → Home
    expect(await screen.findByText('DAY:2026-07-08')).toBeTruthy();
  });
});

// **One remembered day across the day surfaces, and none on the Index** (field report
// #39). The report was that Day-by-day → Map → Day-by-day came back on today: the tab
// bar navigated to a bare `?tab=`, and with `?day=` gone `activeDate` resolved to today.
//
// The trip runs 2026-07-05..14 and today is pinned to 2026-07-08, so a remembered
// 2026-07-11 is distinguishable from all three ways this used to fail — today, the first
// trip day, and a stale default. The snapshot carries NO events, so every day here is an
// empty day: "a selected day with no items is still the same selected day after a
// switch" is the default state of this whole block rather than one case in it.
describe('the remembered day across tab moves (field report #39)', () => {
  const REMEMBERED = '2026-07-11';
  const TODAY = '2026-07-08';
  const TABS: TabId[] = ['home', 'days', 'index', 'map'];

  /** A probe standing in for the tab bar: it reports where it is and which day is
   *  active, and moves through the real `goToTab` — the function the report blamed. */
  function TabProbe() {
    const { tab, goToTab } = useTripTab();
    const { activeDate } = useTrip();
    return (
      <div>
        <span>
          AT:{tab} DAY:{activeDate}
        </span>
        {TABS.map((id) => (
          <button key={id} onClick={() => goToTab(id)}>
            go-{id}
          </button>
        ))}
      </div>
    );
  }

  const go = (tab: TabId) => fireEvent.click(screen.getByText(`go-${tab}`));
  const at = async (tab: TabId, day: string) =>
    expect(await screen.findByText(`AT:${tab} DAY:${day}`)).toBeTruthy();

  it('keeps the day through repeated Day ↔ Map switches', async () => {
    renderAt(`/?tab=days&day=${REMEMBERED}`, <TabProbe />);
    await at('days', REMEMBERED);
    for (let round = 0; round < 3; round += 1) {
      go('map');
      await at('map', REMEMBERED);
      go('days');
      await at('days', REMEMBERED);
    }
  });

  // The Index is the visit that must not cost you the day: it neither filters by it nor
  // shows it as selected, and it still hands it back on the way out — including to the
  // OTHER day surface, which is the crossed pair the report also asked for.
  it('remembers the day through the Index, in every direction', async () => {
    for (const [from, back] of [
      ['days', 'days'],
      ['map', 'map'],
      ['days', 'map'],
      ['map', 'days'],
    ] as [TabId, TabId][]) {
      const view = renderAt(`/?tab=${from}&day=${REMEMBERED}`, <TabProbe />);
      await at(from, REMEMBERED);
      go('index');
      await at('index', REMEMBERED);
      go(back);
      await at(back, REMEMBERED);
      view.unmount();
    }
  });

  it('never falls back to today, the first trip day, or a stale default', async () => {
    renderAt(`/?tab=map&day=${REMEMBERED}`, <TabProbe />);
    await at('map', REMEMBERED);
    go('index');
    go('days');
    const probe = await screen.findByText(/^AT:/);
    expect(probe.textContent).toBe(`AT:days DAY:${REMEMBERED}`);
    expect(probe.textContent).not.toContain(TODAY); // today
    expect(probe.textContent).not.toContain(TRIP.startDate); // the first trip day
  });

  // Home is the one surface that is today-anchored in both modes (ADR-0035 §4), and its
  // clean `/` is what makes that structural rather than an effect. So going Home is not a
  // lost day but the documented reset — asserted here so nobody "fixes" it later.
  it('drops the day at Home, which is today-anchored by construction', async () => {
    renderAt(`/?tab=days&day=${REMEMBERED}`, <TabProbe />);
    await at('days', REMEMBERED);
    go('home');
    await at('home', TODAY);
    go('days');
    await at('days', TODAY);
  });
});

describe('snapshot error state (U-10)', () => {
  it('renders ErrorState with a retry that re-runs the fetch and recovers', async () => {
    h.fetchSnapshot
      .mockReset()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(SNAPSHOT);

    renderAt('/', <div>CONTENT</div>);

    // Chrome-preserving error, not the old dead-end <h1>.
    expect(await screen.findByText(t.snapshot.errorTitle)).toBeTruthy();
    const retry = screen.getByText(t.feedback.retry);

    fireEvent.click(retry); // re-runs the boot fetch (now resolving)

    expect(await screen.findByText('CONTENT')).toBeTruthy();
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(2);
  });
});
