// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type Note,
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

const note = (id: string, placeId: string, body: string): Note =>
  ({
    id,
    tripId: 't1',
    placeId,
    body,
    source: 'member',
    createdBy: 'u1',
    createdAt: '2026-07-19T09:00:00Z',
    updatedAt: '2026-07-19T09:00:00Z',
    updatedBy: 'u1',
  }) as Note;

// Fixtures: a food event + a coordless-lite event today; a sightseeing event on
// another day; a food maybe (no day). Mutable so a test can blank them.
let tripEvents: TripEvent[] = [];
let tripMaybes: MaybeItem[] = [];
let tripPlaces: Place[] = [];
let tripNotes: Note[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));
let tripBookings: Booking[] = [];
let currentMode = 'trip';
let isOffline = false;
// The strip's write. It is a spy rather than a setter on purpose: the bug #10 fixes
// is the case where the chosen day IS the active one, so `activeDate` must NOT move.
const setActiveDate = vi.fn();

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    zoneCrossings: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
    },
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    // Note hosts resolve through trip-state's one index; this file asserts nothing
    // about an inherited name or category, so the index-miss fallback carries it.
    noteHosts: new Map(),
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
    // What the world knows about these places (ADR-0166 §6) — always present, empty when we
    // know nothing, so a row's badge never has to ask whether the read model arrived.
    enrichments: {},
    indexVerbs: { createPlace: vi.fn(), resolvePlace: vi.fn() },
    // A place is the fifth note host (ADR-0153 §8's amendment): the row carries the mark, the
    // selected row carries the section, and the make/rename form carries the composer.
    notes: tripNotes,
    users: [{ id: 'u1', displayName: 'דנה' }],
    noteVerbs: { createNote },
    // The event form the Map hosts carries the attach slot too (ADR-0173 §5), which reads
    // the trip's documents and links. A place never originates one (§4), so both are empty.
    documents: [],
    documentAttachments: [],
    attachmentVerbs: { attachDocument: vi.fn(), detachDocument: vi.fn() },
  }),
}));
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: currentMode }) }));
// Plan-mode research writes through the shelf verb; the write itself is covered in
// PlaceResearch.test.tsx, so the screen only needs the hook to exist.
// The Map now hosts `EventForm` too (ADR-0135 §3), which reaches for the write verbs and the
// signed-in author — so the stub covers what that form calls, not only the shelf verb.
// The three create verbs RESOLVE to their host (ADR-0152 §6b): the form queues notes behind
// them, so a stub returning `undefined` would throw where the real one hands back an id.
const verbs = {
  addMaybe: vi.fn(),
  removePlace: vi.fn(),
  create: vi.fn((_event: Record<string, unknown>) => Promise.resolve()),
  update: vi.fn(),
  schedule: vi.fn((_m: Record<string, unknown>, _fields?: Record<string, unknown>) =>
    Promise.resolve({ id: 'ev-scheduled' }),
  ),
  book: vi.fn((_input: Record<string, unknown>, _opts?: Record<string, unknown>) =>
    Promise.resolve({ id: 'bk-new' }),
  ),
};
/** The list-only harness states its capability boundary explicitly; the rendered split has its
 * own suite in `Map.embedded.test.tsx`. Offline remains orthogonal to this test seam. */
vi.mock('../lib/map-config', () => ({
  mapPaneAvailable: () => false,
  mapColorScheme: () => 'LIGHT',
  mapTileUrls: () => ({
    world: '/map/world.pmtiles',
    detail: '/map/planet-20260813.pmtiles',
  }),
}));
vi.mock('../lib/useMapArchives', () => ({
  useMapArchives: ({ urls }: { urls: { world: string; detail: string } }) => ({
    urls,
    checked: true,
    status: 'ready',
    download: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock('../state/verbs', () => ({ useVerbs: () => verbs }));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../lib/outbox', () => ({
  useIsOffline: () => isOffline,
  // A place's notes are written inside one change group, behind their host (ADR-0152 §6b).
  withChangeGroup: (run: () => Promise<unknown>) => run(),
  // The event form's attach slot (ADR-0173 §5) reads the queued uploads; there is no
  // IndexedDB here, and a queued upload is not what this suite is about.
  usePendingUploads: () => [],
}));

/** The shared search core, stubbed so this suite can say what the PAID half has done —
 *  which is what decides whether the merged list is allowed to call itself empty. Its own
 *  behaviour (floor, debounce, dedup, 429) is tested in `lib/usePlaceSearch.test.ts`. */
const searchStub = {
  predictions: [] as { googlePlaceId: string; primaryText: string }[],
  loading: false,
  active: true,
  /** How the core was CONSTRUCTED, which is where the enrich lives (ADR-0134 §9): under a
   *  row errand the pick must adopt the found place onto the row you started from rather
   *  than mint a second one, and `enrichPlaceId` is the whole of that instruction. */
  options: undefined as { enrichPlaceId?: string } | undefined,
  pick: vi.fn(),
};
vi.mock('../lib/usePlaceSearch', () => ({
  usePlaceSearch: (options?: { enrichPlaceId?: string }) => (
    (searchStub.options = options),
    {
      query: '',
      setQuery: vi.fn(),
      predictions: searchStub.predictions,
      loading: searchStub.loading,
      rateLimited: false,
      failed: false,
      active: searchStub.active,
      alreadyInTrip: () => undefined,
      pick: searchStub.pick,
      saveNameOnly: vi.fn(),
      reset: vi.fn(),
    }
  ),
}));

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
import { relativeDayLabel } from '../lib/time';
import { DOT_SEPARATOR, FILTER_STAGGER_MS, PLACE_REFS_CAP } from '../constants';
import { t } from '../i18n/he';
import { buildHostContextIndex } from '../lib/host-context';

// jsdom implements no `scrollIntoView`, and the list-only path scrolls now: with no sheet it falls
// back to the document, so a selected card that opens below the fold is brought up here too.
Element.prototype.scrollIntoView = vi.fn();

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
    tripNotes = [];
    tripBookings = [];
    currentMode = 'trip';
    isOffline = false;
    geoFix = null;
    geoErrorCode = null;
    getCurrentPosition.mockClear();
    setActiveDate.mockClear();
    for (const fn of Object.values(verbs)) fn.mockClear();
    createNote.mockClear();
  });

  // ── A PLACE CARRIES NOTES (ADR-0153 §8's 2026-08-02 amendment) ───────────────
  // A place has no detail surface of its own, and the pin's menu holds verbs rather than
  // content (ADR-0157 §2), so the ROW is where its notes
  // are read and written — the mark in the meta line, the section on selection. Both day
  // scopes, because they are genuinely different renders on this tab.
  describe('a place carries notes (ADR-0153 §8)', () => {
    const markOf = (name: string) => row(name)?.querySelector('.note-mark') ?? null;
    const sectionOf = (name: string) => row(name)?.querySelector('.note-sec:not(.tsk-sec)') ?? null;

    for (const allDays of [false, true]) {
      const label = allDays ? 'all-days' : 'day';

      it(`marks only the rows that have notes, in ${label} scope`, () => {
        seed();
        tripNotes = [note('n1', 'food', 'הכניסה מאחור')];
        render(wrap(<MapView />));
        if (allDays) tapAllDays();

        expect(markOf('food')).toBeTruthy();
        expect(markOf('see')).toBeNull();
      });

      it(`reveals the section on the SELECTED row only, in ${label} scope`, () => {
        seed();
        tripNotes = [note('n1', 'food', 'הכניסה מאחור')];
        render(wrap(<MapView />));
        if (allDays) tapAllDays();
        expect(document.querySelector('.note-sec:not(.tsk-sec)')).toBeNull();

        fireEvent.click(row('food')!);
        expect(sectionOf('food')).toBeTruthy();
        expect(sectionOf('see')).toBeNull();
      });
    }

    // THE LAYOUT RULE, and the whole reason this row needed none of `EventCard`'s three
    // changes (ADR-0152 §6c): `.map-m` wraps, so the mark can be the item that wraps first —
    // which it can only be by being LAST. A crowded row must never lose a semantic tag to it.
    it('renders the mark last in the meta line, after every semantic tag', () => {
      seed();
      tripNotes = [note('n1', 'food', 'הכניסה מאחור')];
      render(wrap(<MapView />));

      const meta = row('food')!.querySelector('.map-m')!;
      expect(meta.lastElementChild?.classList.contains('note-mark')).toBe(true);
      expect(meta.querySelectorAll('.map-tag').length).toBeGreaterThan(0);
    });

    it('counts only THAT place’s notes', () => {
      seed();
      tripNotes = [
        note('n1', 'food', 'א'),
        note('n2', 'food', 'ב'),
        note('n3', 'see', 'ג'),
        note('n4', 'nowhere', 'ד'),
      ];
      render(wrap(<MapView />));

      expect(markOf('food')?.textContent).toContain('2');
      // A count only past 1: a `1` beside a glyph that already means "a note" says nothing.
      expect(markOf('see')?.textContent).toBe('');
      fireEvent.click(row('food')!);
      expect(sectionOf('food')!.querySelectorAll('.note-item')).toHaveLength(2);
    });

    // An idea with a place renders as a `PlaceRow` too, so it inherits all of this for free —
    // which is half of how ADR-0153 §8's idea gap was closed without a sixth surface.
    it('gives an idea’s row the same mark and section', () => {
      seed();
      tripNotes = [note('n1', 'idea', 'שווה לנסות')];
      render(wrap(<MapView />));

      expect(markOf('idea')).toBeTruthy();
      fireEvent.click(row('idea')!);
      expect(sectionOf('idea')).toBeTruthy();
    });

    // Facts, then what we know, then the verbs — `BookingDetail`'s order and the idea sheet's.
    // Content under a primary action is the one arrangement no surface here uses.
    it('puts the section between the meta line and the way-in block, with the foot last', () => {
      seed();
      tripNotes = [note('n1', 'food', 'הכניסה מאחור')];
      render(wrap(<MapView />));
      fireEvent.click(row('food')!);

      const kids = [...row('food')!.children].map((el) => el.className);
      const at = (cls: string) => kids.findIndex((c) => c.split(' ').includes(cls));
      // **The section lives inside `.map-cardwrote` since ADR-0191 §7** — the card's one
      // flexible track now holds BOTH sections, because tasks as a second pinned row put the
      // card at 411px against its own 420px cap. The ORDER this spec is about is unchanged.
      expect(at('map-cardwrote')).toBeGreaterThan(at('map-main'));
      expect(at('map-cardwrote')).toBeLessThan(at('map-refs'));
      expect(row('food')!.querySelector('.map-cardwrote .note-sec')).toBeTruthy();
      expect(at('map-refs-foot')).toBe(kids.length - 1);
    });
  });

  // ── A PLACE BECOMES AN EVENT OR A BOOKING (ADR-0135) ─────────────────────────
  // This file is the NO-BUILD-CONFIG path (graceful absence, list-only), so the block and its
  // footer must work with no split and no sheet at all. `Map.embedded.test.tsx` covers the
  // split. Both day scopes on purpose: they are genuinely different renders, and an ordering
  // bug that only showed in all-days once survived three sessions.
  describe('the way-in block gains one action (ADR-0135 §1)', () => {
    const foot = () => document.querySelector('.map-refs-foot');
    const scheduleBtn = () =>
      screen.queryByRole('button', { name: t.map.scheduleToDay }) as HTMLElement | null;
    const dialog = () => screen.queryByRole('dialog');

    for (const allDays of [false, true]) {
      const label = allDays ? 'all-days' : 'day';

      it(`appears only on the SELECTED row, in ${label} scope`, () => {
        seed();
        render(wrap(<MapView />));
        // `tapAllDays()`, not `allDaysOn()` — the latter READS the toggle and returns a
        // boolean, so `if (allDays) allDaysOn()` did nothing and this block's "both day
        // scopes on purpose" was one scope twice. Found while adding the day-scoped rule
        // below, which is the first behaviour here that differs BETWEEN the scopes.
        if (allDays) tapAllDays();
        // Nothing selected: no block, so no footer.
        expect(foot()).toBeNull();

        // `idea`, not `food`: `food` has an event on the ACTIVE date, and a place already
        // slotted on the day in scope no longer offers to be slotted again (ADR-0191 §7's
        // amendment). `idea` is on the shelf, which is the state this verb exists for.
        fireEvent.click(row('idea')!);
        expect(foot()).toBeTruthy();
        expect(scheduleBtn()).toBeTruthy();
      });

      it(`opens the form pre-filled with the place, in ${label} scope`, () => {
        seed();
        render(wrap(<MapView />));
        if (allDays) tapAllDays();
        fireEvent.click(row('idea')!);
        fireEvent.click(scheduleBtn()!);

        // The form is a Modal over the map, on the map's own tab (§3) — no navigation.
        expect(dialog()).toBeTruthy();
        // Pre-filled: the place field shows the place you were standing on.
        expect(document.querySelector('.pp-trigger.filled')?.textContent).toContain('idea');
      });
    }

    // §5 — THE REPRODUCTION. Exactly one idea is consumed through the path that already
    // consumes it; two or more and nothing is, because two ideas on one place are two
    // intentions. This must fail if the consume is relaxed to "any idea".
    describe('the originating idea (§5)', () => {
      const openOn = (name: string) => {
        render(wrap(<MapView />));
        // `tapAllDays()`, not `allDaysOn()` — the third call site that used the READ where
        // the action was meant. It matters here now: day-scoped, a place already slotted on
        // the day in scope has no `שיבוץ ליום` to click.
        tapAllDays();
        fireEvent.click(row(name)!);
        fireEvent.click(scheduleBtn()!);
      };
      const saveForm = () => {
        // By the label: the form opens on a place here, so its title placeholder is that
        // place's name — the derived title the save would write (field report #37).
        fireEvent.change(screen.getByRole('textbox', { name: t.eventForm.titleLabel }), {
          target: { value: 'ארוחה' },
        });
        fireEvent.click(screen.getByText(t.eventForm.save));
      };

      it('with exactly ONE idea, the save consumes it', () => {
        seed();
        openOn('idea');
        saveForm();
        expect(verbs.schedule).toHaveBeenCalledTimes(1);
        expect(verbs.schedule.mock.calls[0][0]).toMatchObject({ id: 'idea' });
        expect(verbs.create).not.toHaveBeenCalled();
      });

      it('with TWO ideas, it creates fresh and consumes NOTHING', () => {
        seed();
        tripMaybes = [
          maybe({ id: 'idea', placeId: 'idea', category: 'food' }),
          // A second intention on the same place ("drinks there" beside "a meal there").
          maybe({ id: 'idea2', placeId: 'idea', category: 'food' }),
        ];
        openOn('idea');
        saveForm();
        expect(verbs.schedule).not.toHaveBeenCalled();
        expect(verbs.create).toHaveBeenCalledTimes(1);
      });

      it('with no idea at all, it creates fresh', () => {
        seed();
        openOn('food');
        saveForm();
        expect(verbs.schedule).not.toHaveBeenCalled();
        expect(verbs.create).toHaveBeenCalledTimes(1);
      });
    });
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
    expect(screen.getByRole('button', { name: t.placePicker.empty })).toBeTruthy();
  });

  // ADR-0134 §9: `＋ מיקום` used to open `PlacePickerSheet` — a second search surface over
  // the map, on the tab that already is one. It is an errand now, started in place because
  // the tab is already the destination.
  describe('＋ מיקום is an errand on this tab (ADR-0134 §9)', () => {
    const startEnrich = () =>
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.empty }));

    it('starts errand mode named after the row, and opens the query field', () => {
      seed();
      render(wrap(<MapView />));
      startEnrich();
      // No sheet — the retirement is the assertion, not a detail of it.
      expect(screen.queryByText(t.placePicker.title)).toBeNull();
      expect(screen.getByText(t.map.errand.title('lite'))).toBeTruthy();
      expect(document.querySelector('.map-querystrip')).toBeTruthy();
    });

    it('only GOOGLE can answer it: our own rows keep their ordinary grammar', () => {
      seed();
      render(wrap(<MapView />));
      startEnrich();
      // A form errand puts `בחירה` on every trip row — a bare-text button, where a Google
      // result's is aria-labelled `בחירת <name>`, so this query is our rows only. This
      // errand must not: the coordless row is already in this list, and a second row of
      // ours cannot say where it is.
      expect(screen.queryByRole('button', { name: t.map.errand.choose })).toBeNull();
    });

    it('a pick ENRICHES the row it started from, rather than minting a second place', async () => {
      seed();
      searchStub.predictions = [{ googlePlaceId: 'g-1', primaryText: 'Kissa' }];
      searchStub.pick.mockResolvedValue({ id: 'lite' });
      render(wrap(<MapView />));
      expect(searchStub.options?.enrichPlaceId).toBeUndefined();
      startEnrich();
      // The instruction is carried by the CORE, not by the add: `usePlaceSearch` resolves
      // with `enrichPlaceId`, so the found place lands on the row your booking already
      // references instead of beside it (ADR-0110 §1).
      expect(searchStub.options?.enrichPlaceId).toBe('lite');
      // Google's half only renders under a live query, and under an errand its verb is
      // `בחירה` rather than `＋ אולי` — the choice replaces the shelving (ADR-0134 §3).
      fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
        target: { value: 'kissa' },
      });
      fireEvent.click(screen.getByRole('button', { name: t.map.errand.chooseAria('Kissa') }));
      await waitFor(() => expect(searchStub.pick).toHaveBeenCalled());
      // And the errand ends here — no navigation, and the banner is gone because the row
      // it named has its answer.
      await waitFor(() => expect(screen.queryByText(t.map.errand.title('lite'))).toBeNull());
      searchStub.predictions = [];
    });

    it('ביטול puts the tab back, and does not navigate off it', () => {
      seed();
      render(wrap(<MapView />));
      startEnrich();
      fireEvent.click(screen.getByRole('button', { name: t.map.errand.cancel }));
      expect(screen.queryByText(t.map.errand.title('lite'))).toBeNull();
      // The row is still there to try again on — a local errand has nothing to return to,
      // so cancelling is not a return.
      expect(screen.getByRole('button', { name: t.placePicker.empty })).toBeTruthy();
    });
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
    const maybesCount = () => maybesChip().querySelector('.wp-chip-count')?.textContent;
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

    // **Both stored strings on the row sniff their own direction** (ADR-0118). The name and
    // the meta are the two slots that hold Google's words rather than ours, and an address
    // opening with a numeral run reordered in the RTL flow — `2-14-5 Kabukicho, Shinjuku,
    // Tokyo` read as `Kabukicho, Shinjuku, Tokyo 2-14-5`. A numeral-led NAME is the same
    // defect, which is why the fixture uses one.
    it('lets the name and the address say which way they read', () => {
      tripPlaces = [
        {
          ...place('store', true),
          name: '7-Eleven Shinjuku',
          address: '2-14-5 Kabukicho, Shinjuku, Tokyo',
        } as Place,
      ];
      tripMaybes = [maybe({ id: 'm', placeId: 'store' })];
      render(wrap(<MapView />));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.allDays) }));
      const row = [...document.querySelectorAll('.place')].find(
        (r) => r.querySelector('.map-name')?.textContent === '7-Eleven Shinjuku',
      )!;
      expect(row.querySelector('.map-name')?.getAttribute('dir')).toBe('auto');
      const address = [...row.querySelectorAll('.map-tag')].find(
        (tag) => tag.textContent === '2-14-5 Kabukicho, Shinjuku, Tokyo',
      );
      expect(address?.getAttribute('dir')).toBe('auto');
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

    // §6 defined the number as the index in THE DAY's sequence, so all-days it had
    // nothing to index: it sequenced the whole trip and a pin read `27`. Renumbering
    // per day would put two pins both reading `1` on one canvas with nothing saying
    // which day either is — so the number goes, on the row and the pin together
    // (they read one map), and the day is stated in words where it was ambiguous.
    it('all-days: nobody is numbered, and the row names its day instead', () => {
      seedDay();
      render(wrap(<MapView />));
      tapAllDays();
      for (const name of ['breakfast', 'museum', 'dinner', 'tomorrow', 'someday']) {
        expect(orderOf(name)).toBeNull();
      }
      expect(row('tomorrow')?.querySelector('.map-tag.time')?.textContent).toContain('מחר');
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

      // The other scope, where the invariant holds for a different reason: there is
      // no number to renumber, and the facet is still doing its job.
      tapAllDays();
      expect(orderOf('breakfast')).toBeNull();
      expect(orderOf('dinner')).toBeNull();
      expect(filteredOut('museum')).toBe(true);
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

    // **Rewritten, not relaxed, by ADR-0171 §10b.** This asserted that a check-in day is
    // NUMBERED, on the reasoning that the number was the one thing separating an edge day
    // from an ambient middle night. The number is now exactly what a floor may not claim —
    // a stop number is the index of a moment the app KNOWS, and "from 15:00" is any hour
    // after it — so the assertion inverts.
    //
    // The distinction it was protecting survives, and on firmer ground than a digit: the
    // edge day still passes `hasScheduleSlot` (it has an event and a real edge), so its
    // tier is `upcoming` rather than `ambient`, and its row still carries the check-in
    // word that a middle night has none of.
    it('a check-in day is an ordinary row, and takes NO number — a floor names no moment', () => {
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
      expect(orderOf('hotel')).toBeNull();
      // …and the word is what says which edge it is, which is what the number never did.
      expect(hotel.textContent).toContain(t.glance.transition.checkIn);
    });
  });

  // Reported from the field (#21): the canvas faded a place once the clock had passed
  // it, the list only once a HUMAN had skipped it — so the two halves of the split made
  // different claims about the same place. The row now reads the block, which is the
  // same `isDayUsagePast` the header and `מה נשאר` read (ADR-0124). The paint is CSS
  // and a human pass; what the suite holds down is which rows carry the class.
  describe('a place behind you fades in the list too (#21)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const at = (hhmm: string) => `${ACTIVE_DATE}T${hhmm}:00Z`;
    // Two PLACES, not two events on one: references on the same date merge into one
    // day, so a behind/ahead fixture needs two places to have two answers.
    const seedPassed = () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('morning', true), place('evening', true)];
      tripEvents = [
        event({ id: 'e1', placeId: 'morning', category: 'food', startsAt: at('09:00') }),
        event({ id: 'e2', placeId: 'evening', category: 'food', startsAt: at('20:00') }),
      ];
    };

    // Both scopes: they resolve a place's day differently (this day, or the day it is
    // live on), so one of them passing says nothing about the other.
    it('the passed stop carries it and the one still ahead does not, in either scope', () => {
      seedPassed();
      render(wrap(<MapView />));
      expect(row('morning')!.className).toContain('behind');
      expect(row('evening')!.className).not.toContain('behind');

      tapAllDays();
      expect(row('morning')!.className).toContain('behind');
      expect(row('evening')!.className).not.toContain('behind');
    });

    // The trap this class exists to avoid (ADR-0109's 2026-07-27 amendment): the fade
    // session 137 took OFF the ambient tier, because the hotel you are sleeping in
    // tonight read as finished. Keyed on the clock, it must not come back.
    it('the night you are sleeping in is not behind you, in either scope', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('hotel', true)];
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
      ];
      render(wrap(<MapView />));
      expect(row('hotel')!.className).toContain('ambient');
      expect(row('hotel')!.className).not.toContain('behind');
      tapAllDays();
      expect(row('hotel')!.className).not.toContain('behind');
    });

    // A human outranks the clock (ADR-0117 §2), so tonight's dinner marked היינו at
    // noon is behind you now — and the row said nothing about that before, since the
    // old fade only ever fired on `skipped`.
    it('a place marked היינו before its time fades, without claiming it was skipped', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('dinner', true)];
      tripEvents = [
        event({
          id: 'd',
          placeId: 'dinner',
          category: 'food',
          status: EVENT_STATUS.DONE,
          startsAt: at('20:00'),
        }),
      ];
      render(wrap(<MapView />));
      expect(row('dinner')!.className).toContain('behind');
      expect(row('dinner')!.className).not.toContain('skipped');
      expect(row('dinner')!.textContent).toContain(t.event.didThis);
    });

    // The two claims coincide here and are still not the same claim: the clock passed
    // it AND a human said it did not happen. Both classes land, and the CSS gives such
    // a row the skipped treatment alone rather than a second fade on top of it.
    it('a skipped place carries both, since a skip is also behind you', () => {
      setSimulatedNow(NOON);
      tripPlaces = [place('bailed', true)];
      tripEvents = [
        event({
          id: 'b',
          placeId: 'bailed',
          category: 'food',
          status: EVENT_STATUS.SKIPPED,
          startsAt: at('10:00'),
        }),
      ];
      render(wrap(<MapView />));
      expect(row('bailed')!.className).toContain('behind');
      expect(row('bailed')!.className).toContain('skipped');
    });
  });

  // §8 promises ONE entry per in-scope reference, and a booking-linked event is one
  // reference (amended 2026-08-05): drawing it twice put the same label on two rows told
  // apart only by the leading word. The entry goes to what HOLDS the detail — the booking
  // — and the event's half stays on the row as its clock and its settle pair.
  describe('the way in: one entry per reference (§8)', () => {
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

    it('day scope: a linked pair is ONE entry, named for the booking that holds the detail', () => {
      seedLinked();
      render(wrap(<MapView />));
      fireEvent.click(row('granbell')!);
      expect(refKinds()).toEqual([t.map.refs.booking]);
      // The event's half did not go with its row: the settle pair still hangs here.
      expect(row('granbell')!.querySelector('.map-ref .wp-settle')).toBeTruthy();
    });

    it('all-days: the same one entry — the scope changes which refs are in, not how they resolve', () => {
      seedLinked();
      render(wrap(<MapView />));
      tapAllDays();
      fireEvent.click(row('granbell')!);
      expect(refKinds()).toEqual([t.map.refs.booking]);
      // …and all-days it names its day, which a scoped block leaves to the strip.
      expect(row('granbell')!.querySelector('.map-ref-meta')!.textContent).toContain(
        relativeDayLabel(ACTIVE_DATE, ACTIVE_DATE),
      );
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

  // A hub place carries a reference per leg, and all-days puts every one of them in one
  // block — which is how six rows landed between the notes and the row's primary action.
  describe('the way in: the fold (§8, PLACE_REFS_CAP)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    /** `n` references on one place, an hour apart and all still AHEAD of `NOON` — so
     *  nothing is an open question and the cap is the only thing deciding. */
    const seedHub = (n: number, opts: { date?: string; fromHour?: number } = {}) => {
      tripPlaces = [place('hub', true)];
      tripEvents = Array.from({ length: n }, (_, i) => {
        const date = opts.date ?? ACTIVE_DATE;
        return event({
          id: `leg${i}`,
          placeId: 'hub',
          title: `leg ${i}`,
          date,
          startsAt: `${date}T${String((opts.fromHour ?? 14) + i).padStart(2, '0')}:00:00Z`,
        });
      });
    };
    const visibleRefs = () =>
      [...row('hub')!.querySelectorAll('.map-reflist > .wp-reveal')].filter(
        (r) => !r.classList.contains('hidden'),
      ).length;

    it('shows the cap and names how many it folded — and no control at all under it', () => {
      setSimulatedNow(NOON);
      seedHub(PLACE_REFS_CAP + 2);
      render(wrap(<MapView />));
      fireEvent.click(row('hub')!);
      expect(visibleRefs()).toBe(PLACE_REFS_CAP);
      const more = screen.getByRole('button', { name: t.map.refs.more(2) });

      // Opening it reveals the rest IN PLACE — a folded row is hidden, never dropped
      // (ADR-0120), which is what the count above is counting.
      fireEvent.click(more);
      expect(visibleRefs()).toBe(PLACE_REFS_CAP + 2);
      expect(screen.getByRole('button', { name: t.map.refs.less })).toBeTruthy();
    });

    it('a block at the cap gets no fold control', () => {
      setSimulatedNow(NOON);
      seedHub(PLACE_REFS_CAP);
      render(wrap(<MapView />));
      fireEvent.click(row('hub')!);
      expect(row('hub')!.querySelector('.map-ref-more')).toBeNull();
    });

    it('an open question is never folded, whatever its rank', () => {
      setSimulatedNow(NOON);
      // Four legs on a day that has PASSED with nothing said about them, so all four rank
      // ahead of anything else — which puts the fourth one beyond the cap. Plus two still
      // ahead of now, which is what makes the cap bite at all.
      seedHub(PLACE_REFS_CAP + 1, { date: '2026-07-19', fromHour: 6 });
      tripEvents = [
        ...tripEvents,
        ...Array.from({ length: 2 }, (_, i) =>
          event({
            id: `ahead${i}`,
            placeId: 'hub',
            title: `ahead ${i}`,
            startsAt: `${ACTIVE_DATE}T${14 + i}:00:00Z`,
          }),
        ),
      ];
      render(wrap(<MapView />));
      tapAllDays(); // the open questions are on another day
      fireEvent.click(row('hub')!);
      const asking = [...row('hub')!.querySelectorAll('.map-ref.asking')];
      expect(asking).toHaveLength(PLACE_REFS_CAP + 1);
      // Every one of them survives the fold — kept ON TOP of the cap, not instead of it.
      asking.forEach((ref) =>
        expect(ref.closest('.wp-reveal')!.classList.contains('hidden')).toBe(false),
      );
      expect(visibleRefs()).toBe(PLACE_REFS_CAP + 1);
    });
  });

  // ADR-0131: the query is a CONTROL in the canvas's own row, not a full-screen overlay.
  // Only the wiring is asserted here — the research surface's own behaviour lives in
  // PlaceResearch.test.tsx, and the canvas half is `Map.embedded.test.tsx`'s.
  //
  // NOTE ON THIS FILE: it runs with NO build config, which is the list-only path
  // (ADR-0122 §8) — the row renders `position: static` above the list, `full`/`map` do not
  // exist, and the count's button has no stop to raise. That is deliberate coverage, so
  // the split's own behaviour is asserted in the embedded suite instead.
  describe('the query takes the controls row (ADR-0131 §1/§7/§8)', () => {
    const NOON = Date.parse(`${ACTIVE_DATE}T12:00:00Z`);
    const openSearch = () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.search.button) }));
    };
    const type = (value: string) => {
      fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
        target: { value },
      });
    };

    it('there is no full-screen overlay any more — the field is in the row', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch();
      // The primitive is unchanged and keeps the Index; this tab simply stopped using it.
      expect(document.querySelector('.search-overlay')).toBeNull();
      expect(document.querySelector('.map-controls .map-querystrip')).toBeTruthy();
    });

    it('ONE slot: each occupant covers the row, so the other way in is not even there', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      // Facets open: the strip covers the row IN PLACE (ADR-0122 §2), so the search
      // button is not merely inert — it is absent, which is what makes "both open at
      // once" unreachable by construction rather than by a guard.
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.filter.open) }));
      expect(document.querySelector('.map-facetstrip')).toBeTruthy();
      expect(screen.queryByRole('button', { name: new RegExp(t.map.search.button) })).toBeNull();
      // And the same in the other direction, through the one shared close control.
      fireEvent.click(screen.getByRole('button', { name: t.map.filter.close }));
      openSearch();
      expect(document.querySelector('.map-querystrip')).toBeTruthy();
      expect(document.querySelector('.map-facetstrip')).toBeNull();
      expect(screen.queryByRole('button', { name: new RegExp(t.map.filter.open) })).toBeNull();
    });

    it('ONE list narrows in place: matches reveal, the rest collapse (ADR-0120)', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch();
      type('food');
      // One list, not a second copy in an overlay — which is what the old two-array
      // shape produced and why the query could live on a surface that hid the canvas.
      expect(screen.getAllByText('food')).toHaveLength(1);
      const row = (name: string) =>
        [...document.querySelectorAll('.map-list .wp-reveal')].find(
          (r) => r.querySelector('.map-name')?.textContent === name,
        );
      expect(row('food')?.classList.contains('hidden')).toBe(false);
      expect(row('see')?.classList.contains('hidden')).toBe(true);
    });

    // The defect session 144 found and left, fixed 2026-07-29. It is written as the
    // reproduction rather than as the fix, because the owner checked it on a device and
    // read it as already fixed: the place CARD names an out-of-scope day (`forceDay`) and
    // always did. These assertions are the LIST, which is the half that was wrong.
    describe('a query widens the list, so a row states its own day (ADR-0109 §1)', () => {
      // `see` is an event on the 21st while the strip is on the 20th; `idea` is a maybe
      // with no day at all. Under a query the first must not be filed with the second.
      const shownRows = () =>
        [...document.querySelectorAll('.map-list .wp-reveal')]
          .filter((w) => !w.classList.contains('hidden'))
          .map((w) => ({
            name: w.querySelector('.map-name')?.textContent,
            meta: w.querySelector('.map-m')?.textContent ?? null,
          }));

      it('a hit from another day says WHICH day, instead of saying nothing', () => {
        setSimulatedNow(NOON);
        seed();
        render(wrap(<MapView />));
        openSearch();
        type('see');
        // Day-scoped this row would resolve no day at all: no day, no time, no meta.
        const meta = row('see')?.querySelector('.map-m')?.textContent ?? '';
        expect(withoutBidiControls(meta)).toContain(relativeDayLabel('2026-07-21', ACTIVE_DATE));
      });

      it('…and is not filed under ללא יום beside a genuinely dateless idea', () => {
        setSimulatedNow(NOON);
        seed();
        render(wrap(<MapView />));
        openSearch();
        // Matches `see` (tomorrow), `idea` (no day) and `lite` (today), so the list has
        // to tell two blocks apart — which is the whole assertion.
        type('e');
        const shown = shownRows();
        expect(shown.map((r) => r.name)).toContain('see');
        // The header a row lands under is the one the comparator put it in, so asserting
        // the ORDER is asserting the block: `ללא יום` sorts between ahead and behind, and
        // a mis-scoped `see` used to sit inside it rather than ahead of it.
        expect(shown.findIndex((r) => r.name === 'see')).toBeLessThan(
          shown.findIndex((r) => r.name === 'idea'),
        );
        expect(screen.getByText(t.map.blockHeader.dayless)).toBeTruthy();
      });

      it('closing the query hands the day scope back', () => {
        setSimulatedNow(NOON);
        seed();
        render(wrap(<MapView />));
        openSearch();
        type('e');
        fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
        // `lite` is today's, so day-scoped it says its time and NOT its day — the strip
        // above it already names the day, and `היום ·` on every row is the noise the
        // all-days rule exists to avoid.
        const meta = row('lite')?.querySelector('.map-m')?.textContent ?? '';
        expect(withoutBidiControls(meta)).not.toContain(relativeDayLabel(ACTIVE_DATE, ACTIVE_DATE));
      });
    });

    it('closing CLEARS the query, so no filter can be on without being visible', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch();
      // A query that matches something ELSE, so `food` is hidden by the query alone —
      // which is what makes the assertion after the close mean something. It has to
      // match something: at zero matches `listBody` swaps the whole list for an empty
      // state, so the rows unmount and there is nothing left to be hidden in place.
      type('see');
      expect(filteredOut('food')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
      expect(document.querySelector('.map-querystrip')).toBeNull();
      // ADR-0119's rule: the row is back at rest and nothing is still filtering.
      expect(filteredOut('food')).toBe(false);
    });

    it('the paid half is in the sheet and needs no arm — in BOTH modes (§8/§8a)', () => {
      for (const mode of ['trip', 'plan'] as const) {
        setSimulatedNow(NOON);
        currentMode = mode;
        seed();
        render(wrap(<MapView />));
        openSearch();
        type('food');
        // The regression net for §8 (no mode gate) and §8a (no arm): the paid half renders
        // with nothing to tap to get it. ONE LIST since session 164, so what proves the
        // half is there is its own footer rather than a group header — the two corpus
        // headers are gone by owner's call, and their absence is asserted below.
        expect(screen.getByText(t.placePicker.costFooter)).toBeTruthy();
        expect(document.querySelector('.map-arm')).toBeNull();
        expect(screen.queryByText(t.map.research.tripGroup)).toBeNull();
        expect(screen.queryByText(t.map.research.googleGroup)).toBeNull();
        cleanup();
      }
      currentMode = 'trip';
    });

    // EMPTINESS IS A FACT ABOUT THE MERGED LIST (owner, session 164). The two halves used
    // to answer for themselves, and the result was a screenshot with `לא נמצאו מקומות` in
    // bold above three Google results. A list cannot say "nothing" and then show
    // something.
    it('a query neither half can answer says so, once, and blames nothing', () => {
      setSimulatedNow(NOON);
      seed();
      render(wrap(<MapView />));
      openSearch();
      type('nothing matches this');
      expect(screen.getByText(t.map.search.noResultsTitle)).toBeTruthy();
      // Not the facet empty state (a query ignores them) and not the empty-day one
      // (a query already spans the trip), so neither action is offered.
      expect(screen.queryByText(t.map.filter.clear)).toBeNull();
      expect(screen.queryByText(t.map.emptyDay.action)).toBeNull();
    });

    it('says nothing while the paid half is still working', () => {
      setSimulatedNow(NOON);
      searchStub.loading = true;
      seed();
      render(wrap(<MapView />));
      openSearch();
      type('nothing matches this');
      // The skeletons are the answer; "no results" would be a claim we cannot make yet.
      expect(screen.queryByText(t.map.search.noResultsTitle)).toBeNull();
      expect(document.querySelector('.map-res-skel')).toBeTruthy();
      searchStub.loading = false;
    });

    it('never says "no results" while Google has some — the defect that merged the list', () => {
      setSimulatedNow(NOON);
      searchStub.predictions = [{ googlePlaceId: 'g-1', primaryText: 'Blue Bottle' }];
      seed();
      render(wrap(<MapView />));
      openSearch();
      type('nothing the trip has');
      expect(screen.queryByText(t.map.search.noResultsTitle)).toBeNull();
      expect(screen.getByText('Blue Bottle')).toBeTruthy();
      searchStub.predictions = [];
    });
  });
  // ── DELETING A PLACE (ADR-0157) ──────────────────────────────────────────────────────────
  // The list half. `Map.embedded.test.tsx` covers the canvas half (the long press and its
  // menu); what belongs here is the affordance every path shares — the trash a selected row
  // reveals, the confirm it opens, and the sentence that confirm has to say. Both day scopes,
  // as every day-scoped surface in this suite is asserted.
  describe('a place can be removed from the trip (ADR-0157)', () => {
    const dialog = () => screen.queryByRole('dialog');
    const trash = () =>
      screen.queryByRole('button', { name: t.map.del.aria('food') }) as HTMLElement | null;

    for (const allDays of [false, true]) {
      const label = allDays ? 'all-days' : 'day';

      it(`the trash appears only on the SELECTED row, in ${label} scope`, () => {
        seed();
        render(wrap(<MapView />));
        if (allDays) allDaysOn();
        expect(trash()).toBeNull();

        fireEvent.click(row('food')!);
        expect(trash()).toBeTruthy();
      });
    }

    it('the trash opens a confirm and deletes nothing on its own', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('food')!);
      fireEvent.click(trash()!);

      expect(dialog()).toBeTruthy();
      expect(screen.getByText(t.map.del.title)).toBeTruthy();
      expect(verbs.removePlace).not.toHaveBeenCalled();
    });

    it('confirming removes the place, cancelling does not', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('food')!);
      fireEvent.click(trash()!);
      fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
      expect(verbs.removePlace).not.toHaveBeenCalled();

      // Cancelling leaves the row SELECTED, so the trash is still there — and tapping the
      // row again would now close it rather than re-open it (ADR-0168 §4).
      fireEvent.click(trash()!);
      fireEvent.click(screen.getByRole('button', { name: t.map.del.confirm }));
      expect(verbs.removePlace).toHaveBeenCalledWith(expect.objectContaining({ id: 'food' }));
    });

    // The half no undo can be honest without: a `SetNull` and a `Cascade` write no `Change`
    // rows, so this dialog is the only moment either can be learned (ADR-0152 §2's rule, on
    // the fifth host). One event points at `food`, and one note is written on it.
    it('names what the delete costs: the rows that lose their location, and the notes', () => {
      seed();
      tripNotes = [note('n1', 'food', 'הכניסה מאחור')];
      render(wrap(<MapView />));
      fireEvent.click(row('food')!);
      fireEvent.click(trash()!);

      // NAMED, not counted as "items" (ADR-0157 §8): `food` is referenced by one event, so
      // the line says which event — a reader cannot act on `פריט`.
      const consequence = document.querySelector('.confirm-consequence')!.textContent ?? '';
      expect(consequence).toContain(t.map.del.refs([{ kind: 'event', label: 'food plan' }]));
      expect(consequence).toContain(t.notes.hostDelete(1));
    });

    // The report both rules came from: a place added and immediately deleted warned about
    // "one item", and the item was the shelf idea the ADD ITSELF created (`landPlace`). The
    // fixture's `idea` place is exactly that shape — one live idea and nothing else — so it
    // is now the §9 case: the idea goes WITH the place, and the line says so instead of
    // promising it will survive without a location.
    it('says the sole shelf idea is deleted, not that it survives', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('idea')!);
      fireEvent.click(screen.getByRole('button', { name: t.map.del.aria('idea') }));

      const consequence = document.querySelector('.confirm-consequence')!.textContent ?? '';
      expect(consequence).toContain(t.map.del.idea);
      expect(consequence).not.toContain('בלי מיקום');
    });

    // It says only what applies. A place with no notes gets the location clause and no
    // second one — `hostDelete` naming zero notes would be a warning about nothing.
    it('leaves the note clause out when the place carries none', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('idea')!);
      fireEvent.click(screen.getByRole('button', { name: t.map.del.aria('idea') }));

      const consequence = document.querySelector('.confirm-consequence')!.textContent ?? '';
      expect(consequence).toContain(t.map.del.idea);
      expect(consequence).not.toContain(t.notes.hostDelete(0));
      expect(consequence).not.toContain(DOT_SEPARATOR);
    });

    // ADR-0134 §3's rule, which this verb joins: while the tab is answering one question the
    // verbs CHANGE rather than accumulate — the same reason `נווט` and the schedule verb go.
    it('is absent while a place errand is live', () => {
      seed();
      render(wrap(<MapView />));
      // The coordless row's `＋ מיקום` starts a row errand without leaving the tab.
      fireEvent.click(row('lite')!.querySelector('.pp-addbtn') as HTMLElement);
      fireEvent.click(row('food')!);
      expect(trash()).toBeNull();
    });
  });
});
