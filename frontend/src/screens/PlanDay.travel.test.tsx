// @vitest-environment jsdom
//
// **PLAN MODE'S HOLE, ONCE THE JOURNEY IN IT IS COUNTED** (ADR-0206 §V1.1).
//
// The other half of §V1.1, and the reason it is not M9's: Trip mode STATES a hole and Plan mode
// OFFERS it (ADR-0161 §2), so the same overstatement reaches a person here as a **slot** — a chip
// saying `פער של 3 שעות` over a hole a 40-minute walk eats. ADR-0159 §1 allows the two surfaces to
// differ in POSTURE and forbids a difference about a FACT, and how much of a hole is free is a
// fact; `frontend/CLAUDE.md` names "changing a day-surface derivation in `DayView` only" as having
// cost a release twice.
//
// **Both assertions below were red against `main`**, where the chip read the whole hole.
//
// What is NOT changed here, deliberately: `earnsChip`'s threshold still asks the RAW hole, so
// which positions exist at all is untouched. That is a decision about the builder's drop targets
// (ADR-0161 §2) and it belongs to M9.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type TravelEstimate,
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
/** Pinned, and mid-morning so the day is neither a past archive (which offers no positions at
 *  all, ADR-0029) nor still ahead of its first row. */
const NOW = `${DAY}T09:00:00Z`;
const ZONE = 'Europe/Rome';

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

const places: Place[] = [
  {
    id: 'p-lunch',
    tripId: 't1',
    name: 'שוק צוקיג׳י',
    lat: 40.867,
    lng: 14.25,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
  {
    id: 'p-theatre',
    tripId: 't1',
    name: 'קאבוקי-זה',
    lat: 40.851,
    lng: 14.258,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
];

/** The drawing's own scenario again — a 2:40 hole, a 40-minute walk, 2:00 left — so this file, the
 *  day list's spec and `a-travel-time-between-two-points-v2.html` cannot disagree about the case.
 *  Plan's label is the ROUNDED one (`gapLabel`, ADR-0159 §2: Plan offers, Trip measures), which is
 *  why 160 minutes reads as three hours and 120 as two. */
const WALK_MINUTES = 40;

const lunch = ev('lunch', {
  title: 'ארוחת צהריים',
  placeId: 'p-lunch',
  startsAt: `${DAY}T11:00:00Z`,
  endsAt: `${DAY}T13:20:00Z`,
});
const theatre = ev('theatre', {
  title: 'תיאטרון',
  placeId: 'p-theatre',
  startsAt: `${DAY}T16:00:00Z`,
  endsAt: `${DAY}T18:30:00Z`,
});

let tripEvents: TripEvent[] = [];
const tripBookings: Booking[] = [];

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1', timezone: ZONE, startDate: DAY, endDate: '2026-08-05', updatedBy: 'u1' },
    bookings: tripBookings,
    places,
    events: tripEvents,
    maybeItems: [],
    justAddedIdea: null,
    notes: [],
    documents: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places,
      crossings: [],
      primaryZone: ZONE,
    },
    activeDate: DAY,
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
    reorder: vi.fn(),
    delay: vi.fn(),
    earlier: vi.fn(),
    rippleApply: vi.fn(),
    rippleDismiss: vi.fn(),
  }),
}));

let travelSeconds: number | null = null;
vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({
    estimateFor: (): TravelEstimate | null =>
      travelSeconds === null
        ? null
        : { mode: TRAVEL_MODE.WALKING, durationSeconds: travelSeconds, distanceMeters: 2400 },
  }),
  useDayShapes: () => ({ pathFor: () => null }),
}));

const { PlanDay } = await import('./PlanDay');

const show = () =>
  render(
    wrapNav(
      <MapScopeProvider>
        <DragProvider>
          <PlanDay />
        </DragProvider>
      </MapScopeProvider>,
    ),
  );

/** Plan's own rounded wording, read through the screen's copy rather than written out. */
const chip = (hoursWord: string) => t.planDay.gap(hoursWord);

describe('PlanDay — the chip offers what is free AFTER the journey (ADR-0206 §V1.1)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, theatre];
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  // RED against `main`: the chip read the whole 2:40 hole and offered three hours.
  it('offers two hours where a forty-minute walk eats the rest', () => {
    show();
    expect(screen.getByText(chip(t.planDay.gapTwoHours))).toBeTruthy();
  });

  it('no longer offers the whole hole', () => {
    show();
    expect(screen.queryByText(chip(t.planDay.gapHours(3)))).toBeNull();
  });

  // §D4 — with no estimate the control reads exactly as it read before this milestone. Never a
  // pessimistic guess: a chip that under-offers is a slot somebody cannot use.
  it('offers the whole hole when there is no estimate', () => {
    travelSeconds = null;
    show();
    expect(screen.getByText(chip(t.planDay.gapHours(3)))).toBeTruthy();
  });
});

// ── THE SAME FACT ON PLAN'S SURFACE (ADR-0206 §AI1) ───────────────────────────────────────
//
// ADR-0159 §1 allows the two day surfaces to differ in POSTURE and forbids a difference about a
// FACT, and whether the app may name a departure is a fact. `frontend/CLAUDE.md` names "changing a
// day-surface derivation in `DayView` only" as having cost a release twice.
describe('PlanDay — a leg into a window states no departure either (§AI1)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, { ...theatre, startWindowEnd: `${DAY}T19:00:00Z` }];
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('offers no departure, and no late mark to go with it', () => {
    show();
    const block = document.querySelector('.day-trv');
    expect(block).toBeTruthy();
    expect(block!.textContent).not.toContain('יציאה');
    expect(document.querySelector('.day-trv.miss')).toBeNull();
  });

  it('states the arrival instead', () => {
    show();
    expect(document.querySelector('.day-trv')!.textContent).toContain('הגעה');
  });
});
