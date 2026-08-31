// @vitest-environment jsdom
//
// Home's LEAVE-BY WIRING (ADR-0206 §V1.2 / §Z1), and it has its own file for the reason
// `Home.lift.test.tsx` beside it does: the two halves are already tested apart —
// `lib/hero-travel.ts` pure, `Board`/`HeroLift` with hand-built props — so nothing yet asserts
// that Home connects one to the other. Three things are only observable here:
//
//   · the board's ONE countdown actually swaps its referent, and swaps back;
//   · the collision this epic inherited, where a shutting check-in window and a live leave-by
//     are both true in one minute and there is one tile (§Z5 §M1: the nearer number wins);
//   · `בדרך` withdrawing the mark, which is a read of state a person wrote.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  TRANSIT_LEG_MODE,
  TRAVEL_BUFFER_SECONDS,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type LegTravelMode,
  type TravelEstimate,
  type TravelMode,
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { formatCountdown } from '../lib/time';
import { markOnWay, resetOnWayForTests } from '../lib/on-way';
import { withoutBidiControls } from '../lib/bidi';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { buildHostContextIndex } from '../lib/host-context';

const DAY = '2026-08-03';
/** Pinned — these fixtures carry fixed instants, so reading the real clock would make the file
 *  mean something different every day it ran (`frontend/CLAUDE.md`). Rome is UTC+2 in August, so
 *  12:30Z is 14:30 on the board. */
const NOW = `${DAY}T12:30:00Z`;
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

/** Two real coordinates, because `useDayTravel`'s stops are coordinates and a place-lite row
 *  (ADR-0147) has none — which is itself one of §D4's absences. */
const places: Place[] = [
  {
    id: 'p-museum',
    tripId: 't1',
    name: 'Museo di Capodimonte',
    lat: 40.867,
    lng: 14.25,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
  {
    id: 'p-dinner',
    tripId: 't1',
    name: 'Via dei Tribunali 32',
    lat: 40.851,
    lng: 14.258,
    createdAt: `${DAY}T00:00:00Z`,
    updatedAt: `${DAY}T00:00:00Z`,
    updatedBy: 'u1',
  },
];

/** The stop the day left you at: over by 12:00, so at 12:30 the schedule's own last claim about
 *  where you are is here. */
const museum = ev('museum', {
  title: 'קפודימונטה',
  placeId: 'p-museum',
  startsAt: `${DAY}T10:00:00Z`,
  endsAt: `${DAY}T12:00:00Z`,
});

/** **The same origin, ended early enough that the buffered departure lands AFTER it.**
 *
 *  `museum` runs to ⁦12:00⁩ and now is ⁦12:30⁩, so §AJ2's floor is half an hour behind — which is
 *  the right answer for most specs here and the wrong fixture for the two that are about the
 *  BUFFER's own arithmetic. Those two take this one, so what they measure is the thing they name
 *  rather than the clamp (ADR-0206 §AJ3). */
const museumEndedEarly = { ...museum, endsAt: `${DAY}T10:30:00Z` };

/** `הבא בתור`, `minutes` out from now. */
const dinner = (minutes: number) =>
  ev('dinner', {
    title: 'ארוחת ערב',
    placeId: 'p-dinner',
    startsAt: new Date(Date.parse(NOW) + minutes * 60_000).toISOString(),
    endsAt: new Date(Date.parse(NOW) + (minutes + 90) * 60_000).toISOString(),
  });

/** A check-in window shutting in 15 minutes — one half of the collision. Ambient, so it never
 *  becomes the now or next event; it reaches the board through `deriveHeroBooking`. */
const shuttingStay = ev('stay', {
  title: 'מלון סנטרו',
  category: 'lodging',
  bookingId: 'bk-stay',
  endDate: '2026-08-05',
  startsAt: `${DAY}T09:00:00Z`,
  endsAt: `2026-08-05T09:00:00Z`,
  startWindowEnd: `${DAY}T12:45:00Z`,
});

const stayBooking: Booking = {
  id: 'bk-stay',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: 'מלון סנטרו',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

let tripEvents: TripEvent[] = [];
let tripBookings: Booking[] = [];

let tripOverrides: TravelModeOverride[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    documentAttachments: [],
    // **The declared legs** (ADR-0206 §AM/§AQ2), mutable so a spec can declare one and re-render.
    // Stated rather than omitted: `useDayTravelReads` takes it as a REQUIRED list precisely so a
    // surface cannot forget to wire it and silently ignore every declaration on the trip — and the
    // board reads it since §AQ2, which is why this fixture gained it.
    travelModeOverrides: tripOverrides,
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    trip: { id: 't1', timezone: ZONE, startDate: DAY, endDate: '2026-08-05', updatedBy: 'u1' },
    bookings: tripBookings,
    places,
    events: tripEvents,
    notes: [],
    documents: [],
    maybeItems: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places,
      crossings: [],
      primaryZone: ZONE,
    },
    activeDate: DAY,
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

/** **The fix, at the seam Home reads it from** (ADR-0207 §3). `permission` drives whether Home asks
 *  at all, so `denied` is how a spec says "this device never granted" — which is the DEFAULT case
 *  and has to keep reading exactly as it did before ADR-0207. */
let geoFix: {
  coords: { lat: number; lng: number };
  fixedAt: number;
  accuracyMeters?: number;
} | null = null;
const geoRequest = vi.fn();
vi.mock('../lib/useGeolocation', () => ({
  useGeolocation: () => ({
    status: geoFix ? 'granted' : 'denied',
    coords: geoFix?.coords,
    fixedAt: geoFix?.fixedAt,
    accuracyMeters: geoFix?.accuracyMeters,
    blocked: false,
    permission: geoFix ? 'granted' : 'denied',
    request: geoRequest,
  }),
}));

const onWay = vi.fn();
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({ done: vi.fn(), skip: vi.fn(), restore: vi.fn(), onWay }),
}));

/** **The estimate arrives from `useDayTravel`, so it is mocked at that seam.** The hook is M5's
 *  and tested there; what this file is about is what Home does with an answer. `null` is the
 *  ordinary answer (§D4) and it is a case here rather than an omission. */
let travelSeconds: number | null = null;
/** **WHICH MODE THE BOARD ACTUALLY ASKED ABOUT** (ADR-0206 §AQ2), recorded rather than ignored.
 *  The reported defect was invisible in the duration: the board asked for a WALK on a leg somebody
 *  had switched to a car, and a mock that answers one number whatever it is asked would have stayed
 *  green straight through it. */
const askedModes: LegTravelMode[] = [];
/** Seconds per mode, where a spec needs the two answers to differ the way they did on the real
 *  trip — `~23 דק׳` by car against `~1:16` on foot, over one 6 km leg. */
let travelSecondsByMode: Partial<Record<string, number>> = {};
vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({
    estimateFor: (_from: unknown, _to: unknown, mode: TravelMode): TravelEstimate | null => {
      askedModes.push(mode);
      const seconds = travelSecondsByMode[mode] ?? travelSeconds;
      return seconds == null ? null : { mode, durationSeconds: seconds, distanceMeters: 1800 };
    },
  }),
}));

const { Home } = await import('./Home');

const show = () => render(wrapNav(<Home />));
const tile = () => document.querySelector('.wp-board-countdown');
const unit = () => tile()?.querySelector('.u')?.textContent;
/** The passed arm's SECOND unit line — what the lateness is late for (ADR-0208 §1). */
const unitBelow = () => [...(tile()?.querySelectorAll('.u') ?? [])][1]?.textContent;
const value = () => tile()?.querySelector('.t')?.textContent;

/** **The passed arm's first line, read through the ladder** rather than written out: the measure
 *  word is `formatCountdown`'s, so a spec that hardcoded `דקות` would pass while the code labelled
 *  `1:10` as minutes — which is the bug §1 exists to make impossible. */
const lateUnit = (minutesLate: number) => t.board.lateBy(formatCountdown(minutesLate).unit);

/** The leave-by, in minutes from now, for a leg of `walkMinutes` into an event `eventInMinutes`
 *  out — written out rather than hardcoded so the buffer stays §D5's constant and not a number
 *  this file also believes. */
const toLeave = (eventInMinutes: number, walkMinutes: number) =>
  eventInMinutes - walkMinutes - TRAVEL_BUFFER_SECONDS / 60;

describe('Home — the board counts to the leaving (ADR-0206 §Z1)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [];
    tripBookings = [];
    travelSeconds = null;
    geoFix = null;
    geoRequest.mockClear();
    onWay.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // Arm 1. The number and the word the board has shown since it shipped.
  it('counts to the EVENT while leaving is not yet the live question', () => {
    tripEvents = [museum, dinner(120)];
    travelSeconds = 20 * 60;
    expect(toLeave(120, 20)).toBeGreaterThan(30);
    show();
    expect(value()).toBe('2:00');
    expect(unit()).toBe('שעות');
    expect(tile()?.classList.contains('missed')).toBe(false);
  });

  // Arm 2. The same tile, one referent earlier — never a second box beside it.
  it('swaps to the LEAVE-BY inside the threshold, in one tile', () => {
    tripEvents = [museum, dinner(30)];
    travelSeconds = 20 * 60;
    expect(toLeave(30, 20)).toBe(5);
    show();
    expect(document.querySelectorAll('.wp-board-countdown')).toHaveLength(1);
    expect(value()).toBe('5');
    // **The measure word STAYS, and `ליציאה` sits below it** (ADR-0206 §AR2). This asserted
    // `unit() === t.board.leaveIn` and was green while the tile read `5 · ליציאה` — a number with
    // no measure at all, reported as _"5 what?"_. Both lines are asserted now, so the slot cannot
    // lose one of them again.
    expect(unit()).toBe('דקות');
    expect(unitBelow()).toBe(t.board.leaveIn);
  });

  // Arm 3. §D7's status hue, and §M4's claim: the time passed, which is all the clock supports.
  it('marks a passed leave-by --miss, counting FROM it', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    expect(toLeave(15, 20)).toBe(-10);
    show();
    expect(value()).toBe('10');
    expect(unit()).toBe(lateUnit(10));
    expect(tile()?.classList.contains('missed')).toBe(true);
  });

  // **ADR-0208 §1 — the tile says all three parts.** Two words were reported unclear in this slot
  // before this one, each missing a different half of the sentence: `מהיציאה` read as _measured
  // from_, and a bare `באיחור` named nothing the lateness was late FOR — so `15` could as easily
  // have meant the event started a quarter of an hour ago.
  it('says how much, that it is lateness, and what it is late FOR', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    show();
    expect(value()).toBe('10');
    expect(unit()).toBe(lateUnit(10));
    expect(unitBelow()).toBe(t.board.leaveIn);
  });

  // **And the measure word is the LADDER's, never a literal.** A leg long enough to be an hour
  // late is a drive rather than a walk, and `formatCountdown` steps to `H:MM` there — so a
  // hardcoded `דק׳` would label `1:10` as minutes. This is the spec that stops that coming back.
  it('labels an hour-plus lateness in HOURS, on the same ladder as the number', () => {
    tripEvents = [museumEndedEarly, dinner(15)];
    travelSeconds = 80 * 60;
    expect(toLeave(15, 80)).toBe(-70);
    show();
    expect(value()).toBe('1:10');
    expect(unit()).toBe(lateUnit(70));
    expect(unit()).not.toBe(lateUnit(10));
    expect(unitBelow()).toBe(t.board.leaveIn);
  });

  // **THE BOARD AND THE DAY MUST NOT DISAGREE ABOUT WHEN TO LEAVE** (ADR-0206 §AJ3). Field report,
  // 2026-08-27, two screenshots one minute apart: the day view printed `יציאה 00:30` — the end of
  // the event the traveller was sitting in — and this board said `6 דקות באיחור ליציאה` off the
  // same estimate. §AJ2 decided the clamp and only `dayJourney` implemented it, so the board
  // counted from a buffered instant that sat INSIDE the origin. §AJ2's own name for that is
  // `באיחור`-for-nothing, and ADR-0159 §1 forbids the two elevations differing about a fact.
  it('never marks you late for a departure inside the event you are still in', () => {
    // The origin runs ⁦30⁩ minutes past now, so no earlier departure exists to be late for.
    tripEvents = [{ ...museum, endsAt: `${DAY}T13:00:00Z` }, dinner(45)];
    travelSeconds = 50 * 60;
    // Unclamped this is ⁦10⁩ minutes late (⁦45 − 50 − 5⁩); clamped it is the origin's own end.
    expect(toLeave(45, 50)).toBe(-10);
    show();
    expect(tile()?.classList.contains('missed')).toBe(false);
    expect(unitBelow()).toBe(t.board.leaveIn);
    expect(value()).toBe('30');
  });

  // **§D4, and the exit criterion.** With no estimate the board reads exactly as it did before
  // this milestone — no swap, no placeholder, and nothing added to the horizon.
  it('does not swap at all with no estimate, and adds no row to the horizon', () => {
    tripEvents = [museum, dinner(30)];
    travelSeconds = null;
    show();
    expect(unit()).toBe('דקות');
    expect(value()).toBe('30');
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv')).toBeNull();
  });

  // ⚠ **The collision this epic inherited** (§Z5 §M1). Both facts are true in the same minute
  // and there is one tile, so the nearer number wins; drawing both costs 11px of the
  // `הבא בתור` title and a second line at 360px.
  it('gives the tile to the NEARER of a shutting window and a live leave-by', () => {
    tripEvents = [museum, shuttingStay, dinner(30)];
    tripBookings = [stayBooking];
    travelSeconds = 20 * 60;
    // The window shuts in 15; the leave-by is 5 out. The leave-by is nearer.
    show();
    expect(value()).toBe('5');
    expect(unit()).toBe('דקות');
    expect(unitBelow()).toBe(t.board.leaveIn);
    cleanup();

    // Same window, a leg that leaves 25 minutes from now. The window is nearer, and it keeps
    // the tile it has had since ADR-0184 §6.
    tripEvents = [museum, shuttingStay, dinner(50)];
    travelSeconds = 20 * 60;
    expect(toLeave(50, 20)).toBe(25);
    show();
    expect(value()).toBe('15');
    // **The same slot, the same amendment** (ADR-0206 §AR2). `closesIn` is the precedent `leaveIn`
    // copied, overwrite included, so a shutting window read `15 · לסגירה` — a number with no
    // measure either. Never reported; found by fixing its sibling and asserted with it.
    expect(unit()).toBe('דקות');
    expect(unitBelow()).toBe(t.board.closesIn);
  });

  // A passed leave-by is negative, so it is nearer than any window that has not shut.
  it('a passed leave-by outranks a window still open', () => {
    tripEvents = [museum, shuttingStay, dinner(15)];
    tripBookings = [stayBooking];
    travelSeconds = 20 * 60;
    show();
    expect(unit()).toBe(lateUnit(10));
  });

  // §V1.2's whole sentence, in the slot §D2 puts it in. The board carries the one urgent
  // phrase; the horizon keeps the full read.
  it('the horizon reads ~N דק׳ · צאו ב־HH:MM, between the two points', () => {
    tripEvents = [museum, dinner(60)];
    travelSeconds = 23 * 60;
    show();
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    const text = withoutBidiControls(row.textContent ?? '');
    // The mode leads, and it is DERIVED — from the WALK's own length since §AV1, not from the
    // trip's bookings: ⁦23⁩ minutes is past `WALK_DEFAULT_MAX_SECONDS`, so this leg is a drive.
    expect(text.indexOf(t.travelMode.driving)).toBe(0);
    expect(text).toContain('~23 דק׳');
    // 12:30Z + 60min − 23min − 5min buffer = 13:02Z, which is 15:02 in Rome. Read in the LIVE
    // zone, because a leave-by is a moment on the wrist of whoever is leaving (ADR-0107 §4).
    expect(text).toContain('צאו ב־15:02');
    expect(row.classList.contains('miss')).toBe(false);
  });

  it('says only that the leave-by passed, never that anyone is late', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    show();
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('miss')).toBe(true);
    expect(row.textContent).toContain('זמן היציאה עבר');
    expect(row.textContent).not.toContain('באיחור');
    // The mark's own answer, where the mark is drawn.
    fireEvent.click(screen.getByRole('button', { name: t.actions.onWay }));
    expect(onWay).toHaveBeenCalledWith(expect.objectContaining({ id: 'dinner' }));
  });

  // **`בדרך` is state now**, and this is what it buys: the nudge stops. The whole leave read
  // goes, board and horizon alike — once they are moving, counting to a departure they have
  // already made is the wrong question.
  it('withdraws the leave read entirely once somebody says בדרך', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    markOnWay('t1', 'dinner');
    show();
    expect(unit()).toBe('דקות');
    expect(tile()?.classList.contains('missed')).toBe(false);
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('on-way')).toBe(true);
    expect(row.textContent).toContain(t.actions.onWay);
    expect(row.textContent).not.toContain('עבר');
  });
});

/** **Interpolated between the two REAL stops** above — the museum and the restaurant, ~⁦1.9km⁩
 *  apart — so `0` is the leg's origin, `1` its destination and `0.75` three quarters along. Built
 *  from `places` rather than written out, because a hand-typed coordinate that drifts from the
 *  fixture reads as `unknown` and every stance assertion then passes for the wrong reason (it
 *  did: the first draft kept another spec's longitude and put the fix ⁦1700km⁩ away). */
const between = (fraction: number) => {
  const [from, to] = places;
  return {
    lat: from!.lat! + (to!.lat! - from!.lat!) * fraction,
    lng: from!.lng! + (to!.lng! - from!.lng!) * fraction,
  };
};
const atFraction = (fraction: number, over: Partial<{ accuracyMeters: number }> = {}) => ({
  coords: between(fraction),
  fixedAt: Date.parse(NOW),
  ...over,
});

// **WHICH DAY THE LEAVE-BY IS ON** (ADR-0214 §7). The third slot of a shape this app has fixed
// twice: the hero's journey line hangs off `horizon.next`, which carries no date filter, so on a
// finished evening the leave-by it prints is already TOMORROW's — a bare clock ⁦40px⁩ under a meta
// row that says which day it means. ADR-0160 §M named it for the landing, ADR-0211 §6 fixed it
// for `הבא בתור`, and nobody had asked this one.
describe('Home — the journey line says which day it leaves on (ADR-0214 §7)', () => {
  /** ⁦22:40⁩ Rome on `DAY` — the night board's own moment. */
  const EVENING = `${DAY}T20:40:00Z`;
  /** ⁦07:12⁩ Rome on the NEXT calendar day, with a place so the leg has two ends. */
  const tomorrowTrain = ev('train', {
    title: 'רכבת לקיוטו',
    placeId: 'p-dinner',
    date: '2026-08-04',
    startsAt: '2026-08-04T05:12:00Z',
    endsAt: '2026-08-04T07:40:00Z',
  });
  beforeEach(() => {
    setSimulatedNow(Date.parse(EVENING));
    resetOnWayForTests();
    tripEvents = [];
    tripBookings = [];
    travelSeconds = null;
    geoFix = null;
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  const line = () => document.querySelector('.hero-trv-txt')?.textContent ?? '';

  it('a leave-by that falls tomorrow carries the day, beside the clock', () => {
    tripEvents = [museum, tomorrowTrain];
    travelSeconds = 18 * 60;
    show();
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(line()).toContain('צאו');
    expect(line()).toContain('מחר');
  });

  it('a leave-by TODAY carries no day token at all', () => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [museum, dinner(120)];
    travelSeconds = 20 * 60;
    show();
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(line()).toContain('צאו');
    expect(line()).not.toContain('מחר');
  });
});

describe('Home — a position may withdraw a claim the clock made (ADR-0207)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [museum, dinner(15)];
    tripBookings = [];
    travelSeconds = 20 * 60;
    geoFix = null;
    geoRequest.mockClear();
    onWay.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // **§3 — Home never prompts.** The front door is not an intent to be located, so with no
  // standing consent nothing is even asked, and the surface reads as it did before ADR-0207.
  it('does not ask for a position without standing consent, and behaves as before', () => {
    show();
    expect(geoRequest).not.toHaveBeenCalled();
    expect(unit()).toBe(lateUnit(10));
    expect(tile()?.classList.contains('missed')).toBe(true);
  });

  // **THE REPORTED BUG.** 200m from the door of the next stop, and the board was calling them
  // late. The fix answers the leave-by question, so the mark goes — with nobody pressing anything.
  it('withdraws the late mark when the fix puts them at the destination', () => {
    geoFix = atFraction(1);
    show();
    expect(unit()).toBe('דקות');
    expect(tile()?.classList.contains('missed')).toBe(false);
    // Arrived is the one state with nothing to report, so the block goes entirely.
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv')).toBeNull();
  });

  // Along the leg: the mark goes too, and the line stops claiming the whole walk is still ahead.
  it('reads as on the way when the fix is along the leg, and reports what is LEFT', () => {
    geoFix = atFraction(0.75);
    show();
    expect(unit()).toBe('דקות');
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('on-way')).toBe(true);
    const text = withoutBidiControls(row.textContent ?? '');
    expect(text).toContain(t.actions.onWay);
    // A quarter of a 20-minute walk left, not the twenty — and the number appears ONCE, labelled.
    // Rendering the first build showed it twice (`~12 דק׳ · בדרך · נותרו ~12 דק׳`), and a bare
    // number on this row reads as the leg's length, which is what §6 exists to stop.
    expect(text).toContain('נותרו');
    expect(text).not.toContain('~20 דק׳');
    expect(text.match(/נותרו/g)).toHaveLength(1);
    expect(text.match(/דק׳/g)).toHaveLength(1);
  });

  // **The one arm that makes the app louder, and the one that earns it** (§2). A fix at the
  // origin turns a claim about a clock into one the app has checked.
  it('EARNS the mark when the fix says they are still at the previous stop', () => {
    geoFix = atFraction(0);
    show();
    expect(unit()).toBe(lateUnit(10));
    expect(tile()?.classList.contains('missed')).toBe(true);
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('miss')).toBe(true);
    expect(row.querySelector('.hero-trv-here')?.textContent).toContain(t.travel.stillHere);
    // The tile's word stays on the tile: the sentence says the leave-by passed and where they
    // are, never that the people are late (§Z5 §M4, and ADR-0208 §1 keeps the distinction).
    expect(row.textContent).not.toContain(lateUnit(10));
  });

  // **§4 — a stale fix is worse than no fix.** Twenty minutes old at the origin would EARN a mark
  // for somebody who left fifteen minutes ago, which is a hedge turned into an assertion.
  it('ignores a stale fix rather than earning a mark from it', () => {
    geoFix = { coords: between(0), fixedAt: Date.parse(NOW) - 20 * 60_000 };
    show();
    expect(unit()).toBe(lateUnit(10));
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv-here')).toBeNull();
  });

  // §7 — the mark is reversible now, and the way back is on the row rather than only in a toast.
  it('offers a way back once somebody has said בדרך', () => {
    markOnWay('t1', 'dinner');
    show();
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(screen.getByRole('button', { name: t.actions.undoSettle })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.undoSettle }));
    // Cleared, so the leave read comes back — the mark was not a one-way door.
    expect(unit()).toBe(lateUnit(10));
  });
});

describe('Home — a read needs something to stand on (ADR-0208 §2)', () => {
  /** The same stop, with the group's answer on it: they did not go. */
  const skippedMuseum = { ...museum, status: EVENT_STATUS.SKIPPED };

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [skippedMuseum, dinner(15)];
    tripBookings = [];
    travelSeconds = 20 * 60;
    geoFix = null;
    geoRequest.mockClear();
    onWay.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // **THE REPORTED BUG.** The group skipped the stop they were at, and the board went on
  // measuring the leg out of it — a leave-by, and then a late mark, derived from a claim the
  // group had explicitly denied. With nothing to stand on the whole read is absent (§D4): the
  // tile counts to the event as it always has.
  it("makes no claim at all when the plan's claim was denied and nothing backs it", () => {
    show();
    expect(unit()).toBe('דקות');
    expect(value()).toBe('15');
    expect(tile()?.classList.contains('missed')).toBe(false);
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv')).toBeNull();
  });

  // A skip says nothing about place in either direction — so a fix AT the skipped stop restores
  // the leg, and with it everything the clock had to say about leaving it.
  it('stands the read back up when a fix puts them at the stop they skipped', () => {
    geoFix = atFraction(0);
    show();
    expect(unit()).toBe(lateUnit(10));
    expect(tile()?.classList.contains('missed')).toBe(true);
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv-here')?.textContent).toContain(t.travel.stillHere);
  });

  it('reads as on the way when the fix puts them along the leg they denied starting', () => {
    geoFix = atFraction(0.75);
    show();
    expect(unit()).toBe('דקות');
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('on-way')).toBe(true);
    expect(withoutBidiControls(row.textContent ?? '')).toContain('נותרו');
  });

  // The rule is about a DENIED claim, not about any settle mark: `done` is the strongest origin
  // there is, and it must keep reading exactly as an unanswered stop does.
  it('changes nothing when the stop was marked done instead', () => {
    tripEvents = [{ ...museum, status: EVENT_STATUS.DONE }, dinner(15)];
    show();
    expect(unit()).toBe(lateUnit(10));
    expect(tile()?.classList.contains('missed')).toBe(true);
  });

  // And the denial only bites where the leg actually starts from that stop: a later stop that
  // nobody denied is the origin, and the read stands on it.
  it('is unaffected when a later stop is the one the plan left them at', () => {
    tripEvents = [
      skippedMuseum,
      ev('gelato', {
        placeId: 'p-museum',
        startsAt: `${DAY}T12:10:00Z`,
        endsAt: `${DAY}T12:20:00Z`,
      }),
      dinner(15),
    ];
    show();
    expect(unit()).toBe(lateUnit(10));
  });
});

// ── THE BOARD DOES NOT COUNT TO A DEPARTURE NOBODY SET (ADR-0206 §AI1) ────────────────────
//
// The half that would have shipped broken, caught by the owner reading ADR-0209's mockup: _"we
// must make sure that if you haven't left by the time that the app suggests the app doesn't show
// you as being late."_ Withholding the day row's printed clock is not enough — the board reads the
// same `heroLeaveBy`, so it would swap its countdown to a departure derived from a check-in
// window's OPENING, and then put `באיחור` in its unit slot (ADR-0208 §1) for being late to nothing.
//
// The gate is on the REQUEST, which is ADR-0208's own shape, so `null` flows through every
// consumer below exactly as an absent estimate already does (§D4).
describe('Home — a flexible next event licenses no leave-by (ADR-0206 §AI1)', () => {
  /** `הבא בתור` with a check-in WINDOW: its start is the hour the door opens, not a deadline. */
  const windowedNext = (minutes: number) => ({
    ...dinner(minutes),
    title: 'צ׳ק-אין',
    startWindowEnd: new Date(Date.parse(NOW) + (minutes + 180) * 60_000).toISOString(),
  });

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    tripEvents = [];
    tripBookings = [];
    travelSeconds = null;
    geoFix = null;
    geoRequest.mockClear();
    onWay.mockClear();
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  // The swap threshold is 30 minutes of time-to-leave (§Z1/§AA1), so a 20-minute drive to an
  // event 25 minutes out would normally hand the tile over to the departure.
  it('keeps counting to the event, where it would otherwise swap to the departure', () => {
    tripEvents = [museum, windowedNext(25)];
    travelSeconds = 20 * 60;
    show();
    expect(value()).toBe('25');
    expect(unit()).toBe(formatCountdown(25).unit);
  });

  it('never marks the tile late against it', () => {
    // Well past the departure the old arithmetic produced (25 − 20 − 5 = now).
    tripEvents = [museum, windowedNext(10)];
    travelSeconds = 20 * 60;
    show();
    expect(tile()?.classList.contains('missed')).toBe(false);
    expect(unit()).not.toBe(lateUnit(15));
  });
});

// **THE BOARD READS THE LEG'S MODE, NOT THE TRIP'S** (ADR-0206 §AQ2).
//
// Reported off a real day, from one screen at one moment: the day row read `נסיעה · ~23 דק׳` with
// the car selected on that leg, and the board read `הליכה · ~1:16 שע׳` and, off that figure,
// `51 דקות באיחור ליציאה`. The board was 53 minutes wrong about a departure because it was using a
// mode nobody had chosen.
//
// The cause was one line: `derivedTravelMode(bookings)` — the **trip's** default, from before §AM
// made the mode per LEG. Passing a mode into the board's own call would have fixed the symptom and
// left the shape that produced it, so the board asks `useDayTravelReads` instead: the same function
// both day surfaces ask, about the same leg. `useDayTravelReads`' `overrides` docblock is the
// argument in as many words — a surface that resolves the mode itself can forget to, and forgetting
// is indistinguishable from nobody having declared anything.
describe('Home — the leg’s declared mode is the board’s mode (ADR-0206 §AQ2)', () => {
  const WALK_SECONDS = 76 * 60;
  const DRIVE_SECONDS = 23 * 60;

  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    askedModes.length = 0;
    travelSeconds = null;
    travelSecondsByMode = {
      [TRAVEL_MODE.WALKING]: WALK_SECONDS,
      [TRAVEL_MODE.DRIVING]: DRIVE_SECONDS,
    };
    tripEvents = [museum, dinner(120)];
    tripBookings = [];
    tripOverrides = [];
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
    travelSecondsByMode = {};
    tripOverrides = [];
  });

  /** The override as the app stores it (§AM): keyed on the canonicalised place PAIR, so it serves
   *  the leg in both directions and survives the day being reordered. */
  const declareWalking = () => {
    tripOverrides = [
      {
        id: 'ov-1',
        tripId: 't1',
        fromPlaceId: 'p-dinner',
        toPlaceId: 'p-museum',
        mode: TRAVEL_MODE.WALKING,
        createdBy: 'u1',
        createdAt: `${DAY}T00:00:00Z`,
        updatedAt: `${DAY}T00:00:00Z`,
      } as TravelModeOverride,
    ];
  };

  // **The polarity of this pair flipped with §AV1, and that IS the fix landing.** These fixtures
  // are the reported leg — a ⁦76⁩-minute walk against a ⁦23⁩-minute drive — and the app now derives
  // the drive on its own rather than needing somebody to declare it. So the DERIVED case asserts
  // the drive, and the meaningful override is the walk: a declaration is only testable against a
  // mode the derivation would not have picked.
  it('derives the drive where nobody has declared anything, on a leg nobody would walk', () => {
    show();
    expect(askedModes).toContain(TRAVEL_MODE.DRIVING);
  });

  // The report itself, one layer on: the leg is declared and the board reads the declaration.
  it('asks for the declared mode once the leg has been switched', () => {
    declareWalking();
    show();
    expect(askedModes).toContain(TRAVEL_MODE.WALKING);
    expect(askedModes).not.toContain(TRAVEL_MODE.DRIVING);
  });

  // **And the number the board ACTS on moves with it**, which is the half a mode assertion alone
  // would not prove. The reported minute, reproduced: dinner 50 minutes out, a 76-minute walk and a
  // 23-minute drive over the same leg. On the walk the departure is 31 minutes gone and the tile
  // says you are late; on the drive it is 22 minutes away and the tile says when to go. One leg,
  // one moment, and the board was reading the wrong one of them by 53 minutes.
  it('counts to the departure the leg’s mode implies', () => {
    tripEvents = [museumEndedEarly, dinner(50)];
    // Derived, and since §AV1 that is the DRIVE: ⁦22⁩ minutes to go, and the tile says when to go.
    show();
    expect(value()).toBe(String(toLeave(50, 23)));
    expect(unit()).toBe('דקות');
    expect(unitBelow()).toBe(t.board.leaveIn);
    expect(tile()?.classList.contains('missed')).toBe(false);
    cleanup();

    // Declared a walk, and the number the board ACTS on moves with it — the reported minute, from
    // the other side now: ⁦31⁩ minutes gone and the tile says you are late. One leg, one moment,
    // ⁦53⁩ minutes apart, which is what a mode assertion alone would not have proved.
    declareWalking();
    show();
    expect(value()).toBe(String(-toLeave(50, 76)));
    expect(unit()).toBe(lateUnit(-toLeave(50, 76)));
    expect(tile()?.classList.contains('missed')).toBe(true);
  });

  // §AA4 / §D4 — a leg declared תחב״צ has no provider and therefore no duration. The board must
  // degrade to silence rather than to the walking number it used to fall back on, and `estimateFor`
  // never reaching a request is what `isRoutableMode` guarantees (§AM5).
  it('says nothing at all about a leg declared תחב״צ', () => {
    tripOverrides = [
      {
        id: 'ov-2',
        tripId: 't1',
        fromPlaceId: 'p-dinner',
        toPlaceId: 'p-museum',
        mode: TRANSIT_LEG_MODE,
        createdBy: 'u1',
        createdAt: `${DAY}T00:00:00Z`,
        updatedAt: `${DAY}T00:00:00Z`,
      } as TravelModeOverride,
    ];
    tripEvents = [museum, dinner(30)];
    show();
    // No request is made for a mode no provider has — `isRoutableMode` is the one narrowing at
    // that boundary (§AM5), and this is what "the gate is never sprung" looks like from outside.
    expect(askedModes).toHaveLength(0);
    // …so the board reads exactly as it does with no estimate at all: counting to the event, and
    // no travel row on the horizon. §D4's absence, never a pessimistic walking guess.
    expect(unit()).toBe('דקות');
    expect(value()).toBe('30');
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv')).toBeNull();
  });
});

// **THE TILE'S NUMBER ALWAYS CARRIES A MEASURE WORD** (ADR-0206 §AR2).
//
// Reported in one line off the deploy: _"it says 6 to take off, but 6 what?"_ Two of the tile's
// four arms spread `formatCountdown` and then **overwrote its `unit`** with a preposition phrase —
// `ליציאה`, `לסגירה` — so the ladder's own word was discarded and the number floated. ADR-0208 §1
// had already found and fixed exactly this on the passed arm (_"the unit slot has always carried
// EITHER the measure OR the referent, and `באיחור` carried neither"_); the two arms beside it kept
// carrying only the referent.
//
// **Swept across the arms rather than asserted at one**, because the defect was that a fix landed
// on one of four and the other three were never asked the same question.
describe('Home — every arm of the tile says what its number measures (ADR-0206 §AR2)', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    resetOnWayForTests();
    travelSeconds = null;
    travelSecondsByMode = {};
    tripBookings = [];
    tripOverrides = [];
  });
  afterEach(() => {
    cleanup();
    resetOnWayForTests();
    setSimulatedNow(null);
  });

  /** Every measure word the ladder can hand this slot (`formatCountdown`) — the assertion is that
   *  the tile's FIRST unit line is one of them, never a bare preposition. Read off the ladder
   *  rather than listed, so a new rung cannot fall out of the sweep. */
  const LADDER_WORDS = ['דקה', 'דקות', 'שעות', 'ימים', 'יום', 'יומיים'];

  const arms: { name: string; setup: () => void }[] = [
    {
      name: 'counting to the event',
      setup: () => {
        tripEvents = [museum, dinner(120)];
        travelSeconds = 20 * 60;
      },
    },
    {
      name: 'leaving is the live question',
      setup: () => {
        tripEvents = [museum, dinner(30)];
        travelSeconds = 20 * 60;
      },
    },
    {
      name: 'the leave-by has passed',
      setup: () => {
        tripEvents = [museum, dinner(15)];
        travelSeconds = 20 * 60;
      },
    },
    {
      name: 'a check-in window is shutting',
      setup: () => {
        tripEvents = [museum, shuttingStay, dinner(50)];
        tripBookings = [stayBooking];
        travelSeconds = 20 * 60;
      },
    },
  ];

  for (const { name, setup } of arms) {
    it(`says a measure word while ${name}`, () => {
      setup();
      show();
      expect(value()).toBeTruthy();
      // The first line is the LADDER's word in every arm. `lateBy` wraps it rather than replacing
      // it, so the passed arm passes this test by containing one rather than being one.
      expect(LADDER_WORDS.some((word) => unit()?.includes(word))).toBe(true);
    });
  }

  // …and the referent is never lost in the process: it moves to the second line, it does not go.
  it('keeps the referent on its own line, below the measure', () => {
    tripEvents = [museum, dinner(30)];
    travelSeconds = 20 * 60;
    show();
    expect(unitBelow()).toBe(t.board.leaveIn);
  });
});
