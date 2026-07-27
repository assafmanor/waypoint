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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

// jsdom has no layout engine, so it doesn't implement scrollIntoView — the sheet's
// "bring the selected row into view" is a real call worth asserting the shape of.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;
/** The screen defers the scroll one frame, so the sheet's new height is committed
 *  before the row is centred against it. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

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

// The device's location, driven per test. `permissionState` is what the Permissions
// API reports BEFORE anything is asked — which is what decides whether opening the
// tab may fetch a fix silently or has to show the reason-first card first
// (ADR-0109 session-134). `null` stands for "no Permissions API at all" (Safari).
let permissionState: PermissionState | null = 'prompt';
let geoFix: { lat: number; lng: number } | null = null;
/** Makes a request FAIL (1 = PERMISSION_DENIED), which is the only way to reach the
 *  refusal notice — the same seam `Map.test.tsx` uses. */
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
Object.defineProperty(navigator, 'permissions', {
  get: () =>
    permissionState === null
      ? undefined
      : { query: () => Promise.resolve({ state: permissionState, addEventListener() {} }) },
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
        {/* The canvas background: tapping it clears the selection (ADR-0122 §7). The real
            one is the map div's own click, guarded against pin taps inside `MapPane`. */}
        <button data-canvas onClick={() => (props.onCanvasTap as () => void)()}>
          canvas
        </button>
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
import { MAP_CONTROLS_H, MAP_SHEET_VIEW } from '../constants';
import { PIN_TIER } from '../lib/map-pins';
import { iconForCategory } from '@waypoint/shared';
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
const placeCard = () => document.querySelector('.map-placecard') as HTMLElement | null;
const tapCanvas = () => fireEvent.click(document.querySelector('[data-canvas]')!);

/** The facets live behind ONE `סינון` control that opens them in place (ADR-0122 §2), so
 *  anything touching a facet opens the strip first, and anything reaching for the scope
 *  chip closes it. Both idempotent — the control that is not rendered is skipped. The
 *  `^` matters: with a facet on, the control's name is `סינון: אוכל · אולי`. */
const openFacets = () => {
  const control = screen.queryByRole('button', { name: new RegExp(`^${t.map.filter.open}`) });
  if (control) fireEvent.click(control);
};

describe('the embedded map’s shell (ADR-0121)', () => {
  beforeEach(() => {
    setSimulatedNow(NOON);
    // Most tests here are about the map, not about location: a standing refusal is
    // the branch that offers nothing, so the on-open offer stays out of their way.
    permissionState = 'denied';
  });
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
    permissionState = 'prompt';
    geoFix = null;
    geoErrorCode = null;
    getCurrentPosition.mockClear();
    scrollIntoView.mockClear();
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

  it('renders the split: a live pane, a floating controls row, and a sheet at half', () => {
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

  // ADR-0122 §1: the two fixed rows above the split were 370 of 844 phone pixels spent
  // before either half got one. What the suite can hold of that is the STRUCTURE — the
  // row is inside the split rather than above it, and it is a sibling of the pane rather
  // than a wrapper around it, because wrapping remounts the map and a remount is billed
  // (ADR-0121 §4). Whether it reads as light over real tiles is the device pass's.
  describe('the controls leave the layout (ADR-0122 §1)', () => {
    it('is one row inside the split, over the canvas, beside the pane', () => {
      seed();
      render(wrap(<MapView />));
      const row = document.querySelector('.map-controls')!;
      expect(row.parentElement!.className).toBe('map-split');
      // Not a wrapper around the pane, and not inside it.
      expect(row.querySelector('[data-pane]')).toBeNull();
      expect(document.querySelector('[data-pane] .map-controls')).toBeNull();
      // The shipped pair is gone, not relocated.
      expect(document.querySelector('.map-filter-row')).toBeNull();
      expect(document.querySelector('.map-sortstrip')).toBeNull();
      // …and so is the scope hint: the chip's own state says which scope is on (§2).
      expect(document.querySelector('.map-scopehint')).toBeNull();
    });

    it('writes the row’s height from the same constant the camera’s inset derives from', () => {
      seed();
      render(wrap(<MapView />));
      // One source of truth, so the layout and the band the camera keeps clear of pins
      // cannot drift apart — and never a runtime measurement on a screen that re-renders
      // every second.
      expect(screenEl().style.getPropertyValue('--map-controls-h')).toBe(`${MAP_CONTROLS_H}px`);
    });

    it('the full stop stops BELOW the row, so the list you are reading can still be filtered', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      expect(screenEl().style.getPropertyValue('--sheet-h')).toBe(
        `calc(100% - ${MAP_CONTROLS_H}px)`,
      );
      expect(document.querySelector('.map-controls')).toBeTruthy();
    });

    it('the map stop is the sheet’s own top row and nothing of the list', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      expect(screenEl().style.getPropertyValue('--sheet-h')).toBe('52px');
      // The strip's height is reserved from the same constant, so a taller top can never
      // clip its own contents.
      expect(screenEl().style.getPropertyValue('--snap-top-h')).toBe('52px');
    });
  });

  // Three controls at rest, not seven (ADR-0122 §2). Asserted in BOTH day scopes, since
  // the day-scoped and all-days paths are different renders.
  describe('the facets open in place, behind one control (ADR-0122 §2)', () => {
    const rest = () =>
      [...document.querySelectorAll('.map-controls > *')].map((el) => el.className);

    it('at rest the row carries the scope, one filter control, and search', () => {
      seed();
      render(wrap(<MapView />));
      expect(rest()).toEqual(['map-scopechip', 'map-facets', 'map-search-btn']);
      expect(screen.getByRole('button', { name: t.map.filter.open })).toBeTruthy();
      // The facets are not on screen until asked for.
      expect(screen.queryByRole('radio', { name: new RegExp(t.map.filter.all) })).toBeNull();
    });

    it('one tap replaces the row with the facet strip and a pinned close', () => {
      seed();
      render(wrap(<MapView />));
      openFacets();
      expect(document.querySelector('.map-facetstrip')).toBeTruthy();
      expect(screen.getByRole('radio', { name: new RegExp(t.map.filter.all) })).toBeTruthy();
      // The resting controls step aside — the strip covers the row in place.
      expect(screen.queryByRole('button', { name: t.map.filter.open })).toBeNull();
      expect(screen.queryByRole('button', { name: new RegExp(t.map.allDays) })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: t.map.filter.close }));
      expect(document.querySelector('.map-facetstrip')).toBeNull();
      expect(screen.getByRole('button', { name: new RegExp(t.map.allDays) })).toBeTruthy();
    });

    // The category chips are glyph + count, with the WORD as the accessible name: the
    // glyph is the category's whole vocabulary here (ADR-0038), and the row badge and the
    // pin already carry the same one. `הכל` keeps its word — it has no glyph.
    it('the category chips are glyph + count, still named by their word', () => {
      seed();
      render(wrap(<MapView />));
      openFacets();
      const food = screen.getByRole('radio', { name: t.iconPicker.categories.food });
      expect(food.textContent).not.toContain(t.iconPicker.categories.food);
      expect(food.querySelector('.choice-pill-count')?.textContent).toBe('2');
      const all = screen.getByRole('radio', { name: new RegExp(t.map.filter.all) });
      expect(all.textContent).toContain(t.map.filter.all);
    });

    // A filter that hides the fact that it is filtering is the defect ADR-0119 exists to
    // prevent — and a fourth count would be a fourth thing to keep coupled.
    it('the collapsed control states WHICH facets are on, in words for a reader, and no count', () => {
      seed();
      tripMaybes = [
        maybe({ id: 'm', placeId: 'lunch', category: 'food', targetDate: ACTIVE_DATE }),
      ];
      render(wrap(<MapView />));
      const control = () => document.querySelector('.map-facets') as HTMLElement;
      expect(control().textContent).toBe(t.map.filter.open);
      expect(control().className).not.toContain('on');

      openFacets();
      fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.food }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.filter.maybes) }));
      fireEvent.click(screen.getByRole('button', { name: t.map.filter.close }));

      // The glyph is what it draws; the word is what it is called.
      expect(control().textContent).toContain(iconForCategory('food'));
      expect(control().textContent).toContain(t.map.filter.maybes);
      expect(control().getAttribute('aria-label')).toBe(
        t.map.filter.activeAria(`${t.iconPicker.categories.food} · ${t.map.filter.maybes}`),
      );
      expect(control().className).toContain('on');
      expect(control().querySelector('.cnt')).toBeNull();
    });

    it('says the same thing in all-days scope', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      openFacets();
      fireEvent.click(screen.getByRole('radio', { name: t.iconPicker.categories.food }));
      fireEvent.click(screen.getByRole('button', { name: t.map.filter.close }));
      const control = document.querySelector('.map-facets') as HTMLElement;
      expect(control.getAttribute('aria-label')).toBe(
        t.map.filter.activeAria(t.iconPicker.categories.food),
      );
    });
  });

  // Scope belongs to the tab, filters belong to the split, sort belongs to the list
  // (ADR-0122 §2).
  describe('the sort control moves to the sheet’s own top row', () => {
    const nearChip = () => document.querySelector('.map-nearchip') as HTMLElement | null;

    it('sits in the sheet’s top region, not in the controls row', () => {
      seed();
      render(wrap(<MapView />));
      expect(nearChip()!.closest('.wp-snapsheet-headrow')).toBeTruthy();
      expect(document.querySelector('.map-controls .map-nearchip')).toBeNull();
    });

    // Stop-driven hiding ANIMATES, so the chip stays mounted and CSS hides it;
    // capability-driven absence does not, so offline it is unmounted (§5). Two different
    // facts, two different mechanisms — and jsdom applies no CSS, so what the suite owns
    // is which mechanism each one uses.
    it('stays mounted at the map extreme, where CSS hides it', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
      expect(nearChip()).toBeTruthy();
    });

    it('is unmounted offline, because there it cannot exist at all', () => {
      seed();
      isOffline = true;
      render(wrap(<MapView />));
      expect(nearChip()).toBeNull();
    });
  });

  // ADR-0122 §6: it asks a question about the MAP and used to render inside the list's
  // scroll region, which at the map extreme is not on screen at all.
  describe('the pre-prompt is canvas furniture; the refusal notice is not', () => {
    it('renders over the canvas, as a sibling of the pane — not in the list', async () => {
      seed();
      permissionState = 'prompt';
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(screen.queryByText(t.map.near.prompt.body)).toBeTruthy());
      const prompt = document.querySelector('.map-geoprompt')!;
      expect(prompt.parentElement!.className).toBe('map-split');
      expect(document.querySelector('.map-sheet-scroll .map-geoprompt')).toBeNull();
      // It costs the split no height, so the sheet's own stop is untouched by it.
      expect(screenEl().style.getPropertyValue('--sheet-h')).toBe('56%');
    });

    // The identical rule and reason as a row tap at full: a question about a map you
    // cannot see lowers the sheet enough to see it.
    it('raising it at full drops the sheet to half', () => {
      seed();
      permissionState = 'denied';
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      expect(screenEl().dataset.view).toBe('full');
      fireEvent.click(listButton(t.map.near.chip));
      expect(screen.queryByText(t.map.near.prompt.body)).toBeTruthy();
      expect(screenEl().dataset.view).toBe('half');
    });

    it('the refusal notice stays in the list, because it explains the LIST’s order', async () => {
      seed();
      permissionState = 'prompt';
      geoErrorCode = 1;
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(screen.queryByText(t.map.near.prompt.body)).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      // One card moves and one does not, and the split is exactly what each is about.
      await vi.waitFor(() =>
        expect(document.querySelector('.map-sheet-scroll .fb-banner')).toBeTruthy(),
      );
      expect(document.querySelector('.map-split > .fb-banner')).toBeNull();
    });
  });

  it('only coord-bearing places pin; a coordless one stays a list row', () => {
    seed();
    render(wrap(<MapView />));
    expect(pinIds()).toContain('museum');
    expect(pin('lite')).toBeNull();
    expect(row('lite')).toBeTruthy();
  });

  // The canvas half of the `עכשיו` cue. The pulse itself is CSS and a human pass;
  // what the suite owns is which pin is told to carry it — and that the next-stop
  // cue is still on a different pin, since motion-vs-stillness is the only thing
  // telling the two amber cues apart.
  it('the in-progress pin is marked now, and the next stop is a different pin', () => {
    setSimulatedNow(Date.parse(`${ACTIVE_DATE}T13:54:00Z`));
    tripPlaces = [place('lunch'), place('museum', true, { lat: 35.7, lng: 139.7 })];
    tripEvents = [
      event({
        id: 'l',
        placeId: 'lunch',
        category: 'food',
        startsAt: `${ACTIVE_DATE}T13:00:00Z`,
        endsAt: `${ACTIVE_DATE}T14:00:00Z`,
      }),
      event({
        id: 'm',
        placeId: 'museum',
        category: 'sightseeing',
        startsAt: `${ACTIVE_DATE}T16:00:00Z`,
      }),
    ];
    render(wrap(<MapView />));
    const pins = paneProps.current.pins as {
      placeId: string;
      nowStop?: boolean;
      nextStop?: boolean;
    }[];
    const byId = (id: string) => pins.find((p) => p.placeId === id)!;
    expect(byId('lunch').nowStop).toBe(true);
    expect(byId('lunch').nextStop).toBeFalsy();
    expect(byId('museum').nextStop).toBe(true);
    expect(byId('museum').nowStop).toBeFalsy();
  });

  // A mid-stay night is pinned at full strength now (ADR-0109's 2026-07-27
  // amendment) — the paint is CSS and a human pass, but the tier it paints from and
  // the number it must not have are both ours.
  it('a stay’s middle night pins as ambient, and carries no number', () => {
    tripPlaces = [place('hotel'), place('lunch', true, { lat: 35.7, lng: 139.7 })];
    tripEvents = [
      event({
        id: 'stay',
        placeId: 'hotel',
        category: 'lodging',
        date: '2026-07-19',
        endDate: NEXT_DAY,
        startsAt: '2026-07-19T15:00:00Z',
        endsAt: `${NEXT_DAY}T10:00:00Z`,
      }),
      event({ id: 'l', placeId: 'lunch', category: 'food', startsAt: `${ACTIVE_DATE}T13:00:00Z` }),
    ];
    render(wrap(<MapView />));
    // 07-20 is the strictly-middle night of a 19→21 stay.
    expect(pin('hotel')!.getAttribute('data-tier')).toBe(PIN_TIER.ambient);
    expect(pin('hotel')!.getAttribute('data-order')).toBe('');
    // And it does not take a position from the day's real stops.
    expect(pin('lunch')!.getAttribute('data-order')).toBe('1');
  });

  // The whole reason the row grew a number (§6): with the split on screen, the two
  // halves must be describing the same list, and a number on only one of them reads
  // as a second, unrelated ordering.
  it('the row and its pin carry the SAME number, in both day scopes', () => {
    seed();
    render(wrap(<MapView />));
    const pinOrder = (id: string) => pin(id)?.getAttribute('data-order');
    const rowOrder = (name: string) =>
      row(name)?.querySelector('.map-badge')?.getAttribute('data-order');
    expect(rowOrder('museum')).toBe('1');
    expect(pinOrder('museum')).toBe('1');
    expect(rowOrder('lunch')).toBe('2');
    expect(pinOrder('lunch')).toBe('2');
    // A coordless row has no pin to agree with, and it still holds its place in the
    // sequence — which is what explains the gap the canvas shows where it would be.
    expect(rowOrder('lite')).toBe('3');

    fireEvent.click(listButton(t.map.allDays));
    expect(rowOrder('museum')).toBe(pinOrder('museum'));
    expect(rowOrder('tomorrow')).toBe(pinOrder('tomorrow'));
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
    expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
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
    // three-height axis exists for. A ROW tap normalises the sheet to `half` from either
    // extreme (ADR-0122 §7): from `full` because the map it focuses is invisible there,
    // and from the map extreme because a row you tapped belongs in its list.
    it('a row tap at FULL height drops the sheet to half', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      expect(screenEl().dataset.view).toBe('full');
      fireEvent.click(row('museum')!);
      expect(screenEl().dataset.view).toBe('half');
    });

    it('a row tap from the map extreme normalises the sheet to half as well', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      // The sheet shows no rows there, so this is how a row is tapped at that stop: the
      // search overlay's own selection, which takes the same path.
      fireEvent.click(row('museum')!);
      expect(screenEl().dataset.view).toBe('half');
    });

    // ADR-0122 §7, revising the raise session 136 shipped: **a tap never takes away the
    // surface it was made on.** The raise was the only way to show a row at `peek: 116`,
    // and stops being right once the map extreme shows no list at all — there the tapped
    // place surfaces as a card ON THE CANVAS, and the pane's box never changes, so the
    // camera does not move either.
    it('a pin tap at the map extreme moves NOTHING, and surfaces the place as a card', async () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);

      fireEvent.click(pin('lunch')!);
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
      expect(placeCard()).toBeTruthy();
      expect(placeCard()!.querySelector('.map-name')?.textContent).toBe('lunch');
      // The card IS the row — same markup, same way-in block — not a second object with
      // its own vocabulary.
      expect(placeCard()!.querySelector('.place')).toBeTruthy();
      expect(placeCard()!.querySelector('.map-refs')).toBeTruthy();
      // And nothing is scrolled: there is no list on screen to scroll.
      await nextFrame();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('the card carries a tapped GHOST too, named with the day it belongs to', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('tomorrow')!);
      // The shipped ghost row's rule, generalised: the row surfaces wherever the sheet
      // cannot show it, and a ghost is the case where it is not in the list either.
      expect(placeCard()!.querySelector('.map-name')?.textContent).toBe('tomorrow');
      expect(placeCard()!.textContent).toContain('מחר');
    });

    it('the card is inert: it is not a button, and it does not lift the sheet', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('lunch')!);
      const inner = placeCard()!.querySelector('.place') as HTMLElement;
      // There is nowhere for a tap on it to go — it already shows everything the row
      // shows — and raising the sheet from it would take away the map it sits on.
      expect(inner.getAttribute('role')).toBeNull();
      expect(inner.getAttribute('tabindex')).toBeNull();
      fireEvent.click(inner);
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
    });

    // It exists exactly where the list cannot show the row, so it never doubles it.
    it('there is no card where the list can show the row', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('lunch')!);
      expect(screenEl().dataset.view).toBe('half');
      expect(placeCard()).toBeNull();
      fireEvent.click(toggle(t.map.view.list));
      expect(placeCard()).toBeNull();
    });

    it('raising the sheet hands the selection back to the list', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('lunch')!);
      expect(placeCard()).toBeTruthy();
      // One selection, two renderings — the card is only ever the one the sheet cannot show.
      fireEvent.click(toggle(t.map.view.list));
      expect(placeCard()).toBeNull();
      expect(row('lunch')!.className).toContain('selected');
    });

    // The map idiom, and the card's own dismissal. Nothing registers with the back stack.
    it('a tap on the canvas background clears the selection', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('lunch')!);
      expect(placeCard()).toBeTruthy();
      tapCanvas();
      expect(placeCard()).toBeNull();
      expect(document.querySelectorAll('.place.selected')).toHaveLength(0);
      const pins = paneProps.current.pins as { placeId: string; selected?: boolean }[];
      expect(pins.every((p) => !p.selected)).toBe(true);
    });

    it('a pin tap where the list IS showing still centres its row, in both day scopes', async () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('lunch')!);
      await nextFrame();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });

      scrollIntoView.mockClear();
      fireEvent.click(listButton(t.map.allDays));
      fireEvent.click(pin('tomorrow')!);
      expect(screenEl().dataset.view).toBe('half');
      expect(row('tomorrow')!.className).toContain('selected');
      await nextFrame();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    });

    it('a pin tap at half leaves the height alone — the list is already showing', () => {
      seed();
      render(wrap(<MapView />));
      expect(screenEl().dataset.view).toBe('half');
      fireEvent.click(pin('lunch')!);
      expect(screenEl().dataset.view).toBe('half');
    });

    // The two directions do not cancel each other out: a row tap shrinks the list to
    // reveal the map, a pin tap grows it to reveal the row.
    it('a pin tap at FULL leaves the list at full — nothing is hidden there', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.list));
      fireEvent.click(pin('lunch')!);
      expect(screenEl().dataset.view).toBe('full');
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
      // Two ways in, not a choice the screen makes for you: the booking holds the
      // code and the documents, the event holds when it happens and what surrounds
      // it. The booking leads — it is what a traveller standing there wants first.
      expect([...refs.querySelectorAll('.map-ref-kind')].map((k) => k.textContent)).toEqual([
        t.map.refs.booking,
        t.map.refs.event,
      ]);
      // The destination end says LANDING, not take-off — on both.
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

    // A surfaced ghost row is SELECTED, so §8's way-in block should be on it — and it
    // was the one row that never had one. `forceDay` reached the row's day and its
    // outcome but not `refEntriesFor`, which stayed scoped to the strip's day; a
    // ghost's references are by definition on another day, so every one of them was
    // filtered out. The tap is the only way to learn what a ghost is, and it was
    // answering "nothing".
    it('a surfaced ghost carries its way in, on the day it actually belongs to', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('tomorrow')!);
      const refs = row('tomorrow')!.querySelector('.map-refs');
      expect(refs).toBeTruthy();
      expect(refs!.querySelectorAll('.map-ref')).toHaveLength(1);
      expect(refs!.textContent).toContain('e4 plan');
    });
  });

  // The stay is the case that made this visible, but the rule is about ALL-DAYS scope:
  // a place was read off `days[0]`, so one past day classified it however alive the
  // trip still was with it. Session 137 took the fade off the ambient tier in day
  // scope; all-days never reached that tier at all, so a mid-stay hotel kept it —
  // `PIN_TIER.behind` renders through the `skipped` class (`saturate(.3)`), which is
  // the same claim, harder.
  describe('all-days reads a place by the day it is live on', () => {
    const seedStay = () => {
      tripPlaces = [place('hotel'), place('museum')];
      tripEvents = [
        event({
          id: 'stay',
          placeId: 'hotel',
          category: 'lodging',
          date: '2026-07-19',
          endDate: '2026-07-22',
          startsAt: '2026-07-19T15:00:00Z',
          endsAt: '2026-07-22T10:00:00Z',
        }),
        event({
          id: 'e1',
          placeId: 'museum',
          category: 'sightseeing',
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        }),
      ];
    };

    it('the stay you sleep in tonight is ambient, not behind you — in BOTH scopes', () => {
      seedStay();
      render(wrap(<MapView />));
      expect(pin('hotel')?.dataset.tier).toBe('ambient');
      fireEvent.click(listButton(t.map.allDays));
      expect(pin('hotel')?.dataset.tier).toBe('ambient');
    });

    it('and all-days it names the check-out ahead, not the check-in behind', () => {
      seedStay();
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      // Day-scoped an ambient night says nothing, and that is still the whole ambient
      // distinction. All-days the row describes the place across the trip, so the
      // useful fact is the edge it is heading for.
      const meta = row('hotel')!.querySelector('.map-m')?.textContent ?? '';
      expect(meta).toContain(t.glance.transition.checkOut);
      expect(meta).not.toContain(t.glance.transition.checkIn);
    });

    it('a place visited earlier and booked again later is not filed as behind you', () => {
      tripPlaces = [place('cafe')];
      tripEvents = [
        event({
          id: 'was',
          placeId: 'cafe',
          date: '2026-07-19',
          startsAt: '2026-07-19T10:00:00Z',
          status: EVENT_STATUS.DONE,
        }),
        event({
          id: 'will',
          placeId: 'cafe',
          date: NEXT_DAY,
          startsAt: `${NEXT_DAY}T10:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      expect(pin('cafe')?.dataset.tier).toBe('upcoming');
      // `מה נשאר` always answered this way (it asks about ALL a place's days); the
      // row now agrees with it instead of tagging the café as visited.
      expect(row('cafe')!.textContent).not.toContain(t.event.didThis);
    });
  });

  describe('`מה נשאר`: one toggle, and ADR-0119 count coupling on three axes (§9)', () => {
    const leftChip = () => {
      openFacets();
      return listButton(t.map.filter.left);
    };
    const count = (el: HTMLElement) => el.querySelector('.cnt')?.textContent;
    const pillCount = (label: string) => {
      openFacets();
      return screen
        .getByRole('radio', { name: new RegExp(label) })
        .querySelector('.choice-pill-count')?.textContent;
    };

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

    // The gate moved with the predicate (ADR-0124). It used to ask "has anything been
    // settled", which was the old rule's own blind spot: on a trip where nobody taps
    // היינו the chip never appeared, though a whole morning was behind you that it
    // would have cleared.
    it('the chip appears once anything is behind you, settled or merely passed', () => {
      // A day that has not started yet: nothing is behind you, so there is nothing to
      // hide and no chip — the same derived-affordance rule `אולי` follows (ADR-0050).
      tripPlaces = [place('dinner')];
      tripEvents = [event({ id: 'e', placeId: 'dinner', startsAt: `${ACTIVE_DATE}T20:00:00Z` })];
      const view = render(wrap(<MapView />));
      openFacets();
      expect(screen.queryByRole('button', { name: new RegExp(t.map.filter.left) })).toBeNull();
      view.unmount();

      // Nobody settled anything here either — the clock alone earns the chip now.
      // A second PLACE, not a second event on the same one: two references on one date
      // merge to one day whose `until` is the latest of them, so the morning stop would
      // have been kept alive by the evening one.
      tripPlaces = [...tripPlaces, place('breakfast')];
      tripEvents = [
        ...tripEvents,
        event({ id: 'e2', placeId: 'breakfast', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
      ];
      render(wrap(<MapView />));
      expect(leftChip()).toBeTruthy();
    });

    // The correction, end to end on the screen: a stop the clock has passed and nobody
    // closed used to survive `מה נשאר` — and since settling is a manual tap most stops
    // never get, that was most of the trip.
    it('hides a passed stop nobody settled, and keeps tonight’s', () => {
      tripPlaces = [place('breakfast'), place('dinner')];
      tripEvents = [
        event({ id: 'e1', placeId: 'breakfast', startsAt: `${ACTIVE_DATE}T08:00:00Z` }),
        event({ id: 'e2', placeId: 'dinner', startsAt: `${ACTIVE_DATE}T20:00:00Z` }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(leftChip());
      const hidden = (name: string) =>
        row(name)?.closest('.wp-reveal')?.classList.contains('hidden');
      expect(hidden('breakfast')).toBe(true);
      expect(hidden('dinner')).toBe(false);
      expect(pinIds()).toEqual(['dinner']);
    });

    // The other half, which the owner asked for explicitly: ahead of you on the clock,
    // but a human closed it. `settled` outranks the clock (ADR-0117 §2), so it goes now
    // rather than at 20:00.
    it('hides a stop still AHEAD of you that was marked היינו', () => {
      tripPlaces = [place('dinner'), place('drinks')];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'dinner',
          startsAt: `${ACTIVE_DATE}T20:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
        event({ id: 'e2', placeId: 'drinks', startsAt: `${ACTIVE_DATE}T22:00:00Z` }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(leftChip());
      expect(row('dinner')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(true);
      expect(pinIds()).toEqual(['drinks']);
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
      openFacets();
      expect(
        screen.queryByRole('radio', { name: new RegExp(t.iconPicker.categories.sightseeing) }),
      ).toBeNull();
    });

    it('its own count follows the picked type, the other way round', () => {
      seedSettled();
      render(wrap(<MapView />));
      openFacets();
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

    // Both toggles are DERIVED affordances, so the snapshot can take the chip away
    // while the filter it drives is still on — another member consumes the last idea
    // or un-settles the last event, and the socket delivers it. The strip then holds
    // no control that can turn the filter off: an empty list, the summary still
    // naming the facet, and no way back. The type chip has always had this guard
    // (`activeCategory` falls back when its count empties); the toggles now do too.
    it('a toggle whose chip goes away turns itself off rather than filtering invisibly', () => {
      tripPlaces = [place('been'), place('dinner')];
      tripEvents = [
        event({
          id: 'e1',
          placeId: 'been',
          startsAt: `${ACTIVE_DATE}T20:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
        event({ id: 'e2', placeId: 'dinner', startsAt: `${ACTIVE_DATE}T21:00:00Z` }),
      ];
      const view = render(wrap(<MapView />));
      fireEvent.click(leftChip());
      expect(row('been')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(true);
      // The only thing behind you gets un-settled from another surface, and the
      // snapshot arrives: nothing is behind you now, so the chip is gone.
      tripEvents = tripEvents.map((e) => ({ ...e, status: EVENT_STATUS.PLANNED }));
      view.rerender(wrap(<MapView />));
      openFacets();
      expect(screen.queryByRole('button', { name: new RegExp(t.map.filter.left) })).toBeNull();
      // …and every row is back, rather than a filter running with no control over it.
      expect(row('been')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(false);
    });
  });

  // An empty list has three causes and the tab named one. The common path is neither
  // an empty trip nor an over-narrow filter: the facets persist across a day change
  // (rightly — it is the same question asked of each day), so moving the strip with
  // one on lands here, and `אין מקומות שמתאימים לסינון` then blames a control you did
  // not touch. Each case says which it is and hands back the step out (ADR-0078).
  describe('an empty list says which of its three causes it is', () => {
    it('a day with no places blames the SCOPE, and offers all-days', () => {
      tripPlaces = [place('tomorrow')];
      tripEvents = [event({ id: 'e', placeId: 'tomorrow', date: NEXT_DAY })];
      render(wrap(<MapView />));
      expect(screen.getByText(t.map.emptyDay.title)).toBeTruthy();
      fireEvent.click(listButton(t.map.emptyDay.action));
      expect(screen.queryByText(t.map.emptyDay.title)).toBeNull();
      expect(row('tomorrow')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(false);
    });

    // Which facet gets you here matters: the TYPE chip cannot, because an emptied type
    // falls back to `הכל` (ADR-0119 §3, so "picked a type, got an empty list" is
    // unreachable by tapping). The two toggles have no such fallback — they are
    // tappable at zero — and the day scope has none either, which is the common path:
    // the facets persist across a day change.
    it('an over-narrow filter names the facets it is holding, and clears them', () => {
      // A day you have finished: nothing is left, so the toggle empties the list.
      tripPlaces = [place('breakfast'), place('museum')];
      tripEvents = [
        event({ id: 'e1', placeId: 'breakfast', startsAt: `${ACTIVE_DATE}T08:00:00Z` }),
        event({ id: 'e2', placeId: 'museum', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
      ];
      render(wrap(<MapView />));
      openFacets();
      expect(listButton(t.map.filter.left).querySelector('.cnt')?.textContent).toBe('0');
      fireEvent.click(listButton(t.map.filter.left));
      expect(screen.getByText(t.map.filter.noResultsTitle)).toBeTruthy();
      expect(document.querySelector('.fb-empty-body')!.textContent).toContain(t.map.filter.left);
      fireEvent.click(listButton(t.map.filter.clear));
      expect(screen.queryByText(t.map.filter.noResultsTitle)).toBeNull();
      expect(row('museum')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(false);
    });

    it('a trip with no places at all still says THAT, not either of the other two', () => {
      render(wrap(<MapView />));
      expect(screen.getByText(t.map.empty.title)).toBeTruthy();
      expect(screen.queryByText(t.map.emptyDay.title)).toBeNull();
      expect(screen.queryByText(t.map.filter.noResultsTitle)).toBeNull();
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
      openFacets();
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
      // Plan now OPENS day-scoped (ADR-0109's 2026-07-27 amendment), so the day's
      // shape is on screen without a chip tap.
      expect(paneProps.current.connector).toEqual([
        { lat: 35.6, lng: 139.6 },
        { lat: 35.7, lng: 139.7 },
      ]);
      const link = screen.getByRole('link', { name: new RegExp(t.map.dayRoute) });
      expect(link.getAttribute('href')).toContain('/maps/dir/?api=1&origin=35.6%2C139.6');

      // Widening to all days drops it: connecting every day would be spaghetti.
      fireEvent.click(listButton(t.map.allDays));
      expect(paneProps.current.connector).toBeUndefined();
      expect(screen.queryByRole('link', { name: new RegExp(t.map.dayRoute) })).toBeNull();
    });
  });

  // Session 134, second report — reproduced from the screenshot: day scope, two
  // stops nearby, and the trip's other days scattered across continents as ghosts.
  // The fit was working; it was fitting the ghosts too.
  describe('the camera frames the day, not the ghosts around it', () => {
    const seedFarFlungTrip = () => {
      tripPlaces = [
        place('breakfast', true, { lat: 32.08, lng: 34.78 }), // today, Tel Aviv
        place('lunch', true, { lat: 32.09, lng: 34.79 }), // today, Tel Aviv
        place('rome', true, { lat: 41.9, lng: 12.5 }), // another day
        place('tokyo', true, { lat: 35.68, lng: 139.76 }), // another day
      ];
      tripEvents = [
        event({ id: 'e1', placeId: 'breakfast', startsAt: `${ACTIVE_DATE}T08:00:00Z` }),
        event({ id: 'e2', placeId: 'lunch', startsAt: `${ACTIVE_DATE}T13:00:00Z` }),
        event({ id: 'e3', placeId: 'rome', date: NEXT_DAY }),
        event({ id: 'e4', placeId: 'tokyo', date: '2026-07-22' }),
      ];
    };

    it('hands the camera the day’s own pins only', () => {
      seedFarFlungTrip();
      render(wrap(<MapView />));
      // All four are DRAWN — a ghost is context you can see and tap…
      expect(pinIds()).toHaveLength(4);
      expect(pin('tokyo')?.dataset.tier).toBe('ghost');
      // …but the camera is given the two the day actually contains, so it frames a
      // neighbourhood rather than three continents.
      expect(paneProps.current.pins).toBeDefined();
      const framed = (paneProps.current.pins as { placeId: string; tier: string }[]).filter(
        (p) => p.tier !== 'ghost',
      );
      expect(framed.map((p) => p.placeId).sort()).toEqual(['breakfast', 'lunch']);
    });

    it('anchors the opening camera on a day pin, never on a ghost', () => {
      seedFarFlungTrip();
      render(wrap(<MapView />));
      // Tel Aviv, not Rome or Tokyo — even the frame before the first fit lands
      // somewhere the day contains.
      expect(paneProps.current.defaultCentre).toEqual({ lat: 32.08, lng: 34.78 });
    });

    it('all-days scope has no ghosts, so every pin is framed', () => {
      seedFarFlungTrip();
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      const tiers = (paneProps.current.pins as { tier: string }[]).map((p) => p.tier);
      expect(tiers).not.toContain('ghost');
    });

    // The `באזור` readout deliberately keeps counting ghosts: it is a SPATIAL
    // question about the area, not the facet count the camera answers (§9).
    it('still counts ghosts in the area readout — a different question', () => {
      seedFarFlungTrip();
      render(wrap(<MapView />));
      const onViewChange = paneProps.current.onViewChange as (b: unknown) => void;
      // The real caller is the map's `idle` event; here it is invoked directly, so it
      // needs its own `act` to flush the state it sets.
      act(() => onViewChange({ north: 60, south: 20, east: 150, west: 0 })); // a wide pan
      expect(paneProps.current.areaCount).toBe(4);
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

  // ADR-0109 session-134: opening the tab offers to locate you, rather than waiting
  // for a chip tap. What §6 was protecting is what these assert — a cold OS dialog
  // never appears, and a refusal is never nagged.
  describe('opening the tab offers to locate you (ADR-0109 session-134)', () => {
    const card = () => screen.queryByText(t.map.near.prompt.body);

    it('standing permission: fetches a fix with NO card and no dialog at all', async () => {
      seed();
      permissionState = 'granted';
      geoFix = { lat: 35.6, lng: 139.6 };
      render(wrap(<MapView />));
      // The Permissions API answers a microtask later, so let it.
      await vi.waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
      // No card: the browser already has consent, so asking again would be theatre.
      expect(card()).toBeNull();
      // The me dot arrives with the fix…
      await vi.waitFor(() => expect(paneProps.current.me).toEqual({ lat: 35.6, lng: 139.6 }));
      // …and the LIST IS LEFT ALONE. Locating you is not asking to be sorted by
      // distance; that intent belongs to the chip, and one flag used to mean both,
      // so a fix landing on open silently re-ordered the day out of schedule order.
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
      expect(screen.queryByText(t.map.blockHeader.ahead)).toBeTruthy();
    });

    it('a prompt would appear: shows OUR card and touches nothing', async () => {
      seed();
      permissionState = 'prompt';
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(card()).toBeTruthy());
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(paneProps.current.me).toBeUndefined();
    });

    it('no Permissions API (Safari): shows the card rather than risk a cold dialog', async () => {
      seed();
      permissionState = null;
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(card()).toBeTruthy());
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('already refused: offers nothing — a refusal is an answer, not an invitation', async () => {
      seed();
      permissionState = 'denied';
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(getCurrentPosition).not.toHaveBeenCalled());
      expect(card()).toBeNull();
      // The chip is still there to opt in with.
      expect(screen.getByRole('button', { name: new RegExp(t.map.near.chip) })).toBeTruthy();
    });

    it('offline: nothing is offered, since you cannot be located anyway', async () => {
      seed();
      permissionState = 'prompt';
      isOffline = true;
      render(wrap(<MapView />));
      await vi.waitFor(() => expect(getCurrentPosition).not.toHaveBeenCalled());
      expect(card()).toBeNull();
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
