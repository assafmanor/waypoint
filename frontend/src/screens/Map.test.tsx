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

// `placeId` is not required: a booking-linked event carries none — its place comes
// from the booking (ADR-0048).
const event = (p: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
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
// The strip's write. It is a spy rather than a setter on purpose: the bug #10 fixes
// is the case where the chosen day IS the active one, so `activeDate` must NOT move.
const setActiveDate = vi.fn();

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    setActiveDate,
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
import { MapScopeProvider, useSelectDay } from '../state/map-scope-state';
import { setSimulatedNow } from '../lib/useClock';
import { MapView } from './Map';
import { withoutBidiControls } from '../lib/bidi';
import { FILTER_STAGGER_MS } from '../constants';
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

/** A row a chip/search filters out stays mounted and collapses in place (the
 *  shared reveal, ADR-0120), so "not in the list" is its hidden state — never
 *  absence from the DOM. */
const filteredOut = (name: string) =>
  screen.getByText(name).closest('.wp-reveal')?.classList.contains('hidden');

const row = (name: string) =>
  [...document.querySelectorAll('.place')].find(
    (r) => r.querySelector('.map-name')?.textContent === name,
  ) as HTMLElement | undefined;

/** The number the row's badge carries, or `null` for a row with no position in the
 *  day's sequence. */
const orderOf = (name: string) =>
  row(name)?.querySelector('.map-badge')?.getAttribute('data-order') ?? null;

/** Which day scope the tab is in, read the way a user reads it: the chip's own state.
 *  `.map-scopehint`'s sentence retired with the two fixed rows (ADR-0122 §2) — the chip
 *  says it, and the header day strip drops its filled selection while all-days is on. */
const allDaysOn = () =>
  screen.getByRole('button', { name: new RegExp(t.map.allDays) }).getAttribute('aria-pressed') ===
  'true';

/** The facets now live behind ONE `סינון` control that opens them in place (ADR-0122
 *  §2), so anything that touches a facet opens the strip first. Idempotent: while the
 *  strip is open the control is not rendered, so this is a no-op. The `^` matters —
 *  with a facet on, the control's accessible name is `סינון: אוכל · אולי`. */
const openFacets = () => {
  const control = screen.queryByRole('button', { name: new RegExp(`^${t.map.filter.open}`) });
  if (control) fireEvent.click(control);
};
/** …and the scope chip is only in the row at REST, since the strip covers it in place.
 *  Also idempotent, so reaching for the scope is written the same way everywhere. */
const closeFacets = () => {
  const close = screen.queryByRole('button', { name: t.map.filter.close });
  if (close) fireEvent.click(close);
};

/** Stands in for the header's `DayStrip`, wired to the REAL production handler —
 *  the strip itself lives in `App`'s header, but the intent it signals is what the
 *  Map answers to, and that is what this exercises. */
function DayPill({ date }: { date: string }) {
  const selectDay = useSelectDay();
  return (
    <button type="button" onClick={() => selectDay(date)}>
      day-pill
    </button>
  );
}
const tapDayPill = () => fireEvent.click(screen.getByRole('button', { name: 'day-pill' }));
const tapAllDays = () => {
  closeFacets();
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
};

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
    setActiveDate.mockClear();
  });

  it('Trip mode defaults to today: shows today’s places, hides other-day and dayless ones', () => {
    seed();
    render(wrap(<MapView />));
    expect(screen.getByText('food')).toBeTruthy();
    expect(screen.getByText('lite')).toBeTruthy(); // coordless, still listed on its day
    // Out of the day scope: mounted but collapsed, so tapping כל הימים reveals
    // them rather than rebuilding the list (ADR-0120 session-130).
    expect(filteredOut('see')).toBe(true); // another day
    expect(filteredOut('idea')).toBe(true); // a maybe has no day facet
  });

  // ADR-0122 §8 — this whole suite runs with NO build config, which is the graceful-
  // absence path: no split and no sheet, so the same controls row renders in ordinary
  // flow above the list. One component, two positionings, never two components.
  describe('the list-only path keeps the same controls row, in flow (ADR-0122 §8)', () => {
    it('renders the row statically above the list, with no split around it', () => {
      seed();
      render(wrap(<MapView />));
      const row = document.querySelector('.map-controls')!;
      expect(row.className).toContain('in-flow');
      expect(document.querySelector('.map-split')).toBeNull();
      expect(document.querySelector('.wp-snapsheet')).toBeNull();
      // The shipped pair is gone here too — this path did not get its own copy.
      expect(document.querySelector('.map-filter-row')).toBeNull();
      expect(document.querySelector('.map-sortstrip')).toBeNull();
    });

    // The one place the sort chip cannot live in the sheet, because there is no sheet.
    it('is where `קרוב עכשיו` lives on this path', () => {
      seed();
      render(wrap(<MapView />));
      expect(document.querySelector('.map-controls .map-nearchip')).toBeTruthy();
    });

    it('offline the chip is absent from it, unchanged — you cannot re-locate', () => {
      seed();
      isOffline = true;
      render(wrap(<MapView />));
      expect(document.querySelector('.map-controls')).toBeTruthy();
      expect(document.querySelector('.map-nearchip')).toBeNull();
    });

    it('the facets still open in place here — one disclosure, both positionings', () => {
      seed();
      render(wrap(<MapView />));
      expect(screen.queryByRole('radio', { name: new RegExp(t.map.filter.all) })).toBeNull();
      openFacets();
      expect(document.querySelector('.map-controls .map-facetstrip')).toBeTruthy();
      expect(screen.getByRole('radio', { name: new RegExp(t.map.filter.all) })).toBeTruthy();
    });
  });

  it('a coord place gets a Google directions link; a coordless one gets ＋ מיקום to enrich', () => {
    seed();
    render(wrap(<MapView />));
    const nav = screen.getAllByRole('link', { name: new RegExp(t.actions.navigate) });
    expect(nav[0].getAttribute('href')).toContain('/maps/dir/?api=1&destination=');
    expect(screen.getByRole('button', { name: t.map.addLocation })).toBeTruthy();
  });

  it('＋ מיקום opens the shared picker sheet to enrich the coordless place', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: t.map.addLocation }));
    expect(screen.getByText(t.placePicker.title)).toBeTruthy();
  });

  it('the all-days chip reveals every place (other days + dayless maybes/bookings)', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
    expect(screen.getByText('see')).toBeTruthy();
    expect(screen.getByText('idea')).toBeTruthy();
  });

  // Both modes open on the day you are on (ADR-0109's 2026-07-27 amendment,
  // reversing §1's Plan pivot). Before the trip starts `activeDate` is today clamped
  // into the trip range — day 1 — so Plan opens there with `כל הימים` one tap away.
  it('Plan mode opens day-scoped too, not on all days', () => {
    currentMode = 'plan';
    seed();
    render(wrap(<MapView />));
    expect(allDaysOn()).toBe(false);
    expect(filteredOut('see')).toBe(true); // another day
    tapAllDays();
    expect(allDaysOn()).toBe(true);
    expect(filteredOut('see')).toBe(false);
  });

  // The reported bug: `onSelectDay` was `setActiveDate`, so the Map could only learn
  // a day had been chosen by watching the date CHANGE. Tapping the day you are
  // already on writes the same value, nothing changes, and the strip's most obvious
  // way out of `כל הימים` did nothing at all.
  it('choosing the day you are already on leaves all-days — the date never moves', () => {
    seed();
    render(
      wrap(
        <>
          <DayPill date={ACTIVE_DATE} />
          <MapView />
        </>,
      ),
    );
    tapAllDays();
    expect(allDaysOn()).toBe(true);
    expect(filteredOut('see')).toBe(false);

    tapDayPill();
    // The strip still writes the one source of truth — with the same value it held.
    expect(setActiveDate).toHaveBeenCalledWith(ACTIVE_DATE);
    expect(allDaysOn()).toBe(false);
    expect(filteredOut('see')).toBe(true);
  });

  it('choosing a day is an intent, not a toggle: tapping it again keeps the day scope', () => {
    seed();
    render(
      wrap(
        <>
          <DayPill date={ACTIVE_DATE} />
          <MapView />
        </>,
      ),
    );
    tapDayPill();
    tapDayPill();
    expect(allDaysOn()).toBe(false);
  });

  it('the maybes toggle narrows to shelf ideas', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) })); // see everything
    openFacets();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.filter.maybes) }));
    expect(filteredOut('idea')).toBe(false);
    expect(filteredOut('food')).toBe(true);
    expect(filteredOut('see')).toBe(true);
  });

  it('a filtered-out row collapses in place, and matches reveal with a stagger (ADR-0120)', () => {
    seed();
    render(wrap(<MapView />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
    openFacets();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(t.iconPicker.categories.food) }));
    const reveal = (name: string) => screen.getByText(name).closest('.wp-reveal') as HTMLElement;
    // The non-matching rows are still mounted (that's what lets them animate out)
    // and inert, so they're out of reach of pointer, keyboard, and screen reader.
    expect(reveal('see').classList.contains('hidden')).toBe(true);
    expect(reveal('see').hasAttribute('inert')).toBe(true);
    expect(reveal('see').style.transitionDelay).toBe('0ms');
    expect(reveal('food').hasAttribute('inert')).toBe(false);
    // Only the visible rows carry the stagger, and they carry it in list order —
    // a hidden row between two matches never leaves a gap in the sequence.
    const shown = [...document.querySelectorAll<HTMLElement>('.wp-reveal:not(.hidden)')];
    expect(shown.map((r) => r.style.transitionDelay)).toEqual(
      shown.map((_, i) => `${i * FILTER_STAGGER_MS}ms`),
    );
  });

  it('a scope change reveals rows in place, it does not rebuild the list (session-130)', () => {
    seed();
    render(wrap(<MapView />));
    const row = screen.getByText('see').closest('.wp-reveal');
    expect(row?.classList.contains('hidden')).toBe(true); // another day
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
    // The SAME node un-hides: כל הימים is a reveal like every other control, so
    // the row animates in rather than the list being thrown away and re-made.
    expect(screen.getByText('see').closest('.wp-reveal')).toBe(row);
    expect(row?.classList.contains('hidden')).toBe(false);
  });

  it('visible rows carry a move key, so a re-order slides them (session-130)', () => {
    seed();
    render(wrap(<MapView />));
    const key = (name: string) =>
      screen.getByText(name).closest('.wp-reveal')?.getAttribute('data-flip-key');
    expect(key('food')).toBeTruthy();
    expect(key('see')).toBeNull(); // hidden: nothing to watch move
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

  // ADR-0119 — three reported ways the `אולי` facet lied. Asserted in BOTH day
  // scopes, since the day-scoped and all-days paths are different renders.
  describe('the maybes facet is the shelf, in the day scope (ADR-0119)', () => {
    // Both facet getters open the strip first (see `openFacets`), so these read exactly
    // as they did when the chips sat in a permanently visible row.
    const maybesChip = () => {
      openFacets();
      return screen.getByRole('button', { name: new RegExp(t.map.filter.maybes) });
    };
    const maybesCount = () => maybesChip().querySelector('.cnt')?.textContent;
    const allDaysChip = () => {
      closeFacets();
      return screen.getByRole('button', { name: new RegExp(t.map.allDays) });
    };
    const pill = (label: string) => {
      openFacets();
      return screen.getByRole('radio', { name: new RegExp(label) });
    };
    const countOn = (label: string) => pill(label).querySelector('.choice-pill-count')?.textContent;
    // Fixtures carry fixed dates, so the clock is pinned (frontend CLAUDE.md): noon
    // on the active day, which also makes '2026-07-21' read as מחר.
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const rowFor = (name: string) =>
      [...document.querySelectorAll('.place')].find(
        (r) => r.querySelector('.map-name')?.textContent === name,
      );

    it('an idea pencilled in for today is on today’s map, and in the maybes filter', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('today-idea', true), place('someday-idea', true)];
      tripMaybes = [
        maybe({ id: 'm1', placeId: 'today-idea', category: 'food', targetDate: ACTIVE_DATE }),
        maybe({ id: 'm2', placeId: 'someday-idea', category: 'food' }),
      ];
      render(wrap(<MapView />));
      // The reported bug: "maybe today" showed nowhere in the scope Trip mode opens on.
      expect(filteredOut('today-idea')).toBe(false);
      expect(filteredOut('someday-idea')).toBe(true); // dateless: all-days only
      fireEvent.click(maybesChip());
      expect(screen.getByText('today-idea')).toBeTruthy();
      expect(maybesCount()).toBe('1');
    });

    it('a pencilled day is named in a neutral tag, never as an amber commitment', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('tomorrow-idea', true)];
      tripMaybes = [maybe({ id: 'm', placeId: 'tomorrow-idea', targetDate: '2026-07-21' })];
      render(wrap(<MapView />));
      fireEvent.click(allDaysChip());
      const row = rowFor('tomorrow-idea')!;
      expect(row.textContent).toContain(t.map.shelfTag);
      expect(row.querySelector('.map-tag.time')).toBeNull();
      expect(row.querySelector('.map-tag')?.textContent).toBe('מחר');
    });

    it('a skipped soft event is on the shelf, so the maybes filter finds it', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('bailed', true), place('planned', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'bailed', category: 'food', status: EVENT_STATUS.SKIPPED }),
        event({ id: 'e2', placeId: 'planned', category: 'food' }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(maybesChip());
      // It appeared under its category chip but never under `אולי` — the reported bug.
      expect(filteredOut('bailed')).toBe(false);
      expect(filteredOut('planned')).toBe(true);
      // …and the same in all-days scope.
      fireEvent.click(allDaysChip());
      expect(filteredOut('bailed')).toBe(false);
      expect(filteredOut('planned')).toBe(true);
    });

    it('the maybes count follows the picked category, and the chips follow the toggle', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('idea-food', true), place('idea-see', true), place('booked-food', true)];
      tripEvents = [event({ id: 'e', placeId: 'booked-food', category: 'food' })];
      tripMaybes = [
        maybe({ id: 'm1', placeId: 'idea-food', category: 'food', targetDate: ACTIVE_DATE }),
        maybe({ id: 'm2', placeId: 'idea-see', category: 'sightseeing', targetDate: ACTIVE_DATE }),
      ];
      render(wrap(<MapView />));
      expect(maybesCount()).toBe('2');
      expect(countOn(t.iconPicker.categories.food)).toBe('2'); // the idea + the scheduled one

      fireEvent.click(pill(t.iconPicker.categories.food));
      expect(maybesCount()).toBe('1'); // one maybe restaurant, not two

      fireEvent.click(maybesChip());
      expect(countOn(t.iconPicker.categories.food)).toBe('1'); // the scheduled one is filtered out
      expect(countOn(t.map.filter.all)).toBe('2'); // the two ideas, both types
      expect(countOn(t.iconPicker.categories.sightseeing)).toBe('1');
    });
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
      expect(screen.getByText(t.map.blockHeader.behind)).toBeTruthy();
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
      expect(screen.getByText(t.map.blockHeader.behind)).toBeTruthy();
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
      expect(screen.getByText(t.map.blockHeader.behind)).toBeTruthy();
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
    // The chip's numeral is an LTR island (ADR-0118), so its text carries invisible
    // bidi controls — read the plain characters, except where order is the point.
    const distanceChips = () =>
      [...document.querySelectorAll('.place')].map((row) => {
        const chip = row.querySelector('.map-dist');
        return chip ? withoutBidiControls(chip.textContent ?? '') : undefined;
      });

    // Opening the tab now OFFERS to locate you (ADR-0109 session-134) — but the
    // invariant §6 was protecting still holds exactly: the device is untouched until
    // the user allows it, and the list has already rendered in full without it. jsdom
    // has no Permissions API, so this is the `unsupported` branch: we cannot tell
    // whether a dialog would appear, so we show OUR card rather than risk a cold one.
    it('offers on open, and asks the device nothing until allowed', () => {
      seedNear();
      render(wrap(<MapView />));
      // Asserted on the body, not the title: the title renders behind a 📍 in the same
      // text node, so a full-string match on it can never fail and never had teeth.
      expect(screen.getByText(t.map.near.prompt.body)).toBeTruthy();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
      expect(rowNames()).toEqual(['far', 'lite', 'near']); // default day/name order
    });

    it('“לא עכשיו” on the offer means not-this-session, not not-this-visit', () => {
      seedNear();
      const view = render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.notNow }));
      expect(screen.queryByText(t.map.near.prompt.body)).toBeNull();
      // The tab remounts on every tab change while the lifted MapScopeProvider above
      // it survives — so swap the screen out and back through the SAME provider,
      // which is what a tab change really does. (A fresh `render(wrap(…))` would
      // build a new provider and prove nothing.)
      view.rerender(wrap(<div />));
      view.rerender(wrap(<MapView />));
      expect(screen.queryByText(t.map.near.prompt.body)).toBeNull();
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('the chip states the reason first, and only then asks the device', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      // Clear the on-open offer so what is under test is the CHIP's own path.
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.notNow }));
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
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.notNow }));
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
      const dist = distanceChips();
      expect(dist[0]).toBe('10 מ׳'); // standing on it
      expect(dist[1]).toBe('1.1 ק״מ');
      expect(dist[2]).toBeUndefined(); // the coordless lite can't be measured
    });

    it('the chip reads number-then-unit: never forced LTR over its Hebrew (ADR-0118)', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      const chip = document.querySelector('.map-dist')!;
      // dir="ltr" here laid the whole token out left-to-right, so a Hebrew reader
      // met the unit first ("ק״מ 9"). The numeral is the island, not the token.
      expect(chip.getAttribute('dir')).toBeNull();
      expect(chip.textContent).toBe('\u206610\u2069 מ׳');
    });

    // The chip owns the ORDER and nothing else now. Toggling it off puts the day
    // back in its own sequence — but the distances stay, because we still know
    // where you are, and forgetting a fix we hold to undo a sort would be a lie.
    it('toggling off restores the default order and KEEPS the distances', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      fireEvent.click(nearChip());
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      fireEvent.click(nearChip());
      expect(rowNames()).toEqual(['far', 'lite', 'near']);
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
      expect(document.querySelector('.map-dist')).toBeTruthy();
    });

    // The regression the session-134 on-open offer introduced: locating you is not
    // the same as asking to be sorted by distance, and it used to be one flag.
    it('a fix obtained on OPEN shows distances but never re-orders the day', () => {
      seedNear();
      geoFix = HERE;
      render(wrap(<MapView />));
      // The on-open offer's own path — allow it, without ever touching the chip.
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.allow }));
      expect(document.querySelector('.map-dist')).toBeTruthy();
      // Schedule order, and the schedule's own headers — not the near-me grouping.
      expect(rowNames()).toEqual(['far', 'lite', 'near']);
      expect(screen.queryByText(t.map.near.groupHeader)).toBeNull();
      expect(nearChip().getAttribute('aria-pressed')).toBe('false');

      // …and the chip still does its one job when it IS tapped.
      fireEvent.click(nearChip());
      expect(rowNames()).toEqual(['near', 'far', 'lite']);
      expect(nearChip().getAttribute('aria-pressed')).toBe('true');
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
      expect(distanceChips()).not.toContain('1.1 ק״מ');
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
      expect(screen.getByText(t.map.blockHeader.behind)).toBeTruthy();
      expect(screen.getByText(t.map.blockHeader.ahead)).toBeTruthy();
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
      expect(screen.queryByText(t.map.blockHeader.ahead)).toBeNull();
      expect(screen.queryByText(t.map.blockHeader.behind)).toBeNull();
    });
  });

  // ADR-0109 session-127 — a place with no day is its own block. Reported: undated
  // maybes read as "in the past", because the behind-you header was the last one
  // above them and they sorted below everything.
  describe('the undated block says so (ADR-0109 session-127)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const at = (hhmm: string) => `${ACTIVE_DATE}T${hhmm}:00Z`;
    /** The list as rendered, headers included, in order. Out-of-scope rows stay
     *  mounted and collapsed (ADR-0120), so what's on screen skips them. */
    const sequence = () =>
      [...document.querySelectorAll('.map-list > *')]
        .filter((node) => !node.classList.contains('hidden'))
        .map((node) =>
          node.classList.contains('map-grouphead')
            ? `# ${node.textContent}`
            : (node.querySelector('.map-name')?.textContent ?? '?'),
        );
    const seedBlocks = () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('this-morning', true), place('tonight', true), place('someday', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'this-morning', startsAt: at('09:00') }),
        event({ id: 'e2', placeId: 'tonight', startsAt: at('20:00') }),
      ];
      tripMaybes = [maybe({ id: 'm', placeId: 'someday' })];
    };

    it('an undated idea sits between the blocks, under its own header', () => {
      seedBlocks();
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(sequence()).toEqual([
        `# ${t.map.blockHeader.ahead}`,
        'tonight',
        `# ${t.map.blockHeader.dayless}`,
        'someday',
        `# ${t.map.blockHeader.behind}`,
        'this-morning',
      ]);
    });

    it('the day scope is unaffected — an undated row isn’t on a day at all', () => {
      seedBlocks();
      render(wrap(<MapView />));
      expect(sequence()).toEqual([
        `# ${t.map.blockHeader.ahead}`,
        'tonight',
        `# ${t.map.blockHeader.behind}`,
        'this-morning',
      ]);
    });

    it('an all-undated list carries no header — there is nothing to be beside', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('someday', true), place('whenever', true)];
      tripMaybes = [
        maybe({ id: 'm1', placeId: 'someday' }),
        maybe({ id: 'm2', placeId: 'whenever' }),
      ];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      expect(sequence()).toEqual(['someday', 'whenever']);
    });
  });

  // The number was already computed and already on every pin; the row simply never
  // received it, so a numbered canvas sat above an unnumbered list (ADR-0121 §6).
  describe('the row carries the pin’s number (§6)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const at = (hhmm: string) => `${ACTIVE_DATE}T${hhmm}:00Z`;
    const seedDay = () => {
      setSimulatedNow(NOON);
      tripPlaces = [
        place('breakfast', true),
        place('museum', true),
        place('dinner', true),
        place('tomorrow', true),
        place('someday', true),
      ];
      tripEvents = [
        event({ id: 'e1', placeId: 'breakfast', category: 'food', startsAt: at('08:00') }),
        event({ id: 'e2', placeId: 'museum', category: 'sightseeing', startsAt: at('11:00') }),
        event({ id: 'e3', placeId: 'dinner', category: 'food', startsAt: at('20:00') }),
        event({
          id: 'e4',
          placeId: 'tomorrow',
          category: 'food',
          date: '2026-07-21',
          startsAt: '2026-07-21T09:00:00Z',
        }),
      ];
      tripMaybes = [maybe({ id: 'm', placeId: 'someday', category: 'food' })];
    };

    it('day scope: the day’s stops are numbered in the order they happen', () => {
      seedDay();
      render(wrap(<MapView />));
      expect(orderOf('breakfast')).toBe('1');
      expect(orderOf('museum')).toBe('2');
      expect(orderOf('dinner')).toBe('3');
      // Nothing outside the day has a position in it, so neither gets a number —
      // the same rule that leaves a ghost pin unnumbered.
      expect(orderOf('tomorrow')).toBeNull();
      expect(orderOf('someday')).toBeNull();
    });

    it('all-days: the numbering follows the trip’s sequence, and an idea still has none', () => {
      seedDay();
      render(wrap(<MapView />));
      tapAllDays();
      expect(orderOf('breakfast')).toBe('1');
      expect(orderOf('museum')).toBe('2');
      expect(orderOf('dinner')).toBe('3');
      expect(orderOf('tomorrow')).toBe('4');
      // An idea was never put in a sequence — nothing scheduled it.
      expect(orderOf('someday')).toBeNull();
    });

    // The invariant the number exists under: it is the index in the SCOPED set,
    // computed before any chip. So a gap (1, 3) is correct and says something is
    // filtered out — the alternative, renumbering, would make the list disagree with
    // the canvas the moment a chip is tapped.
    it('a filter never renumbers, in either scope — the gaps are the point', () => {
      seedDay();
      render(wrap(<MapView />));
      openFacets();
      fireEvent.click(
        screen.getByRole('radio', { name: new RegExp(t.iconPicker.categories.food) }),
      );
      expect(filteredOut('museum')).toBe(true);
      expect(orderOf('breakfast')).toBe('1');
      expect(orderOf('dinner')).toBe('3');

      tapAllDays();
      expect(orderOf('breakfast')).toBe('1');
      expect(orderOf('dinner')).toBe('3');
      expect(orderOf('tomorrow')).toBe('4');
    });

    // Phase 4 made an ambient stay night read as present rather than faded; this is the
    // thing that must not break with it. A middle night is neither an arrival nor a
    // departure, so it holds no position — giving it one would renumber every real
    // stop, and it is now the ONLY thing marking the night as ambient at all.
    it('a stay’s middle night has no position in the day, so it takes no number', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('hotel', true), place('lunch', true)];
      tripEvents = [
        event({
          id: 'stay',
          placeId: 'hotel',
          category: 'lodging',
          date: '2026-07-19',
          endDate: '2026-07-21',
          startsAt: '2026-07-19T15:00:00Z',
          endsAt: '2026-07-21T10:00:00Z',
        }),
        event({ id: 'l', placeId: 'lunch', category: 'food', startsAt: at('13:00') }),
      ];
      render(wrap(<MapView />));
      // The active date is the strictly-middle night of a 19→21 stay.
      expect(orderOf('hotel')).toBeNull();
      expect(orderOf('lunch')).toBe('1');
    });
  });

  // Reported off the running app: Home's board said `עכשיו · עד 14:00` about a
  // 13:00-14:00 lunch at 13:54 while the Map filed the same row under `מה שלפנינו`.
  // The Map had derived its own two-state ahead/behind partition with no middle, so
  // an event in progress was simply "not past". It now reads `deriveNow` — the
  // board's own resolver — so the two surfaces cannot disagree.
  describe('the tab says what is happening NOW (ADR-0109 amendment)', () => {
    const IN_PROGRESS = Date.parse(`${ACTIVE_DATE}T13:54:00Z`);
    const tagsOn = (name: string) =>
      [...(row(name)?.querySelectorAll('.map-tag') ?? [])].map((el) => el.textContent);
    const seedLunch = () => {
      setSimulatedNow(IN_PROGRESS);
      tripPlaces = [place('lunch', true), place('museum', true)];
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
    };

    it('an event in progress is tagged עכשיו, and the later one is the next stop', () => {
      seedLunch();
      render(wrap(<MapView />));
      expect(tagsOn('lunch')).toContain(t.map.happeningNow);
      expect(row('lunch')!.className).toContain('nowstop');
      // The two cues never land on one row: `eventPhase` is `now` OR `upcoming`.
      expect(tagsOn('lunch')).not.toContain(t.map.nextStop);
      expect(tagsOn('museum')).toContain(t.map.nextStop);
      expect(tagsOn('museum')).not.toContain(t.map.happeningNow);
    });

    it('all-days scope says it too — being in progress is not a property of the scope', () => {
      seedLunch();
      render(wrap(<MapView />));
      tapAllDays();
      expect(tagsOn('lunch')).toContain(t.map.happeningNow);
      expect(row('lunch')!.className).toContain('nowstop');
    });

    it('before it starts it is not now — it is what is next instead', () => {
      seedLunch();
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T12:30:00Z`));
      render(wrap(<MapView />));
      expect(row('lunch')).toBeTruthy(); // or the negative below proves nothing
      expect(tagsOn('lunch')).not.toContain(t.map.happeningNow);
      expect(tagsOn('lunch')).toContain(t.map.nextStop);
    });

    it('after it ends it is not now either, and it sinks behind you', () => {
      seedLunch();
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T14:30:00Z`));
      render(wrap(<MapView />));
      expect(row('lunch')).toBeTruthy();
      expect(tagsOn('lunch')).not.toContain(t.map.happeningNow);
      expect(row('lunch')!.className).not.toContain('nowstop');
    });

    // A stay's span runs to check-out, so an unfiltered "now" window would mark the
    // hotel continuously for three days and drown the thing you are actually doing.
    it('a stay never says עכשיו, on any of its days', () => {
      setSimulatedNow(IN_PROGRESS);
      tripPlaces = [place('hotel', true), place('lunch', true)];
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
          id: 'l',
          placeId: 'lunch',
          category: 'food',
          startsAt: `${ACTIVE_DATE}T13:00:00Z`,
          endsAt: `${ACTIVE_DATE}T14:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(tagsOn('hotel')).not.toContain(t.map.happeningNow);
      // …and the thing that IS happening still gets the cue.
      expect(tagsOn('lunch')).toContain(t.map.happeningNow);
    });

    it('Plan mode says nothing: a live "now" means nothing while you are planning', () => {
      currentMode = 'plan';
      seedLunch();
      render(wrap(<MapView />));
      expect(tagsOn('lunch')).not.toContain(t.map.happeningNow);
    });
  });

  // A mid-stay night used to share one quiet treatment with a skipped place, on the
  // reasoning that both are "present but not a live commitment". Half of that was
  // wrong — a skipped place is behind you, a night you are sleeping somewhere is the
  // most current fact on the day — so the two no longer travel together (ADR-0109's
  // 2026-07-27 amendment). The paint itself is CSS and a human pass; what the suite
  // can hold down is that the derivation still tells the two apart.
  describe('an ambient stay night is present, not past', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const stay = () =>
      event({
        id: 'stay',
        placeId: 'hotel',
        category: 'lodging',
        date: '2026-07-19',
        endDate: '2026-07-21',
        startsAt: '2026-07-19T15:00:00Z',
        endsAt: '2026-07-21T10:00:00Z',
      });

    it('the middle night is marked ambient and NOT skipped', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('hotel', true)];
      tripEvents = [stay()];
      render(wrap(<MapView />));
      // The active date is the strictly-middle night of a 19→21 stay.
      expect(row('hotel')!.className).toContain('ambient');
      // The class the fade used to be shared with. Keeping them apart in the markup is
      // what lets them be told apart in the paint.
      expect(row('hotel')!.className).not.toContain('skipped');
    });

    // The other scope, and it is a genuinely different render: `renderRow` reads
    // prominence off the ACTIVE day, so in all-days there is no single day to be
    // mid-stay on and the stay is simply one ordinary row. Worth stating, because it
    // means `ambient` is a day-scope-only class and a test asserting its absence in
    // all-days would pass for the wrong reason.
    it('all-days has no mid-stay night to mark, so the stay is one ordinary row', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('hotel', true)];
      tripEvents = [stay()];
      render(wrap(<MapView />));
      expect(row('hotel')!.className).toContain('ambient');
      tapAllDays();
      expect(row('hotel')!.className).not.toContain('ambient');
      expect(document.querySelectorAll('.place')).toHaveLength(1);
    });

    it('a skipped place keeps the quiet treatment the stay gave up', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('museum', true)];
      tripEvents = [
        event({
          id: 'm',
          placeId: 'museum',
          category: 'sightseeing',
          status: EVENT_STATUS.SKIPPED,
          startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(row('museum')!.className).toContain('skipped');
      expect(row('museum')!.className).not.toContain('ambient');
    });

    // The edge day is what an ambient night now looks like, minus the one thing that
    // still separates them — so the check-in day must still be numbered, or the
    // distinction the amendment rests on is gone.
    it('a check-in day is an ordinary NUMBERED row, which is what ambient is not', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('hotel', true)];
      // Check in ON the active date, so 07-20 is this stay's start edge, not a middle.
      tripEvents = [
        event({
          id: 'stay',
          placeId: 'hotel',
          category: 'lodging',
          date: ACTIVE_DATE,
          endDate: '2026-07-22',
          startsAt: `${ACTIVE_DATE}T15:00:00Z`,
          endsAt: '2026-07-22T10:00:00Z',
        }),
      ];
      render(wrap(<MapView />));
      const hotel = row('hotel')!;
      expect(hotel.className).not.toContain('ambient');
      expect(hotel.className).not.toContain('skipped');
      expect(orderOf('hotel')).toBe('1');
    });
  });

  // §8 promised one entry per in-scope reference. A booking-linked event is two
  // destinations, and returning early on the booking made the event unreachable for
  // exactly the references most worth reaching.
  describe('the way in: a linked booking is two ways in, not one (§8)', () => {
    const seedLinked = () => {
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T12:00:00Z`));
      tripPlaces = [place('granbell', true)];
      tripBookings = [
        {
          id: 'bk',
          tripId: 't1',
          type: 'hotel',
          title: 'Shinjuku Granbell',
          source: 'manual',
          placeId: 'granbell',
          createdAt: '',
          updatedAt: '',
          updatedBy: 'u1',
        } as Booking,
      ];
      tripEvents = [
        event({
          id: 'ci',
          bookingId: 'bk',
          category: 'lodging',
          title: 'Shinjuku Granbell',
          startsAt: `${ACTIVE_DATE}T15:00:00Z`,
        }),
      ];
    };
    const refKinds = () =>
      [...(row('granbell')?.querySelectorAll('.map-ref-kind') ?? [])].map((k) => k.textContent);

    it('day scope: the booking leads, the event follows', () => {
      seedLinked();
      render(wrap(<MapView />));
      fireEvent.click(row('granbell')!);
      expect(refKinds()).toEqual([t.map.refs.booking, t.map.refs.event]);
    });

    it('all-days: the same pair — the scope changes which refs are in, not how they resolve', () => {
      seedLinked();
      render(wrap(<MapView />));
      tapAllDays();
      fireEvent.click(row('granbell')!);
      expect(refKinds()).toEqual([t.map.refs.booking, t.map.refs.event]);
    });

    it('an unlinked booking still resolves to exactly one entry', () => {
      seedLinked();
      tripEvents = [];
      render(wrap(<MapView />));
      tapAllDays(); // an unlinked booking carries no day
      fireEvent.click(row('granbell')!);
      expect(refKinds()).toEqual([t.map.refs.booking]);
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
      // Plan opens day-scoped like Trip does now; widen to all-days and check again,
      // since the two scopes are separate render paths on this screen.
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

    it('search reveals matches instead of dropping the rest (ADR-0120)', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch(t.map.search.button);
      fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
        target: { value: 'food' },
      });
      const results = document.querySelector('.search-overlay-results')!;
      const row = (name: string) =>
        [...results.querySelectorAll('.wp-reveal')].find(
          (r) => r.querySelector('.map-name')?.textContent === name,
        );
      expect(row('food')?.classList.contains('hidden')).toBe(false);
      expect(row('see')?.classList.contains('hidden')).toBe(true);
    });
  });
});
