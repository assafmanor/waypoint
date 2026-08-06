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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type DeliveredEnrichmentFields,
  type DeliveredImageValue,
  type MaybeItem,
  type Note,
  type Place,
  type TripEvent,
} from '@waypoint/shared';

// jsdom has no layout engine, so it doesn't implement scrollIntoView — the sheet's
// "bring the selected row into view" is a real call worth asserting the shape of.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;
/** **How the screen brings a row into view** (ADR-0135 §8's alignment + ADR-0168 §3's
 *  animation): the card's TOP, and eased. The easing is the half the owner reported missing —
 *  the offset was already right, so an instant arrival just left the list somewhere else the
 *  next frame with nothing saying a row had been fetched for you. Named once here so the
 *  assertions below stay about WHICH row, and see `reduced motion` for the other branch. */
const BROUGHT_INTO_VIEW = { block: 'start', behavior: 'smooth' };
/** The screen defers the scroll one frame, so the sheet's new height is committed
 *  before the row is centred against it. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

const ACTIVE_DATE = '2026-07-20';
const NEXT_DAY = '2026-07-21';
const PREV_DAY = '2026-07-19';
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

const maybe = (p: Partial<MaybeItem> & Pick<MaybeItem, 'id'>): MaybeItem =>
  ({ tripId: 't1', title: p.id, consumed: false, ...p }) as MaybeItem;

let tripEvents: TripEvent[] = [];
let tripMaybes: MaybeItem[] = [];
let tripPlaces: Place[] = [];
let tripNotes: Note[] = [];
const createNote = vi.fn(() => Promise.resolve(undefined));
let tripBookings: Booking[] = [];
let tripEnrichments: Record<string, DeliveredEnrichmentFields> = {};
let currentMode = 'trip';
let isOffline = false;

// The index write layer, stubbed at module scope so it is BOTH assertable and stable: the
// inline `vi.fn()`s this replaced were re-created on every `useTrip()` call, which is a fresh
// identity per render on a screen that re-renders every second.
const indexVerbs = {
  createPlace: vi.fn<(input: { name: string }) => Promise<string>>(),
  updatePlace: vi.fn<(placeId: string, input: unknown) => Promise<void>>(),
  resolvePlace: vi.fn(),
};
const updatePlace = indexVerbs.updatePlace;

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
    // What the world knows about these places (ADR-0166 §6). Mutable, because whether a row's
    // badge frames a photo is one of the things this screen decides.
    enrichments: tripEnrichments,
    indexVerbs,
    // A place is the fifth note host (ADR-0153 §8's amendment): the row carries the mark, the
    // selected row carries the section, and the make/rename form carries the composer.
    notes: tripNotes,
    users: [{ id: 'u1', displayName: 'דנה' }],
    noteVerbs: { createNote },
  }),
}));
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: currentMode }) }));
const addMaybe = vi.fn();
// The Map hosts `EventForm` since ADR-0135 §3, so the stub covers the verbs that form calls.
// `done`/`skip`/`restore` are the SHIPPED verbs the settle cluster calls (ADR-0139). This
// file stubs the verb layer rather than the reducer, so the assertable seam is "the right
// verb was called with the right event" — the write's own behaviour (optimistic dispatch,
// outbox queueing, the undo toast) is `verbs`' to test, and is already tested there.
const verbs = {
  addMaybe,
  // The three create verbs RESOLVE to their host (ADR-0152 §6b) — the form queues notes
  // behind them, so a stub returning `undefined` throws where the real one hands back an id.
  create: vi.fn((_event: Record<string, unknown>) => Promise.resolve()),
  update: vi.fn(),
  schedule: vi.fn((_m: Record<string, unknown>, _fields?: Record<string, unknown>) =>
    Promise.resolve({ id: 'ev-scheduled' }),
  ),
  book: vi.fn((_input: Record<string, unknown>, _opts?: Record<string, unknown>) =>
    Promise.resolve({ id: 'bk-new' }),
  ),
  done: vi.fn(),
  skip: vi.fn(),
  restore: vi.fn(),
  removePlace: vi.fn(),
};
vi.mock('../state/verbs', () => ({ useVerbs: () => verbs }));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
vi.mock('../lib/outbox', () => ({
  useIsOffline: () => isOffline,
  withChangeGroup: (run: () => Promise<unknown>) => run(),
}));

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
/** The shared search core, stubbed: its own behaviour (floor, pause debounce, session
 *  token, dedup, 429) is tested in `lib/usePlaceSearch.test.ts`, and what this suite owns
 *  is what the SCREEN does with results — feeds the query, draws the rings, adds. */
const searchStub = {
  setQuery: vi.fn(),
  pick: vi.fn(),
  reset: vi.fn(),
  predictions: [] as {
    googlePlaceId: string;
    primaryText: string;
    secondaryText?: string;
    lat?: number;
    lng?: number;
  }[],
  referenced: {} as Record<string, { id: string }>,
  corpus: '' as string,
};
vi.mock('../lib/usePlaceSearch', () => ({
  usePlaceSearch: (opts: { corpus?: string } = {}) => {
    searchStub.corpus = opts.corpus ?? '';
    return {
      query: '',
      setQuery: searchStub.setQuery,
      predictions: searchStub.predictions,
      loading: false,
      rateLimited: false,
      failed: false,
      active: true,
      alreadyInTrip: (p: { googlePlaceId: string }) => searchStub.referenced[p.googlePlaceId],
      pick: searchStub.pick,
      saveNameOnly: vi.fn(),
      reset: searchStub.reset,
    };
  },
}));

/** **The deciding surface's one read** (ADR-0166 §17). The route's own behaviour is the backend's
 *  spec; what belongs here is which tap asks, with what, and which row shows the answer. The rest
 *  of `lib/api` stays real — this screen reaches it only through the verbs, which are stubbed. */
const lookupEnrichment = vi.fn().mockResolvedValue({});
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lookupEnrichment: (...args: unknown[]) => lookupEnrichment(...args),
}));

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
    const pins = props.pins as {
      placeId: string;
      tier: string;
      order?: number;
      aside?: boolean;
      nextStop?: boolean;
      nowStop?: boolean;
      selected?: boolean;
      match?: boolean;
      outcome?: 'done' | 'skipped';
      transition?: string;
    }[];
    const arrivalProp = props.arrival as {
      at: { lat: number; lng: number };
      frame: boolean;
    } | null;
    return (
      <div data-pane>
        {/* The canvas background: tapping it clears the selection (ADR-0122 §7). The real
            one is the map div's own click, guarded against pin taps inside `MapPane`. */}
        <button data-canvas onClick={() => (props.onCanvasTap as () => void)()}>
          canvas
        </button>
        {/* THE TWO MAKE-A-PLACE GESTURES (ADR-0147). The recogniser itself is
            `lib/canvas-gestures.test.ts`'s and the projection round trip is
            `useMapCamera`'s; what the SCREEN owns is what each gesture opens, so the stub
            exposes them as the two taps that call the callbacks with a point.

            THE HOLD NOW REPORTS WHAT IT LANDED ON (ADR-0157 §2), so there are two buttons
            for the one gesture: on blank canvas it makes a place, on a pin it opens that
            place's menu. Which is which is the second argument, exactly as `MapPane`
            resolves it from `data-pin` in the real pane. */}
        <button
          data-hold
          onClick={() =>
            (props.onHold as (at: { lat: number; lng: number }, placeId?: string) => void)(HELD_AT)
          }
        >
          hold
        </button>
        <button
          data-holdpin
          onClick={() =>
            (props.onHold as (at: { lat: number; lng: number }, placeId?: string) => void)(
              HELD_AT,
              (props.pins as { placeId: string }[])[0]?.placeId,
            )
          }
        >
          hold pin
        </button>
        {/* A POI tap is GOOGLE's again (ADR-0148 §6), so the pane takes no callback for it and
            this button drives the only thing the tap still does on our side: clear the
            selection, exactly as ADR-0125 §6 has always said. */}
        <button data-poi onClick={() => (props.onCanvasTap as () => void)()}>
          poi
        </button>
        {/* The marker under the open form: our dashed PIN for a dropped point, the app's own
            RING where Google already drew an icon (ADR-0132 §6). Two silhouettes, so the stub
            has to report which. */}
        <span
          data-draftmarker={
            props.draftMarker
              ? [
                  (props.draftMarker as { ringed?: boolean }).ringed ? 'ring' : 'pin',
                  (props.draftMarker as { lat: number }).lat,
                  (props.draftMarker as { lng: number }).lng,
                  (props.draftMarker as { hue?: string }).hue ?? '',
                  (props.draftMarker as { glyph?: string }).glyph ?? '',
                ].join('|')
              : ''
          }
        />
        {/* The furniture band's two taps the screen has to answer (ADR-0126): the
            `באזור` readout, and locate with no fix. The real controls live in the pane
            and are tested there; what these expose is the SCREEN's half. */}
        <button
          data-areasort
          data-on={String(props.areaSorted)}
          onClick={() => (props.onAreaSort as () => void)()}
        >
          area
        </button>
        <button data-locate onClick={() => (props.onLocate as () => void)()}>
          locate
        </button>
        {/* Where the camera was asked to GO (ADR-0134 §6). A row tap sets it; a pin or
            ring tap must not — that is the whole split, so the suite has to see it. And
            `data-arrival` is the INTENT beside it, because since ADR-0148 §3's amendment a
            drop asks for a PAN and everything else asks for a frame: "it moved" and "it
            zoomed" are two claims, and only the pair can catch a drop that zooms. */}
        <span
          data-frame={arrivalProp ? `${arrivalProp.at.lat},${arrivalProp.at.lng}` : ''}
          data-arrival={arrivalProp ? (arrivalProp.frame ? 'frame' : 'pan') : ''}
        />
        {/* `data-aside` and `data-amber` exist because ADR-0131 §4 split the subordinate
            RATIO from the paint, so the suite has to see them apart: a query withdraws
            `aside` and leaves the tier alone, and the amber cues deliberately do NOT
            follow the withdrawal. */}
        {/* The RINGS (ADR-0132 §6): a population that is deliberately NOT on the pin
            ladder, so the stub keeps it in its own list — a test that found a ring in
            `pins` would be asserting the thing the design refuses. */}
        {(props.results as { googlePlaceId: string; selected?: boolean }[]).map((r) => (
          <button
            key={r.googlePlaceId}
            data-ring={r.googlePlaceId}
            data-selected={String(r.selected ?? false)}
            onClick={() => (props.onSelectResult as (id: string) => void)(r.googlePlaceId)}
          >
            {r.googlePlaceId}
          </button>
        ))}
        {pins.map((pin) => (
          <button
            key={pin.placeId}
            data-pin={pin.placeId}
            data-tier={pin.tier}
            data-order={pin.order ?? ''}
            data-aside={String(pin.aside ?? false)}
            data-amber={pin.nowStop ? 'now' : pin.nextStop ? 'next' : ''}
            data-selected={String(pin.selected ?? false)}
            data-match={String(pin.match ?? false)}
            data-outcome={pin.outcome ?? ''}
            data-transition={pin.transition ?? ''}
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
import { NavProvider, useAppBack } from '../state/nav-state';
import { MapScopeProvider, useMapScope } from '../state/map-scope-state';
import { setSimulatedNow } from '../lib/useClock';
import { MapView } from './Map';
import { MAP_CONTROLS_H, MAP_SHEET_VIEW, PLACE_CORPUS, type MapSheetView } from '../constants';
import { isFramedByCamera, PIN_TIER, type PinTier } from '../lib/map-pins';
import { withoutBidiControls } from '../lib/bidi';
import { DEFAULT_PLACE_ICON } from '../constants';
import { iconForCategory } from '@waypoint/shared';
import { t } from '../i18n/he';

/** The make/rename form's name field — the one control every one of ADR-0147's four sources
 *  opens, and the card's own `<label>` is what names it. */
const draftForm = () => document.querySelector('.map-draft') as HTMLElement | null;
const draftName = () => draftForm()!.querySelector('input') as HTMLInputElement;

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <MapScopeProvider>
            {node}
            <ChromeProbe />
          </MapScopeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

/** The shell's half of the chrome reclaim (ADR-0132), which this suite cannot mount:
 *  `AppShell` lives above these providers. So the probe stands in for it — it reads the
 *  same lifted flag `App.tsx` reads, and drives a back through the same `useAppBack` a
 *  header button or the system-back interceptor does. */
let lastBack = '';
/** Which place the next arrival names — set by `arrive()` just before it fires. */
let arriveAt = '';
function ChromeProbe() {
  const { chromeReclaimed, errand, errandResult, requestFocus } = useMapScope();
  const back = useAppBack();
  return (
    <>
      <button
        data-testid="chrome-probe"
        data-chrome-reclaimed={String(chromeReclaimed)}
        onClick={() => {
          lastBack = back().kind;
        }}
      />
      {/* The other end of the errand (ADR-0134 §1): a form sends one and lands on this
          tab. It is the same provider a real host writes through, so the tab is exercised
          in the state it actually arrives in rather than through a prop nothing sets. */}
      {/* The arrival (ADR-0121 §8): `מפה` on an event, a booking or a shelf idea hands the
          tab a place through this very provider, so driving it here exercises the path a real
          host takes rather than a prop nothing sets. */}
      <button data-testid="arrive-probe" onClick={() => requestFocus(arriveAt)} />
      <button
        data-testid="errand-probe"
        data-answer={errandResult.pending ? (errandResult.pending.placeId ?? 'cancelled') : ''}
        onClick={() =>
          errand.hand({
            target: { kind: 'event', field: 'placeId' },
            returnTo: '/trip/t1?tab=days',
            label: 'ארוחת ערב',
            draft: { title: 'ארוחת ערב' },
          })
        }
      />
    </>
  );
}
const probe = () => screen.getByTestId('chrome-probe');
const arrive = (placeId: string) => {
  arriveAt = placeId;
  fireEvent.click(screen.getByTestId('arrive-probe'));
};
const startErrand = () => fireEvent.click(screen.getByTestId('errand-probe'));
const errandAnswer = () => screen.getByTestId('errand-probe').dataset.answer;
/** What came back through the OTHER channel: a place id, `cancelled`, or '' if nothing was
 *  handed over at all — which is what a cancel used to do. */
const errandReturn = () => screen.getByTestId('errand-probe').dataset.answer;
const chromeReclaimed = () => probe().dataset.chromeReclaimed === 'true';
const pressBack = () => {
  fireEvent.click(probe());
  return lastBack;
};

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
/** Where the stubbed long press and POI tap land. Fixed, because the point is data the screen
 *  threads through, not something it derives. */
const HELD_AT = { lat: 35.7148, lng: 139.7967 };
const holdCanvas = () => fireEvent.click(document.querySelector('[data-hold]')!);
/** The same gesture, landed on the first pin instead of on blank canvas (ADR-0157 §2). */
const holdPin = () => fireEvent.click(document.querySelector('[data-holdpin]')!);
const tapPoi = () => fireEvent.click(document.querySelector('[data-poi]')!);
const draftMarker = () =>
  (document.querySelector('[data-draftmarker]') as HTMLElement).dataset.draftmarker;
/** What the camera was last asked to bring into view. */
const framed = () => (document.querySelector('[data-frame]') as HTMLElement).dataset.frame;
/** `frame` = a fit (zoom included), `pan` = centred at the zoom you are at, '' = nothing
 *  asked for. The drop is the only source that asks for a pan (ADR-0148 §3's amendment). */
const arrivalKind = () => (document.querySelector('[data-arrival]') as HTMLElement).dataset.arrival;
const tapAreaSort = () => fireEvent.click(document.querySelector('[data-areasort]')!);
const tapLocate = () => fireEvent.click(document.querySelector('[data-locate]')!);
const areaSortOn = () => document.querySelector('[data-areasort]')!.getAttribute('data-on');
/** The list's VISIBLE rows in the order they are rendered — what a sort is about. A
 *  row filtered out of scope stays in the DOM collapsed (ADR-0120), so it has to be
 *  excluded here or a ghost would read as part of the order. */
const rowNames = () =>
  [...document.querySelectorAll('.map-list .place')]
    .filter((r) => !r.closest('.wp-reveal')?.classList.contains('hidden'))
    .map((r) => r.querySelector('.map-name')?.textContent);
const groupHeads = () => [...document.querySelectorAll('.map-grouphead')].map((h) => h.textContent);

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
    tripNotes = [];
    tripBookings = [];
    tripEnrichments = {};
    currentMode = 'trip';
    isOffline = false;
    paneProps.current = {};
    permissionState = 'prompt';
    geoFix = null;
    geoErrorCode = null;
    getCurrentPosition.mockClear();
    scrollIntoView.mockClear();
    for (const fn of Object.values(indexVerbs)) fn.mockClear();
    searchStub.pick.mockReset();
    searchStub.referenced = {};
    lookupEnrichment.mockReset();
    lookupEnrichment.mockResolvedValue({});
    verbs.done.mockClear();
    verbs.skip.mockClear();
    verbs.restore.mockClear();
    for (const fn of Object.values(verbs)) fn.mockClear();
    // Shared through the trip-state mock, so without this a later test reads the previous
    // one's calls — the exact shape that made four assertions here "pass" once already.
    createNote.mockClear();
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

  // ── ARRIVING FROM AN EVENT / BOOKING / IDEA (ADR-0121 §8) ─────────────────────
  // `מפה` elsewhere hands this tab a place. It framed the camera and set the selection, and
  // left the LIST wherever it was — so the row it had just selected could be below the fold
  // with nothing saying it had been brought to you. The path had grown its own half-copy of
  // `select`; it goes through the real one now.
  describe('an arrival lands the place the way a row tap does', () => {
    beforeEach(seed);

    it('selects the place, frames it, and scrolls its row into view', async () => {
      render(wrap(<MapView />));
      scrollIntoView.mockClear();
      arrive('museum');
      await nextFrame();
      expect(row('museum')!.classList.contains('selected')).toBe(true);
      // `framed()` reports the point, which is how this harness names a camera target.
      expect(framed()).toBe('35.6,139.6');
      expect(arrivalKind()).toBe('frame');
      expect(scrollIntoView).toHaveBeenCalled();
    });

    // The measured call (see `landOnPlace`): the card costs more canvas than the sheet does,
    // so the list host wins for exactly the places worth arriving at.
    it('opens at `half`, with the list on screen rather than a card over the map', async () => {
      render(wrap(<MapView />));
      arrive('museum');
      await nextFrame();
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
      expect(placeCard()).toBeNull();
    });

    // Day-scoped, the row is not in the list at all until the scope widens — and the scroll
    // has to find it afterwards, which is what the deferred frame buys.
    it('widens to all-days for a place on another day, and still brings its row', async () => {
      render(wrap(<MapView />));
      scrollIntoView.mockClear();
      arrive('tomorrow');
      await nextFrame();
      expect(row('tomorrow')).toBeTruthy();
      expect(row('tomorrow')!.classList.contains('selected')).toBe(true);
      expect(scrollIntoView).toHaveBeenCalled();
    });

    // **PROVENANCE IS NOT TREATMENT.** `land` buys the sheet, the framing and the scroll; it
    // must NOT buy `openedFromRow`, or the user's FIRST tap on the row reads as their second
    // and closes the thing that was just brought to them.
    it('does not read the first tap on that row as a second press', async () => {
      render(wrap(<MapView />));
      arrive('museum');
      await nextFrame();
      fireEvent.click(row('museum')!);
      expect(row('museum')!.classList.contains('selected')).toBe(true);
    });
  });

  // ── THE LONG PRESS HAS TWO OBJECTS (ADR-0157 §2) ──────────────────────────────
  // The canvas half of removing a place. The gesture that makes a place is unchanged on
  // blank canvas — what is new is that the same press ON a pin acts on that place instead,
  // which is the conflict this had to resolve: before the pane reported what the finger was
  // on, a hold over a pin dropped a second place on top of the one you were pressing.
  describe('a long press on a pin opens that place’s menu', () => {
    const menu = () => document.querySelector('.wp-row-actions') as HTMLElement | null;
    const menuItem = (label: string) =>
      screen.getByRole('button', { name: new RegExp(label) }) as HTMLElement;

    it('opens the menu and makes NO place', () => {
      seed();
      render(wrap(<MapView />));
      holdPin();

      expect(menu()).toBeTruthy();
      // The one that would have been the bug: the make-a-place form must not be up.
      expect(draftForm()).toBeNull();
      expect(indexVerbs.createPlace).not.toHaveBeenCalled();
    });

    it('still makes a place when the press lands on blank canvas', () => {
      seed();
      render(wrap(<MapView />));
      holdCanvas();

      expect(draftForm()).toBeTruthy();
      expect(menu()).toBeNull();
    });

    it('names the place it is about, so the destructive verb is never anonymous', () => {
      seed();
      render(wrap(<MapView />));
      holdPin();

      expect(document.querySelector('.modal-title')!.textContent).toContain('museum');
    });

    it('deletes nothing by itself: the verb opens the confirm', () => {
      seed();
      render(wrap(<MapView />));
      holdPin();
      fireEvent.click(menuItem(t.map.del.action));

      expect(screen.getByText(t.map.del.title)).toBeTruthy();
      expect(verbs.removePlace).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: t.map.del.confirm }));
      expect(verbs.removePlace).toHaveBeenCalledWith(expect.objectContaining({ id: 'museum' }));
    });

    it('offers the rename from the same menu, since a pin has no row of verbs', () => {
      seed();
      render(wrap(<MapView />));
      holdPin();
      fireEvent.click(menuItem(t.map.make.edit));

      expect(draftForm()).toBeTruthy();
      expect(draftName().value).toBe('museum');
    });

    // The selection would otherwise outlive the row it points at, and at the map extreme
    // that is a card describing a place that no longer exists.
    it('clears the selection when the place it is showing is the one deleted', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).toContain('selected');

      fireEvent.click(
        within(row('museum')!).getByRole('button', { name: t.map.del.aria('museum') }),
      );
      fireEvent.click(screen.getByRole('button', { name: t.map.del.confirm }));

      expect(document.querySelector('.place.selected')).toBeNull();
    });
  });

  // ── A PLACE CARRIES NOTES (ADR-0153 §8's amendment) ─────────────────────────
  // `Map.test.tsx` covers the mark and the section on the list-only path. What is only true
  // HERE is the part that needs a sheet and a camera: the row is a `role="button"` running
  // `select`, so a tap on its note section must not also re-select the place.
  describe('a place carries notes (ADR-0153 §8)', () => {
    it('a tap inside the section does not re-select the row under the finger', () => {
      seed();
      tripNotes = [note('n1', 'lunch', 'הכניסה מאחור')];
      render(wrap(<MapView />));
      fireEvent.click(row('lunch')!);

      const section = row('lunch')!.querySelector('.note-sec') as HTMLElement;
      expect(section).toBeTruthy();
      // Selecting sends the camera a FRESH arrival object every time (a frame is spent once,
      // so the same row may be tapped twice) — which is exactly what a re-select triggered by
      // a tap on a NOTE would do: move the map under a finger that was reaching for text.
      const before = paneProps.current.arrival;
      expect(before).toBeTruthy();
      fireEvent.click(section.querySelector('.note-item-b') as HTMLElement);
      expect(paneProps.current.arrival).toBe(before);
      // …and the tap still did its own job: the note opened where it is (ADR-0153 §4's
      // amendment, round two — no sheet, so nothing to look for over the map either).
      expect(section.querySelector('.note-open-foot')).toBeTruthy();
    });
  });

  // ── A PLACE BECOMES AN EVENT OR A BOOKING — THE SPLIT (ADR-0135) ─────────────
  // `Map.test.tsx` covers the same block on the no-build-config, list-only path. Here it has
  // the sheet to overflow, which is what §8's scroll-into-view exists for.
  describe('the way-in block gains one action (ADR-0135)', () => {
    const scheduleBtn = () =>
      screen.queryByRole('button', { name: t.map.scheduleToDay }) as HTMLElement | null;

    for (const allDays of [false, true]) {
      const label = allDays ? 'all-days' : 'day';

      it(`selecting a row reveals the footer and opens the form over the map, in ${label} scope`, () => {
        seed();
        render(wrap(<MapView />));
        if (allDays) fireEvent.click(listButton(t.map.allDays));
        expect(document.querySelector('.map-refs-foot')).toBeNull();

        fireEvent.click(row('lunch')!);
        expect(scheduleBtn()).toBeTruthy();

        fireEvent.click(scheduleBtn()!);
        // A Modal over the map, on the map's own tab — nothing navigated (§3), so the tab is
        // still the map underneath.
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(document.querySelector('.map-screen')).toBeTruthy();
        expect(document.querySelector('.pp-trigger.filled')?.textContent).toContain('lunch');
      });
    }

    // §8: the block already overflows the `half` sheet on a 360 with two references, BEFORE
    // this phase adds a footer — so selecting a row now scrolls what grew into view.
    // `nearest`, because the row itself is already on screen: you just tapped it.
    it('scrolls the newly-revealed block into view, aligned to the card’s top', async () => {
      seed();
      render(wrap(<MapView />));
      scrollIntoView.mockClear();

      fireEvent.click(row('lunch')!);
      // **`start`** since 2026-08-05 (owner): `nearest` is a no-op once the card is taller than
      // the scrollport, which is exactly the card this reveal produces.
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith(BROUGHT_INTO_VIEW));
    });

    // §7 / ADR-0134 §3: under an errand the tab is answering ONE question, so the verb
    // CHANGES rather than accumulating — exactly as `נווט` gives its slot to `בחירה`.
    it('is ABSENT while a place errand is live, and returns when the errand ends', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('lunch')!);
      expect(scheduleBtn()).toBeTruthy();

      startErrand();
      expect(scheduleBtn()).toBeNull();
      // The row still offers the errand's own verb in its place.
      expect(within(row('lunch')!).getByRole('button', { name: t.map.errand.choose })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: t.map.errand.cancel }));
      expect(scheduleBtn()).toBeTruthy();
    });
  });

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
    // Each control by the class that IDENTIFIES it, not by its whole className: since
    // session 185 the two chips get their appearance from `ToggleChip`, so the full string
    // also carries `wp-chip accent` — which is about how a chip looks, and this assertion
    // is about which three controls are in the row.
    const rest = () =>
      [...document.querySelectorAll('.map-controls > *')].map(
        (el) => [...el.classList].find((c) => c.startsWith('map-')) ?? el.className,
      );

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
      expect(control().querySelector('.wp-chip-count')).toBeNull();
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

  // The session-185 extraction: four hand-rolled copies of one chip rule became four call
  // sites of `ToggleChip`. What is worth a test is not the class but the SEMANTICS split
  // the migration had to preserve — a pressed toggle and a control whose on-state is a fact
  // about the filter look identical and must not announce identically.
  describe('the pressed chips are one primitive (root rule 8)', () => {
    const chips = () => [...document.querySelectorAll('.wp-chip')] as HTMLElement[];

    for (const allDays of [false, true]) {
      it(`every chip in the row is the shared primitive, in ${allDays ? 'all-days' : 'day'} scope`, () => {
        seed();
        tripMaybes = [
          maybe({ id: 'm', placeId: 'lunch', category: 'food', targetDate: ACTIVE_DATE }),
        ];
        render(wrap(<MapView />));
        if (allDays) fireEvent.click(listButton(t.map.allDays));

        // The scope chip is a real toggle and says so; the filter control is an indicator
        // and deliberately does not, because its tap OPENS the strip.
        const scope = document.querySelector('.map-scopechip') as HTMLElement;
        expect(scope.classList.contains('wp-chip')).toBe(true);
        expect(scope.getAttribute('aria-pressed')).toBe(String(allDays));
        const filter = document.querySelector('.map-facets') as HTMLElement;
        expect(filter.classList.contains('wp-chip')).toBe(true);
        expect(filter.hasAttribute('aria-pressed')).toBe(false);

        // The facet toggles: provisional while off (ADR-0110 §2), and pressed toggles.
        openFacets();
        const maybes = document.querySelector('.map-maybes') as HTMLElement;
        expect(maybes.classList.contains('provisional')).toBe(true);
        expect(maybes.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(maybes);
        expect(
          (document.querySelector('.map-maybes') as HTMLElement).getAttribute('aria-pressed'),
        ).toBe('true');

        // Nothing in the row is a hand-rolled chip any more.
        expect(chips().length).toBeGreaterThan(0);
      });
    }

    // Teal is a LOCATION semantic (ADR-0109 §6-7), so it is a tone the primitive keeps
    // rather than a variant flattened into the neutral chip; a refusal drops it to `muted`,
    // which is the chip present-but-unable rather than absent.
    it('near-me keeps its teal tone, and a refusal mutes it instead of removing it', () => {
      seed();
      render(wrap(<MapView />));
      const near = () => document.querySelector('.map-nearchip') as HTMLElement;
      expect(near().classList.contains('teal')).toBe(true);
      expect(near().classList.contains('muted')).toBe(false);
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

  // The DAY-SCOPE GATE on the phase word (ADR-0141 §4), which is the screen's rule and not
  // the lib's — so it is asserted in BOTH scopes, on the surface where the two renders
  // genuinely differ (frontend CLAUDE.md).
  it('a hotel-changing day tells its two stays apart by word, ahead of time', () => {
    // Neither cue applies: the day is still ahead, so nothing is `עכשיו` and nothing is
    // `behind`. This is precisely the case the Phase-4 follow-up left open.
    setSimulatedNow(Date.parse(`${ACTIVE_DATE}T08:00:00Z`));
    tripPlaces = [
      place('outgoing'),
      place('incoming', true, { lat: 35.7, lng: 139.7 }),
      place('cafe', true, { lat: 35.71, lng: 139.71 }),
    ];
    tripEvents = [
      event({
        id: 'stay-a',
        placeId: 'outgoing',
        category: 'lodging',
        icon: '🏨',
        date: '2026-07-18',
        endDate: ACTIVE_DATE,
        startsAt: '2026-07-18T15:00:00Z',
        endsAt: `${ACTIVE_DATE}T10:00:00Z`,
      }),
      event({
        id: 'stay-b',
        placeId: 'incoming',
        category: 'lodging',
        icon: '🏨',
        date: ACTIVE_DATE,
        endDate: NEXT_DAY,
        startsAt: `${ACTIVE_DATE}T15:00:00Z`,
        endsAt: `${NEXT_DAY}T10:00:00Z`,
      }),
      // The day's actual next stop, so NEITHER stay is cued — which is the whole point of
      // the case. Without it the arriving stay is `nextDestination` and carries amber, i.e.
      // the "covered twice over" live reading rather than the uncovered ahead-of-time one.
      event({
        id: 'breakfast',
        placeId: 'cafe',
        category: 'food',
        startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        endsAt: `${ACTIVE_DATE}T09:45:00Z`,
      }),
    ];
    render(wrap(<MapView />));
    // Same hue, same glyph, same tier — and now not the same word.
    expect(pin('outgoing')!.getAttribute('data-transition')).toBe('צ׳ק-אאוט');
    expect(pin('incoming')!.getAttribute('data-transition')).toBe('צ׳ק-אין');
    // Neither is amber, so nothing about the budget moved to say it.
    expect(pin('outgoing')!.getAttribute('data-amber')).toBe('');
    expect(pin('incoming')!.getAttribute('data-amber')).toBe('');

    // ALL-DAYS drops it: there is nothing on a pin saying which day the word belongs to,
    // so two stays from two days would both read `צ׳ק-אין` — the same ambiguity that
    // killed all-days renumbering, and the number goes with it.
    fireEvent.click(listButton(t.map.allDays));
    expect(pin('outgoing')!.getAttribute('data-transition')).toBe('');
    expect(pin('incoming')!.getAttribute('data-transition')).toBe('');
    expect(pin('outgoing')!.getAttribute('data-order')).toBe('');
  });

  it('the amber cues keep their word in all-days, because they are about the clock', () => {
    // A two-endpoint transport booking, mid-flight: bracketed and NOT ambient (ADR-0063
    // §5), so it can be `deriveNow`'s answer — a multi-day stay never can, being off the
    // counted schedule. It also gives each end its own pin, which is what makes `edge`
    // mean something: the origin is a departure, the destination an arrival.
    setSimulatedNow(Date.parse(`${ACTIVE_DATE}T10:00:00Z`));
    tripPlaces = [place('origin'), place('dest', true, { lat: 35.7, lng: 139.7 })];
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
        startsAt: `${ACTIVE_DATE}T09:00:00Z`,
        endsAt: `${ACTIVE_DATE}T12:00:00Z`,
      }),
    ];
    render(wrap(<MapView />));
    // Each end reads its own word, in the per-mode wording a flight earns.
    expect(pin('origin')!.getAttribute('data-transition')).toBe('המראה');
    expect(pin('dest')!.getAttribute('data-transition')).toBe('נחיתה');
    expect(pin('origin')!.getAttribute('data-amber')).toBe('now');

    fireEvent.click(listButton(t.map.allDays));
    // The scope gate is on the NEUTRAL tag only — an amber pin is a claim about the clock,
    // not about which day you are looking at, so it survives all-days with its word.
    expect(pin('origin')!.getAttribute('data-amber')).toBe('now');
    expect(pin('origin')!.getAttribute('data-transition')).toBe('המראה');
    // …and the pin beside it, which carries no cue, loses its word with the scope.
    expect(pin('dest')!.getAttribute('data-amber')).toBe('');
    expect(pin('dest')!.getAttribute('data-transition')).toBe('');
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

  // ── WHAT HAPPENED THERE (ADR-0137) ────────────────────────────────────────────
  // The screen's job is the DERIVATION reaching the right pins; how each tier draws it is
  // the pane's (`MapPane.test.tsx`). Both scopes, because they are different renders and
  // only one of them has a ghost tier at all (frontend CLAUDE.md).
  describe('the pin says what happened at a place', () => {
    const settled = (id: string, status: TripEvent['status'], date = ACTIVE_DATE) =>
      event({ id: `e-${id}`, placeId: id, startsAt: `${date}T09:00:00Z`, date, status });

    beforeEach(() => {
      tripPlaces = [
        place('been', true, { lat: 35.6, lng: 139.7 }),
        place('bailed', true, { lat: 35.61, lng: 139.71 }),
        place('nobodysaid', true, { lat: 35.62, lng: 139.72 }),
      ];
    });

    it('marks what a human settled and leaves the third state unmarked', () => {
      tripEvents = [
        settled('been', EVENT_STATUS.DONE),
        settled('bailed', EVENT_STATUS.SKIPPED),
        settled('nobodysaid', EVENT_STATUS.PLANNED),
      ];
      render(wrap(<MapView />));
      expect(pin('been')!.getAttribute('data-outcome')).toBe('done');
      expect(pin('bailed')!.getAttribute('data-outcome')).toBe('skipped');
      // Passed, and nobody said what happened. The tier is the whole claim.
      expect(pin('nobodysaid')!.getAttribute('data-outcome')).toBe('');
      expect(pin('nobodysaid')!.getAttribute('data-tier')).toBe(PIN_TIER.behind);
    });

    // The population the report was actually about: a place pencilled for ANOTHER day,
    // which is drawn because it is physically in view. Its mark answers the only question
    // a ghost raises — do I still need to care about this?
    it('a ghost carries its own day’s outcome, and an all-days pin has no ghost tier', () => {
      tripEvents = [
        event({
          id: 'y',
          placeId: 'been',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T13:00:00Z`,
          status: EVENT_STATUS.DONE,
        }),
        event({
          id: 'ny',
          placeId: 'bailed',
          date: PREV_DAY,
          startsAt: `${PREV_DAY}T15:00:00Z`,
          status: EVENT_STATUS.SKIPPED,
        }),
        // Ahead of us, so nothing has happened there to report.
        event({
          id: 'f',
          placeId: 'nobodysaid',
          date: NEXT_DAY,
          startsAt: `${NEXT_DAY}T19:00:00Z`,
        }),
      ];
      render(wrap(<MapView />));
      expect(pin('been')!.getAttribute('data-tier')).toBe(PIN_TIER.ghost);
      expect(pin('been')!.getAttribute('data-outcome')).toBe('done');
      expect(pin('bailed')!.getAttribute('data-outcome')).toBe('skipped');
      expect(pin('nobodysaid')!.getAttribute('data-outcome')).toBe('');

      // All-days: every pin is in scope, so nothing is a ghost — and the marks survive the
      // scope change, because the outcome is a stored fact and not a scope-relative one.
      fireEvent.click(listButton(t.map.allDays));
      expect(pin('been')!.getAttribute('data-tier')).toBe(PIN_TIER.behind);
      expect(pin('been')!.getAttribute('data-outcome')).toBe('done');
      expect(pin('bailed')!.getAttribute('data-outcome')).toBe('skipped');
      expect(pin('nobodysaid')!.getAttribute('data-outcome')).toBe('');
    });

    // ADR-0130 §2 withdraws `behind` in Plan mode, and the mark goes with the tier rather
    // than needing a rule of its own — a day you are arranging has no past to report on.
    it('Plan mode marks no filled pin', () => {
      currentMode = 'plan';
      tripEvents = [settled('been', EVENT_STATUS.DONE)];
      render(wrap(<MapView />));
      expect(pin('been')!.getAttribute('data-tier')).not.toBe(PIN_TIER.behind);
      expect(pin('been')!.getAttribute('data-outcome')).toBe('');
    });

    // The canvas and the list read ONE derivation (ADR-0110 §2), so they cannot disagree:
    // whatever the pin marks, the row says in words.
    it('agrees with the row it shares a derivation with', () => {
      tripEvents = [settled('been', EVENT_STATUS.DONE), settled('bailed', EVENT_STATUS.SKIPPED)];
      render(wrap(<MapView />));
      expect(pin('been')!.getAttribute('data-outcome')).toBe('done');
      expect(row('been')!.textContent).toContain(t.event.didThis);
      expect(pin('bailed')!.getAttribute('data-outcome')).toBe('skipped');
      expect(row('bailed')!.textContent).toContain(t.event.skipped);
    });
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

    // All-days there is no day for the number to be an index in, so it goes — and it
    // goes from BOTH halves at once, which is the agreement this test is really about
    // (#16): they read one `buildPinOrderIndex`. The pin stub writes `''` where the
    // row simply carries no attribute; what matters is that neither shows a number.
    fireEvent.click(listButton(t.map.allDays));
    for (const name of ['museum', 'lunch', 'tomorrow']) {
      expect(rowOrder(name)).toBeNull();
      expect(pinOrder(name)).toBe('');
    }
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

    it('a pin tap where the list IS showing brings its row to the top, in both day scopes', async () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('lunch')!);
      await nextFrame();
      expect(scrollIntoView).toHaveBeenCalledWith(BROUGHT_INTO_VIEW);

      scrollIntoView.mockClear();
      fireEvent.click(listButton(t.map.allDays));
      fireEvent.click(pin('tomorrow')!);
      expect(screenEl().dataset.view).toBe('half');
      expect(row('tomorrow')!.className).toContain('selected');
      await nextFrame();
      expect(scrollIntoView).toHaveBeenCalledWith(BROUGHT_INTO_VIEW);
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

    // ── SETTLING FROM HERE (ADR-0139) ────────────────────────────────────────────
    // The verb hangs on the reference row because that row already names its target: a
    // place can carry several events on one day and ADR-0117 §5 forbids collapsing them,
    // so "mark this place done" is not well-formed while "mark THIS event done" is.
    describe('settling an event from the way-in block', () => {
      const settleRow = (name: string, label: string) =>
        [...row(name)!.querySelectorAll('.map-ref')].find((r) =>
          r.querySelector('.map-ref-label')?.textContent?.includes(label),
        ) as HTMLElement;

      it('offers the pair on an event, and nothing on a booking', () => {
        tripPlaces = [place('dest', true, { lat: 35.7, lng: 139.7 })];
        // Same inline shape the file's other booking fixtures use — no helper exists here.
        tripBookings = [
          {
            id: 'bk',
            tripId: 't1',
            type: 'train',
            title: 'שינקנסן',
            source: 'manual',
            toPlaceId: 'dest',
            createdAt: '',
            updatedAt: '',
            updatedBy: 'u1',
          } as Booking,
        ];
        tripEvents = [
          event({
            id: 'e1',
            placeId: 'dest',
            bookingId: 'bk',
            startsAt: `${ACTIVE_DATE}T08:00:00Z`,
          }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('dest')!);
        const refs = [...row('dest')!.querySelectorAll('.map-ref')];
        // ONE entry, named for the booking that holds the detail — and the settle pair is on
        // it, because the reference the row names rides on an event that has an
        // `EVENT_STATUS`. A booking carries none, which is why an UNLINKED one gets no pair.
        const kinds = refs.map((r) => r.querySelector('.map-ref-kind')?.textContent);
        expect(kinds).toEqual([t.map.refs.booking]);
        expect(refs[0].querySelector('.wp-settle')).toBeTruthy();
      });

      it('marks done through the shipped verb, with the event it names', () => {
        tripPlaces = [place('cafe', true, { lat: 35.7, lng: 139.7 })];
        tripEvents = [
          event({ id: 'e1', placeId: 'cafe', title: 'קפה', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('cafe')!);
        fireEvent.click(settleRow('cafe', 'קפה').querySelector('.wp-settle-btn.done')!);
        expect(verbs.done).toHaveBeenCalledTimes(1);
        expect(verbs.done.mock.calls[0][0]).toMatchObject({ id: 'e1' });
        expect(verbs.skip).not.toHaveBeenCalled();
      });

      it('marks skipped through the shipped verb', () => {
        tripPlaces = [place('shrine', true, { lat: 35.7, lng: 139.7 })];
        tripEvents = [
          event({
            id: 'e1',
            placeId: 'shrine',
            title: 'מקדש',
            startsAt: `${ACTIVE_DATE}T09:00:00Z`,
          }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('shrine')!);
        fireEvent.click(settleRow('shrine', 'מקדש').querySelector('.wp-settle-btn.skip')!);
        expect(verbs.skip).toHaveBeenCalledTimes(1);
        expect(verbs.skip.mock.calls[0][0]).toMatchObject({ id: 'e1' });
      });

      // An ALREADY-settled event shows what a human said plus the one verb left. Which is
      // also why every event is settleable rather than only the passed ones: gating the
      // controls on "passed and unanswered" would delete this undo the instant it was earned.
      it('a settled event states its outcome and offers the undo instead of the pair', () => {
        tripPlaces = [place('cafe', true, { lat: 35.7, lng: 139.7 })];
        tripEvents = [
          event({
            id: 'e1',
            placeId: 'cafe',
            title: 'קפה',
            startsAt: `${ACTIVE_DATE}T09:00:00Z`,
            status: EVENT_STATUS.DONE,
          }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('cafe')!);
        const settled = settleRow('cafe', 'קפה');
        expect(settled.querySelector('.wp-settle-btn.done')).toBeNull();
        expect(settled.querySelector('.wp-settle-btn.skip')).toBeNull();
        // In the row's OWN tag vocabulary, not a third one.
        expect(settled.querySelector('.wp-settle .wp-settle-tag.ok')?.textContent).toContain(
          t.event.didThis,
        );
        fireEvent.click(settled.querySelector('.wp-settle .wp-settle-btn')!);
        expect(verbs.restore).toHaveBeenCalledTimes(1);
        expect(verbs.restore.mock.calls[0][0]).toMatchObject({ id: 'e1' });
      });

      // The emphasis is the CLOCK's question, and only the clock's: it marks a day that has
      // passed with nothing said about it (ADR-0117 §1's third state). An event still ahead
      // is settleable and NOT emphasised — nothing has passed to be an open question.
      it('emphasises only the passed-and-unanswered row', () => {
        tripPlaces = [
          place('past', true, { lat: 35.7, lng: 139.7 }),
          place('ahead', true, { lat: 35.71, lng: 139.71 }),
        ];
        tripEvents = [
          event({ id: 'e1', placeId: 'past', title: 'בוקר', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
          event({ id: 'e2', placeId: 'ahead', title: 'ערב', startsAt: `${ACTIVE_DATE}T20:00:00Z` }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('past')!);
        expect(settleRow('past', 'בוקר').className).toContain('asking');
        fireEvent.click(row('ahead')!);
        const aheadRow = settleRow('ahead', 'ערב');
        expect(aheadRow.className).not.toContain('asking');
        // Available, though — a human may close tonight's dinner at 11:00 (ADR-0117 §2).
        expect(aheadRow.querySelector('.wp-settle-btn.done')).toBeTruthy();
      });

      // `refs` is passed when a row is SELECTED and `renderRow` serves both hosts, so this is
      // not a card feature — it appears wherever the selected row is. Both day scopes too,
      // since they are genuinely different renders (frontend CLAUDE.md).
      it('works in all-days scope as well as the day', () => {
        tripPlaces = [place('cafe', true, { lat: 35.7, lng: 139.7 })];
        tripEvents = [
          event({ id: 'e1', placeId: 'cafe', title: 'קפה', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(listButton(t.map.allDays));
        fireEvent.click(row('cafe')!);
        fireEvent.click(settleRow('cafe', 'קפה').querySelector('.wp-settle-btn.done')!);
        expect(verbs.done).toHaveBeenCalledTimes(1);
      });

      // A settle must not also navigate: the row around it opens the day, and the row around
      // THAT selects the place.
      it('does not open the day when the pair is tapped', () => {
        tripPlaces = [place('cafe', true, { lat: 35.7, lng: 139.7 })];
        tripEvents = [
          event({ id: 'e1', placeId: 'cafe', title: 'קפה', startsAt: `${ACTIVE_DATE}T09:00:00Z` }),
        ];
        render(wrap(<MapView />));
        fireEvent.click(row('cafe')!);
        fireEvent.click(settleRow('cafe', 'קפה').querySelector('.wp-settle-btn.done')!);
        // Still on the Map, with the block still open on the same place — the settle did not
        // also fire the row's own `onOpen`, which navigates to the day.
        expect(row('cafe')!.querySelector('.map-refs')).toBeTruthy();
        expect(verbs.done).toHaveBeenCalledTimes(1);
      });
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
      // ONE entry, named for the booking: it holds the code and the documents, which is
      // what a traveller standing there wants first. The event's clock and its outcome are
      // on the same row rather than on a second one carrying the identical label.
      expect([...refs.querySelectorAll('.map-ref-kind')].map((k) => k.textContent)).toEqual([
        t.map.refs.booking,
      ]);
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

    // ─── ADR-0131 §4: A QUERY WITHDRAWS THE RATIO, AND NOT MUCH ELSE ───────────────
    // Search is scope-blind by rule, so a match from another day is what was asked for —
    // arriving wearing the paint that means "not what you are looking at" was the defect.
    // The paint STAYS (a hollow ghost still answers *which day*, which is what you need
    // to know when your search found Friday's); the subordinate SIZE comes off.
    describe('a query withdraws the aside ratio, and the paint stays (ADR-0131 §4)', () => {
      const search = (value: string) => {
        fireEvent.click(listButton(t.map.search.button));
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value },
        });
      };

      // Both scopes, because they are genuinely different renders and the promotion only
      // EXISTS in the day-scoped one — in all-days there is nothing for a ghost to be.
      it('day scope: the match keeps its ghost paint and loses the ratio', () => {
        seed();
        render(wrap(<MapView />));
        expect(pin('tomorrow')?.dataset.tier).toBe('ghost');
        expect(pin('tomorrow')?.dataset.aside).toBe('true');

        search('tomorrow');
        expect(pin('tomorrow')?.dataset.tier).toBe('ghost');
        expect(pin('tomorrow')?.dataset.aside).toBe('false');
      });

      it('all-days: nothing to promote, because nothing is out of scope', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(listButton(t.map.allDays));
        expect(pin('tomorrow')?.dataset.aside).toBe('false');
        search('tomorrow');
        expect(pin('tomorrow')?.dataset.aside).toBe('false');
      });

      // The query is a filter like any other, so the matches are what REMAIN — which is
      // why they need no cue and the ladder needs no new axis (§3).
      it('the pins are the matches, ghosts included, and facets do not narrow them', () => {
        seed();
        render(wrap(<MapView />));
        search('tomorrow');
        expect(pinIds()).toEqual(['tomorrow']);
      });

      // The half of §4 that would have broken silently: `isAsidePin` has five readers and
      // only three follow the query. These two do not, and both would be WRONG if they did.
      it('the day connector does not gain the match — a Friday hit is not on today’s route', () => {
        currentMode = 'plan';
        seed();
        render(wrap(<MapView />));
        expect(paneProps.current.connector).toHaveLength(2);

        // The connector follows the FILTERED set, exactly as it does for a category chip,
        // so a query that leaves one ghost leaves no route — and the point is that the
        // promoted ghost did not JOIN one. `orderedStops` keeps reading the tier, not the
        // withdrawn ratio, which is the half of §4 that would have broken silently.
        search('tomorrow');
        expect(pin('tomorrow')?.dataset.aside).toBe('false');
        expect(paneProps.current.connector).toEqual([]);
      });

      it('a matching ghost never claims an amber cue — those are claims about TIME', () => {
        seed();
        // Late enough that the trip's next destination is TOMORROW's place, so the pin the
        // guard has to refuse is exactly the one the query promotes.
        setSimulatedNow(Date.parse(`${ACTIVE_DATE}T23:30:00Z`));
        render(wrap(<MapView />));
        search('tomorrow');
        expect(pin('tomorrow')?.dataset.aside).toBe('false');
        expect(pin('tomorrow')?.dataset.amber).toBe('');
      });

      // The two readers ADR-0131's own table did not enumerate. Both ask "is this pin's
      // row ABSENT from the list?", and under a query the list is trip-wide, so it is not.
      it('tapping a match surfaces no ghost row — its row is already in the list', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(pin('tomorrow')!);
        expect(screen.getByText(t.map.notThisDay)).toBeTruthy();

        search('tomorrow');
        fireEvent.click(pin('tomorrow')!);
        expect(screen.queryByText(t.map.notThisDay)).toBeNull();
      });
    });

    // ─── CHOOSING A PLACE FOR A FORM (ADR-0134 §1-§4) ──────────────────────────────
    // The tab in errand mode: a form sent us here for ONE place. What is asserted is what
    // the canvas and the rows say about that, since the channel itself is covered in
    // `state/map-scope-state.test.tsx`.
    describe('the tab under a place errand', () => {
      it('says what it is doing, and every row offers the choose verb instead of נווט', () => {
        seed();
        render(wrap(<MapView />));
        expect(screen.queryByText(t.map.errand.title('ארוחת ערב'))).toBeNull();
        startErrand();
        expect(screen.getByText(t.map.errand.title('ארוחת ערב'))).toBeTruthy();
        const choose = within(row('museum')!).getByRole('button', { name: t.map.errand.choose });
        expect(within(row('museum')!).queryByText(new RegExp(t.actions.navigate))).toBeNull();
        // …and choosing hands the place back through the other channel, for the form's host
        // to re-open from (§2). This screen never touches an event.
        fireEvent.click(choose);
        expect(errandAnswer()).toBe('museum');
      });

      // THE OWNER'S REPORT (session 166): _"opening the map from events still had the
      // existing events very prominent, they should probably be low tier on this case"_.
      // The demotion is CSS off one attribute — no marker re-render, nothing re-diffed on a
      // live map — so the attribute is what there is to assert.
      it('demotes every trip pin to context, and restores them when the errand ends', () => {
        seed();
        render(wrap(<MapView />));
        expect(screenEl().dataset.choosing).toBeUndefined();
        startErrand();
        expect(screenEl().dataset.choosing).toBe('place');
        // The pins are still THERE and still framed by the camera — where the trip is, is
        // where you want to start looking. Only their prominence changed.
        expect(pinIds()).toContain('museum');
        fireEvent.click(screen.getByRole('button', { name: t.map.errand.cancel }));
        expect(screenEl().dataset.choosing).toBeUndefined();
      });

      // …EXCEPT A SEARCH RESULT, and per pin rather than by switching the demotion off
      // (owner, session 168: _"not every trip pin, just search results that are already
      // saved"_). A place your search surfaced is an answer, not the backdrop you are
      // choosing against — so the exemption rides on the pin, as `aside` does (ADR-0131 §4).
      it('exempts a pin the search surfaced, and only that pin', () => {
        seed();
        render(wrap(<MapView />));
        startErrand();
        expect(pin('museum')!.dataset.match).toBe('false');
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value: 'museum' },
        });
        expect(pin('museum')!.dataset.match).toBe('true');
        // The demotion itself is still on: it is the PIN that is exempt, not the canvas.
        expect(screenEl().dataset.choosing).toBe('place');
      });

      // The SECOND exemption (owner, session 169: _"selected should be promoted to pin"_).
      // Reported on a device: the selected place drew as a dot with the selection ring
      // around it — a ring drawn around nothing. Selection is the strongest answer the tab
      // has to "what are you choosing", so it outranks a rule about the backdrop.
      //
      // The demotion is CSS (`:not(.match, .selected)`), so what a unit test owns is the
      // pair of flags it keys on: the pin has to be MARKED selected while an errand is live.
      it('marks the tapped pin selected under an errand, which is what exempts it', () => {
        seed();
        render(wrap(<MapView />));
        startErrand();
        expect(pin('museum')!.dataset.selected).toBe('false');
        fireEvent.click(pin('museum')!);
        expect(pin('museum')!.dataset.selected).toBe('true');
        expect(screenEl().dataset.choosing).toBe('place');
      });

      // ARRIVING ON AN ERRAND OPENS THE FIELD (owner, session 168: _"opening map search for
      // event/booking doesn't start on keyboard open"_). The field's `autoFocus` is what
      // brings the keyboard; opening it is what this screen owes.
      it('opens the query field on arrival, and does not reopen one you closed', () => {
        seed();
        render(wrap(<MapView />));
        expect(screen.queryByPlaceholderText(t.map.search.placeholder)).toBeNull();
        startErrand();
        expect(screen.getByPlaceholderText(t.map.search.placeholder)).toBeTruthy();
        // Closing it is a decision, and re-opening under the user is the nag this tab
        // refuses elsewhere (ADR-0109 §6).
        fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
        expect(screen.queryByPlaceholderText(t.map.search.placeholder)).toBeNull();
      });

      // `ביטול` HAS TO GIVE THE FORM BACK (owner, session 168). It shipped navigating away
      // and handing nothing over, so the host had nothing to re-open from and a half-typed
      // event died on the way out — the loss the draft exists to prevent, via the other exit.
      it('cancelling hands the draft back with no place assigned', () => {
        seed();
        render(wrap(<MapView />));
        startErrand();
        fireEvent.click(screen.getByRole('button', { name: t.map.errand.cancel }));
        expect(errandReturn()).toBe('cancelled');
      });

      // TAPPING WHAT IS ALREADY SELECTED COMMITS IT (owner, session 171 — the correction to
      // 170's row double-tap, which was the wrong surface). The first tap still only selects,
      // so ADR-0134 §3's look-before-you-commit split is intact; the second one on the SAME
      // pin is `בחירה` without travelling to the row.
      it('a second tap on the selected pin chooses it; the first only selects', () => {
        seed();
        render(wrap(<MapView />));
        startErrand();
        fireEvent.click(pin('museum')!);
        expect(errandAnswer()).toBe('');
        fireEvent.click(pin('museum')!);
        expect(errandAnswer()).toBe('museum');
      });

      // …and it is errand-scoped: with nothing asking for a place, a second tap on a pin
      // has nothing to commit to.
      it('a second tap does nothing without an errand', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(pin('museum')!);
        fireEvent.click(pin('museum')!);
        expect(errandAnswer()).toBe('');
        expect(pin('museum')!.dataset.selected).toBe('true');
      });

      // A card is the only way to reach one of OUR places at the map extreme, so it has to
      // carry the verb too — otherwise a trip place is pickable from the list and not from
      // the canvas, on the tab that exists to show you where things are.
      it('the place card can choose, at the map extreme', () => {
        seed();
        render(wrap(<MapView />));
        startErrand();
        fireEvent.click(toggle(t.map.view.map));
        fireEvent.click(pin('museum')!);
        fireEvent.click(within(placeCard()!).getByRole('button', { name: t.map.errand.choose }));
        expect(errandAnswer()).toBe('museum');
      });
    });

    // ─── THE MAP EXTREME IS AVAILABLE WHILE SEARCHING (owner, session 166) ─────────
    // It was closed in session 159 on a report from a phone, for a structural reason: the
    // sheet shows no rows at that stop, so a coordless match had no pin AND no row, and
    // every Google result was a row with no pin. **The second half of that died when
    // results became rings** (ADR-0132 §6) — a result is on the canvas now — and the owner
    // has asked for the stop back. This is ADR-0132 §8's owed decision, taken, with the
    // condition it named built: a ring tap at that stop raises the result's own card.
    describe('the map extreme is available while a query is live', () => {
      const openSearch = () => fireEvent.click(listButton(t.map.search.button));
      const type = (value: string) =>
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value },
        });

      // `full` still normalises — the pane is hidden there, so a search whose answers are
      // pins has nothing to show you. `map` no longer does.
      it('opening search normalises from `full` only, and leaves the map extreme alone', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(toggle(t.map.view.list));
        expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.full);
        openSearch();
        expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
        cleanup();

        seed();
        render(wrap(<MapView />));
        fireEvent.click(toggle(t.map.view.map));
        openSearch();
        expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
      });

      it('the toggle keeps its map option, and the axis keeps all three stops', () => {
        seed();
        render(wrap(<MapView />));
        openSearch();
        type('museum');
        expect(screen.queryByRole('button', { name: t.map.view.map })).toBeTruthy();
        // The drag and the arrow keys read the same axis as the toggle — one `order` prop,
        // so they cannot disagree about which stops exist.
        const grab = document.querySelector('.wp-snapsheet-grab') as HTMLElement;
        expect(grab.getAttribute('aria-valuemax')).toBe('2');
      });

      // The condition ADR-0132 §8 attached to reopening the stop. Same rule as the trip
      // row's card and the ghost row (ADR-0122 §7): the row surfaces wherever the sheet
      // cannot show it — this is simply its third case.
      it('a ring tap at the map extreme raises the result card, with the add action', () => {
        seed();
        searchStub.predictions = [
          {
            googlePlaceId: 'g-1',
            primaryText: 'Blue Bottle',
            secondaryText: 'Shinjuku',
            lat: 35.69,
            lng: 139.7,
          },
        ];
        render(wrap(<MapView />));
        openSearch();
        type('coffee');
        fireEvent.click(toggle(t.map.view.map));
        expect(document.querySelector('.map-placecard')).toBeNull();
        fireEvent.click(document.querySelector('[data-ring="g-1"]') as HTMLElement);
        const card = document.querySelector('.map-placecard') as HTMLElement;
        expect(card.textContent).toContain('Blue Bottle');
        expect(card.querySelector('[data-result="g-1"]')!.className).toContain('selected');
        expect(
          within(card).getByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
        ).toBeTruthy();
        // Its body is INERT, like the trip card's: there is nothing to frame about the place
        // you are already looking at.
        expect(card.querySelector('.map-res-open')!.tagName).toBe('SPAN');
      });

      // Two cards on one canvas is the defect, so each selection clears the other.
      it('a pin tap at the map extreme replaces the result card with the place card', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
        ];
        render(wrap(<MapView />));
        openSearch();
        type('museum');
        fireEvent.click(toggle(t.map.view.map));
        fireEvent.click(document.querySelector('[data-ring="g-1"]') as HTMLElement);
        fireEvent.click(pin('museum')!);
        const cards = document.querySelectorAll('.map-placecard');
        expect(cards).toHaveLength(1);
        expect(cards[0].querySelector('[data-result="g-1"]')).toBeNull();
      });
    });

    // ─── UNSAVED GOOGLE RESULTS, AS RINGS (ADR-0132 §6/§7) ─────────────────────────
    // The SKU switch is what makes this possible at all: Text Search returns results WITH
    // coordinates, where an Autocomplete prediction has none until the pick (ADR-0115 §2)
    // and could therefore only ever be a row.
    describe("Google's results are rings on our canvas", () => {
      const openSearch = () => fireEvent.click(listButton(t.map.search.button));
      const type = (value: string) =>
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value },
        });
      const ring = (id: string) => document.querySelector(`[data-ring="${id}"]`) as HTMLElement;
      const rings = () =>
        [...document.querySelectorAll('[data-ring]')].map((el) => el.getAttribute('data-ring'));

      beforeEach(() => {
        searchStub.predictions = [];
        searchStub.referenced = {};
        searchStub.setQuery.mockClear();
        searchStub.pick.mockReset();
        addMaybe.mockClear();
      });

      it('spends the Text Search SKU, not Autocomplete', () => {
        seed();
        render(wrap(<MapView />));
        // Not a cosmetic assertion: the two SKUs differ in whether a session token folds
        // the run of keystrokes into one charge, and only one of them returns coordinates.
        expect(searchStub.corpus).toBe(PLACE_CORPUS.text);
      });

      it('feeds the paid core only a LIVE query — an open field is not an intent to spend', () => {
        seed();
        render(wrap(<MapView />));
        openSearch();
        expect(searchStub.setQuery).toHaveBeenLastCalledWith('');
        type('coffee');
        expect(searchStub.setQuery).toHaveBeenLastCalledWith('coffee');
      });

      it('draws a ring per placeable result, and none once the field closes', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
          { googlePlaceId: 'g-2', primaryText: 'Arabica', lat: 35.68, lng: 139.71 },
        ];
        render(wrap(<MapView />));
        expect(rings()).toEqual([]);
        openSearch();
        type('coffee');
        expect(rings()).toEqual(['g-1', 'g-2']);
        fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
        expect(rings()).toEqual([]);
      });

      // A result with no coordinates is a row and nothing else — the same treatment a
      // coordless Place-lite of our own gets, for the same reason.
      it('a result without coordinates gets no ring', () => {
        seed();
        searchStub.predictions = [{ googlePlaceId: 'g-3', primaryText: 'Somewhere' }];
        render(wrap(<MapView />));
        openSearch();
        type('coffee');
        expect(rings()).toEqual([]);
      });

      // It already HAS a pin. A ring over it would draw one place twice while saying the
      // opposite thing about it.
      it('a result already in the trip gets no ring', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
        ];
        searchStub.referenced = { 'g-1': { id: 'museum' } };
        render(wrap(<MapView />));
        openSearch();
        type('coffee');
        expect(rings()).toEqual([]);
      });

      // …AND THE PREMISE OF THAT RULE HAS TO BE MADE TRUE (owner, session 167 — _"you can't
      // see results that are already on the trip on the map"_). "It already has a pin" holds
      // only while both halves of the search match the same way, and they never did: ours is
      // a normalised substring (`matchesAnyTerm`), Google's handles transliteration and
      // aliases. So `מון` finds `Moon Sushi Bar Pinsker` in Google's half and cannot find it
      // in ours — the place we OWN was filtered off the canvas, its row said `כבר בטיול`,
      // and the canvas said `אין מקומות באזור` over the very spot.
      it('a result the trip owns is OUR pin, even when our own text match missed it', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Moon Sushi Bar Pinsker', lat: 35.69, lng: 139.7 },
        ];
        searchStub.referenced = { 'g-1': { id: 'museum' } };
        render(wrap(<MapView />));
        openSearch();
        // Matches no place of ours — `museum`, `lunch`, `lite`, `tomorrow`.
        type('מון');
        expect(pinIds()).toEqual(['museum']);
        // Still no ring: it is ours, and a ring means "not yours yet". One object per place,
        // which is what the rule above was actually protecting.
        expect(rings()).toEqual([]);
      });

      // …AND ITS ROW IS OURS TOO (owner, session 168 — the same report a second time, since
      // the canvas half of this shipped and the list half did not: _"still don't see existing
      // places on search"_). The trip's own row now shows for it, carrying its day, its time
      // and its references; Google's half drops the result rather than repeating it worse.
      // ONE PLACE, ONE ROW, and it is ours — the rule the ring already followed.
      it('…and its row is OUR row, not repeated as a Google result', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Moon Sushi Bar Pinsker', lat: 35.69, lng: 139.7 },
          { googlePlaceId: 'g-2', primaryText: 'Arabica', lat: 35.68, lng: 139.71 },
        ];
        searchStub.referenced = { 'g-1': { id: 'museum' } };
        render(wrap(<MapView />));
        openSearch();
        type('מון');
        expect(row('museum')).toBeTruthy();
        expect(document.querySelector('[data-result="g-1"]')).toBeNull();
        // The results we do NOT own are untouched: this is a filter, not an empty half.
        expect(document.querySelector('[data-result="g-2"]')).toBeTruthy();
      });

      // The row and the pin are two views of ONE place, so they select together — the
      // pin↔row rule, not the two-selections case the cards guard against.
      it('tapping its row selects its pin, and its card at the map extreme is ours', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Moon Sushi Bar Pinsker', lat: 35.69, lng: 139.7 },
        ];
        searchStub.referenced = { 'g-1': { id: 'museum' } };
        render(wrap(<MapView />));
        openSearch();
        type('מון');
        fireEvent.click(row('museum')!);
        expect(pin('museum')!.dataset.selected).toBe('true');
        // At the map extreme exactly one card comes up, and it is the PLACE card — the
        // richer of the two, and the honest answer to "what is this": ours.
        fireEvent.click(toggle(t.map.view.map));
        const cards = document.querySelectorAll('.map-placecard');
        expect(cards).toHaveLength(1);
        expect(cards[0].querySelector('[data-place="museum"]')).toBeTruthy();
      });

      // The pin↔row rule, in the direction the rings need it (ADR-0132 §8): the card
      // exists only where the list cannot show the row, and while a query is live the map
      // extreme is unavailable — so the row is always there to select.
      it('a ring tap selects its ROW and drops any place selection', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
        ];
        render(wrap(<MapView />));
        openSearch();
        type('museum');
        fireEvent.click(pin('museum')!);
        expect(row('museum')!.className).toContain('selected');
        fireEvent.click(ring('g-1'));
        expect(ring('g-1').dataset.selected).toBe('true');
        expect(row('museum')!.className).not.toContain('selected');
        // …and the canvas clears both again.
        fireEvent.click(document.querySelector('[data-canvas]') as HTMLElement);
        expect(ring('g-1').dataset.selected).toBe('false');
      });

      // **`＋ אולי` NOW OPENS THE FORM FIRST** (ADR-0147 §4, amending ADR-0131 §11's
      // "picked → shelf"): a result is the fourth source into the one naming form, so the place
      // enters the trip with the name and glyph you chose instead of Google's for you to fix
      // later. Prefilled with Google's, so accepting it is one more tap.
      it('adding a result opens the form prefilled, then resolves and references it', async () => {
        seed();
        const result = {
          googlePlaceId: 'g-1',
          primaryText: 'Blue Bottle',
          lat: 35.69,
          lng: 139.7,
        };
        searchStub.predictions = [result];
        searchStub.pick.mockResolvedValue({ id: 'p-new', name: 'Blue Bottle' });
        render(wrap(<MapView />));
        openSearch();
        type('coffee');
        fireEvent.click(
          screen.getByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
        );
        // Nothing is written on the way in: opening the form costs nothing, and the resolve
        // lands on the confirm ("armed by intent, not by opening", ADR-0115 §1).
        expect(searchStub.pick).not.toHaveBeenCalled();
        const field = draftName();
        expect(field.value).toBe('Blue Bottle');
        fireEvent.change(field, { target: { value: 'הקפה מול המלון' } });
        fireEvent.click(screen.getByRole('button', { name: t.map.make.add }));
        await vi.waitFor(() => expect(addMaybe).toHaveBeenCalled());
        expect(searchStub.pick).toHaveBeenCalledWith(result);
        // The name is the user's, written over Google's through the one authored write.
        expect(updatePlace).toHaveBeenCalledWith('p-new', { name: 'הקפה מול המלון' });
        // No glyph was PICKED, so none is carried: the idea keeps the shelf's own default and
        // the place keeps deriving. A derived glyph is not a choice (see `authoredIcon`).
        expect(addMaybe).toHaveBeenCalledWith('הקפה מול המלון', {
          placeId: 'p-new',
          icon: undefined,
          category: undefined,
        });
      });

      // ── ADR-0168 §5: THE SECOND TAP ON A RING IS THE SHELF ──────────────────────
      // Owner, 2026-08-06: _"double clicking on a result ＋ should treat it like you've
      // selected `הוסף למדף`, same way that it does when adding a place to an event/booking."_
      // Session 171 built exactly this gesture and gated it on an errand, on the grounds that
      // _"outside an errand there is nothing to commit to"_ — and that premise was wrong: there
      // is the shelf, which is where a result's add has always landed. So the gesture is one
      // rule and the CONTEXT picks the destination.
      it('a second tap on the selected ring shelves it, skipping the naming form', async () => {
        seed();
        const result = { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 };
        searchStub.predictions = [result];
        searchStub.pick.mockResolvedValue({ id: 'p-new', name: 'Blue Bottle' });
        render(wrap(<MapView />));
        openSearch();
        type('coffee');

        // The FIRST tap still only selects — ADR-0134 §3's look-before-you-commit split, which
        // this composes with rather than reversing.
        fireEvent.click(ring('g-1'));
        expect(ring('g-1').dataset.selected).toBe('true');
        expect(searchStub.pick).not.toHaveBeenCalled();

        fireEvent.click(ring('g-1'));
        await vi.waitFor(() => expect(addMaybe).toHaveBeenCalled());
        expect(searchStub.pick).toHaveBeenCalledWith(result);
        // Google's own name, because there was no form to type another one into — which is the
        // whole point of the shortcut, and the same landing `הוספה למדף` reaches.
        expect(addMaybe).toHaveBeenCalledWith('Blue Bottle', {
          placeId: 'p-new',
          icon: undefined,
          category: undefined,
        });
      });

      // Under an errand the destination changes and the gesture does not: this is the half
      // session 171 shipped, and it must keep working now that the gate is gone.
      it('…and under an errand the same tap CHOOSES instead of shelving', async () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
        ];
        searchStub.pick.mockResolvedValue({ id: 'p-new', name: 'Blue Bottle' });
        render(wrap(<MapView />));
        startErrand();
        type('coffee');
        fireEvent.click(ring('g-1'));
        fireEvent.click(ring('g-1'));
        await vi.waitFor(() => expect(errandAnswer()).toBe('p-new'));
        expect(addMaybe).not.toHaveBeenCalled();
      });
    });

    // ═══ FOUR SOURCES, ONE FORM (ADR-0147) ════════════════════════════════════════
    // The form's own rules are `MapPlaceForm.test.tsx`'s and the recogniser's are
    // `canvas-gestures`'; what belongs HERE is the wiring the screen owns — which source
    // opens what, what each one writes, where it lands, and the invariants the design rests on.
    describe('making and naming a place', () => {
      const nameIt = (value: string) => fireEvent.change(draftName(), { target: { value } });
      const confirm = (label: string = t.map.make.add) =>
        fireEvent.click(within(draftForm()!).getByRole('button', { name: label }));
      const pencil = () => screen.getByRole('button', { name: t.map.make.edit });
      /** The standard fixture, with `museum` given a name worth renaming. Seeded through
       *  `seed()` so the place is REFERENCED and therefore listed — a place with no reference
       *  is cache-only and has no row to carry a pencil (ADR-0112). */
      const seedNamed = (over: Partial<Place> = {}) => {
        seed();
        tripPlaces = tripPlaces.map((p) =>
          p.id === 'museum' ? { ...p, name: 'רמן נאגי', address: 'Kabukicho', ...over } : p,
        );
      };
      const openSearch = () => fireEvent.click(listButton(t.map.search.button));
      const type = (value: string) =>
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value },
        });

      // ── ADR-0112, AND IT IS THE ONE THAT CANNOT BE ALLOWED TO REGRESS ────────────
      // A `Place` with no reference is cache-only: it would not list, would not pin and would
      // not survive the next snapshot — so a source that created a place and no reference
      // would silently drop the user's work. Stated as a PROPERTY over every add source
      // rather than once per flow, because "this one flow happens to call addMaybe" is what a
      // value test proves and it is not the rule.
      it('EVERY add creates a reference, never a bare Place (ADR-0112)', async () => {
        const sources = [
          {
            name: 'a long press',
            arrange: () => indexVerbs.createPlace.mockResolvedValue('p-drop'),
            run: () => {
              holdCanvas();
              nameIt('הספסל עם הנוף');
            },
          },
          {
            name: 'a search result',
            arrange: () => searchStub.pick.mockResolvedValue({ id: 'p-res', name: 'Blue Bottle' }),
            run: () => {
              openSearch();
              type('coffee');
              fireEvent.click(
                screen.getByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
              );
            },
          },
        ];
        for (const source of sources) {
          cleanup();
          addMaybe.mockClear();
          for (const fn of Object.values(indexVerbs)) fn.mockReset();
          searchStub.pick.mockReset();
          seed();
          searchStub.predictions = [
            { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
          ];
          source.arrange();
          render(wrap(<MapView />));
          source.run();
          confirm();
          await vi.waitFor(() =>
            expect(addMaybe, `${source.name} landed no reference`).toHaveBeenCalledTimes(1),
          );
          expect(addMaybe.mock.calls[0][1].placeId).toBeTruthy();
        }
      });

      // ── A NOTE WRITTEN ON THE WAY (ADR-0152 §6b, phase 6) ───────────────────────
      // The composer is the scroll region's second child, and what it writes has to land on
      // the place this form produced — which is why the host does the writing: only it knows
      // which of the four sources ran, and therefore when the id exists.
      it('writes a note typed on the form onto the place it just made', async () => {
        seed();
        indexVerbs.createPlace.mockResolvedValue('p-drop');
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('הספסל עם הנוף');
        fireEvent.change(draftForm()!.querySelector('.note-compose-in')!, {
          target: { value: 'הכי שקט בבוקר' },
        });
        confirm();

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
        expect(createNote).toHaveBeenCalledWith({ body: 'הכי שקט בבוקר', placeId: 'p-drop' });
        // …and the place came first. Offline the outbox is FIFO, so a note that overtook its
        // host would flush first and the server would refuse a host it cannot see.
        expect(indexVerbs.createPlace.mock.invocationCallOrder[0]).toBeLessThan(
          createNote.mock.invocationCallOrder[0],
        );
      });

      it('writes nothing when the box was left empty — the common case costs no press', async () => {
        seed();
        indexVerbs.createPlace.mockResolvedValue('p-drop');
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('הספסל עם הנוף');
        confirm();

        await vi.waitFor(() => expect(addMaybe).toHaveBeenCalled());
        expect(createNote).not.toHaveBeenCalled();
      });

      // Renaming is the one source whose place already exists, so it is the one that could
      // have written the note to the wrong id (or to none).
      it('hangs a note from the rename form on the place being renamed', async () => {
        seedNamed();
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        fireEvent.change(draftForm()!.querySelector('.note-compose-in')!, {
          target: { value: 'סוגרים ב-17:00' },
        });
        confirm(t.map.make.save);

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
        expect(createNote).toHaveBeenCalledWith({ body: 'סוגרים ב-17:00', placeId: 'museum' });
      });

      // ── ONE COMPOSITION, THREE DESTINATIONS (ADR-0131 §11) ──────────────────────
      // The defect this build owed was a SECOND copy of this branch beside `addResult`'s. So
      // what is pinned is that the destination is a function of the ERRAND STATE and not of
      // the source: the same gesture twice, with only the errand changed.
      it('the invocation decides where a new place lands, not the source', async () => {
        seed();
        indexVerbs.createPlace.mockResolvedValue('p-drop');
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('x');
        confirm();
        await vi.waitFor(() => expect(addMaybe).toHaveBeenCalled());
        expect(errandAnswer()).toBe('');

        // …and under a form errand the SAME gesture ASSIGNS and returns, with no idea created
        // ("only choosing one place and not adding more and more places", ADR-0134 §3).
        cleanup();
        addMaybe.mockClear();
        indexVerbs.createPlace.mockResolvedValue('p-drop-2');
        seed();
        render(wrap(<MapView />));
        startErrand();
        holdCanvas();
        nameIt('x');
        confirm();
        await vi.waitFor(() => expect(errandAnswer()).toBe('p-drop-2'));
        expect(addMaybe).not.toHaveBeenCalled();
      });

      // ── 6b: THE FREE GESTURE ────────────────────────────────────────────────────
      it('a long press opens the form on an empty name and spends nothing', () => {
        seed();
        render(wrap(<MapView />));
        expect(draftForm()).toBeNull();
        holdCanvas();
        expect(draftName().value).toBe('');
        expect(within(draftForm()!).getByText(t.map.make.dropTitle)).toBeTruthy();
        // No session, no Details, no reverse geocode: opening it calls nothing at all.
        expect(indexVerbs.createPlace).not.toHaveBeenCalled();
        expect(indexVerbs.resolvePlace).not.toHaveBeenCalled();
        expect(searchStub.pick).not.toHaveBeenCalled();
        // And it cannot be confirmed nameless — a dropped pin has nothing else to be called.
        // Pressing add REFUSES rather than doing nothing (ADR-0150); what is protected here
        // is that nothing is written, which is unchanged.
        fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.add }));
        expect(within(draftForm()!).getByRole('alert').textContent).toBe(t.map.make.nameRequired);
        expect(indexVerbs.createPlace).not.toHaveBeenCalled();
        // The coordinates are the confirmation that the pin fell where the finger was; no
        // address is fetched for it, because a reverse geocode is paid and refused.
        expect(withoutBidiControls(draftForm()!.textContent!)).toContain('35.7148, 139.7967');
      });

      // ── THE PIN COMES INTO VIEW, FROM EVERY SOURCE (ADR-0148 §3) ────────────────
      // Stated over all four rather than once, because "the drop frames" was true while the
      // pencil and a search result framed NOTHING — a rename could be started from a row whose
      // pin was off screen, or from `full` where there is no canvas at all.
      //
      // The frame is deferred one animation frame on purpose: the split has just been given the
      // sheet's height back and the card has not been laid out, so framing synchronously would
      // fit against a canvas that no longer exists. So every case here waits a frame — and that
      // wait is the assertion's own subject as much as the coordinates are.
      //
      // **AND ONE OF THE THREE DELIBERATELY DOES NOT ZOOM** (owner, on a phone: a long press
      // "zooms in and pans to it — in these cases I don't want a zoom"). A drop names a pixel
      // already on screen, so it asks for a pan; a row's place may be off screen or not drawn
      // at all, so those still frame. `kind` is asserted beside `at` because "it moved" and
      // "it zoomed" are two claims, and the point alone cannot tell them apart.
      it('every source brings the place it is about into view', async () => {
        const cases: { name: string; open: () => void; at: string; kind: string }[] = [
          { name: 'a long press', open: holdCanvas, at: '35.7148,139.7967', kind: 'pan' },
          {
            name: 'a search result',
            open: () => {
              openSearch();
              type('coffee');
              fireEvent.click(
                screen.getByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
              );
            },
            at: '35.69,139.7',
            kind: 'frame',
          },
          {
            name: 'the pencil',
            // Selected via its PIN, not its row, and that is the whole point of this case: a
            // row tap frames on its own (ADR-0134 §6), so selecting that way would leave the
            // camera already pointing at the place and this assertion would pass with the
            // pencil framing nothing at all. A pin tap deliberately does NOT frame (ADR-0129
            // §1, asserted two describes down), so what lands here can only be the rename's.
            open: () => {
              fireEvent.click(pin('museum')!);
              fireEvent.click(pencil());
            },
            // `museum`'s own coordinates — a rename brings the place it is renaming into view.
            at: '35.6,139.6',
            kind: 'frame',
          },
        ];
        for (const c of cases) {
          cleanup();
          seedNamed();
          searchStub.predictions = [
            { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
          ];
          render(wrap(<MapView />));
          c.open();
          await nextFrame();
          expect(framed(), `${c.name} framed nothing`).toBe(c.at);
          expect(arrivalKind(), `${c.name} asked for the wrong move`).toBe(c.kind);
        }
      });

      it('a dropped pin is created with its coordinates', async () => {
        seed();
        indexVerbs.createPlace.mockResolvedValue('p-drop');
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('הספסל עם הנוף');
        confirm();
        await vi.waitFor(() => expect(indexVerbs.createPlace).toHaveBeenCalled());
        expect(indexVerbs.createPlace).toHaveBeenCalledWith({
          name: 'הספסל עם הנוף',
          lat: 35.7148,
          lng: 139.7967,
          // Untouched, so nothing is stored and the place keeps deriving its glyph.
          icon: undefined,
          // Nobody said what it is either — and a drop has no references to derive one from,
          // so the pin stays `leisure` until someone does (ADR-0165).
          category: undefined,
        });
        // Created WITH what was authored, so there is no second write to name it.
        expect(indexVerbs.updatePlace).not.toHaveBeenCalled();
      });

      // The category rides along on the CREATE, like the name and the glyph, so a dropped pin
      // never exists un-authored and there is no second request to categorise it (ADR-0165).
      it('a dropped pin is created with the category the pills chose', async () => {
        seed();
        indexVerbs.createPlace.mockResolvedValue('p-drop');
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('רמן נאגי');
        fireEvent.click(
          within(draftForm()!).getByRole('radio', { name: t.iconPicker.categories.food }),
        );
        confirm();
        await vi.waitFor(() => expect(indexVerbs.createPlace).toHaveBeenCalled());
        expect(indexVerbs.createPlace).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'רמן נאגי', category: 'food' }),
        );
        expect(indexVerbs.updatePlace).not.toHaveBeenCalled();
      });

      it('marks the dropped spot with OUR dashed pin, in the category’s hue', () => {
        seed();
        render(wrap(<MapView />));
        holdCanvas();
        expect(draftMarker()).toBe(`pin|35.7148|139.7967|leisure|${DEFAULT_PLACE_ICON}`);
        // The payoff of the form carrying a category at all: the pin under it answers the
        // pills, so a restaurant stops coming out `leisure` green.
        fireEvent.click(
          within(draftForm()!).getByRole('radio', { name: t.iconPicker.categories.food }),
        );
        expect(draftMarker()).toBe(`pin|35.7148|139.7967|food|${iconForCategory('food')}`);
      });

      // ── 6c IS GONE, AND THAT IS THE ASSERTION (ADR-0148 §6) ─────────────────────
      // A tap on one of Google's own sights opened this form and shipped that way; the owner
      // used it on a phone and had it removed — _"opening a create place form for every hit on a
      // Google suggestion is very annoying"_. So the POI tap is Google's again, which is
      // ADR-0125 §6 unamended.
      //
      // Pinned as an ABSENCE on purpose. The removal took the phase's only paid gesture with it,
      // so what must never come back is not just the form but the `resolvePlace` behind it: a
      // POI tap that spends is the exact failure ADR-0147's own §4 spent three paragraphs
      // avoiding, and it would be invisible until a bill arrived.
      it('a tap on one of Google’s sights opens nothing of ours, and spends nothing', () => {
        seed();
        render(wrap(<MapView />));
        tapPoi();
        expect(draftForm()).toBeNull();
        expect(indexVerbs.resolvePlace).not.toHaveBeenCalled();
        expect(indexVerbs.createPlace).not.toHaveBeenCalled();
        expect(addMaybe).not.toHaveBeenCalled();
      });

      // …including on a sight the trip already owns, which used to open the form as a free
      // rename. The pencil is the way to rename, and it is the only one.
      it('a tap on a sight the trip already owns opens nothing either', () => {
        seedNamed({ googlePlaceId: 'g-poi' });
        render(wrap(<MapView />));
        tapPoi();
        expect(draftForm()).toBeNull();
        expect(indexVerbs.updatePlace).not.toHaveBeenCalled();
      });

      // ── THE PENCIL: REVEALED BY SELECTION (ADR-0147 §3) ─────────────────────────
      // The whole measured constraint is that an UNSELECTED row pays nothing, so what is
      // pinned is the COUNT across the list — not that the selected row has one.
      it('the rename affordance exists on the selected row and on no other', () => {
        seed();
        render(wrap(<MapView />));
        expect(document.querySelectorAll('.map-rename')).toHaveLength(0);
        fireEvent.click(row('museum')!);
        expect(document.querySelectorAll('.map-rename')).toHaveLength(1);
        expect(row('museum')!.querySelector('.map-rename')).toBeTruthy();
        // …and it MOVES with the selection rather than accumulating.
        fireEvent.click(row('lunch')!);
        expect(document.querySelectorAll('.map-rename')).toHaveLength(1);
        expect(row('lunch')!.querySelector('.map-rename')).toBeTruthy();
        tapCanvas();
        expect(document.querySelectorAll('.map-rename')).toHaveLength(0);
      });

      // Under an errand the tab is answering one question, and ADR-0134 §3 has the verbs
      // CHANGE rather than accumulate — the same rule that takes `נווט` off this row.
      it('the pencil is absent while a place errand is live', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(row('museum')!);
        expect(document.querySelectorAll('.map-rename')).toHaveLength(1);
        startErrand();
        expect(document.querySelectorAll('.map-rename')).toHaveLength(0);
      });

      it('ANY place is renameable, including one Google named', async () => {
        seedNamed({ googlePlaceId: 'g-x' });
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        expect(draftName().value).toBe('רמן נאגי');
        expect(within(draftForm()!).getByText(t.map.make.renameTitle)).toBeTruthy();
        nameIt('הרמן ליד המלון');
        confirm(t.map.make.save);
        await vi.waitFor(() => expect(indexVerbs.updatePlace).toHaveBeenCalled());
        expect(indexVerbs.updatePlace).toHaveBeenCalledWith('museum', { name: 'הרמן ליד המלון' });
      });

      // The point of `applyAuthored`'s diff: accepting the name as offered must not cost a
      // request. Otherwise every `＋ אולי` on a search result writes twice.
      it('a confirm that changes nothing writes nothing', async () => {
        seedNamed();
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        confirm(t.map.make.save);
        await waitFor(() => expect(draftForm()).toBeNull());
        expect(indexVerbs.updatePlace).not.toHaveBeenCalled();
      });

      // ── THE PILLS WRITE (ADR-0165) ──────────────────────────────────────────────
      // The bug this replaces: a rename whose only act was a category tap wrote **nothing** —
      // the pills drove the glyph, the glyph was dropped for being derived, and the category
      // had no column to land in. No request, no error, no change; a control that did nothing.
      // Pinned as a VALUE on the write, because "the form reports it" was already true and is
      // not what was broken.
      it('a category tap on a rename is stored on the place', async () => {
        seedNamed();
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        fireEvent.click(
          within(draftForm()!).getByRole('radio', { name: t.iconPicker.categories.food }),
        );
        confirm(t.map.make.save);
        await vi.waitFor(() => expect(indexVerbs.updatePlace).toHaveBeenCalled());
        expect(indexVerbs.updatePlace).toHaveBeenCalledWith('museum', { category: 'food' });
      });

      // …and re-choosing the category it already has still costs nothing, which is the same
      // diff `name` has always been subject to.
      it('re-picking the category the place already has writes nothing', async () => {
        seedNamed({ category: 'food' });
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        fireEvent.click(
          within(draftForm()!).getByRole('radio', { name: t.iconPicker.categories.food }),
        );
        confirm(t.map.make.save);
        await waitFor(() => expect(draftForm()).toBeNull());
        expect(indexVerbs.updatePlace).not.toHaveBeenCalled();
      });

      // A glyph PICKED in the form is stored on the place; one the CATEGORY derived is not —
      // storing a derived one would freeze the icon at whatever the category said that day and
      // shadow the category from then on. **That rule survives ADR-0165 and is now load-bearing
      // rather than lossy:** the category itself persists, so the glyph it derives is a
      // rendering of stored data, not something to also write.
      it('stores a picked glyph on the place, and a derived one nowhere', async () => {
        seedNamed();
        render(wrap(<MapView />));
        fireEvent.click(row('רמן נאגי')!);
        fireEvent.click(pencil());
        fireEvent.click(
          within(draftForm()!).getByRole('radio', { name: t.iconPicker.categories.food }),
        );
        confirm(t.map.make.save);
        await waitFor(() => expect(draftForm()).toBeNull());
        // The category, and NOT the glyph it derived.
        expect(indexVerbs.updatePlace).toHaveBeenCalledWith('museum', { category: 'food' });

        fireEvent.click(pencil());
        fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.iconLabel }));
        fireEvent.click(screen.getByRole('button', { name: '🍜', hidden: true }));
        confirm(t.map.make.save);
        await vi.waitFor(() => expect(indexVerbs.updatePlace).toHaveBeenCalledTimes(2));
        expect(indexVerbs.updatePlace).toHaveBeenLastCalledWith('museum', { icon: '🍜' });
      });

      // ── EXACTLY ONE CARD ON THIS CANVAS (ADR-0125 §6) ───────────────────────────
      it('the form is the only card, whatever else was selected', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(toggle(t.map.view.map));
        fireEvent.click(pin('museum')!);
        expect(document.querySelectorAll('.map-placecard')).toHaveLength(1);
        holdCanvas();
        const cards = document.querySelectorAll('.map-placecard');
        expect(cards).toHaveLength(1);
        expect(cards[0].querySelector('.map-draft')).toBeTruthy();
        // …and cancelling gives the canvas back rather than leaving two.
        fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
        expect(document.querySelectorAll('.map-draft')).toHaveLength(0);
      });

      // A state a mounted screen enters and leaves, with a visible cancel — so a system back
      // has to close the FORM rather than leave the tab with what was typed still in it.
      it('a system back closes the form instead of leaving the tab', () => {
        seed();
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('הספסל');
        pressBack();
        expect(draftForm()).toBeNull();
      });

      // The failure is stated in the field's own error slot and the form STAYS: a write that
      // failed must not throw away what was typed.
      it('a failed write keeps the form, with what was typed, and says so', async () => {
        seed();
        indexVerbs.createPlace.mockRejectedValue(new Error('offline'));
        render(wrap(<MapView />));
        holdCanvas();
        nameIt('הספסל');
        confirm();
        await vi.waitFor(() =>
          expect(screen.getByRole('alert').textContent).toBe(t.map.make.failed),
        );
        expect(draftName().value).toBe('הספסל');
      });

      // ═══ TOTAL VISIBILITY, AND EVERY WAY OUT (ADR-0148) ═══════════════════════════
      // Two reports off a real phone: the form's top half was off screen with its actions
      // still tappable, and an outside tap did not close it. What is pinned here is the three
      // mechanisms that answer them, each as the property it must satisfy rather than as the
      // one state that was screenshotted.
      describe('the form has the room it needs, and one way out', () => {
        const stop = () => screenEl().dataset.view;
        /** The sheet's stop, through the control a finger uses. `half` is the default, so it
         *  is reached by not touching the toggle at all. */
        const setStop = (view: MapSheetView) => {
          if (view === MAP_SHEET_VIEW.full) fireEvent.click(toggle(t.map.view.list));
          else if (view === MAP_SHEET_VIEW.map) fireEvent.click(toggle(t.map.view.map));
        };

        // ── §2 · THE FORM IMPLIES THE `map` STOP, FROM EVERY ORIGIN ──────────────────
        // Not "when the room is short": always, so standing the sheet down is the same act as
        // tapping the view toggle rather than a special behaviour of the form. Stated over all
        // three origins because the one that matters most is `full`, where the card's room is
        // NEGATIVE by construction — so the pencil up there used to open a form that could not
        // be drawn at all.
        it('normalises the sheet to `map` from every stop, and gives the stop back', () => {
          for (const from of [MAP_SHEET_VIEW.half, MAP_SHEET_VIEW.full] as const) {
            cleanup();
            seedNamed();
            render(wrap(<MapView />));
            setStop(from);
            expect(stop()).toBe(from);
            holdCanvas();
            expect(stop(), `opening from ${from} did not normalise`).toBe(MAP_SHEET_VIEW.map);
            // …and closing gives it back, which is what makes this a DEFERRAL rather than the
            // loss ADR-0147 rejected ("it takes away the list you were reading").
            fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
            expect(stop(), `closing did not restore ${from}`).toBe(from);
          }
        });

        // ── §2b · AND THE SHEET STANDS DOWN ENTIRELY, NOT JUST TO `map` ──────────────
        // At `map` the sheet is nothing but its own 52px strip over a list you cannot see, and
        // the view toggle in it contradicts a form that just moved you to the canvas. Giving
        // that height to the canvas is what makes the WHOLE form fit with no scrolling on every
        // target — with the strip it is 19px short at 360×640 under an Android keyboard.
        //
        // The geometry itself is not assertable here (jsdom reports every rect as zero, which
        // is why `frontend/CLAUDE.md` sends this class of check to a measurement or e2e pass).
        // What IS assertable is the mechanism: the height goes away, and it comes back.
        it('gives the sheet’s whole height to the canvas while the form is open', () => {
          seedNamed();
          render(wrap(<MapView />));
          expect(screenEl().style.getPropertyValue('--sheet-h')).not.toBe('0px');
          holdCanvas();
          expect(screenEl().style.getPropertyValue('--sheet-h')).toBe('0px');
          expect(screenEl().dataset.form).toBe('open');
          fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
          expect(screenEl().style.getPropertyValue('--sheet-h')).not.toBe('0px');
          expect(screenEl().dataset.form).toBeUndefined();
        });

        // ── §1 · ONE QUIET LINE, NEVER TWO ───────────────────────────────────────────
        // Two short muted clauses each taking a full row plus a gap was 44px of a 223px card,
        // and they were never both load-bearing at once. Asserted per source, because which of
        // the two survives is the whole decision.
        it('gives each source exactly one quiet line under the field', () => {
          const cases: { name: string; open: () => void; note: string }[] = [
            // A dropped pin has only its point — there is no address, on purpose.
            { name: 'a long press', open: holdCanvas, note: '35.7148, 139.7967' },
          ];
          for (const c of cases) {
            cleanup();
            seed();
            render(wrap(<MapView />));
            c.open();
            const notes = draftForm()!.querySelectorAll('.field-hint');
            expect(notes, `${c.name} did not render exactly one note`).toHaveLength(1);
            expect(withoutBidiControls(notes[0].textContent!)).toBe(c.note);
            // …and the row it replaced is gone, not merely emptied.
            expect(draftForm()!.querySelector('.map-draft-meta')).toBeNull();
          }
        });

        it('the pencil at `full` opens a form the canvas can actually host', () => {
          seedNamed();
          render(wrap(<MapView />));
          setStop(MAP_SHEET_VIEW.full);
          fireEvent.click(pin('museum')!);
          fireEvent.click(screen.getByRole('button', { name: t.map.make.edit }));
          expect(draftForm()).toBeTruthy();
          expect(stop()).toBe(MAP_SHEET_VIEW.map);
        });

        // Already at `map`, so there is nothing to defer and nothing to restore — the guard
        // exists so a cancel cannot push the sheet somewhere the user never was.
        it('leaves the stop alone when it is already `map`', () => {
          seedNamed();
          render(wrap(<MapView />));
          setStop(MAP_SHEET_VIEW.map);
          holdCanvas();
          fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
          expect(stop()).toBe(MAP_SHEET_VIEW.map);
        });

        // ── §5 · THE CHROME COMES DOWN, AND THE SHELL NEVER LEARNS WHICH SURFACE ─────
        it('asks for the chrome while the form is open, and gives it back when it closes', () => {
          seedNamed();
          render(wrap(<MapView />));
          expect(chromeReclaimed()).toBe(false);
          holdCanvas();
          expect(chromeReclaimed()).toBe(true);
          fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
          expect(chromeReclaimed()).toBe(false);
        });

        // The two surfaces are ORed by the screen, so neither can take the chrome back while
        // the other still wants it — which is the whole reason it is one boolean with one
        // writer rather than a `queryOpen || formOpen` at the shell's read site.
        it('keeps the chrome down when a form closes over a still-open query', () => {
          seedNamed();
          searchStub.predictions = [
            { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
          ];
          render(wrap(<MapView />));
          openSearch();
          type('coffee');
          expect(chromeReclaimed()).toBe(true);
          fireEvent.click(
            screen.getByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
          );
          expect(chromeReclaimed()).toBe(true);
          fireEvent.click(within(draftForm()!).getByRole('button', { name: t.map.make.cancel }));
          // The query field is still open, so the chrome is still wanted.
          expect(chromeReclaimed()).toBe(true);
        });

        // ── §E · ONE FUNCTION FOR EVERY WAY OUT ──────────────────────────────────────
        // `frontend/CLAUDE.md`: a cancel control, a backdrop or OUTSIDE TAP, Escape and the
        // Android gesture must all run the same handler. The shipped form bound three of four.
        it('a tap on the canvas closes the form and clears the selection', () => {
          seedNamed();
          render(wrap(<MapView />));
          fireEvent.click(pin('museum')!);
          fireEvent.click(screen.getByRole('button', { name: t.map.make.edit }));
          expect(draftForm()).toBeTruthy();
          tapCanvas();
          expect(draftForm()).toBeNull();
          expect(row('רמן נאגי')!.className).not.toContain('selected');
        });

        // Every way out lands in the same place, which is the point of there being one
        // function — a table rather than three tests, so a fourth exit cannot quietly differ.
        it('the cancel, the outside tap and the system back all leave the same state', () => {
          for (const exit of ['cancel', 'canvas', 'back'] as const) {
            cleanup();
            seedNamed();
            render(wrap(<MapView />));
            setStop(MAP_SHEET_VIEW.half);
            holdCanvas();
            fireEvent.change(draftName(), { target: { value: 'הספסל' } });
            if (exit === 'cancel')
              fireEvent.click(
                within(draftForm()!).getByRole('button', { name: t.map.make.cancel }),
              );
            else if (exit === 'canvas') tapCanvas();
            else pressBack();
            expect(draftForm(), `${exit} left the form up`).toBeNull();
            expect(stop(), `${exit} did not restore the stop`).toBe(MAP_SHEET_VIEW.half);
            expect(draftMarker(), `${exit} left a marker behind`).toBe('');
          }
        });

        // A row tap MEANS something else, so it is not swallowed: the form closes and the tap
        // does what it came to do. One gesture, one intent, never a trap.
        it('a row tap closes the form and still selects the row', () => {
          seedNamed();
          render(wrap(<MapView />));
          holdCanvas();
          expect(draftForm()).toBeTruthy();
          fireEvent.click(row('lunch')!);
          expect(draftForm()).toBeNull();
          expect(row('lunch')!.className).toContain('selected');
        });
      });
    });

    // ─── A ROW TAP FRAMES; A CANVAS TAP PANS (ADR-0134 §6) ─────────────────────────
    // ADR-0129 §1 decided both taps pan, on the owner's report that being zoomed for a pin
    // you can already see is a nuisance. That is right for a PIN and wrong for a ROW: a row
    // in a list is the one case where you cannot see the place, and at `full` there is no
    // canvas at all. So the tap's SOURCE decides, and these tests are the split.
    describe('a row tap frames, a canvas tap pans', () => {
      it('a trip row tap frames the place', () => {
        seed();
        render(wrap(<MapView />));
        expect(framed()).toBe('');
        fireEvent.click(row('museum')!);
        expect(framed()).toBe('35.6,139.6');
      });

      it('a PIN tap does not frame — it only pans, which is ADR-0129 §1 unchanged', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(pin('museum')!);
        expect(row('museum')!.className).toContain('selected');
        expect(framed()).toBe('');
      });

      // A coordless row still SELECTS — it is referenced, so it must be tappable
      // (ADR-0121 §8) — and there is simply nothing to frame.
      it('a coordless row selects and frames nothing', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(row('lite')!);
        expect(row('lite')!.className).toContain('selected');
        expect(framed()).toBe('');
      });

      it('from `full` the sheet drops to `half` first, so the framing is not behind the list', () => {
        seed();
        render(wrap(<MapView />));
        fireEvent.click(toggle(t.map.view.list));
        expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.full);
        fireEvent.click(row('museum')!);
        expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
        expect(framed()).toBe('35.6,139.6');
      });

      // The same tap, on the other corpus. A result row is the case the owner asked for by
      // name: "clicking on a result pans you to the location, instead of opening Google maps".
      it("a result's ROW frames it; its RING only pans", () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
        ];
        render(wrap(<MapView />));
        fireEvent.click(listButton(t.map.search.button));
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value: 'coffee' },
        });
        fireEvent.click(document.querySelector('[data-ring="g-1"]') as HTMLElement);
        expect(framed()).toBe('');
        fireEvent.click(document.querySelector('[data-result="g-1"] .map-res-open') as HTMLElement);
        expect(framed()).toBe('35.69,139.7');
      });

      // The pane derives it from the rings it is already drawing, so the SPAN can read the
      // other candidates while the camera's own fit stays free of them (ADR-0134 §7).
      it('the rings reach the camera as focus CONTEXT, never as points it fits', () => {
        seed();
        searchStub.predictions = [
          { googlePlaceId: 'g-1', primaryText: 'Blue Bottle', lat: 35.69, lng: 139.7 },
          { googlePlaceId: 'g-2', primaryText: 'Arabica', lat: 35.68, lng: 139.71 },
        ];
        render(wrap(<MapView />));
        fireEvent.click(listButton(t.map.search.button));
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value: 'coffee' },
        });
        // `pins` is the camera's fit set and it must not contain a ring.
        const pinIds = (paneProps.current.pins as { placeId: string }[]).map((p) => p.placeId);
        expect(pinIds).not.toContain('g-1');
        expect((paneProps.current.results as unknown[]).length).toBe(2);
      });
    });

    // ─── THE CHROME RECLAIM (ADR-0132) ─────────────────────────────────────────────
    // The keyboard opens on FOCUS, so the state the surface has to survive begins before
    // a character exists — which is why the chrome keys off the FIELD BEING OPEN and not
    // off `searching`. On a resizing layout viewport the split absorbs the whole keyboard
    // (43px of canvas at 390×844), and at 360×640 the pane cannot lay out Google's
    // attribution at all, which is ADR-0106 §B rather than a density complaint.
    describe('the query field takes the app chrome with it', () => {
      const openSearch = () => fireEvent.click(listButton(t.map.search.button));

      it('reclaims the chrome on the OPEN tap, before anything is typed', () => {
        seed();
        render(wrap(<MapView />));
        expect(chromeReclaimed()).toBe(false);
        openSearch();
        // No `type(...)` here on purpose: this is the assertion that separates ADR-0132's
        // trigger from ADR-0131's `searching`.
        expect(chromeReclaimed()).toBe(true);
      });

      it('gives it back when the field closes', () => {
        seed();
        render(wrap(<MapView />));
        openSearch();
        fireEvent.click(screen.getByRole('button', { name: t.map.search.close }));
        expect(chromeReclaimed()).toBe(false);
      });

      // A surface that hid the header AND the tab bar changed "where am I", so back has
      // to undo that before it leaves the tab. It is a back LAYER rather than a rule in
      // `resolveBack` — the mechanism `resolveBack` already consults first.
      it('back closes the field instead of leaving the tab, and only while it is open', () => {
        seed();
        render(wrap(<MapView />));
        // Nothing open: back is not ours to handle.
        expect(pressBack()).not.toBe('close-overlay');
        openSearch();
        expect(pressBack()).toBe('close-overlay');
        expect(chromeReclaimed()).toBe(false);
        expect(screen.queryByPlaceholderText(t.map.search.placeholder)).toBeNull();
        // …and it HANDS OFF rather than repeating: the next back is structural again.
        expect(pressBack()).not.toBe('close-overlay');
      });

      // The flag outlives this screen (it is lifted so the header can read it), so an
      // unmount that left it set would strand the whole app with no chrome.
      it('unmounting the tab with the field open gives the chrome back', () => {
        seed();
        const view = render(wrap(<MapView />));
        openSearch();
        expect(chromeReclaimed()).toBe(true);
        view.rerender(wrap(<div />));
        expect(chromeReclaimed()).toBe(false);
      });
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

  // ADR-0130, from two reports on the same day: "past places shouldn't be faded on plan
  // mode", and "maybes should be represented differently than how past events are… I want
  // to be able to visually distinguish between somewhere I've already been to and
  // somewhere I'm considering". The paint is CSS and a human pass; what the suite owns is
  // the tier each pin is painted FROM, which is where both defects actually lived.
  describe('a maybe is not a past place, and Plan mode has no past (ADR-0130)', () => {
    it('Plan mode does not demote a passed stop — the same day, two modes', () => {
      seed();
      setSimulatedNow(Date.parse(`${ACTIVE_DATE}T23:59:00Z`));
      const { unmount } = render(wrap(<MapView />));
      // Trip mode: the day is over, so its stops are behind you.
      expect(pin('museum')!.dataset.tier).toBe(PIN_TIER.behind);
      unmount();

      currentMode = 'plan';
      render(wrap(<MapView />));
      // Plan mode: the same stop, at the same instant, is a stop again. You cannot
      // rearrange a day whose pins are the hardest ones on the canvas to read.
      expect(pin('museum')!.dataset.tier).toBe(PIN_TIER.upcoming);
      expect(pin('museum')!.dataset.order).toBe('1');
    });

    it('a dayless maybe is a shelf pin, not another day’s ghost — and stays one in Plan', () => {
      seed();
      // Deliberately far from the day (Rome, against the fixtures' Tokyo): the split's
      // one real hazard is a dayless idea pulling the camera off the day.
      tripPlaces = [...tripPlaces, place('someday', true, { lat: 41.9, lng: 12.5 })];
      tripMaybes = [maybe({ id: 'm', placeId: 'someday' })];
      const { unmount } = render(wrap(<MapView />));
      // Nothing pencilled it anywhere, which is exactly what leaves it available today.
      expect(pin('someday')!.dataset.tier).toBe(PIN_TIER.shelf);
      // …while a place pencilled for tomorrow is genuinely elsewhere.
      expect(pin('tomorrow')!.dataset.tier).toBe(PIN_TIER.ghost);
      // The split must not quietly re-open the frame ADR-0121 §7 closed: a dayless idea
      // in Rome would reframe a day that happens in Tokyo.
      const framed = (paneProps.current.pins as { placeId: string; tier: PinTier }[]).filter(
        isFramedByCamera,
      );
      expect(framed.map((p) => p.placeId)).not.toContain('someday');
      expect(paneProps.current.defaultCentre).toEqual({ lat: 35.6, lng: 139.6 });
      unmount();

      currentMode = 'plan';
      render(wrap(<MapView />));
      expect(pin('someday')!.dataset.tier).toBe(PIN_TIER.shelf);
    });

    it('tapping a dayless maybe surfaces its row, exactly as a ghost tap does', () => {
      seed();
      // Deliberately far from the day (Rome, against the fixtures' Tokyo): the split's
      // one real hazard is a dayless idea pulling the camera off the day.
      tripPlaces = [...tripPlaces, place('someday', true, { lat: 41.9, lng: 12.5 })];
      tripMaybes = [maybe({ id: 'm', placeId: 'someday' })];
      render(wrap(<MapView />));
      // Its row is not in the scoped sheet either, so the tap has the same job — which is
      // why the surfacing is keyed on the REASON rather than on the ghost tier.
      expect(row('someday')!.closest('.wp-reveal')!.classList.contains('hidden')).toBe(true);
      fireEvent.click(pin('someday')!);
      expect(screen.getByText(t.map.notThisDay)).toBeTruthy();
      expect(row('someday')!.className).toContain('selected');
    });

    it('all-days has no shelf tier: with no day to be out of, a maybe is just an idea', () => {
      seed();
      // Deliberately far from the day (Rome, against the fixtures' Tokyo): the split's
      // one real hazard is a dayless idea pulling the camera off the day.
      tripPlaces = [...tripPlaces, place('someday', true, { lat: 41.9, lng: 12.5 })];
      tripMaybes = [maybe({ id: 'm', placeId: 'someday' })];
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      expect(pin('someday')!.dataset.tier).toBe(PIN_TIER.idea);
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
    const count = (el: HTMLElement) => el.querySelector('.wp-chip-count')?.textContent;
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
      expect(listButton(t.map.filter.left).querySelector('.wp-chip-count')?.textContent).toBe('0');
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

    // The other scope, and the one where the number never meant anything: with no day
    // it sequenced the whole trip, so a pin read `27`. The canvas keeps every pin and
    // drops every numeral — the day is on the row, in words.
    it('all-days numbers nothing at all', () => {
      seedOrdered();
      render(wrap(<MapView />));
      fireEvent.click(listButton(t.map.allDays));
      expect(numbers()).toEqual({ first: '', second: '', third: '' });
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
  // ADR-0128 §1's session-155 amendment scopes the dot tier by DAY-vs-ALL-DAYS, because
  // the two are genuinely different situations: a day holds three to six stops and its
  // order is the whole point, while all-days holds the multi-city density the tier was
  // invented for and has no order to lose (nothing is numbered without a scoped day).
  // The rules key on `data-scope`, so what the shell has to guarantee is that the
  // attribute tracks the scope chip — CSS does the rest.
  describe('the dot tier can see the scope it is keyed on (ADR-0128 §1)', () => {
    it('the screen states the scope the tier reads, and follows the chip', () => {
      seed();
      render(wrap(<MapView />));
      expect(screenEl().dataset.scope).toBe('day');
      fireEvent.click(listButton(t.map.allDays));
      expect(screenEl().dataset.scope).toBe('all');
    });

    // The population the day-scope rule degrades is the ghost, and it has to be
    // distinguishable in the markup for the rule to reach it.
    it('a ghost is the one pin marked as not-this-day in day scope', () => {
      seed();
      render(wrap(<MapView />));
      expect(pin('tomorrow')!.dataset.tier).toBe(PIN_TIER.ghost);
      expect(pin('museum')!.dataset.tier).not.toBe(PIN_TIER.ghost);
    });
  });

  // ADR-0129 §1. Reported off a real map: being zoomed for tapping a pin you can already
  // SEE is inconvenient, so selection pans and the ZOOM becomes an explicit intent —
  // carried by the card's own badge, which is the verb that badge already has on every
  // other surface (ADR-0121's session-148 amendment).
  describe('zooming to a place is an intent, not a side effect (ADR-0129 §1)', () => {
    const openCard = () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('museum')!);
      return placeCard()!;
    };

    it('the card’s badge is a control, and the list’s badges are not', () => {
      const card = openCard();
      const badge = card.querySelector('.map-badge')!;
      expect(badge.getAttribute('role')).toBe('button');
      expect(badge.getAttribute('aria-label')).toBe(t.map.frameOnPlace);
      // Reuses session 148's affordance rather than growing a second one.
      expect(badge.className).toContain('wp-placebadge');
    });

    it('the list’s own badges stay inert', () => {
      seed();
      render(wrap(<MapView />));
      const badge = row('museum')!.querySelector('.map-badge')!;
      expect(badge.getAttribute('role')).toBeNull();
      expect(badge.className).not.toContain('wp-placebadge');
    });

    // What the tap does: hands the camera a place to FRAME. The pane's own test covers
    // what the camera then does with it; what belongs here is that the intent is sent,
    // and that it is a fresh object so the same place can be re-framed on a second tap.
    it('tapping it asks the camera to frame that place, and again on a second tap', () => {
      const card = openCard();
      const badge = card.querySelector('.map-badge')!;
      fireEvent.click(badge);
      const first = paneProps.current.arrival;
      expect(first).toEqual({ at: { lat: 35.6, lng: 139.6 }, frame: true });
      fireEvent.click(badge);
      expect(paneProps.current.arrival).toEqual(first);
      expect(paneProps.current.arrival).not.toBe(first);
    });

    // And the selection itself sends nothing: a pin tap is a pan, decided in the camera.
    it('selecting a pin does NOT ask for a frame', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('museum')!);
      expect(paneProps.current.arrival).toBeNull();
    });
  });

  // The badge is also the thumbnail's frame (ADR-0167 §1). The GEOMETRY of that — the row's
  // height, the ring, the order counter's overhang — is measured in
  // `e2e/place-photo-frame.spec.ts`, because jsdom loads no CSS and reports every rect as zero.
  // What belongs here is the SCREEN's decision: which rows get a photo at all.
  describe('a fetched photo fills the badge (ADR-0167 §1)', () => {
    const image: DeliveredImageValue = {
      url: '/enrichment/images/enr_1',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sizeBytes: 120_000,
      source: 'commons',
      license: 'CC BY-SA 3.0',
      attribution: 'Kakidai',
      fetchedAt: '2026-07-19T09:00:00Z',
      confidence: 1,
      method: 'settled_id',
      ref: 'Sensoji.jpg',
    };
    const badge = (name: string) => row(name)!.querySelector('.map-badge')!;

    it('frames the row we know something about, and leaves the others alone', () => {
      seed();
      tripEnrichments = { museum: { image } };
      render(wrap(<MapView />));
      expect(badge('museum').querySelector('img')!.getAttribute('src')).toBe(image.url);
      expect(badge('museum').hasAttribute('data-photo')).toBe(true);
      // The common case, and the reason the frame had to be free: Tokyo restaurants scored
      // 0 of 7 for images (ADR-0166 §11.3), so most rows render exactly as they always did.
      expect(badge('lunch').querySelector('img')).toBeNull();
      expect(badge('lunch').hasAttribute('data-photo')).toBe(false);
    });

    it('yields to an icon a human picked (§2)', () => {
      seed();
      tripPlaces = [{ ...place('museum'), icon: '🍜' }, ...tripPlaces.slice(1)];
      tripEnrichments = { museum: { image } };
      render(wrap(<MapView />));
      expect(badge('museum').querySelector('img')).toBeNull();
      expect(badge('museum').textContent).toBe('🍜');
    });
  });

  // **WHAT THE WORLD KNOWS, IN THE SELECTION REVEAL** (ADR-0167 §9.3/§5/§6). The block's
  // GEOMETRY — two lines, the card still inside its cap, the notes scroller's remaining room —
  // is measured in `e2e/place-know.spec.ts`; jsdom reports every rect as zero. What belongs
  // here is which rows get the block, which language a reader gets, and the footer's contents.
  describe('the summary block and the way through to Google (ADR-0167 §9.3/§6)', () => {
    const summaryValue = (lang: string, value: string) => ({
      value,
      lang,
      source: 'wikipedia' as const,
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia',
      fetchedAt: '2026-07-19T09:00:00Z',
      confidence: 1,
      method: 'settled_id' as const,
      ref: 'Q615183',
    });
    const block = (name: string) => row(name)?.querySelector('.map-sum') as HTMLElement | null;
    const google = () =>
      screen.queryByRole('link', { name: t.map.know.moreOnGoogle }) as HTMLAnchorElement | null;

    it('pins two lines under the identity on the SELECTED row, and nowhere else', () => {
      seed();
      tripEnrichments = { museum: { summary: { he: summaryValue('he', 'מוזיאון בטוקיו.') } } };
      render(wrap(<MapView />));
      // Unselected: the list can hold the whole trip, so an unselected row pays nothing.
      expect(block('museum')).toBeNull();

      fireEvent.click(row('museum')!);
      const prose = block('museum')!.querySelector('.map-sum-t') as HTMLElement;
      expect(prose.textContent).toBe('מוזיאון בטוקיו.');
      // The prose sniffs its own direction and says what language it is (ADR-0167 §5/§8).
      expect(prose.getAttribute('dir')).toBe('auto');
      expect(prose.getAttribute('lang')).toBe('he');
      // Hebrew needs no marker.
      expect(block('museum')!.querySelector('.map-sum-lang')).toBeNull();
      // Not inside the notes scroller: the group's own writing keeps its region (§9.5).
      expect(block('museum')!.closest('.note-sec-list')).toBeNull();
    });

    // The majority case for a place that gets a summary at all (ADR-0166 §11.5), so the
    // marker is what keeps an English extract in a Hebrew app honest rather than jarring.
    it('marks an English summary in one word, in the row’s own tag grammar', () => {
      seed();
      tripEnrichments = { museum: { summary: { en: summaryValue('en', 'A museum in Tokyo.') } } };
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);

      const marker = block('museum')!.querySelector('.map-sum-lang') as HTMLElement;
      expect(marker.textContent).toBe(t.map.know.langMarker.en);
      expect(marker.className).toContain('map-tag');
      // A SIBLING of the prose, not inside it: `dir="auto"` would sniff the Hebrew marker and
      // lay the English extract out RTL.
      expect(marker.parentElement).toBe(block('museum'));
    });

    it('draws nothing at all when we know nothing, which is the common case', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(block('museum')).toBeNull();
      // …but the way to the answer is still there, and then it is the whole content (§6).
      expect(google()).toBeTruthy();
    });

    it('offers עוד בגוגל on Google’s own panel for the place, in a new tab', () => {
      seed();
      tripPlaces = [{ ...place('museum'), googlePlaceId: 'g-museum' }, ...tripPlaces.slice(1)];
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);

      const link = google()!;
      expect(link.getAttribute('href')).toContain('query_place_id=g-museum');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      // The row's own single Google exit is untouched — this is a different question, which is
      // what the label carries (§6).
      expect(within(row('museum')!).getByText(t.actions.navigate)).toBeTruthy();
    });

    // Same rule as the schedule verb and `נווט`: under an errand the tab answers one question,
    // so the verbs change rather than accumulate (ADR-0134 §3).
    it('withdraws עוד בגוגל while a place errand is live', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(google()).toBeTruthy();

      startErrand();
      expect(google()).toBeNull();
    });
  });

  // **EXPANDING IS A MODE CHANGE, NOT GROWTH** (ADR-0167 §11.1). The card becomes the one an
  // un-added research place gets, and the notes, the references and the schedule footer come OFF
  // — which is what dissolved §10.2's measured problem instead of working around it: a hero
  // revealed INSIDE the collapsed card left the notes scroller 31px.
  describe('the research card (ADR-0167 §11.1)', () => {
    const image = {
      url: '/enrichment/images/enr_1',
      mimeType: 'image/jpeg',
      width: 840,
      height: 600,
      sizeBytes: 120_000,
      source: 'commons' as const,
      license: 'CC BY-SA 4.0',
      attribution: 'Kakidai',
      fetchedAt: '2026-07-19T09:00:00Z',
      confidence: 1,
      method: 'settled_id' as const,
      ref: 'Nezu.jpg',
    };
    const summary = {
      he: {
        value: 'מוזיאון לאמנות יפנית ומזרח־אסייתית ברובע מינאטו.',
        lang: 'he',
        source: 'wikipedia' as const,
        license: 'CC BY-SA 4.0',
        fetchedAt: '2026-07-19T09:00:00Z',
        confidence: 1,
        method: 'settled_id' as const,
        ref: 'Q1054134',
      },
    };
    const expand = () => fireEvent.click(screen.getByRole('button', { name: t.map.know.more }));
    const knowRow = () => row('museum')!;

    const seedKnown = (fields: Record<string, unknown> = { image, summary }) => {
      seed();
      tripEnrichments = { museum: fields } as typeof tripEnrichments;
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
    };

    it('offers the way in only when there is a room to open', () => {
      seedKnown();
      expect(screen.queryByRole('button', { name: t.map.know.more })).toBeTruthy();

      cleanup();
      // A place we know nothing about must not offer it (ADR-0109 §7) — `עוד בגוגל` is its way
      // to more, and it is already in the footer.
      seed();
      tripEnrichments = {};
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(screen.queryByRole('button', { name: t.map.know.more })).toBeNull();
    });

    // A photo with no summary still has a room: the hero IS what expanding shows, and without
    // this the picture would be unreachable on that place.
    it('offers it for an image with no summary at all', () => {
      seedKnown({ image });
      expect(screen.queryByRole('button', { name: t.map.know.more })).toBeTruthy();
    });

    it('swaps the card into the research card, and takes the itinerary blocks off', () => {
      seedKnown();
      // Collapsed: the group's own material is what is on screen.
      expect(knowRow().querySelector('.note-sec')).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.map.scheduleToDay })).toBeTruthy();
      expect(knowRow().querySelector('.map-hero')).toBeNull();

      expand();

      // Expanded: the picture, its credit, the whole summary, and a way back.
      expect(knowRow().querySelector('.map-hero img')?.getAttribute('src')).toBe(image.url);
      expect(knowRow().querySelector('.map-credit')?.textContent).toContain('Kakidai');
      expect(knowRow().querySelector('.map-sum')?.className).toContain('is-open');
      expect(screen.getByRole('button', { name: t.map.know.back })).toBeTruthy();
      // **Not on screen at the same time** — that is the whole difference from growth.
      expect(knowRow().querySelector('.note-sec')).toBeNull();
      expect(knowRow().querySelector('.map-refs')).toBeNull();
      expect(screen.queryByRole('button', { name: t.map.scheduleToDay })).toBeNull();
      // The one Google exit stays, beside the way back (§11.1's `.backrow`).
      expect(screen.queryByRole('link', { name: t.map.know.moreOnGoogle })).toBeTruthy();
    });

    it('comes back to the itinerary detail, with the place still selected', () => {
      seedKnown();
      expand();
      fireEvent.click(screen.getByRole('button', { name: t.map.know.back }));

      expect(knowRow().querySelector('.map-hero')).toBeNull();
      expect(knowRow().querySelector('.note-sec')).toBeTruthy();
      expect(knowRow().className).toContain('selected');
    });

    // ADR-0168 §4. Owner: _"to go back you must click on the little `חזרה לפרטי המקום` button.
    // This is very inconvenient and easy to miss. I think that instead clicking anywhere on the
    // card should go back to the place."_
    it('comes back from a tap anywhere on the card, not only on the little button', () => {
      seedKnown();
      expand();
      // The summary itself, which is the largest thing on the expanded card and the reason
      // anyone opened it.
      fireEvent.click(knowRow().querySelector('.map-sum') as HTMLElement);

      expect(knowRow().querySelector('.map-hero')).toBeNull();
      expect(knowRow().className).toContain('selected');
    });

    // The named control does not move, so it must not be duplicated either: announcing the body
    // as a second button with the same label reads the way back out twice.
    it('leaves the way back as the ONE control with that name', () => {
      seedKnown();
      expand();
      expect(screen.getAllByRole('button', { name: t.map.know.back })).toHaveLength(1);
    });

    // The hero is the level BELOW the card (ADR-0167 §11.1), so its tap must not be swallowed
    // by the body's new one.
    it('still opens the full picture from the hero rather than closing the card', () => {
      seedKnown();
      expand();
      fireEvent.click(knowRow().querySelector('.map-hero') as HTMLElement);
      expect(knowRow().querySelector('.map-hero')).toBeTruthy();
    });

    // The credit is the licensing obligation §4 placed under the picture, and its Latin run is
    // isolated INSIDE an RTL element — the half of ADR-0118 its lint guard cannot see (§8.2).
    it('credits the photographer and the license, with the Latin run isolated', () => {
      seedKnown();
      expand();
      const credit = knowRow().querySelector('.map-credit') as HTMLElement;
      // The stored license string verbatim: nine distinct ones appeared across 32 files.
      expect(credit.textContent).toContain('CC BY-SA 4.0');
      // U+2066 … U+2069 around each Latin run, and no `dir` on the element itself.
      expect(credit.textContent).toContain('\u2066');
      expect(credit.getAttribute('dir')).toBeNull();
    });

    // §11.1 keeps the full-screen preview as the level BELOW the expanded card, reached from the
    // hero — the app's own zoomable viewer (ADR-0062's one exception), not a bigger thumbnail.
    it('opens the full picture from the hero, with the credit as its caption', () => {
      seedKnown();
      expand();
      fireEvent.click(knowRow().querySelector('.map-hero') as HTMLElement);

      const viewer = document.querySelector('.doc-viewer') as HTMLElement;
      expect(viewer).toBeTruthy();
      expect(viewer.querySelector('.doc-viewer-caption')?.textContent).toContain('Kakidai');
      expect(viewer.querySelector('.doc-viewer-img')?.getAttribute('src')).toBe(image.url);
    });

    // Selecting another place must not leave the expansion behind on the one you left — which is
    // why the state is an id rather than a boolean.
    it('collapses when the selection moves to another place', () => {
      seedKnown();
      expand();
      fireEvent.click(row('lunch')!);
      expect(document.querySelector('.map-hero')).toBeNull();
    });

    // ── THE DECIDING CARD: enriched before it is saved (ADR-0166 §17) ──────────────────
    // The same three blocks, on a place nobody has added — which is the surface §9.1 designed
    // them for, and until now the only one that could not have them. What this suite owns is the
    // wiring: which tap asks, what it asks with, and which row is allowed to show the answer.
    describe('a place we have not added yet', () => {
      const openSearch = () => fireEvent.click(listButton(t.map.search.button));
      const typeQuery = (value: string) =>
        fireEvent.change(screen.getByPlaceholderText(t.map.search.placeholder), {
          target: { value },
        });
      const SKYTREE = {
        googlePlaceId: 'g-sky',
        primaryText: 'Tokyo Skytree',
        secondaryText: 'Sumida',
        lat: 35.7101,
        lng: 139.8107,
      };
      const resultRow = (id = 'g-sky') =>
        document.querySelector(`[data-result="${id}"]`) as HTMLElement;

      const search = async (predictions: typeof searchStub.predictions = [SKYTREE]) => {
        seed();
        searchStub.predictions = predictions;
        render(wrap(<MapView />));
        openSearch();
        typeQuery('skytree');
        await Promise.resolve();
      };

      it('asks what the world knows when you tap a result, with the identity it needs', async () => {
        await search();
        expect(lookupEnrichment).not.toHaveBeenCalled();

        fireEvent.click(resultRow().querySelector('.map-res-open') as HTMLElement);

        // The name and the point travel with the question: the store holds nothing for a place
        // nobody has added, so they are what a match can be made from (ADR-0166 §17).
        await waitFor(() =>
          expect(lookupEnrichment).toHaveBeenCalledWith(
            't1',
            { googlePlaceId: 'g-sky', name: 'Tokyo Skytree', lat: 35.7101, lng: 139.8107 },
            expect.anything(),
          ),
        );
      });

      it('shows the picture, the credit and the summary on the selected row', async () => {
        lookupEnrichment.mockResolvedValue({ image, summary });
        await search();
        fireEvent.click(resultRow().querySelector('.map-res-open') as HTMLElement);

        await waitFor(() => expect(resultRow().querySelector('.map-hero')).toBeTruthy());
        expect(resultRow().querySelector('.map-hero img')?.getAttribute('src')).toBe(image.url);
        expect(resultRow().querySelector('.map-credit')?.textContent).toContain('Kakidai');
        // The DECIDING density — three lines, and no way in to a mode change, because there is
        // nothing here to swap off.
        expect(resultRow().querySelector('.map-sum')?.className).toContain('is-decide');
        expect(screen.queryByRole('button', { name: t.map.know.more })).toBeNull();
      });

      it('leaves the rows nobody tapped exactly as they were', async () => {
        lookupEnrichment.mockResolvedValue({ image, summary });
        await search([SKYTREE, { googlePlaceId: 'g-other', primaryText: 'Somewhere else' }]);
        fireEvent.click(resultRow().querySelector('.map-res-open') as HTMLElement);

        await waitFor(() => expect(resultRow().querySelector('.map-hero')).toBeTruthy());
        // One fetch, one row: the collapsed results are the rows they always were, and nothing
        // was fetched for them (the owner's "on tap only").
        expect(resultRow('g-other').querySelector('.map-hero')).toBeNull();
        expect(lookupEnrichment).toHaveBeenCalledTimes(1);
      });

      it('asks nothing about a result the trip already owns', async () => {
        // Its enrichment is in the snapshot under its own `placeId`, and the card that shows is
        // our place's row — richer, and ours (session 167).
        searchStub.referenced = { 'g-sky': { id: 'museum' } };
        await search();
        fireEvent.click(row('museum')!);
        await Promise.resolve();
        expect(lookupEnrichment).not.toHaveBeenCalled();
      });

      it('asks once per place, however many times you tap it', async () => {
        lookupEnrichment.mockResolvedValue({ summary });
        await search([SKYTREE, { googlePlaceId: 'g-other', primaryText: 'Somewhere else' }]);
        const tap = (id: string) =>
          fireEvent.click(resultRow(id).querySelector('.map-res-open') as HTMLElement);

        tap('g-sky');
        await waitFor(() => expect(lookupEnrichment).toHaveBeenCalledTimes(1));
        tap('g-other');
        await waitFor(() => expect(lookupEnrichment).toHaveBeenCalledTimes(2));
        // Back to the first: answered already, so nothing is asked again — including when the
        // answer was "we know nothing", which is the majority case and must not be re-asked.
        tap('g-sky');
        await Promise.resolve();
        expect(lookupEnrichment).toHaveBeenCalledTimes(2);
      });

      it('shows nothing at all for a place the sources cannot describe', async () => {
        lookupEnrichment.mockResolvedValue({});
        await search();
        fireEvent.click(resultRow().querySelector('.map-res-open') as HTMLElement);

        await waitFor(() => expect(lookupEnrichment).toHaveBeenCalled());
        // A complete state, not an error state (ADR-0109 §7): the row it always was.
        expect(resultRow().querySelector('.map-sum')).toBeNull();
        expect(resultRow().querySelector('.map-hero')).toBeNull();
        expect(document.querySelector('.wp-banner')).toBeNull();
      });

      it('asks nothing while offline', async () => {
        isOffline = true;
        await search();
        // There is no research half offline at all — but the guard is in the hook too, because
        // the lookup needs Wikimedia and is never outboxed.
        expect(lookupEnrichment).not.toHaveBeenCalled();
      });

      it('opens the full picture from its hero, credited', async () => {
        lookupEnrichment.mockResolvedValue({ image, summary });
        await search();
        fireEvent.click(resultRow().querySelector('.map-res-open') as HTMLElement);
        await waitFor(() => expect(resultRow().querySelector('.map-hero')).toBeTruthy());

        fireEvent.click(resultRow().querySelector('.map-hero') as HTMLElement);
        const viewer = document.querySelector('.doc-viewer') as HTMLElement;
        // The same viewer the committed place's hero opens, titled by the result's own name —
        // which is why the state carries the picture rather than a `placeId` it does not have.
        expect(viewer.querySelector('.doc-viewer-title')?.textContent).toContain('Tokyo Skytree');
        expect(viewer.querySelector('.doc-viewer-caption')?.textContent).toContain('Kakidai');
      });
    });
  });

  // **THE PIN CARRIES THE SAME PHOTOGRAPH THE ROW DOES** (ADR-0167 §16, treatment B). The
  // screen's half of it is which photo each pin gets — the gate that decides whether it is
  // DRAWN is a container query on the pane, which no unit test can see.
  describe('the photograph reaches the canvas', () => {
    const image = {
      url: '/enrichment/images/enr_pin',
      mimeType: 'image/jpeg',
      width: 840,
      height: 600,
      sizeBytes: 1000,
      source: 'commons',
      license: 'CC BY-SA 4.0',
      attribution: 'Kakidai',
      fetchedAt: '2026-08-05T09:00:00Z',
      confidence: 1,
      method: 'settled_id',
      ref: 'Museum.jpg',
    } as DeliveredImageValue;
    const pinFor = (placeId: string) =>
      (paneProps.current.pins as { placeId: string; photoUrl?: string }[]).find(
        (p) => p.placeId === placeId,
      );

    it('hands the pin the row’s own photo, origin-prefixed', () => {
      seed();
      tripEnrichments = { museum: { image } } as typeof tripEnrichments;
      render(wrap(<MapView />));
      expect(pinFor('museum')?.photoUrl).toBe(image.url);
      // The majority of pins carry none, and are untouched.
      expect(pinFor('lunch')?.photoUrl).toBeUndefined();
    });

    // §2 on the canvas: a human's pick wins over a fetched photo, and it has to win on BOTH
    // surfaces or the same place says two different things about itself.
    it('gives a picked icon precedence over the photograph, exactly as the badge does', () => {
      seed();
      tripPlaces = tripPlaces.map((p) => (p.id === 'museum' ? { ...p, icon: '🗿' } : p));
      tripEnrichments = { museum: { image } } as typeof tripEnrichments;
      render(wrap(<MapView />));
      expect(pinFor('museum')?.photoUrl).toBeUndefined();
    });
  });

  // **AN EXPANSION BRINGS ITS OWN BOTTOM INTO VIEW** (owner, 2026-08-05: _"Still cutoff when
  // opening to half map half list"_). Expanding adds ~300px to a row in a ~380px scroller, so the
  // way back and `עוד בגוגל` opened under the tab bar — the same failure ADR-0135 §8 fixed for the
  // selection reveal, which the mode change inherited none of.
  describe('the expanded card is not left below the fold', () => {
    it('scrolls the row it just grew into view, with nearest', async () => {
      seed();
      tripEnrichments = {
        museum: {
          summary: {
            en: {
              value: 'A museum in Bloomsbury, London.',
              lang: 'en',
              source: 'wikipedia',
              license: 'CC BY-SA 4.0',
              fetchedAt: '2026-07-19T09:00:00Z',
              confidence: 1,
              method: 'settled_id',
              ref: 'Q6373',
            },
          },
        },
      } as typeof tripEnrichments;
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      await nextFrame();
      scrollIntoView.mockClear();

      fireEvent.click(screen.getByRole('button', { name: t.map.know.more }));
      await nextFrame();

      // **`start`** — the card's top, which is the only alignment that is correct at every card
      // height: `nearest` is a no-op once the box spans the scrollport, and `center` puts the
      // identity row above the fold (owner, 2026-08-05).
      expect(scrollIntoView).toHaveBeenCalledWith(BROUGHT_INTO_VIEW);
      const target = scrollIntoView.mock.instances.at(-1) as HTMLElement;
      expect(target.getAttribute('data-place')).toBe('museum');
    });
  });

  // **LEAVING THE MAP EXTREME BRINGS THE SELECTION WITH YOU** (owner, 2026-08-05, with a
  // screenshot of the selected card opening below the fold). A selection made at `map` cannot
  // scroll anything — there is no list on screen, which is why `select` returns early there — so
  // switching to the list showed it at whatever offset it was left at.
  // ── ADR-0168 §4: A SECOND TAP CLOSES WHAT THE FIRST OPENED ─────────────────────
  // Owner: _"when you select a place card from the list it expands to show more info, I need it
  // to shrink back when clicking again."_ Selecting opens a card inside the row — the summary,
  // the notes, the references, the footer — and the only ways out were selecting something else
  // or the back gesture.
  describe('a selected row closes on the next tap', () => {
    it('closes the row it opened, and the pin lets go with it', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).toContain('selected');

      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).not.toContain('selected');
      const pins = paneProps.current.pins as { placeId: string; selected?: boolean }[];
      expect(pins.every((pin) => !pin.selected)).toBe(true);
    });

    // **The one case it must NOT fire**, and the reason `openedFromRow` exists at all: a pin
    // tap only PANS (ADR-0129 §1), so the row's own tap is the gesture that frames — ADR-0134
    // §6, the one way to see a place you selected on the canvas and then went to the list for.
    // Reading that as "a second press" would have deleted it.
    it('frames instead, when the CANVAS is what opened the row — and closes on the tap after', () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(pin('museum')!);
      expect(row('museum')!.className).toContain('selected');
      expect(framed()).toBe('');

      fireEvent.click(row('museum')!);
      expect(framed()).toBe('35.6,139.6');
      expect(row('museum')!.className).toContain('selected');

      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).not.toContain('selected');
    });

    // The expansion is a state OF the selected row, so closing the row takes it — otherwise
    // re-selecting the same place re-opened its research card.
    it('re-opens collapsed, not expanded, after being closed', () => {
      seed();
      tripEnrichments = {
        museum: { summary: { text: 'A museum.', lang: 'he' } },
      } as unknown as typeof tripEnrichments;
      render(wrap(<MapView />));
      fireEvent.click(row('museum')!);
      fireEvent.click(screen.getByRole('button', { name: t.map.know.more }));
      expect(screen.queryByRole('button', { name: t.map.know.back })).toBeTruthy();

      // Three taps, and the order is the rule: the innermost state closes first. Leave the
      // expansion, close the row, open it again.
      fireEvent.click(row('museum')!);
      fireEvent.click(row('museum')!);
      fireEvent.click(row('museum')!);
      expect(row('museum')!.className).toContain('selected');
      expect(screen.queryByRole('button', { name: t.map.know.back })).toBeNull();
    });
  });

  describe('the selection survives the stop change', () => {
    it('centres the selected row when the list comes back on screen', async () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      fireEvent.click(pin('museum')!);
      await nextFrame();
      // Nothing to scroll at the map extreme: the tapped place is a card on the canvas.
      scrollIntoView.mockClear();

      fireEvent.click(toggle(t.map.view.list));
      await nextFrame();

      expect(scrollIntoView).toHaveBeenCalledWith(BROUGHT_INTO_VIEW);
      // The row it brought up is the selected one, not whichever was nearest the top.
      const target = scrollIntoView.mock.instances.at(-1) as HTMLElement;
      expect(target.getAttribute('data-place')).toBe('museum');
    });

    it('scrolls nothing when there is no selection to bring along', async () => {
      seed();
      render(wrap(<MapView />));
      fireEvent.click(toggle(t.map.view.map));
      scrollIntoView.mockClear();

      fireEvent.click(toggle(t.map.view.list));
      await nextFrame();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  // ── Phase 8: the canvas's own chrome (ADR-0126) ───────────────────────────
  // The pane's own markup is `MapPane`'s test; what belongs here is the half the
  // SCREEN owns — the order, the two headers, the shortfall the list has to state, and
  // the ladder locate routes into.
  describe('the area is a SORT, not a filter (ADR-0126 §5)', () => {
    // Bounds that hold `museum`, `lunch` and the ghost `tomorrow`, and exclude `far`.
    // `far` sits mid-schedule, so an area order is a visible re-order rather than the
    // order it started in — which is the trap the design mockup fell into first.
    const VIEW = { north: 35.7, south: 35.5, east: 139.7, west: 139.5 };
    const OUTSIDE = { lat: 35.9, lng: 139.9 };

    const seedArea = () => {
      tripPlaces = [
        place('museum', true, { lat: 35.6, lng: 139.6 }),
        place('far', true, OUTSIDE),
        place('lunch', true, { lat: 35.61, lng: 139.61 }),
        place('tomorrow', true, { lat: 35.62, lng: 139.62 }),
      ];
      tripEvents = [
        event({ id: 'e1', placeId: 'museum', startsAt: `${ACTIVE_DATE}T13:00:00Z` }),
        event({ id: 'e2', placeId: 'far', startsAt: `${ACTIVE_DATE}T14:00:00Z` }),
        event({ id: 'e3', placeId: 'lunch', startsAt: `${ACTIVE_DATE}T15:00:00Z` }),
        event({ id: 'e4', placeId: 'tomorrow', date: NEXT_DAY }),
      ];
    };
    /** The map settled: the only way `viewBounds` is ever written (§9's idle rule). */
    const settle = (bounds: typeof VIEW | null = VIEW) =>
      act(() => (paneProps.current.onViewChange as (b: unknown) => void)(bounds));

    const openArea = () => {
      seedArea();
      render(wrap(<MapView />));
      settle();
      tapAreaSort();
    };

    it('orders the in-view places first and HIDES NOTHING', () => {
      seedArea();
      render(wrap(<MapView />));
      settle();
      expect(rowNames()).toEqual(['museum', 'far', 'lunch']);
      tapAreaSort();
      expect(rowNames()).toEqual(['museum', 'lunch', 'far']);
    });

    // Two headers where near-me needs one: a distance is legible on every row, "in
    // view" is not, so the boundary the first group ends at has to be drawn.
    it('draws both group headers, and drops the day blocks like any sort intent', () => {
      openArea();
      expect(groupHeads()).toEqual([t.map.area.groupHeader, t.map.area.elsewhere]);
      expect(groupHeads()).not.toContain(t.map.blockHeader.ahead);
    });

    // THE PREREQUISITE. `areaCount` reads the canvas and counts ghosts; the list
    // cannot produce them. So the count stays spatial and the LIST says what it could
    // not bring, in session 144's grammar.
    it('states how many of the counted places this day cannot show', () => {
      openArea();
      // THREE pins in view — `museum`, `lunch` and the ghost `tomorrow` — against a
      // list that can offer two of them. `far` is a day stop the camera is not looking
      // at, which is the ordinary case and not the gap.
      expect(paneProps.current.areaCount).toBe(3);
      expect(rowNames()).toEqual(['museum', 'lunch', 'far']);
      expect(document.body.textContent).toContain(t.map.area.otherDays(1));
    });

    // And the way out genuinely resolves it, rather than explaining it away.
    it('all-days removes the ghost, so the count and the list converge', () => {
      openArea();
      fireEvent.click(screen.getByRole('button', { name: t.map.emptyDay.action }));
      settle();
      expect(rowNames()).toContain('tomorrow');
      expect(document.body.textContent).not.toContain(t.map.area.otherDays(1));
    });

    // The bounds are snapshotted at the TAP: the tap raises the sheet, which resizes
    // the pane and fires a fresh idle, so an order keyed on live bounds would
    // re-shuffle the instant it was created.
    it('a later camera idle does not re-order the list', () => {
      openArea();
      const ordered = rowNames();
      settle({ north: 36.5, south: 35.8, east: 140.5, west: 139.8 });
      expect(rowNames()).toEqual(ordered);
    });

    it('a second tap clears it and the schedule order returns', () => {
      openArea();
      expect(areaSortOn()).toBe('true');
      tapAreaSort();
      expect(areaSortOn()).toBe('false');
      expect(rowNames()).toEqual(['museum', 'far', 'lunch']);
    });

    // One list, one order.
    it('near-me and the area sort are mutually exclusive', () => {
      openArea();
      geoFix = { lat: 35.6, lng: 139.6 };
      permissionState = 'granted';
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.map.near.chip) }));
      expect(areaSortOn()).toBe('false');
    });

    it('a day-scope change clears it: a new day is a new list', () => {
      openArea();
      expect(areaSortOn()).toBe('true');
      fireEvent.click(listButton(t.map.allDays));
      expect(areaSortOn()).toBe('false');
    });

    // ADR-0122 §7's rule, now with a third caller: the order it just produced is
    // invisible at the `map` stop, so the sheet comes up to show it.
    it('tapping it at the map extreme lifts the sheet to half', () => {
      seedArea();
      render(wrap(<MapView />));
      settle();
      fireEvent.click(toggle(t.map.view.map));
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
      tapAreaSort();
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
    });
  });

  // #19: the same tap used to centre you or re-frame the filtered set depending on a
  // permission you could not see. Locate is locate-only now, and it is what finally
  // gives the canvas a way to ASK (ADR-0122 §2's handed-forward gap).
  describe('locate is locate-only, and routes to the card (ADR-0126 §6)', () => {
    it('with no permission it opens the SAME reason-first card the chip opens', async () => {
      seed();
      permissionState = 'prompt';
      render(wrap(<MapView />));
      // Dismiss the on-open offer so what is on screen next is the locate tap's doing.
      await vi.waitFor(() =>
        expect(screen.getByRole('button', { name: t.map.near.prompt.notNow })).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole('button', { name: t.map.near.prompt.notNow }));
      expect(document.querySelector('.map-geoprompt')).toBeNull();
      tapLocate();
      expect(document.querySelector('.map-geoprompt')).toBeTruthy();
      // It ROUTES to the card; it never asks the device itself (ADR-0121 §12).
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    // Session 138's split is what makes this safe: locate sets the FACT, never the
    // sort intent, so granting through it must not re-order the day.
    it('granting through locate lights the dot and leaves the list in schedule order', async () => {
      seed();
      permissionState = 'granted';
      geoFix = { lat: 35.6, lng: 139.6 };
      render(wrap(<MapView />));
      await act(async () => {});
      const before = rowNames();
      tapLocate();
      expect(paneProps.current.me).toEqual(geoFix);
      expect(rowNames()).toEqual(before);
      const chip = screen.getByRole('button', { name: new RegExp(t.map.near.chip) });
      expect(chip.getAttribute('aria-pressed')).toBe('false');
    });

    // §7's rule keys on the OUTCOME, not the tap: with location services off the
    // browser still reports `granted` and the request fails anyway, so this is only
    // knowable once it has settled. The notice lives in the list, hence the lift.
    it('an UNOBTAINABLE fix lifts the sheet, so the notice it wrote is on screen', async () => {
      seed();
      permissionState = 'granted';
      geoErrorCode = 2; // POSITION_UNAVAILABLE — not a refusal, and not visible up front
      render(wrap(<MapView />));
      await act(async () => {});
      fireEvent.click(toggle(t.map.view.map));
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.map);
      tapLocate();
      await act(async () => {});
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
      expect(document.body.textContent).toContain(t.map.near.unavailableBanner);
    });

    // A hard refusal is knowable before asking, so it takes the same lift immediately
    // rather than through a request that cannot re-prompt.
    it('a standing refusal lifts the sheet without asking again', async () => {
      seed();
      permissionState = 'denied';
      render(wrap(<MapView />));
      // `blocked` is what the Permissions API answers, a microtask later.
      await vi.waitFor(() => expect(document.querySelector('[data-locate]')).toBeTruthy());
      await act(async () => {});
      fireEvent.click(toggle(t.map.view.map));
      tapLocate();
      expect(screenEl().dataset.view).toBe(MAP_SHEET_VIEW.half);
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });
  });

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
