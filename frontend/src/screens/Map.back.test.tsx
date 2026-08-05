// @vitest-environment jsdom
//
// **THE REAL MAP TAB, UNDER A REAL SYSTEM BACK** (owner, 2026-07-29: _"closing (swipe back)
// the map search entered from the map should return you back to the map and not home"_).
//
// Its own file, and both halves of that are deliberate:
//
//  • `Map.embedded.test.tsx` mounts this screen under a `MemoryRouter`, and the back
//    interceptor snapshots `window.location` — it runs inside a DOM event, outside React —
//    so that suite **cannot exercise the interceptor at all**. Switching it wholesale would
//    put 138 unrelated assertions on a different router to chase one bug.
//  • `state/nav-state.system-back.test.tsx` drives the same presses against a **stand-in**
//    layer and gets the right answer every time. So if the report reproduces, the cause is
//    something this screen does that a stand-in does not — the chrome reclaim, the lifted
//    `queryOpen`, the errand layer — and the difference between the two files IS the
//    diagnosis.
//
// The mocks below are the minimum to get `MapView` on screen: they are a deliberate copy of
// the embedded suite's, because this file asks a different question of the same screen and
// sharing the fixture would couple two suites that should be free to move apart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import type { Note, Place, TripEvent } from '@waypoint/shared';

const ACTIVE_DATE = '2026-07-22';
let tripPlaces: Place[] = [];
const tripNotes: Note[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));
let tripEvents: TripEvent[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      name: 'טיול',
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
    },
    events: tripEvents,
    bookings: [],
    maybeItems: [],
    places: tripPlaces,
    activeDate: ACTIVE_DATE,
    zoneEvidence: {
      events: tripEvents,
      bookings: [],
      places: tripPlaces,
      crossings: [],
      primaryZone: 'Asia/Tokyo',
    },
    usingCachedSnapshot: false,
    // What the world knows about these places (ADR-0166 §6) — always present, empty when we
    // know nothing, so a row's badge never has to ask whether the read model arrived.
    enrichments: {},
    indexVerbs: { createPlace: vi.fn(), resolvePlace: vi.fn(), updateBooking: vi.fn() },
    // A place is the fifth note host (ADR-0153 §8's amendment): the row carries the mark, the
    // selected row carries the section, and the make/rename form carries the composer.
    notes: tripNotes,
    users: [{ id: 'u1', displayName: 'דנה' }],
    noteVerbs: { createNote },
  }),
}));
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: 'trip' }) }));
vi.mock('../state/verbs', () => ({ useVerbs: () => ({ addMaybe: vi.fn() }) }));
vi.mock('../lib/outbox', () => ({
  useIsOffline: () => false,
  withChangeGroup: (run: () => Promise<unknown>) => run(),
}));
vi.mock('../lib/useGeolocation', () => ({
  useGeolocation: () => ({
    status: 'denied',
    permission: 'denied',
    blocked: true,
    coords: null,
    request: vi.fn(),
  }),
}));
vi.mock('../lib/usePlaceSearch', () => ({
  usePlaceSearch: () => ({
    query: '',
    setQuery: vi.fn(),
    predictions: [],
    loading: false,
    rateLimited: false,
    failed: false,
    active: true,
    alreadyInTrip: () => undefined,
    pick: vi.fn(),
    saveNameOnly: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('../lib/map-config', () => ({
  mapsConfig: () => ({ apiKey: 'k', mapId: 'waypoint-day' }),
  mapPaneAvailable: () => true,
}));
vi.mock('../ui/domain/MapPane', () => ({ MapPane: () => <div data-pane /> }));

import { ToastProvider } from '../ui/Toast';
import { NavProvider, useMarkInsideTrip } from '../state/nav-state';
import { MapScopeProvider } from '../state/map-scope-state';
import { setSimulatedNow } from '../lib/useClock';
import { MapView } from './Map';
import { t } from '../i18n/he';

const place = (id: string): Place =>
  ({
    id,
    tripId: 't1',
    name: id,
    lat: 35.6,
    lng: 139.6,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  }) as Place;

const event = (id: string, placeId: string): TripEvent =>
  ({
    id,
    tripId: 't1',
    date: ACTIVE_DATE,
    title: id,
    kind: 'soft',
    status: 'planned',
    placeId,
    startsAt: `${ACTIVE_DATE}T09:00:00Z`,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u1',
  }) as TripEvent;

class FakeNavigation extends EventTarget {
  currentEntry = { index: 5 };
}
let fakeNav: FakeNavigation;

beforeEach(() => {
  setSimulatedNow(new Date(`${ACTIVE_DATE}T08:00:00Z`).getTime());
  tripPlaces = [place('museum')];
  tripEvents = [event('e1', 'museum')];
  fakeNav = new FakeNavigation();
  (window as unknown as { navigation?: FakeNavigation }).navigation = fakeNav;
  // The history the app really builds: one same-URL guard entry behind the tab, and tab
  // changes REPLACE (ADR-0090). So the entry behind the Map tab is trip Home — which is
  // exactly what "it went home" would be.
  window.history.replaceState(null, '', '/');
  window.history.pushState(null, '', '/');
  window.history.replaceState(null, '', '/?tab=map');
});

afterEach(() => {
  cleanup();
  setSimulatedNow(null);
  delete (window as unknown as { navigation?: FakeNavigation }).navigation;
});

function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}
const where = () => screen.getByTestId('where').textContent;

function InsideTrip() {
  useMarkInsideTrip();
  return null;
}

function SystemBack() {
  return (
    <button
      data-testid="system-back"
      onClick={() => {
        const evt = Object.assign(new Event('navigate', { cancelable: true }), {
          navigationType: 'traverse',
          destination: { index: fakeNav.currentEntry.index - 1 },
        });
        fakeNav.dispatchEvent(evt);
        if (!evt.defaultPrevented) {
          fakeNav.currentEntry.index -= 1;
          window.history.back();
        }
      }}
    />
  );
}

async function pressBack(expected: string) {
  fireEvent.click(screen.getByTestId('system-back'));
  await waitFor(() => expect(where()).toBe(expected));
}

function wrap(node: ReactNode) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <NavProvider>
          <MapScopeProvider>
            <InsideTrip />
            {node}
            <Where />
            <SystemBack />
          </MapScopeProvider>
        </NavProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

const openSearch = () => fireEvent.click(screen.getByRole('button', { name: t.map.search.button }));
const fieldOpen = () => screen.queryByPlaceholderText(t.map.search.placeholder) != null;

describe('the Map tab under a system back', () => {
  it('one press closes the search field and stays on the tab', async () => {
    render(wrap(<MapView />));
    openSearch();
    expect(fieldOpen()).toBe(true);

    await pressBack('/?tab=map');
    expect(fieldOpen()).toBe(false);
  });

  // …and only THEN does back leave the tab. Two presses, two outcomes — which is what
  // "return you back to the map and not home" is asking for.
  it('the next press is the one that goes Home', async () => {
    render(wrap(<MapView />));
    openSearch();
    await pressBack('/?tab=map');
    await pressBack('/');
  });

  // Typing is what turns the open field into a live query (`searching`), and a live query
  // changes the sheet, the pins and the list — so it is worth pressing back from that state
  // too rather than only from the empty field.
  it('closes a field with a live query, still without leaving the tab', async () => {
    render(wrap(<MapView />));
    openSearch();
    fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
      target: { value: 'museum' },
    });
    await pressBack('/?tab=map');
    expect(fieldOpen()).toBe(false);
  });

  // The field opened, closed by its own ✕, and opened again — the sequence that leaves a
  // spent history marker behind (ADR-0103's push-only bookkeeping).
  it('survives an open / ✕ / re-open cycle', async () => {
    render(wrap(<MapView />));
    openSearch();
    fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
    openSearch();

    await pressBack('/?tab=map');
    expect(fieldOpen()).toBe(false);
  });
});
