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
  // Distinct from the place name on purpose: the row's meta line renders the title,
  // so a title equal to the place name makes every getByText(name) ambiguous.
  title: `${p.id} plan`,
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
// Plan-mode research writes through the shelf verb; the write itself is covered in
// PlaceResearch.test.tsx, so the screen only needs the hook to exist.
vi.mock('../state/verbs', () => ({ useVerbs: () => ({ addMaybe: vi.fn() }) }));
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
    // Dawn of the active day, so these fixtures are all still ahead unless a test
    // says otherwise. Without pinning, the order would depend on when the suite runs.
    const DAWN = Date.parse(`${ACTIVE_DATE}T00:00:00Z`);

    it('today reads by the clock, not the alphabet', () => {
      setSimulatedNow(DAWN);
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

    it('Trip mode leads with what is ahead and labels the block behind you', () => {
      // The reported day: 14:11, two stops visited, the next one at 17:00.
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T14:11:00Z`));
      tripPlaces = [place('morning', true), place('lunch', true), place('ice-cave', true)];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'morning',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
          endsAt: `${ACTIVE_DATE}T10:00:00Z`,
        }),
        event({
          id: 'e2',
          placeId: 'lunch',
          startsAt: `${ACTIVE_DATE}T12:00:00Z`,
          endsAt: `${ACTIVE_DATE}T13:00:00Z`,
        }),
        event({ id: 'e3', placeId: 'ice-cave', startsAt: `${ACTIVE_DATE}T17:00:00Z` }),
      ];
      render(wrap(<MapView />));
      // Ahead first; then what's done, NEWEST first — lunch (12:00) is the stop you
      // just left, so it outranks the morning one.
      expect(names()).toEqual(['ice-cave', 'lunch', 'morning']);
      expect(screen.getByText(t.map.behindHeader)).toBeTruthy();
    });

    it('Plan mode splits the same way — a list opening on last Tuesday is wrong there too', () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T14:11:00Z`));
      currentMode = 'plan';
      tripPlaces = [place('morning', true), place('ice-cave', true)];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'morning',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
          endsAt: `${ACTIVE_DATE}T10:00:00Z`,
        }),
        event({ id: 'e2', placeId: 'ice-cave', startsAt: `${ACTIVE_DATE}T17:00:00Z` }),
      ];
      render(wrap(<MapView />));
      expect(names()).toEqual(['ice-cave', 'morning']);
      expect(screen.getByText(t.map.behindHeader)).toBeTruthy();
    });

    it('all-days scope leads with what is ahead, whatever day it falls on', () => {
      // The reported bug: ordering by date first put earlier days above tonight.
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T14:11:00Z`));
      tripPlaces = [
        place('two-days-ago', true),
        place('yesterday', true),
        place('tonight', true),
        place('next-week', true),
      ];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'two-days-ago',
          date: '2026-07-18',
          startsAt: '2026-07-18T09:00:00Z',
        }),
        event({
          id: 'e2',
          placeId: 'yesterday',
          date: '2026-07-19',
          startsAt: '2026-07-19T09:00:00Z',
        }),
        event({ id: 'e3', placeId: 'tonight', startsAt: `${ACTIVE_DATE}T20:00:00Z` }),
        event({
          id: 'e4',
          placeId: 'next-week',
          date: '2026-07-24',
          startsAt: '2026-07-24T09:00:00Z',
        }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(names()).toEqual(['tonight', 'next-week', 'yesterday', 'two-days-ago']);
      expect(screen.getByText(t.map.behindHeader)).toBeTruthy();
    });

    it('a flight’s two endpoints read in travel order, not alphabetically', () => {
      setSimulatedNow(DAWN);
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

  describe('row meta says when and what, not the address (ADR-0109 §1)', () => {
    const metaOf = (name: string) =>
      [...document.querySelectorAll('.place')]
        .find((row) => row.querySelector('.map-name')?.textContent === name)
        ?.querySelector('.map-m')?.textContent ?? '';
    const timeOf = (name: string) =>
      [...document.querySelectorAll('.place')]
        .find((row) => row.querySelector('.map-name')?.textContent === name)
        ?.querySelector('.map-tag.time')?.textContent;

    it('a scheduled place reads its time and what happens there, not its address', () => {
      tripPlaces = [
        { ...place('museum', true), address: 'Dimitras, Nicosia, Lefkosia 2058' } as Place,
      ];
      tripEvents = [
        event({
          id: 'e',
          placeId: 'museum',
          title: 'מוזיאון הארכיאולוגי',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(timeOf('museum')).toBe('18:00'); // 09:00Z in the trip's Tokyo zone
      expect(metaOf('museum')).toContain('מוזיאון הארכיאולוגי');
      expect(metaOf('museum')).not.toContain('Nicosia');
    });

    it('a flight’s ends read take-off and landing, each in its own zone', () => {
      tripPlaces = [place('origin', true), place('arrival', true)];
      tripBookings = [
        {
          id: 'bk',
          tripId: 't1',
          type: 'flight',
          title: 'flight',
          source: 'manual',
          fromPlaceId: 'origin',
          toPlaceId: 'arrival',
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
          icon: '✈️',
          category: 'transport',
          startsAt: `${ACTIVE_DATE}T00:15:00Z`,
          endsAt: `${ACTIVE_DATE}T04:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      // The origin says take-off at its departure, the destination landing at its
      // arrival — never a bare transition word, since the row names the place.
      expect(timeOf('origin')).toBe('09:15');
      expect(metaOf('origin')).toContain(t.glance.transition.flightDeparture);
      expect(timeOf('arrival')).toBe('13:00');
      expect(metaOf('arrival')).toContain(t.glance.transition.flightArrival);
    });

    it('all-days scope names the day too, since a bare time would read as today', () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T02:00:00Z`)); // 11:00 Tokyo on the 20th
      tripPlaces = [place('today-stop', true), place('tomorrow-stop', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'today-stop', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
        event({
          id: 'e2',
          placeId: 'tomorrow-stop',
          date: '2026-07-21',
          startsAt: '2026-07-21T01:00:00Z',
        }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      // One tag carries both, the Index's `scheduleLabel` composition.
      expect(timeOf('today-stop')).toBe(`היום · 18:00`);
      expect(timeOf('tomorrow-stop')).toBe(`מחר · 10:00`);
    });

    it('day scope shows only the time — the strip already names the day', () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T02:00:00Z`));
      tripPlaces = [place('stop', true)];
      tripEvents = [event({ id: 'e', placeId: 'stop', startsAt: `${ACTIVE_DATE}T09:00:00Z` })];
      render(wrap(<MapView />));
      expect(timeOf('stop')).toBe('18:00');
    });

    it('an untimed event still says which day when the list spans several', () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T02:00:00Z`));
      tripPlaces = [place('sometime', true)];
      tripEvents = [event({ id: 'e', placeId: 'sometime', date: '2026-07-22' })];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(timeOf('sometime')).toBe('מחרתיים');
    });

    it('an unscheduled shelf idea keeps the address fallback — nothing happens there yet', () => {
      tripPlaces = [{ ...place('idea', true), address: 'Barshavski St 7' } as Place];
      tripMaybes = [maybe({ id: 'm', placeId: 'idea' })];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(timeOf('idea')).toBeUndefined();
      expect(metaOf('idea')).toContain('Barshavski St 7');
    });

    it('a mid-stay night says nothing back — the hotel’s own name is not news', () => {
      tripPlaces = [{ ...place('hotel', true), address: 'Some St 1' } as Place];
      tripEvents = [
        event({
          id: 'h',
          placeId: 'hotel',
          title: 'המלון',
          category: 'lodging',
          icon: '🏨',
          date: '2026-07-19',
          endDate: '2026-07-22',
          startsAt: '2026-07-19T06:00:00Z',
          endsAt: '2026-07-22T02:00:00Z',
        }),
      ];
      render(wrap(<MapView />)); // ACTIVE_DATE (the 20th) is a strictly-middle night
      expect(timeOf('hotel')).toBeUndefined();
      expect(metaOf('hotel')).toContain('Some St 1');
      expect(metaOf('hotel')).not.toContain('המלון');
    });
  });

  describe('navigate-to-next cue (Phase 4b, ADR-0106 §6)', () => {
    // 09:00 Tokyo on the active day, so the seeded events are all still ahead.
    const NOW = Date.parse('2026-07-20T00:00:00Z');
    const timed = (id: string, hour: string) =>
      event({ id, placeId: id, startsAt: `2026-07-20T${hour}:00Z` });

    const nextTag = () => screen.queryByText(new RegExp(t.map.nextStop));

    it('marks exactly one row — the earliest upcoming mappable stop', () => {
      setSimulatedNow(NOW);
      tripPlaces = [place('food', true), place('see', true)];
      tripEvents = [timed('see', '09:00'), timed('food', '04:00')];
      render(wrap(<MapView />));
      const tags = screen.getAllByText(new RegExp(t.map.nextStop));
      expect(tags).toHaveLength(1);
      const row = tags[0].closest('.place');
      expect(row?.textContent).toContain('food');
      // The tag says WHICH row; the row's own meta says when — 04:00Z reads 13:00 in
      // the trip's Tokyo zone (ADR-0107: the event's own zone).
      expect(tags[0].textContent).toBe(t.map.nextStop);
      expect(row?.querySelector('.map-tag.time')?.textContent).toBe('13:00');
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

  // ADR-0117 — the row says what happened, and the block header stops claiming a
  // visit it can't vouch for. Asserted in BOTH scopes with a pinned clock.
  describe('place outcomes (ADR-0117)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const at = (hhmm: string) => `${ACTIVE_DATE}T${hhmm}:00Z`;
    const rowFor = (name: string) =>
      [...document.querySelectorAll('.place')].find((r) =>
        r.querySelector('.map-name')?.textContent?.includes(name),
      );

    it('a visited place says היינו; a skipped one says דילגנו and goes quiet', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('been', true), place('bailed', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'been', startsAt: at('09:00'), status: 'done' }),
        event({ id: 'e2', placeId: 'bailed', startsAt: at('10:00'), status: 'skipped' }),
      ];
      render(wrap(<MapView />));
      expect(rowFor('been')?.textContent).toContain(t.event.didThis);
      expect(rowFor('bailed')?.textContent).toContain(t.event.skipped);
      // The skipped row must NOT claim a visit — the bug this fixes.
      expect(rowFor('bailed')?.textContent).not.toContain(t.event.didThis);
      expect(rowFor('bailed')?.className).toContain('skipped');
    });

    it('a passed-but-unsettled place gets no outcome tag at all', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('unsettled', true)];
      tripEvents = [event({ id: 'e1', placeId: 'unsettled', startsAt: at('09:00') })];
      render(wrap(<MapView />));
      const row = rowFor('unsettled');
      expect(row?.textContent).not.toContain(t.event.didThis);
      expect(row?.textContent).not.toContain(t.event.skipped);
    });

    it('marking a later stop done sinks it behind you, before its time', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('later', true), place('soon', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'later', startsAt: at('20:00'), status: 'done' }),
        event({ id: 'e2', placeId: 'soon', startsAt: at('18:00') }),
      ];
      render(wrap(<MapView />));
      const names = [...document.querySelectorAll('.place .map-name')].map((n) => n.textContent);
      expect(names).toEqual(['soon', 'later']);
      expect(screen.getByText(t.map.behindHeader)).toBeTruthy();
      expect(screen.getByText(t.map.aheadHeader)).toBeTruthy();
    });

    it('outcomes read the same in all-days scope', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('been', true)];
      tripEvents = [event({ id: 'e1', placeId: 'been', startsAt: at('09:00'), status: 'done' })];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(rowFor('been')?.textContent).toContain(t.event.didThis);
    });

    it('an all-ahead list carries no headers at all', () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T00:00:00Z`));
      tripPlaces = [place('soon', true)];
      tripEvents = [event({ id: 'e1', placeId: 'soon', startsAt: at('18:00') })];
      render(wrap(<MapView />));
      expect(screen.queryByText(t.map.aheadHeader)).toBeNull();
      expect(screen.queryByText(t.map.behindHeader)).toBeNull();
    });
  });

  // Phase 5 (ADR-0115): the same control, two halves. Only the wiring is asserted
  // here — the research surface's own behaviour lives in PlaceResearch.test.tsx.
  describe('Plan-mode research on the search control (ADR-0115 §1)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const openSearch = (label: string) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
    };
    const armPresent = () => screen.queryByRole('button', { name: t.map.research.armAria }) != null;

    it('Plan mode: typing offers the trip’s own places AND a Google search', () => {
      setSimulatedNow(NOON);
      currentMode = 'plan';
      seed();
      render(wrap(<MapView />));
      openSearch(t.map.search.planButton);
      fireEvent.change(screen.getByPlaceholderText(t.map.search.planPlaceholder), {
        target: { value: 'food' },
      });
      expect(screen.getByText(t.map.research.tripGroup)).toBeTruthy();
      expect(armPresent()).toBe(true);
    });

    it('Plan mode: research is offered in both day scopes, not just all-days', () => {
      setSimulatedNow(NOON);
      currentMode = 'plan';
      seed();
      render(wrap(<MapView />));
      // Plan defaults to all-days; narrow to the active day and check again, since
      // the two scopes are separate render paths on this screen.
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      openSearch(t.map.search.planButton);
      fireEvent.change(screen.getByPlaceholderText(t.map.search.planPlaceholder), {
        target: { value: 'food' },
      });
      expect(armPresent()).toBe(true);
    });

    it('Trip mode: the same control stays a pure filter, no paid affordance', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch(t.map.search.button);
      fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
        target: { value: 'food' },
      });
      // Twice: the list behind the overlay, and the overlay's own filtered copy.
      expect(screen.getAllByText('food')).toHaveLength(2);
      expect(armPresent()).toBe(false);
    });
  });
});
