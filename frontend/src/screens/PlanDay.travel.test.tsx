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
  type TravelModeOverride,
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

let tripOverrides: TravelModeOverride[] = [];
const travelModeVerbs = {
  setLegMode: vi.fn(async () => {}),
  clearLegMode: vi.fn(async () => {}),
};

let tripEvents: TripEvent[] = [];
/** Mutable like `DayView.travel.test.tsx`'s, so a describe can add the place its own fixture
 *  needs: `useDayTravelReads` skips any leg whose two ends do not both resolve to coordinates,
 *  which is a silently ABSENT journey block rather than a failure. */
let tripPlaces: Place[] = places;
const tripBookings: Booking[] = [];

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    // The declared legs, mutable so a spec can declare one and re-render (ADR-0206 §AM). Stated
    // rather than omitted: `useDayTravelReads` takes it as a REQUIRED list precisely so a surface
    // cannot forget to wire it and silently ignore every declaration on the trip.
    travelModeOverrides: tripOverrides,
    travelModeVerbs,
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1', timezone: ZONE, startDate: DAY, endDate: '2026-08-05', updatedBy: 'u1' },
    bookings: tripBookings,
    places: tripPlaces,
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

// One reset for the whole file rather than one per describe: a declaration leaking from a spec
// into the next would change what every following read says, and the leak would look like a bug in
// the derivation rather than in the fixture.
beforeEach(() => {
  tripOverrides = [];
  travelModeVerbs.setLegMode.mockClear();
  travelModeVerbs.clearLegMode.mockClear();
});

describe('PlanDay — the chip offers what is free AFTER the journey (ADR-0206 §V1.1)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, theatre];
    tripPlaces = places;
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

// ── THE STAY'S TWO ROWS, ON PLAN'S SURFACE TOO (ADR-0209 §1) ──────────────────────────────
//
// The same two facts, off the same `dayBookendStays` the map's stop sequence reads. ADR-0159 §1
// allows the two day surfaces to differ in POSTURE and forbids a difference about a FACT, and "you
// slept there" is not a posture — so what differs here is only the settle pair, which Plan takes
// through a row menu (ADR-0171 §10e).
describe('PlanDay — the day says where it starts and ends', () => {
  const stay = ev('stay', {
    title: 'מלון סנטרו',
    category: 'lodging',
    kind: EVENT_KIND.HARD,
    placeId: 'p-lunch',
    date: '2026-08-01',
    endDate: '2026-08-05',
    startsAt: '2026-08-01T13:00:00Z',
    endsAt: '2026-08-05T09:00:00Z',
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [stay, lunch, theatre];
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('names it once at each end, and not in the strip as well', () => {
    show();
    const named = [...document.querySelectorAll('.tr-title')].filter((el) =>
      el.textContent?.includes('מלון'),
    );
    expect(named).toHaveLength(2);
    expect(document.querySelector('.day-ambient .an')).toBeNull();
  });

  // Plan's posture: no inline settle pair on the row (ADR-0171 §10e).
  it('offers no settle pair on it', () => {
    show();
    expect(document.querySelector('.transition-row .wp-settle')).toBeNull();
  });
});

// **THE DAY'S HEAD, AS PLAN MODE DRAWS IT** — both halves of the 2026-08-26 field report.
//
// Plan mode's copies of two derivations had drifted from Trip mode's, which is
// `frontend/CLAUDE.md`'s "changing a day-surface derivation in `DayView` only" for the third
// time. ADR-0159 §1 allows the two surfaces to differ in POSTURE and forbids a difference about
// a FACT, and both of these are facts.
describe('PlanDay — the day starts where the day started', () => {
  const hotelPlace: Place = {
    id: 'p-hotel',
    tripId: 't1',
    name: 'מלון',
    lat: 40.86,
    lng: 14.24,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  /** Checked in the night before, out at ⁦11:00⁩ today — the check-out day the report came from. */
  const stay = ev('stay', {
    title: 'The Hill Hotel at Fludir',
    category: 'lodging',
    placeId: 'p-hotel',
    date: '2026-08-02',
    endDate: DAY,
    startsAt: '2026-08-02T13:00:00Z',
    endsAt: `${DAY}T11:00:00Z`,
  });
  /** The day's first stop, EARLIER than the check-out ceiling — which is the ordinary shape of a
   *  travel day and the shape that read `אין זמן לדרך`. */
  const falls = ev('falls', {
    title: 'Háifoss',
    placeId: 'p-theatre',
    startsAt: `${DAY}T08:00:00Z`,
    endsAt: `${DAY}T09:00:00Z`,
  });
  const hire = ev('hire', {
    title: 'Iceland Car Rental',
    category: 'transport',
    icon: '🚗',
    placeId: 'p-lunch',
    date: DAY,
    endDate: '2026-08-12',
    startsAt: `${DAY}T00:00:00Z`,
    endsAt: '2026-08-12T08:00:00Z',
  });

  beforeEach(() => {
    // Before the first stop, so the leg is the AHEAD arm and prints a clock to read.
    setSimulatedNow(Date.parse(`${DAY}T06:00:00Z`));
    tripEvents = [stay, hire, falls];
    tripPlaces = [...places, hotelPlace];
    travelSeconds = 62 * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  // RED against `main`: `planJourney` passed the stay's own `endsAt` — its check-out CEILING —
  // as the hole's earliest departure, so an ⁦11:00⁩ check-out measured against an ⁦08:00⁩ waterfall
  // reported a journey nobody can make. Trip mode has omitted it since ADR-0206 §AD.
  it('states when to leave for a stop that is before the check-out', () => {
    show();
    // Across ALL the day's blocks, not `.first()`: the fixture also carries the midnight hire, so
    // the drive that brought you to the bed is a block of its own above the stay row.
    const blocks = [...document.querySelectorAll('.day-trv')].map((b) => b.textContent ?? '');
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((b) => b.includes(t.travel.noTimeForTravel))).toBe(false);
    expect(blocks.some((b) => b.includes('יציאה'))).toBe(true);
  });

  // RED against `main`: the pickup row sat below the bed, so the day read "wake at the hotel,
  // then drive out to the counter at midnight". Same rule, same predicate as the map's.
  it('puts a midnight pickup above the stay row', () => {
    show();
    const titles = [...document.querySelectorAll('.transition-row .tr-title')].map(
      (n) => n.textContent ?? '',
    );
    expect(titles.indexOf('Iceland Car Rental')).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf('Iceland Car Rental')).toBeLessThan(
      titles.indexOf('The Hill Hotel at Fludir'),
    );
  });
});

// **THE LAST LEG OF DAY 1** (ADR-0206 §AJ1), reported off the §AI deploy: the flight lands at 23:20
// and the hotel checked into that night opens `מ-15:00`, so the fit measured the 1:42 drive against
// a deadline **eight hours behind its own origin** and said `אין זמן לדרך` about the one leg of the
// day nobody can be late for. The owner's own framing — _"we're checking in technically the day
// after check in day, at like 2am"_ — is the shape: an open floor is not a deadline.
describe('PlanDay — the drive into tonight’s hotel cannot be impossible', () => {
  const hotelPlace: Place = {
    id: 'p-hotel',
    tripId: 't1',
    name: 'מלון',
    lat: 40.86,
    lng: 14.24,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  /** Checked in TODAY and out tomorrow, so this day's bookend is `sleeps`. Its `startsAt` is the
   *  desk's opening hour, which is the bound the fit was reading as a deadline. */
  const stay = ev('stay', {
    title: 'Gissurarbúð 5',
    category: 'lodging',
    placeId: 'p-hotel',
    date: DAY,
    endDate: '2026-08-04',
    startsAt: `${DAY}T15:00:00Z`,
    endsAt: '2026-08-04T09:00:00Z',
  });
  /** The day's last row: a flight landing well after the desk opened. */
  const landing = ev('landing', {
    title: 'קפלאוויק ← וינה',
    category: 'transport',
    kind: EVENT_KIND.HARD,
    placeId: 'p-theatre',
    startsAt: `${DAY}T18:40:00Z`,
    endsAt: `${DAY}T23:20:00Z`,
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(`${DAY}T09:00:00Z`));
    tripEvents = [stay, landing];
    tripPlaces = [...places, hotelPlace];
    travelSeconds = 102 * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  // RED against `main`.
  it('says when you will get there instead of refusing the drive', () => {
    show();
    const block = document.querySelector('.day-trv');
    expect(block).toBeTruthy();
    expect(block!.textContent).not.toContain(t.travel.noTimeForTravel);
    expect(block!.textContent).toContain('הגעה');
  });
});

// **THE DRIVE THAT BROUGHT YOU TO THE BED** (owner, 2026-08-26: _"it should also show the way from
// the car rental to the hotel, right?"_). ADR-0054's amendment refused it that morning because a leg
// into a check-in FLOOR read `אין זמן לדרך`; §AJ1 removed that, so the leg is drawn and says the one
// thing it can.
describe('PlanDay — the drive from the pickup into the bed', () => {
  const hotelPlace: Place = {
    id: 'p-hotel',
    tripId: 't1',
    name: 'מלון',
    lat: 40.86,
    lng: 14.24,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  /** Woke here: checked in yesterday, out this morning. */
  const stay = ev('stay', {
    title: 'Gissurarbúð 5',
    category: 'lodging',
    placeId: 'p-hotel',
    date: '2026-08-02',
    endDate: DAY,
    startsAt: '2026-08-02T13:00:00Z',
    endsAt: `${DAY}T11:00:00Z`,
  });
  /** Collected at midnight — a floor, so it reads above the bed (ADR-0054). Its `endsAt` is the
   *  RETURN, nine days out, which is why the leg carries the edge's own instant instead. */
  const hire = ev('hire', {
    title: 'Iceland Car Rental',
    category: 'transport',
    icon: '🚗',
    placeId: 'p-lunch',
    date: DAY,
    endDate: '2026-08-12',
    startsAt: `${DAY}T00:00:00Z`,
    endsAt: '2026-08-12T08:00:00Z',
  });
  const falls = ev('falls', {
    title: 'Háifoss',
    placeId: 'p-theatre',
    startsAt: `${DAY}T09:00:00Z`,
    endsAt: `${DAY}T10:00:00Z`,
  });

  beforeEach(() => {
    // Before the drive itself, so the block is the AHEAD arm rather than a record of last night.
    setSimulatedNow(Date.parse(`${DAY}T00:05:00Z`));
    tripEvents = [stay, hire, falls];
    tripPlaces = [...places, hotelPlace];
    travelSeconds = 31 * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('says the arrival rather than refusing the drive', () => {
    show();
    const blocks = [...document.querySelectorAll('.day-trv')].map((b) => b.textContent ?? '');
    expect(blocks.some((b) => b.includes('הגעה'))).toBe(true);
    expect(blocks.some((b) => b.includes(t.travel.noTimeForTravel))).toBe(false);
  });

  // The whole reason the leg carries `departAfterMs`: read off the hire's own `endsAt` the arrival
  // would be nine days out, and off its `startsAt` via `endsAt ?? startsAt` it would never be read.
  it('measures it from the pickup instant, not the hire’s return', () => {
    show();
    const arrival = [...document.querySelectorAll('.day-trv')]
      .map((b) => b.textContent ?? '')
      .find((b) => b.includes('הגעה'))!;
    // ⁦00:00⁩Z + ⁦31⁩ min, printed in the day's own zone (`Europe/Rome`, so ⁦02:31⁩) — the fixture's zone
    // rather than UTC, which is the whole point of reading a clock through `formatTime`.
    expect(arrival).toContain('02:31');
  });
});
