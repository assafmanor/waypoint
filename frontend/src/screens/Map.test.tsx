// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type Place,
  type TripEvent,
} from '@waypoint/shared';

const ACTIVE_DATE = '2026-07-20';

const place = (id: string, coords: boolean, at?: { lat: number; lng: number }): Place => ({
  id,
  tripId: 't1',
  name: id,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...(coords ? (at ?? { lat: 35.6, lng: 139.6 }) : {}),
});

const event = (p: Partial<TripEvent> & Pick<TripEvent, 'id' | 'placeId'>): TripEvent => ({
  tripId: 't1',
  date: ACTIVE_DATE,
  title: p.id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...p,
});

const maybe = (p: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't1', title: p.id, consumed: false, ...p }) as MaybeItem;

// Fixtures: a food event + a coordless-lite event today; a sightseeing event on
// another day; a food maybe (no day). Mutable so a test can blank them.
let tripEvents: TripEvent[] = [];
let tripMaybes: MaybeItem[] = [];
let tripPlaces: Place[] = [];
let tripBookings: Booking[] = [];
let currentMode = 'trip';
let isOffline = false;

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
    bookings: tripBookings,
    maybeItems: tripMaybes,
    places: tripPlaces,
    activeDate: ACTIVE_DATE,
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places: tripPlaces,
      crossings: [],
      primaryZone: 'Asia/Tokyo',
    },
    usingCachedSnapshot: false,
    indexVerbs: { createPlace: vi.fn(), resolvePlace: vi.fn() },
  }),
}));
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: currentMode }) }));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => isOffline }));

// The device's geolocation, driven per test: `fix` is what a granted request
// returns, `errorCode` makes it fail (1 = PERMISSION_DENIED).
let geoFix: { lat: number; lng: number } | null = null;
let geoErrorCode: number | null = null;
const getCurrentPosition = vi.fn(
  (
    onSuccess: (p: { coords: { latitude: number; longitude: number } }) => void,
    onError: (e: { code: number; PERMISSION_DENIED: number }) => void,
  ) => {
    if (geoErrorCode != null) onError({ code: geoErrorCode, PERMISSION_DENIED: 1 });
    else if (geoFix) onSuccess({ coords: { latitude: geoFix.lat, longitude: geoFix.lng } });
  },
);
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition },
  configurable: true,
});

import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { MapScopeProvider } from '../state/map-scope-state';
import { setSimulatedNow } from '../lib/useClock';
import { MapView } from './Map';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <MapScopeProvider>{node}</MapScopeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

function seed() {
  tripPlaces = [place('food', true), place('see', true), place('idea', true), place('lite', false)];
  tripEvents = [
    event({ id: 'food', placeId: 'food', category: 'food' }),
    event({ id: 'see', placeId: 'see', category: 'sightseeing', date: '2026-07-21' }),
    event({ id: 'lite', placeId: 'lite', category: 'activity' }),
  ];
  tripMaybes = [maybe({ id: 'idea', placeId: 'idea', category: 'food' })];
}

describe('MapView (Phase 3, ADR-0109/0110)', () => {
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
    tripEvents = [];
    tripMaybes = [];
    tripPlaces = [];
    tripBookings = [];
    currentMode = 'trip';
    isOffline = false;
    geoFix = null;
    geoErrorCode = null;
    getCurrentPosition.mockClear();
  });

  it('Trip mode defaults to today: shows today’s places, hides other-day and dayless ones', () => {
    seed();
    render(wrap(<MapView />));
    expect(screen.getByText('food')).toBeTruthy();
    expect(screen.getByText('lite')).toBeTruthy(); // coordless, still listed on its day
    expect(screen.queryByText('see')).toBeNull(); // another day
    expect(screen.queryByText('idea')).toBeNull(); // a maybe has no day facet
  });

  it('a coord place gets a Google directions link; a coordless one gets ＋ מיקום to enrich', () => {
    seed();
    render(wrap(<MapView />));
    const nav = screen.getAllByRole('link', { name: new RegExp(t.actions.navigate) });
    expect(nav[0].getAttribute('href')).toContain('/maps/dir/?api=1&destination=');
    expect(screen.getByRole('button', { name: new RegExp(t.map.addLocation) })).toBeTruthy();
  });

  it('＋ מיקום opens the shared picker sheet to enrich the coordless place', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.addLocation) }));
    expect(screen.getByText(t.placePicker.title)).toBeTruthy();
  });

  it('the all-days chip reveals every place (other days + dayless maybes/bookings)', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
    expect(screen.getByText('see')).toBeTruthy();
    expect(screen.getByText('idea')).toBeTruthy();
  });

  it('the maybes toggle narrows to shelf ideas', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) })); // see everything
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.filter.maybes) }));
    expect(screen.getByText('idea')).toBeTruthy();
    expect(screen.queryByText('food')).toBeNull();
    expect(screen.queryByText('see')).toBeNull();
  });

  it('Plan mode defaults to all days', () => {
    seed();
    currentMode = 'plan';
    render(wrap(<MapView />));
    expect(screen.getByText('see')).toBeTruthy();
    expect(screen.getByText('idea')).toBeTruthy();
  });

  it('empty trip → the empty state', () => {
    render(wrap(<MapView />));
    expect(screen.getByText(t.map.empty.title)).toBeTruthy();
  });

  describe('list order is trip order (ADR-0109 §1 amendment)', () => {
    const names = () =>
      [...document.querySelectorAll('.place .map-name')].map((n) => n.textContent);

    it('today reads by the clock, not the alphabet', () => {
      // Alphabetical order would be the exact reverse of the schedule.
      tripPlaces = [place('zoo', true), place('market', true), place('bar', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'bar', startsAt: `${ACTIVE_DATE}T20:00:00Z` }),
        event({ id: 'e2', placeId: 'market', startsAt: `${ACTIVE_DATE}T13:00:00Z` }),
        event({ id: 'e3', placeId: 'zoo', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
      ];
      render(wrap(<MapView />));
      expect(names()).toEqual(['zoo', 'market', 'bar']);
    });

    it('a flight’s two endpoints read in travel order, not alphabetically', () => {
      tripPlaces = [place('zzz-departure', true), place('aaa-landing', true)];
      tripBookings = [
        {
          id: 'bk',
          tripId: 't1',
          type: 'flight',
          title: 'flight',
          source: 'manual',
          fromPlaceId: 'zzz-departure',
          toPlaceId: 'aaa-landing',
          createdAt: '',
          updatedAt: '',
          updatedBy: 'u1',
        } as Booking,
      ];
      tripEvents = [
        event({
          id: 'f',
          placeId: undefined,
          bookingId: 'bk',
          startsAt: `${ACTIVE_DATE}T07:15:00Z`,
          endsAt: `${ACTIVE_DATE}T11:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(names()).toEqual(['zzz-departure', 'aaa-landing']);
    });
  });

  describe('near me now (Phase 4a, ADR-0109 §6-7)', () => {
    // Two places on the same Tokyo street, one ~1.1 km further out than the other,
    // plus a coordless lite. The device sits at `near`.
    const HERE = { lat: 35.68, lng: 139.76 };
    const seedNear = () => {
      tripPlaces = [
        place('far', true, { lat: 35.69, lng: 139.76 }),
        place('near', true, HERE),
        place('lite', false),
      ];
      tripEvents = [
        event({ id: 'far', placeId: 'far' }),
        event({ id: 'near', placeId: 'near' }),
        event({ id: 'lite', placeId: 'lite' }),
      ];
    };
    const nearChip = () => screen.getByRole('button', { name: new RegExp(t.map.near.chip) });
    const rowNames = () =>
      [...document.querySelectorAll('.place .map-name')].map((n) => n.textContent);

    it('asks for nothing on open — the tab renders fully with zero location', () => {
      seedNear();
      render(wrap(<MapView />));
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(screen.queryByText(t.map.near.prompt.title)).toBeNull();
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
      expect(rowNames()).toEqual(['far', 'lite', 'near']); // default day/name order
    });

    it('the chip states the reason first, and only then asks the device', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      // The pre-prompt is up and NOTHING has been requested yet (ADR-0109 §6).
      expect(screen.getByText(t.map.near.prompt.body)).toBeTruthy();
      expect(getCurrentPosition).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(t.map.near.prompt.body)).toBeNull();
    });

    it('"לא עכשיו" closes the pre-prompt without asking — nothing is dead-ended', () => {
      seedNear();
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.notNow }));
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(screen.queryByText(t.map.near.prompt.body)).toBeNull();
      expect(rowNames()).toEqual(['far', 'lite', 'near']);
    });

    it('granted: re-sorts nearest-first under the group header, coordless sinking last', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      expect(screen.getByText(t.map.near.groupHeader)).toBeTruthy();
      expect(rowNames()).toEqual(['near', 'far', 'lite']);
    });

    it('granted: distance chips read on measured rows, and never on a coordless one', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      const dist = [...document.querySelectorAll('.place')].map(
        (row) => row.querySelector('.map-dist')?.textContent,
      );
      expect(dist[0]).toBe('10 מ׳'); // standing on it
      expect(dist[1]).toBe('1.1 ק״מ');
      expect(dist[2]).toBeUndefined(); // the coordless lite can't be measured
    });

    it('toggling off restores the default order and drops the distances', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      fireEvent.click(nearChip());
      expect(rowNames()).toEqual(['far', 'lite', 'near']);
      expect(document.querySelector('.map-dist')).toBeNull();
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
    });

    it('denied: the list keeps its own order and says why, with no retry offered', () => {
      seedNear();
      geoErrorCode = 1; // PERMISSION_DENIED → hard-denied, a retry cannot re-prompt
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      expect(screen.getByText(new RegExp(t.map.near.deniedBanner))).toBeTruthy();
      expect(screen.getByText(t.map.near.blockedHint)).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.map.near.retry })).toBeNull();
      expect(rowNames()).toEqual(['far', 'lite', 'near']);
      expect(document.querySelector('.map-dist')).toBeNull();
    });

    it('unavailable: a retry IS offered, since asking again can still succeed', () => {
      seedNear();
      geoErrorCode = 2; // POSITION_UNAVAILABLE
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      expect(screen.getByText(new RegExp(t.map.near.unavailableBanner))).toBeTruthy();
      const retry = screen.getByRole('button', { name: t.map.near.retry });

      geoErrorCode = null;
      geoFix = HERE;
      fireEvent.click(retry);
      expect(rowNames()).toEqual(['near', 'far', 'lite']);
    });

    it('offline: the chip is gone and distances say so rather than going stale', () => {
      seedNear();
      geoFix = HERE;
      const view = render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));

      isOffline = true;
      view.rerender(wrap(<MapView />));
      expect(screen.queryByRole('button', { name: new RegExp(t.map.near.chip) })).toBeNull();
      expect(screen.getAllByText(t.map.near.unavailable)).toHaveLength(2); // both coord rows
      expect(screen.queryByText('1.1 ק״מ')).toBeNull();
    });
  });

  describe('navigate-to-next cue (Phase 4b, ADR-0106 §6)', () => {
    // 09:00 Tokyo on the active day, so the seeded events are all still ahead.
    const NOW = Date.parse('2026-07-20T00:00:00Z');
    const timed = (id: string, hour: string) =>
      event({ id, placeId: id, startsAt: `2026-07-20T${hour}:00Z` });

    const nextTag = () => screen.queryByText(new RegExp(t.map.nextStop));

    it('marks exactly one row — the earliest upcoming mappable stop — with its time', () => {
      setSimulatedNow(NOW);
      tripPlaces = [place('food', true), place('see', true)];
      tripEvents = [timed('see', '09:00'), timed('food', '04:00')];
      render(wrap(<MapView />));
      const tags = screen.getAllByText(new RegExp(t.map.nextStop));
      expect(tags).toHaveLength(1);
      // 04:00Z reads 13:00 in the trip's Tokyo zone (ADR-0107: the event's own zone).
      expect(tags[0].textContent).toContain('13:00');
      expect(tags[0].closest('.place')?.textContent).toContain('food');
    });

    it('is absent in Plan mode — a live "next" says nothing while planning', () => {
      setSimulatedNow(NOW);
      currentMode = 'plan';
      tripPlaces = [place('food', true)];
      tripEvents = [timed('food', '04:00')];
      render(wrap(<MapView />));
      expect(nextTag()).toBeNull();
    });

    it('is absent when nothing upcoming has coordinates', () => {
      setSimulatedNow(NOW);
      tripPlaces = [place('lite', false)];
      tripEvents = [timed('lite', '04:00')];
      render(wrap(<MapView />));
      expect(nextTag()).toBeNull();
    });
  });
});
