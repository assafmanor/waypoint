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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRANSIT_LEG_MODE,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type TravelEstimate,
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';
import { approxTravelTime, hoursPhrase } from '../lib/duration';
import { setSimulatedNow } from '../lib/useClock';
import { formatDistance, haversineMeters } from '../lib/distance';
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
      // `tripPlaces`, not the static fixture: a spec that swaps the places in (to give them a
      // zone, or to take their coordinates away) must have the zone derivation see the same rows
      // the screen does, or it reads every event in the trip's primary and the two disagree.
      places: tripPlaces,
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
/** Every ask this screen makes for a route — the day total's exit criterion is that it adds none
 *  (ADR-0206 §V1.9), and `useDayTravel` is the one seam a request can leave through. */
const travelAsks: { tripId: string; stops: readonly { lat: number; lng: number }[] }[] = [];
vi.mock('../lib/travel', () => ({
  useDayTravel: (opts: { tripId: string; stops: readonly { lat: number; lng: number }[] }) => {
    travelAsks.push(opts);
    return {
      estimateFor: (): TravelEstimate | null =>
        travelSeconds === null
          ? null
          : { mode: TRAVEL_MODE.WALKING, durationSeconds: travelSeconds, distanceMeters: 2400 },
    };
  },
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

// ── PLAN CAN CHANGE A LEG'S MODE (ADR-0206 §AM9) ──────────────────────────────────────────
//
// **The reported defect:** _"Right now you can only change the mode on the day view and not on plan
// day!"_ M8b wired the READS on both surfaces and the CONTROL on one, which is `frontend/CLAUDE.md`'s
// "changing a day-surface derivation in `DayView` only" for the third time. And Plan is where §AL10
// argued the override would mostly be set — "the sort of thing set while planning rather than while
// standing in it" — so this was the surface that needed it most.
describe('PlanDay — the leg mode is declarable here too (ADR-0206 §AM9)', () => {
  const PAIR = { fromPlaceId: 'p-lunch', toPlaceId: 'p-theatre' };

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

  it('offers the disclosure on the journey block', () => {
    show();
    const face = document.querySelector('button.day-trv-face');
    expect(face).toBeTruthy();
    expect(face!.getAttribute('aria-expanded')).toBe('false');
  });

  it('writes the override on the leg’s own pair', () => {
    show();
    fireEvent.click(document.querySelector('button.day-trv-face')!);
    fireEvent.click(screen.getByRole('button', { name: t.travelMode[TRANSIT_LEG_MODE] }));
    expect(travelModeVerbs.setLegMode).toHaveBeenCalledWith(
      PAIR.fromPlaceId,
      PAIR.toPlaceId,
      TRANSIT_LEG_MODE,
    );
  });

  // The same clear-vs-set rule Trip mode follows, because it is the hook's and not the screen's.
  it('clears rather than storing the derived mode back', () => {
    tripOverrides = [
      {
        id: 'tmo-1',
        tripId: 't1',
        ...PAIR,
        mode: TRANSIT_LEG_MODE,
        createdBy: 'u1',
        createdAt: `${DAY}T00:00:00Z`,
        updatedAt: `${DAY}T00:00:00Z`,
      } as TravelModeOverride,
    ];
    show();
    fireEvent.click(document.querySelector('button.day-trv-face')!);
    fireEvent.click(screen.getByRole('button', { name: t.travelMode[TRAVEL_MODE.WALKING] }));
    expect(travelModeVerbs.clearLegMode).toHaveBeenCalledWith(PAIR.fromPlaceId, PAIR.toPlaceId);
    expect(travelModeVerbs.setLegMode).not.toHaveBeenCalled();
  });

  // **A MODE THE GATE REFUSES KEEPS ITS BLOCK, FOR THE DECLARATION'S EXACT REASON** (ADR-0206
  // §AM10). Field report, 2026-08-27: _"I changed a drive to a walk and the route simply
  // disappeared from the plan day"_. A walk past walking's ⁦15 km⁩ ceiling has no estimate and
  // never will, so `dayJourney` answered `null` and the hole rendered nothing — including the
  // control that had just been used, which made the change irreversible on the surface that made
  // it. And it must not borrow `בלי הערכת זמן`: that says we are not estimating, where this says
  // what you asked for cannot be done.
  it('keeps the block for a leg too far for its mode, and says why', () => {
    // ⁦~46 km⁩ apart: over walking's ceiling, under driving's.
    tripPlaces = [places[0]!, { ...places[1]!, lat: 40.45, lng: 14.258 }];
    travelSeconds = null;
    tripOverrides = [
      {
        id: 'tmo-1',
        tripId: 't1',
        ...PAIR,
        mode: TRAVEL_MODE.WALKING,
        createdBy: 'u1',
        createdAt: `${DAY}T00:00:00Z`,
        updatedAt: `${DAY}T00:00:00Z`,
      } as TravelModeOverride,
    ];
    show();

    const block = document.querySelector('.day-trv');
    expect(block).toBeTruthy();
    expect(block!.textContent).toContain(t.travel.tooFarFor(t.travelMode[TRAVEL_MODE.WALKING]));
    // Not the declaration's words, which mean something else.
    expect(block!.textContent).not.toContain(t.travel.noEstimate);
    // And the way back: the control that set this is still on screen.
    expect(document.querySelector('button.day-trv-face')).toBeTruthy();
  });

  // A declared leg reads the same here as in Trip mode: the mode word, no duration, and the block
  // still standing — which is what keeps the control reachable to switch back (§AM6).
  it('reads a declared leg as תחב״צ with no duration, control still there', () => {
    tripOverrides = [
      {
        id: 'tmo-1',
        tripId: 't1',
        ...PAIR,
        mode: TRANSIT_LEG_MODE,
        createdBy: 'u1',
        createdAt: `${DAY}T00:00:00Z`,
        updatedAt: `${DAY}T00:00:00Z`,
      } as TravelModeOverride,
    ];
    show();
    expect(screen.getByText(t.travelMode[TRANSIT_LEG_MODE])).toBeTruthy();
    const block = document.querySelector('.day-trv')!;
    expect(block.textContent).toContain(t.travel.noEstimate);
    expect(block.textContent).not.toContain(String(WALK_MINUTES));
    expect(document.querySelector('button.day-trv-face')).toBeTruthy();
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

// ── M9 · THE DAY'S OWN VERDICT (ADR-0206 §V1.7 / §AN) ────────────────────────────────────
//
// Plan mode learns to say "this day does not fit". Three things are under test and only the first
// is the feature — the other two are the ways it goes wrong:
//
//   1. an over-stuffed day is flagged, and says how many and by how much;
//   2. a feasible day is SILENT — there is no positive arm, deliberately;
//   3. a day whose legs are all gated out is silent in the SAME way, which is §D4: a reader must
//      not be able to tell "not computed" from "not computable", and a pessimistic guess fails
//      that in the direction that costs somebody their afternoon.
//
// ADR-0011 is untouched throughout: this is a read, nothing moves, and no event — hard or soft —
// is named by the verdict.
describe('PlanDay — the day says it does not fit (ADR-0206 §V1.7)', () => {
  /** The verdict's own row, or `null`. Read by class rather than by copy, so a test for
   *  "silent" cannot pass because the wording changed underneath it. */
  const verdict = () => document.querySelector('.day-fit');

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, theatre];
    tripPlaces = places;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  // The 2:40 hole with a 3:20 walk in it — 40 minutes short, well past
  // `TRAVEL_FIT_TOLERANCE_SECONDS`.
  it('flags an over-stuffed day, and says how many legs and by how much', () => {
    travelSeconds = 200 * 60;
    show();
    const row = verdict();
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain(t.travel.dayInfeasibleOne);
    // `hoursPhrase`, not `gapLabel` — the day's sum is a MEASUREMENT on ADR-0114's ladder,
    // like the leg's own `חסרות 18 דק׳ לדרך` beneath it, where `gapLabel` is Plan's rounded
    // OFFER (ADR-0159 §1). The two ladders disagree by design and this row wants the first.
    expect(row!.textContent).toContain(t.travel.dayShortfall(hoursPhrase(40)));
  });

  it('is silent on a day that fits', () => {
    travelSeconds = WALK_MINUTES * 60;
    show();
    expect(verdict()).toBeNull();
  });

  // §D4, and the case the whole discriminant exists for: `daySequenceFits` answers `true` for a
  // day nothing was measured on, so a verdict that rendered a positive arm would put a tick on a
  // day it never asked about.
  it('is silent in the same way when every leg is gated out', () => {
    travelSeconds = null;
    show();
    expect(verdict()).toBeNull();
  });

  // The count is the half no single leg's row can state, so it has to inflect rather than print a
  // numeral the Hebrew would then disagree with.
  it('counts the legs, in the plural', () => {
    travelSeconds = 200 * 60;
    tripEvents = [
      lunch,
      theatre,
      ev('dinner', {
        title: 'ארוחת ערב',
        placeId: 'p-lunch',
        startsAt: `${DAY}T18:40:00Z`,
        endsAt: `${DAY}T20:00:00Z`,
      }),
    ];
    show();
    expect(verdict()!.textContent).toContain(t.travel.dayInfeasibleTwo);
  });

  // **The verdict is a roll-up of the arms the ROWS render, never a second derivation off the raw
  // stops** (§AN). This is the guard on that: an infeasible leg draws `חסרות … לדרך` on its own
  // block, and the day's count must be the number of blocks saying it.
  it('agrees with the blocks it sits above', () => {
    travelSeconds = 200 * 60;
    show();
    const failing = [...document.querySelectorAll('.day-trv.miss')].length;
    expect(failing).toBe(1);
    expect(verdict()!.textContent).toContain(t.travel.dayInfeasibleOne);
  });

  // ADR-0011: a hard event is never implicated. The verdict names no row at all — which is the
  // strongest form of that, and the reason it says a COUNT rather than a title.
  it('names no event, so no hard event is implicated (ADR-0011)', () => {
    travelSeconds = 200 * 60;
    show();
    expect(verdict()!.textContent).not.toContain(theatre.title);
    expect(verdict()!.textContent).not.toContain(lunch.title);
  });
});

// ── M9 · THE SLOT PICKER'S OWN `פנוי` LINE (ADR-0206 §V1.1's last surface) ────────────────
//
// The chip, the seam and the between-row label were corrected in M6a; the picker was not, because
// `dayPositions` answers with POSITIONS where the correction is about PAIRS. So it offered ⁦3⁩ hours
// in the same hole the chip above it offered two — ADR-0159 §1's forbidden disagreement about a
// fact, one tap deeper than anything that had been reported.
describe('PlanDay — the slot picker states what is free, not the hole (ADR-0206 §AN)', () => {
  /** Open the day-as-a-picker the way a person does: tap a row's own time. */
  const openPicker = (title: string) => {
    fireEvent.click(screen.getByLabelText(t.planDay.slotMoveTitle(title)));
    return screen.getByText(t.planDay.slotWhen);
  };
  /** **The free line of ONE position, found by the clock it resolves to.** Reading the whole
   *  list and asserting a phrase is absent from it is vacuous the moment an unrelated position
   *  happens to hold that length — which it did on the first draft of this spec, where the day's
   *  tail was also three hours. The position under test is the one after lunch, and its clock is
   *  lunch's own end. */
  const freeAt = (clock: string) =>
    [...document.querySelectorAll('.slotpick-opt')]
      .find((row) => row.querySelector('.tm')?.textContent === clock)
      ?.querySelector('.free')?.textContent ?? null;
  /** Lunch ends ⁦13:20⁩Z, which is ⁦15:20⁩ in the day's own zone (`Europe/Rome`, +2 in August). */
  const AFTER_LUNCH = '15:20';

  /** **A THIRD ROW, and it is the fixture's whole point.** `dayPositions` drops the row being
   *  moved (`exclude`) and re-joins the day around it, so opening the picker ON lunch deletes the
   *  very lunch→theatre pair under test — the sheet then honestly reports the raw hole, which is
   *  §D4 and not the case this describe is about. Moving a row somewhere else keeps the pair. */
  const dinner = ev('dinner', {
    title: 'ארוחת ערב',
    placeId: 'p-lunch',
    startsAt: `${DAY}T19:00:00Z`,
    endsAt: `${DAY}T20:30:00Z`,
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, theatre, dinner];
    tripPlaces = places;
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  // RED before M9: the position after lunch read the raw 2:40 hole and offered three hours, while
  // the chip on that same hole already said two.
  it('offers what the chip on the same hole offers', () => {
    show();
    openPicker(dinner.title);
    expect(freeAt(AFTER_LUNCH)).toBe(t.planDay.slotFree(t.planDay.gapTwoHours));
    // And the chip on that same hole says the same thing, which is the point of the whole fix
    // (ADR-0159 §1: two surfaces, one fact).
    expect(screen.getByText(chip(t.planDay.gapTwoHours))).toBeTruthy();
  });

  // §D4 — with no estimate the sheet reads exactly as it read before any of this, because the app
  // does not invent a walk it did not measure.
  it('states the whole hole when there is no estimate', () => {
    travelSeconds = null;
    show();
    openPicker(dinner.title);
    expect(freeAt(AFTER_LUNCH)).toBe(t.planDay.slotFree(t.planDay.gapHours(3)));
  });

  // The other half of §D4, and the one a reader would not predict: a position joined around the
  // MOVED row has two rows that are not adjacent on the day as it stands, so there is no leg to
  // ask about and the raw hole is the honest answer. Asserted rather than left to chance, because
  // the alternative — reaching for some nearby leg's estimate — would be a guess.
  it('leaves a position joined around the moved row on the raw hole', () => {
    show();
    openPicker(theatre.title);
    // With the theatre gone the hole after lunch runs to dinner — ⁦15:20⁩→⁦21:00⁩, and those two
    // rows are not adjacent on the day as it stands, so there is no leg and no correction.
    expect(freeAt(AFTER_LUNCH)).toBe(t.planDay.slotFree(t.planDay.gapHours(6)));
  });
});

// ── THE LEG'S WAY TO THE MAP (owner, 2026-08-27) ─────────────────────────────────────────
//
// _"No shape on the day row · I prefer מרחק, ומגע אל המפה, and it's what we mostly have today
// (minus the touch for map)."_ The distance shipped; the touch was drawn in §1e and never built.
describe('PlanDay — the distance is the way to the leg on the map', () => {
  const mapTouch = () => document.querySelector('.day-trv-map');

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

  it('offers the touch on a leg whose two ends resolve', () => {
    show();
    const touch = mapTouch();
    expect(touch).toBeTruthy();
    expect(touch!.getAttribute('aria-label')).toBe(t.actions.showOnMap);
    // The distance is still the read-out; the pin is added to it rather than replacing it.
    expect(touch!.textContent).toContain('ק״מ');
  });

  // **`role="button"` and not a `<button>`, and this is the assertion that keeps it that way**:
  // the face is a `<button>` whenever the mode disclosure is offered, and nested buttons are
  // invalid HTML. `PlaceBadge` already had to solve exactly this.
  it('is not a nested button inside the face', () => {
    show();
    expect(mapTouch()!.tagName).toBe('SPAN');
    expect(mapTouch()!.getAttribute('role')).toBe('button');
    expect(mapTouch()!.closest('button.day-trv-face')).toBeTruthy();
  });

  // The other half of that: a tap must reach the map, not expand the mode row underneath it.
  it('does not toggle the mode disclosure', () => {
    show();
    const face = mapTouch()!.closest('button.day-trv-face')!;
    expect(face.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mapTouch()!);
    expect(face.getAttribute('aria-expanded')).toBe('false');
  });

  // "Absent, not broken" (ADR-0121 §8): a leg whose ends do not both resolve to a place has no
  // pair to ask about, so the block keeps whatever it can say and offers no way in.
  it('drops the touch where the leg has no resolved pair', () => {
    tripPlaces = [];
    show();
    expect(mapTouch()).toBeNull();
  });
});

// ── HOW FAR THE DAY GOES, ON THE OTHER DAY SURFACE (ADR-0206 §V1.9 / §AP) ────────────────
//
// **The point of this block is that it is not a posture difference.** Plan mode's day-level
// VERDICT is Plan's alone (§AN — an opinion about a day you have not lived), but a day's total
// distance is a FACT, and ADR-0159 §1 forbids the two surfaces differing about one. So the same
// derivation and the same component render here, and these specs are what would go red if a
// later change reached only `DayView` — `frontend/CLAUDE.md`'s named anti-pattern.
describe('PlanDay — the day says how far it goes (ADR-0206 §V1.9)', () => {
  const morningPlace: Place = {
    id: 'p-morning',
    tripId: 't1',
    name: 'שער טוריי',
    lat: 40.845,
    lng: 14.262,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  };
  const morning = ev('morning', {
    title: 'בוקר',
    placeId: 'p-morning',
    startsAt: `${DAY}T08:00:00Z`,
    endsAt: `${DAY}T08:30:00Z`,
  });
  const coordOf = (id: string) => {
    const place = [...places, morningPlace].find((pl) => pl.id === id)!;
    return { lat: place.lat!, lng: place.lng! };
  };
  const declaredLeg = (fromPlaceId: string, toPlaceId: string): TravelModeOverride => ({
    id: `tmo-${fromPlaceId}`,
    tripId: 't1',
    fromPlaceId,
    toPlaceId,
    mode: TRANSIT_LEG_MODE,
    createdBy: 'u1',
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
  });
  const ROUTED_M = 2400;
  const line = () => document.querySelector('.day-total')!;

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [morning, lunch, theatre];
    tripPlaces = [...places, morningPlace];
    tripOverrides = [];
    travelSeconds = WALK_MINUTES * 60;
    travelAsks.length = 0;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
    tripPlaces = places;
  });

  it('states the distance and the hedged duration, exactly as the day list does', () => {
    show();
    expect(line().textContent).toBe(
      t.travel.dayTotal(formatDistance(ROUTED_M * 2), approxTravelTime(WALK_MINUTES * 2 * 60)!),
    );
  });

  it('counts a declared leg in the kilometres and not in the minutes', () => {
    tripOverrides = [declaredLeg('p-lunch', 'p-theatre')];
    show();
    const crow = Math.round(haversineMeters(coordOf('p-lunch'), coordOf('p-theatre')));
    expect(line().textContent).toBe(
      t.travel.dayTotal(formatDistance(ROUTED_M + crow), approxTravelTime(WALK_MINUTES * 60)!),
    );
  });

  it('renders no line at all when nothing on the day is routable', () => {
    travelSeconds = null;
    show();
    expect(document.querySelector('.day-total')).toBeNull();
  });

  it('adds no request of its own', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      show();
      expect(line()).toBeTruthy();
      expect(new Set(travelAsks.map((ask) => JSON.stringify(ask.stops))).size).toBe(1);
      expect(travelAsks[0]!.stops).toEqual([
        coordOf('p-morning'),
        coordOf('p-lunch'),
        coordOf('p-theatre'),
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// **PLAN MODE STATES ITS HOURS IN THE SAME ZONE TRIP MODE DOES** (ADR-0206 §AQ1).
//
// ADR-0159 §1 forbids the two day surfaces differing about a **fact**, and which hour a departure
// is stated in is one — a leave-by that reads 19:31 on the day list and 20:31 here is the same
// divergence `frontend/CLAUDE.md` records as having cost a release twice.
//
// This surface had the identical wiring and the identical defect: `tz={tz}`, where `tz` is
// `trip.timezone`. It is asserted here rather than left to `DayView`'s spec for exactly the reason
// that rule exists — the fix landing on one surface is how the pair drifts, and §AM7 already had to
// record two consumers found reading the mode in the singular for the same reason.
describe('PlanDay — a journey states its hours where the traveller is (ADR-0206 §AQ1)', () => {
  /** Two hours behind this file's trip primary (Rome, UTC+2) — the reported direction, where the
   *  trip's own zone pushes a printed departure PAST the hour its destination card names. */
  const STOPS_ARE_IN = 'Atlantic/Reykjavik';

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [lunch, theatre];
    tripPlaces = places.map((p) => ({ ...p, timezone: STOPS_ARE_IN }));
    travelSeconds = WALK_MINUTES * 60;
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('states the departure in the stops’ zone, and never in the trip’s', () => {
    show();
    const meta = [...document.querySelectorAll('.day-trv')]
      .map((b) => b.textContent ?? '')
      .find((b) => b.includes('יציאה'))!;
    // `theatre` starts 16:00Z; the walk plus §D5's buffer puts the departure at 15:15Z, which is
    // 15:15 where the stops are and 17:15 where the trip is filed — an hour and a quarter after
    // the event it is for, which is the report.
    expect(meta).toContain('15:15');
    expect(meta).not.toContain('17:15');
  });
});
