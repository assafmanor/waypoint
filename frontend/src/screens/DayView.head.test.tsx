// @vitest-environment jsdom
//
// **THE DAY'S HEAD, ON THE TRIP SURFACE** (ADR-0219 §2/§3/§4) — what replaced `.sec-title`'s
// 12px muted `יום 3 · ראשון · איסלנד`, and what the strip above the list turned into.
//
// It is a screen spec rather than a `DayHead` one because the component is tested where it lives
// (`ui/domain/DayHead.test.tsx`, its shape) and the derivations are tested where they live
// (`@waypoint/shared`'s `day-title` and `sharing`, their rules). What is only observable here is
// that the screen connects one to the other over the day's real rows — `frontend/CLAUDE.md`'s
// named anti-pattern is changing a day-surface derivation in `DayView` only, and it has cost a
// release twice.
//
// The GEOMETRY is not asserted here and cannot be: jsdom loads no CSS, resolves no `var()` and
// reports every rect as zero. The 360px measurements are in the PR and in ADR-0219.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type DeliveredEnrichmentFields,
  type Place,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import { buildHostContextIndex } from '../lib/host-context';
import '../test/scroll-into-view';

const DAY = '2026-08-03';
const NOW = `${DAY}T09:00:00Z`;
const ZONE = 'Atlantic/Reykjavik';
const DESTINATION = 'איסלנד';

const ev = (id: string, e: Partial<TripEvent> = {}): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: DAY,
  sortOrder: 0,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
  ...e,
});

const place = (id: string, name: string, lat: number, lng: number): Place => ({
  id,
  tripId: 't1',
  name,
  lat,
  lng,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
});
const HAIFOSS = place('p-haifoss', 'Háifoss', 64.2, -19.6);
const GEYSIR = place('p-geysir', 'Geysir', 64.31, -20.3);

/** A delivered image that CLEARS `dayPhoto`'s gate: `confidence ≥ 0.9`, and a credit we can
 *  print. Both halves matter — the specs below take each away in turn. */
const image = (over: Partial<DeliveredEnrichmentFields['image']> = {}) => ({
  url: '/enrichment/images/haifoss',
  mimeType: 'image/jpeg',
  width: 1200,
  height: 800,
  sizeBytes: 90_000,
  source: 'commons' as const,
  license: 'CC BY-SA 4.0',
  attribution: 'A. Photographer',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  method: 'name_proximity' as const,
  ref: 'Q38519',
  confidence: 1,
  ...over,
});

let tripEvents: TripEvent[] = [];
let tripBookings: Booking[] = [];
let tripPlaces: Place[] = [];
let tripEnrichments: TripEnrichments = {};
let activeDate = DAY;

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    travelModeOverrides: [],
    travelModeVerbs: { setLegMode: vi.fn(), clearLegMode: vi.fn() },
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: {
      id: 't1',
      timezone: ZONE,
      destination: DESTINATION,
      startDate: DAY,
      endDate: '2026-08-06',
      updatedBy: 'u1',
    },
    bookings: tripBookings,
    places: tripPlaces,
    enrichments: tripEnrichments,
    events: tripEvents,
    maybeItems: [],
    justAddedIdea: null,
    notes: [],
    documents: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places: tripPlaces,
      crossings: [],
      primaryZone: ZONE,
    },
    activeDate,
    ripple: null,
    setActiveDate: () => {},
    changeFeed: [],
    dismissChange: () => {},
    clearChangeFeed: () => {},
    fxRates: null,
    refreshFx: async () => {},
    tasks: [],
    users: [],
    zoneCrossings: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
  }),
}));

vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: null }) }));
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({
    done: vi.fn(),
    skip: vi.fn(),
    restore: vi.fn(),
    onWay: vi.fn(),
    rippleApply: vi.fn(),
    rippleDismiss: vi.fn(),
    reorder: vi.fn(),
    delay: vi.fn(),
    earlier: vi.fn(),
  }),
}));
vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({ estimateFor: () => null, warmingFor: () => false }),
  useDayShapes: () => ({ pathFor: () => null }),
}));

const { DayView } = await import('./DayView');

const show = () =>
  render(
    wrapNav(
      <MapScopeProvider>
        <DragProvider>
          <DayView />
        </DragProvider>
      </MapScopeProvider>,
    ),
  );

const head = () => document.querySelector('.day-swipe > .day-page .wp-dayhead')!;

beforeEach(() => {
  setSimulatedNow(Date.parse(NOW));
  tripEvents = [];
  tripBookings = [];
  tripPlaces = [];
  tripEnrichments = {};
  activeDate = DAY;
});
afterEach(() => {
  cleanup();
  setSimulatedNow(null);
});

describe('the day’s head (ADR-0219 §2)', () => {
  it('stamps the day of the month and the weekday, and does not repeat the trip ordinal', () => {
    show();
    const date = head().querySelector('.wp-dayhead-date')!;
    expect(date.textContent).toContain('03');
    // `יום 3` is the header anchor's (`יום 3/12`) and the destination is the trip's name, so
    // neither is repeated in the head — the whole reason the old `.sec-title` line is gone.
    expect(head().textContent).not.toContain(t.day.heading(1, '', DESTINATION));
  });

  it('marks today amber, and only today', () => {
    show();
    expect(head().classList.contains('is-now')).toBe(true);
    expect(head().querySelector('.wp-dayhead-now')!.textContent).toBe(t.common.now);

    cleanup();
    activeDate = '2026-08-05';
    show();
    expect(head().classList.contains('is-now')).toBe(false);
    expect(head().querySelector('.wp-dayhead-now')).toBeNull();
  });

  it('names an empty day by the trip’s destination — the one word it still has', () => {
    show();
    expect(head().querySelector('.wp-dayhead-copy > strong')!.textContent).toBe(DESTINATION);
  });

  it('names a day by the place its stops share', () => {
    tripPlaces = [HAIFOSS];
    tripEvents = [ev('a', { placeId: HAIFOSS.id, title: 'מפל' })];
    show();
    expect(head().querySelector('.wp-dayhead-copy > strong')!.textContent).toContain('Háifoss');
  });

  it('names a day that moves as its route', () => {
    tripPlaces = [HAIFOSS, GEYSIR];
    tripEvents = [
      ev('a', { placeId: HAIFOSS.id, startsAt: `${DAY}T09:00:00Z` }),
      ev('b', { placeId: GEYSIR.id, startsAt: `${DAY}T13:00:00Z` }),
    ];
    show();
    const title = head().querySelector('.wp-dayhead-copy > strong')!.textContent!;
    expect(title).toContain('Háifoss');
    expect(title).toContain('Geysir');
  });
});

describe('the day’s shot (ADR-0219 §3)', () => {
  beforeEach(() => {
    tripPlaces = [HAIFOSS];
    tripEvents = [
      ev('a', {
        placeId: HAIFOSS.id,
        startsAt: `${DAY}T09:00:00Z`,
        endsAt: `${DAY}T12:00:00Z`,
      }),
    ];
  });

  it('shows the picture, its subject and its credit, when a stop clears the gate', () => {
    tripEnrichments = { [HAIFOSS.id]: { image: image() } };
    show();
    const shot = head().querySelector('.wp-dayhead-shot')!;
    expect(shot.querySelector('img')!.getAttribute('src')).toContain('/enrichment/images/haifoss');
    expect(shot.querySelector('figcaption')!.textContent).toContain('Háifoss');
    expect(shot.querySelector('figcaption')!.textContent).toContain('CC BY-SA 4.0');
    // The first thing on the page, so it is fetched eagerly rather than lazily.
    expect(shot.querySelector('img')!.getAttribute('loading')).toBe('eager');
  });

  // Both halves of the gate, and the absence is the design: a day whose stops clear no gate has
  // no shot and no placeholder. Nine days with photos and three without reads as honest.
  it('stands alone below the confidence floor', () => {
    tripEnrichments = { [HAIFOSS.id]: { image: image({ confidence: 0.8 }) } };
    show();
    expect(head().querySelector('.wp-dayhead-shot')).toBeNull();
  });

  it('stands alone when the picture cannot be credited', () => {
    tripEnrichments = { [HAIFOSS.id]: { image: image({ attribution: undefined, license: '' }) } };
    show();
    expect(head().querySelector('.wp-dayhead-shot')).toBeNull();
  });

  it('stands alone when nothing is known about the day’s stops at all', () => {
    show();
    expect(head().querySelector('.wp-dayhead-shot')).toBeNull();
  });
});

describe('the head’s footer band (ADR-0219 §2/§4)', () => {
  it('carries the day’s one action, at the end edge', () => {
    show();
    expect(head().querySelector('.wp-dayhead-foot > .new-event-btn')!.textContent).toContain(
      t.actions.newEvent,
    );
  });

  // A read-only past day: create is gated (ADR-0029), so there is nothing in the band and the
  // band itself is absent rather than empty.
  it('is absent entirely on an archive day, and the banner keeps only its tag', () => {
    activeDate = '2026-07-20';
    show();
    expect(head().querySelector('.wp-dayhead-foot')).toBeNull();
    expect(head().querySelector('.new-event-btn')).toBeNull();
    const banner = document.querySelector('.day-swipe > .day-page .archive-banner')!;
    expect(banner.querySelector('.ab-main')!.textContent).toBe(t.day.archiveTag);
    // The control stays — the banner lost its heading, not its way back.
    expect(banner.querySelector('.ab-back')!.textContent).toContain(t.header.backToToday);
  });
});

describe('what the retired strip carried (ADR-0219 §4)', () => {
  it('draws no ambient strip at all', () => {
    tripPlaces = [HAIFOSS];
    tripEvents = [ev('a', { placeId: HAIFOSS.id })];
    show();
    expect(document.querySelector('.day-ambient')).toBeNull();
    expect(document.querySelector('.ambient')).toBeNull();
  });

  // **An untimed hard booking is a row now**, on `.transition-row`'s grammar, above the first
  // event — so §10a-i's "a claim on your day reads at the top" holds with no strip to hold it.
  it('renders an untimed commitment as the first row of the list, above the events', () => {
    tripBookings = [{ id: 'b1', tripId: 't1', type: BOOKING_TYPE.ACTIVITY } as Booking];
    tripEvents = [
      ev('timed', { startsAt: `${DAY}T13:00:00Z`, endsAt: `${DAY}T14:00:00Z` }),
      ev('untimed', { kind: EVENT_KIND.HARD, bookingId: 'b1', title: 'איסוף כרטיסים' }),
    ];
    show();
    const list = document.querySelector('.day-swipe > .day-page .day-list')!;
    const rows = [...list.querySelectorAll('.transition-row, .wp-event')];
    expect(rows[0].classList.contains('transition-row')).toBe(true);
    expect(rows[0].textContent).toContain('איסוף כרטיסים');
    expect(rows[0].querySelector('.tr-clock')!.textContent).toBe(t.day.noTime);
    // Trip mode's posture: the settle pair is here, because ADR-0164 counts this row in
    // `נותרו היום` until somebody answers.
    expect(rows[0].querySelector('.wp-settle')).toBeTruthy();
  });
});
