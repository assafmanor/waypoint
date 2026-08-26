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
  TRAVEL_BUFFER_SECONDS,
  TRAVEL_MODE,
  type Booking,
  type Place,
  type TravelEstimate,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
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

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    documentAttachments: [],
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

const onWay = vi.fn();
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({ done: vi.fn(), skip: vi.fn(), restore: vi.fn(), onWay }),
}));

/** **The estimate arrives from `useDayTravel`, so it is mocked at that seam.** The hook is M5's
 *  and tested there; what this file is about is what Home does with an answer. `null` is the
 *  ordinary answer (§D4) and it is a case here rather than an omission. */
let travelSeconds: number | null = null;
vi.mock('../lib/travel', () => ({
  useDayTravel: () => ({
    estimateFor: (): TravelEstimate | null =>
      travelSeconds === null
        ? null
        : { mode: TRAVEL_MODE.WALKING, durationSeconds: travelSeconds, distanceMeters: 1800 },
  }),
}));

const { Home } = await import('./Home');

const show = () => render(wrapNav(<Home />));
const tile = () => document.querySelector('.wp-board-countdown');
const unit = () => tile()?.querySelector('.u')?.textContent;
const value = () => tile()?.querySelector('.t')?.textContent;

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
    expect(unit()).toBe(t.board.leaveIn);
  });

  // Arm 3. §D7's status hue, and §M4's claim: the time passed, which is all the clock supports.
  it('marks a passed leave-by --miss, counting FROM it', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    expect(toLeave(15, 20)).toBe(-10);
    show();
    expect(value()).toBe('10');
    expect(unit()).toBe(t.board.sinceLeave);
    expect(tile()?.classList.contains('missed')).toBe(true);
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
    expect(unit()).toBe(t.board.leaveIn);
    cleanup();

    // Same window, a leg that leaves 25 minutes from now. The window is nearer, and it keeps
    // the tile it has had since ADR-0184 §6.
    tripEvents = [museum, shuttingStay, dinner(50)];
    travelSeconds = 20 * 60;
    expect(toLeave(50, 20)).toBe(25);
    show();
    expect(value()).toBe('15');
    expect(unit()).toBe(t.board.closesIn);
  });

  // A passed leave-by is negative, so it is nearer than any window that has not shut.
  it('a passed leave-by outranks a window still open', () => {
    tripEvents = [museum, shuttingStay, dinner(15)];
    tripBookings = [stayBooking];
    travelSeconds = 20 * 60;
    show();
    expect(unit()).toBe(t.board.sinceLeave);
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
    // The mode leads, and it is DERIVED (§Z2): this trip has no car booking, so it walks.
    expect(text.indexOf(t.travelMode.walking)).toBe(0);
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
