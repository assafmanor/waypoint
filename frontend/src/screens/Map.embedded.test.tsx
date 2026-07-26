// @vitest-environment jsdom
//
// The embedded map's SHELL (ADR-0121 §13): snap heights, the רשימה/מפה toggle, row ↔
// pin selection, the full→half lift, the ghost tier's surfaced row, the way in to
// each reference, and the `מה נשאר` filter with ADR-0119's count coupling on three
// axes. The pane is stubbed — the rendered canvas is a human step (§13) — so what is
// asserted here is what the SCREEN decides, not what Google draws.
//
// It is a separate file from `Map.test.tsx` on purpose: that suite runs with no build
// config, which is the graceful-absence path (§2) and must keep being tested as the
// list-only tab it is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const NEXT_DAY = '2026-07-21';
const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);

const place = (id: string, coords = true, at?: { lat: number; lng: number }): Place => ({
  id,
  tripId: 't1',
  name: id,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u1',
  ...(coords ? (at ?? { lat: 35.6, lng: 139.6 }) : {}),
});

const event = (p: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
  tripId: 't1',
  date: ACTIVE_DATE,
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
vi.mock('../state/verbs', () => ({ useVerbs: () => ({ addMaybe: vi.fn() }) }));
vi.mock('../lib/outbox', () => ({ useIsOffline: () => isOffline }));
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition: vi.fn() },
  configurable: true,
});

// The build config is PRESENT here, which is what puts the split on screen. It is a
// build var in real life, so mocking the reader is the honest seam.
vi.mock('../lib/map-config', () => ({
  mapsConfig: () => ({ apiKey: 'k', mapId: 'waypoint-day' }),
  mapPaneAvailable: ({ offline }: { offline: boolean }) => !offline,
}));

/** The pane, stubbed: it reports what it was told to draw and lets a test tap a pin.
 *  Everything a rendered canvas would do is out of reach of the suite (§13). */
const paneProps: { current: Record<string, unknown> } = { current: {} };
vi.mock('../ui/domain/MapPane', () => ({
  MapPane: (props: Record<string, unknown>) => {
    paneProps.current = props;
    const pins = props.pins as { placeId: string; tier: string; order?: number }[];
    return (
      <div data-pane>
        {pins.map((pin) => (
          <button
            key={pin.placeId}
            data-pin={pin.placeId}
            data-tier={pin.tier}
            data-order={pin.order ?? ''}
            onClick={() => (props.onSelectPin as (id: string) => void)(pin.placeId)}
          >
            {pin.placeId}
          </button>
        ))}
      </div>
    );
  },
}));

import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { MapScopeProvider } from '../state/map-scope-state';
import { setSimulatedNow } from '../lib/useClock';
import { MapView } from './Map';
import { MAP_SHEET_VIEW } from '../constants';
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

const screenEl = () => document.querySelector('.map-screen') as HTMLElement;
const sheet = () => document.querySelector('.wp-snapsheet') as HTMLElement;
const pin = (id: string) => document.querySelector(`[data-pin="${id}"]`) as HTMLElement | null;
const pinIds = () =>
  [...document.querySelectorAll('[data-pin]')].map((p) => p.getAttribute('data-pin'));
const row = (name: string) =>
  [...document.querySelectorAll('.place')].find(
    (r) => r.querySelector('.map-name')?.textContent === name,
  ) as HTMLElement | undefined;
const listButton = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
const toggle = (label: string) => screen.getByRole('button', { name: label });

describe('the embedded map’s shell (ADR-0121)', () => {
  beforeEach(() => setSimulatedNow(NOON));
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
    tripEvents = [];
    tripMaybes = [];
    tripPlaces = [];
    tripBookings = [];
    currentMode = 'trip';
    isOffline = false;
    paneProps.current = {};
  });

  const seed = () => {
    tripPlaces = [place('museum'), place('lunch'), place('lite', false), place('tomorrow')];
    tripEvents = [
      event({
        id: 'e1',
        placeId: 'museum',
        category: 'sightseeing',
        startsAt: `${ACTIVE_DATE}T09:00:00Z`,
      }),
      event({ id: 'e2', placeId: 'lunch', category: 'food', startsAt: `${ACTIVE_DATE}T20:00:00Z` }),
      event({ id: 'e3', placeId: 'lite', category: 'food', startsAt: `${ACTIVE_DATE}T21:00:00Z` }),
      event({ id: 'e4', placeId: 'tomorrow', category: 'food', date: NEXT_DAY }),
    ];
  };

  it('renders the split: a fixed header, a live pane, and a sheet at half', () => {
    seed();
    render(wrap(<MapView />));
    expect(screenEl().className).toContain('is-split');
    expect(document.querySelector('[data-pane]')).toBeTruthy();
    expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
    // The pane is sized to the area the SNAPPED sheet leaves visible (§5), so Google's
    // attribution stays visible and a drag costs no relayout.
    expect(screenEl().style.getPropertyValue('--sheet-h')).toBe('56%');
    expect(sheet().dataset.view).toBe('half');
  });

  it('only coord-bearing places pin; a coordless one stays a list row', () => {
    seed();
    render(wrap(<MapView />));
    expect(pinIds()).toContain('museum');
    expect(pin('lite')).toBeNull();
    expect(row('lite')).toBeTruthy();
  });

  // One state, two controls, so they cannot disagree. At half neither extreme is
  // active, which is the honest rendering.
  it('the toggle is a shortcut to the two extremes of the sheet’s own axis', () => {
    seed();
    render(wrap(<MapView />));
    expect(toggle(t.map.view.list).getAttribute('aria-pressed')).toBe('false');
    expect(toggle(t.map.view.map).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle(t.map.view.list));
    expect(screenEl().dataset.view).toBe('full');
    expect(toggle(t.map.view.list).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle(t.map.view.map));
    expect(screenEl().dataset.view).toBe('peek');
    expect(toggle(t.map.view.list).getAttribute('aria-pressed')).toBe('false');
  });

  // Back leaves the tab at any height: the sheet is view state, not a back layer
  // (ADR-0103). Nothing here registers an overlay.
  it('the sheet is not an overlay — no Modal, no backdrop, no back layer', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(toggle(t.map.view.list));
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  describe('selection: row ↔ pin are one, and it never leaves the app (§8)', () => {
    it('a row tap selects the row and its pin', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).toContain('selected');
      expect(row('museum')!.getAttribute('aria-pressed')).toBe('true');
      const pins = paneProps.current.pins as { placeId: string; selected?: boolean }[];
      expect(pins.find((p) => p.placeId === 'museum')?.selected).toBe(true);
      expect(pins.find((p) => p.placeId === 'lunch')?.selected).toBeFalsy();
    });

    it('the row tap goes nowhere near Google — the row keeps ניווט as its one link', () => {
      seed();
      render(wrap(<MapView />));
      // The Phase-2 interim opened Google's place view from the row itself; it is
      // retired, not relocated. `ניווט` (directions) is the surviving Google action.
      expect(row('museum')!.getAttribute('href')).toBeNull();
      const nav = row('museum')!.querySelector('a.map-navbtn') as HTMLAnchorElement;
      expect(nav.href).toContain('/maps/dir/?api=1&destination=');
    });

    it('a pin tap selects its row', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('lunch')!);
      expect(row('lunch')!.className).toContain('selected');
    });

    // Focusing a map you cannot see is useless — this is the interaction the
    // three-height axis exists for.
    it('a row tap at FULL height drops the sheet to half', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      expect(screenEl().dataset.view).toBe('full');
      fireEvent.click(row('museum')!);
      expect(screenEl().dataset.view).toBe('half');
    });

    // A coordless place is still REFERENCED, so it must still select: the verb is
    // SELECT, and focusing is only what selection does when there are coordinates.
    it('a coordless row selects (there is simply no camera to move), and does not lift the sheet', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      fireEvent.click(row('lite')!);
      expect(row('lite')!.className).toContain('selected');
      // Nothing to see on the map, so the list is not shrunk to reveal it.
      expect(screenEl().dataset.view).toBe('full');
    });

    it('only one row is selected at a time', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      fireEvent.click(row('lunch')!);
      expect(document.querySelectorAll('.place.selected')).toHaveLength(1);
      expect(row('lunch')!.className).toContain('selected');
    });
  });

  describe('the way in to the entity, revealed by selection (§8)', () => {
    it('appears only on the selected row, labelled in the reference’s own words', () => {
      tripPlaces = [place('museum')];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'museum',
          title: 'מוזיאון הארכיאולוגי',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(document.querySelector('.map-refs')).toBeNull();
      fireEvent.click(row('museum')!);
      const refs = row('museum')!.querySelector('.map-refs')!;
      expect(refs.querySelectorAll('.map-ref')).toHaveLength(1);
      // It names its destination rather than saying "details" — that is what earns
      // it a full-width row.
      expect(refs.textContent).toContain(t.map.refs.event);
      expect(refs.textContent).toContain('מוזיאון הארכיאולוגי');
    });

    it('a booking-linked event reads as a booking, in the per-end transition wording', () => {
      tripPlaces = [place('origin'), place('dest')];
      tripBookings = [
        {
          id: 'bk',
          tripId: 't1',
          type: 'flight',
          title: 'flight',
          source: 'manual',
          fromPlaceId: 'origin',
          toPlaceId: 'dest',
          createdAt: '',
          updatedAt: '',
          updatedBy: 'u1',
        } as Booking,
      ];
      tripEvents = [
        event({
          id: 'f',
          bookingId: 'bk',
          icon: '✈️',
          category: 'transport',
          startsAt: `${ACTIVE_DATE}T00:15:00Z`,
          endsAt: `${ACTIVE_DATE}T04:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(row('dest')!);
      const refs = row('dest')!.querySelector('.map-refs')!;
      expect(refs.textContent).toContain(t.map.refs.booking);
      // The destination end says LANDING, not take-off.
      expect(refs.textContent).toContain(t.glance.transition.flightArrival);
    });

    it('one entry per in-scope reference — union semantics are normal here', () => {
      tripPlaces = [place('station')];
      tripEvents = [
        event({ id: 'a', placeId: 'station', startsAt: `${ACTIVE_DATE}T08:00:00Z` }),
        event({ id: 'b', placeId: 'station', startsAt: `${ACTIVE_DATE}T19:00:00Z` }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(row('station')!);
      expect(row('station')!.querySelectorAll('.map-ref')).toHaveLength(2);
    });

    it('a coordless row — the weakest place data there is — still gets its way in', () => {
      tripPlaces = [place('lite', false)];
      tripEvents = [event({ id: 'e', placeId: 'lite', title: 'ארוחה אצל יוקי' })];
      render(wrap(<MapView />));
      fireEvent.click(row('lite')!);
      expect(row('lite')!.querySelector('.map-refs')?.textContent).toContain('ארוחה אצל יוקי');
    });
  });

  describe('the ghost tier: in view, but not in this day (§6)', () => {
    it('pins an out-of-day place in day scope, unnumbered, and drops it in all-days', () => {
      seed();
      render(wrap(<MapView />));
      expect(pin('tomorrow')?.dataset.tier).toBe('ghost');
      expect(pin('tomorrow')?.dataset.order).toBe('');
      // Its row is NOT in the scoped sheet — that asymmetry is what the tap is for.
      // (Out-of-scope rows stay mounted and collapsed, ADR-0120, so "not in the
      // list" is its hidden state, never absence from the DOM.)
      expect(row('tomorrow')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(true);

      // All-days scope excludes nothing, so there is nothing for a ghost to be.
      fireEvent.click(listButton(t.map.allDays));
      expect(pin('tomorrow')?.dataset.tier).not.toBe('ghost');
      expect(row('tomorrow')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(false);
    });

    it('tapping a ghost surfaces that one row, named with the day it belongs to', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('tomorrow')!);
      expect(screen.getByText(t.map.notThisDay)).toBeTruthy();
      const surfaced = row('tomorrow')!;
      // Reusing the row rather than inventing an info window, and it says WHICH day
      // via `relativeDayLabel` (ADR-0085).
      expect(surfaced.textContent).toContain('מחר');
      expect(surfaced.className).toContain('selected');
    });

    it('tapping an in-scope pin clears a surfaced ghost row', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('tomorrow')!);
      expect(screen.queryByText(t.map.notThisDay)).toBeTruthy();
      fireEvent.click(pin('museum')!);
      expect(screen.queryByText(t.map.notThisDay)).toBeNull();
    });
  });

  describe('`מה נשאר`: one toggle, and ADR-0119 count coupling on three axes (§9)', () => {
    const leftChip = () => listButton(t.map.filter.left);
    const count = (el: HTMLElement) => el.querySelector('.cnt')?.textContent;
    const pillCount = (label: string) =>
      screen.getByRole('radio', { name: new RegExp(label) }).querySelector('.choice-pill-count')
        ?.textContent;

    const seedSettled = () => {
      // Two settled (one visited, one skipped), two still open, plus a coordless row
      // that survives — the exact shape that caught the mislabelled count in the
      // mockup: 5 rows survive, not the 4 that have pins.
      tripPlaces = [
        place('been'),
        place('bailed'),
        place('lunch'),
        place('dinner'),
        place('lite', false),
      ];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'been',
          category: 'sightseeing',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
        event({
          id: 'e2',
          placeId: 'bailed',
          category: 'sightseeing',
          startsAt: `${ACTIVE_DATE}T10:00:00Z`,
          status: EVENT_STATUS.SKIPPED,
        }),
        event({
          id: 'e3',
          placeId: 'lunch',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T13:00:00Z`,
        }),
        event({
          id: 'e4',
          placeId: 'dinner',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T20:00:00Z`,
        }),
        event({
          id: 'e5',
          placeId: 'lite',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T21:00:00Z`,
        }),
      ];
    };

    it('the chip appears only when the trip has something settled', () => {
      seed();
      const view = render(wrap(<MapView />));
      expect(screen.queryByRole('button', { name: new RegExp(t.map.filter.left) })).toBeNull();
      view.unmount();
      seedSettled();
      render(wrap(<MapView />));
      expect(leftChip()).toBeTruthy();
    });

    // A count that overstates is the exact defect ADR-0119 was written to fix.
    it('its count is the surviving LIST ROWS, coordless row included', () => {
      seedSettled();
      render(wrap(<MapView />));
      expect(count(leftChip())).toBe('3'); // lunch, dinner, lite
    });

    it('hides everything settled — a skip as well as a visit — in the list AND on the canvas', () => {
      seedSettled();
      render(wrap(<MapView />));
      fireEvent.click(leftChip());
      const hidden = (name: string) =>
        row(name)?.closest('.wp-reveal')?.classList.contains('hidden');
      expect(hidden('been')).toBe(true);
      expect(hidden('bailed')).toBe(true);
      expect(hidden('lunch')).toBe(false);
      expect(pinIds()).toEqual(['lunch', 'dinner']);
    });

    it('while it is on, the type chips and `אולי` count only unsettled places', () => {
      seedSettled();
      tripMaybes = [
        maybe({ id: 'm', placeId: 'lunch', category: 'food', targetDate: ACTIVE_DATE }),
      ];
      render(wrap(<MapView />));
      expect(pillCount(t.map.filter.all)).toBe('5');
      expect(pillCount(t.iconPicker.categories.sightseeing)).toBe('2');

      fireEvent.click(leftChip());
      expect(pillCount(t.map.filter.all)).toBe('3');
      // Both settled places were sightseeing, so that chip drops out entirely.
      expect(
        screen.queryByRole('radio', { name: new RegExp(t.iconPicker.categories.sightseeing) }),
      ).toBeNull();
    });

    it('its own count follows the picked type, the other way round', () => {
      seedSettled();
      render(wrap(<MapView />));
      fireEvent.click(
        screen.getByRole('radio', { name: new RegExp(t.iconPicker.categories.food) }),
      );
      // Three food rows, all unsettled.
      expect(count(leftChip())).toBe('3');
      fireEvent.click(
        screen.getByRole('radio', { name: new RegExp(t.iconPicker.categories.sightseeing) }),
      );
      // Both sightseeing places are settled, so nothing is left of that type.
      expect(count(leftChip())).toBe('0');
    });

    it('it applies to ghosts too: a place visited on Tuesday must not sit on the canvas', () => {
      seedSettled();
      tripPlaces = [...tripPlaces, place('other-day')];
      tripEvents = [
        ...tripEvents,
        event({
          id: 'g',
          placeId: 'other-day',
          category: 'food',
          date: NEXT_DAY,
          status: EVENT_STATUS.DONE,
        }),
      ];
      render(wrap(<MapView />));
      expect(pin('other-day')?.dataset.tier).toBe('ghost');
      fireEvent.click(leftChip());
      expect(pin('other-day')).toBeNull();
    });
  });

  describe('the numbers, and what may not renumber them (§6)', () => {
    const numbers = () =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-pin]')].map((p) => [
          p.getAttribute('data-pin'),
          p.getAttribute('data-order'),
        ]),
      );

    const seedOrdered = () => {
      tripPlaces = [
        place('first', true, { lat: 35.6, lng: 139.6 }),
        place('second', true, { lat: 35.7, lng: 139.7 }),
        place('third', true, { lat: 35.8, lng: 139.8 }),
      ];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'first',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        }),
        event({
          id: 'e2',
          placeId: 'second',
          category: 'sightseeing',
          startsAt: `${ACTIVE_DATE}T13:00:00Z`,
        }),
        event({
          id: 'e3',
          placeId: 'third',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T20:00:00Z`,
        }),
      ];
    };

    it('numbers the day in sequence', () => {
      seedOrdered();
      render(wrap(<MapView />));
      expect(numbers()).toEqual({ first: '1', second: '2', third: '3' });
    });

    // Gaps are correct AND informative: `1, 3` says something is filtered out.
    it('a type chip leaves gaps rather than renumbering', () => {
      seedOrdered();
      render(wrap(<MapView />));
      fireEvent.click(
        screen.getByRole('radio', { name: new RegExp(t.iconPicker.categories.food) }),
      );
      expect(numbers()).toEqual({ first: '1', third: '3' });
    });
  });

  describe('the day connector and its free deep-link (§10)', () => {
    const seedDay = () => {
      tripPlaces = [
        place('a', true, { lat: 35.6, lng: 139.6 }),
        place('b', true, { lat: 35.7, lng: 139.7 }),
      ];
      tripEvents = [
        event({ id: 'e1', placeId: 'a', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
        event({ id: 'e2', placeId: 'b', startsAt: `${ACTIVE_DATE}T13:00:00Z` }),
      ];
    };

    it('Trip mode draws no connector: you are living the day, not auditing its shape', () => {
      seedDay();
      render(wrap(<MapView />));
      expect(paneProps.current.connector).toBeUndefined();
      expect(screen.queryByRole('link', { name: new RegExp(t.map.dayRoute) })).toBeNull();
    });

    it('Plan mode’s day scope draws it, in day order, with the whole-day link beside it', () => {
      seedDay();
      currentMode = 'plan';
      render(wrap(<MapView />));
      // Plan defaults to all-days, where connecting every day would be spaghetti.
      expect(paneProps.current.connector).toBeUndefined();

      fireEvent.click(listButton(t.map.allDays));
      expect(paneProps.current.connector).toEqual([
        { lat: 35.6, lng: 139.6 },
        { lat: 35.7, lng: 139.7 },
      ]);
      const link = screen.getByRole('link', { name: new RegExp(t.map.dayRoute) });
      expect(link.getAttribute('href')).toContain('/maps/dir/?api=1&origin=35.6%2C139.6');
    });
  });

  describe('the camera answers controls, not the clock (§7)', () => {
    it('a scope, type or facet change moves the signal; a clock tick does not', () => {
      seed();
      const view = render(wrap(<MapView />));
      const first = paneProps.current.setSignal;

      setSimulatedNow(NOON + 60_000);
      view.rerender(wrap(<MapView />));
      expect(paneProps.current.setSignal).toBe(first);

      fireEvent.click(listButton(t.map.allDays));
      expect(paneProps.current.setSignal).not.toBe(first);
    });
  });

  it('offline the map is ABSENT: no pane, no toggle, no map instance (§11)', () => {
    seed();
    isOffline = true;
    render(wrap(<MapView />));
    expect(document.querySelector('[data-pane]')).toBeNull();
    expect(screen.queryByRole('button', { name: t.map.view.map })).toBeNull();
    expect(screenEl().className).not.toContain('is-split');
    // The tab is the list it has always been, under the existing "last saved" banner.
    expect(row('museum')).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.map.near.chip) })).toBeNull();
  });
});
