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
    expect(unit()).toBe(t.board.leaveIn);
  });

  // Arm 3. §D7's status hue, and §M4's claim: the time passed, which is all the clock supports.
  it('marks a passed leave-by --miss, counting FROM it', () => {
    tripEvents = [museum, dinner(15)];
    travelSeconds = 20 * 60;
    expect(toLeave(15, 20)).toBe(-10);
    show();
    expect(value()).toBe('10');
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
    expect(tile()?.classList.contains('missed')).toBe(true);
    fireEvent.click(document.querySelector('.wp-board')!);
    const row = document.querySelector('.hero-trv')!;
    expect(row.classList.contains('miss')).toBe(true);
    expect(row.querySelector('.hero-trv-here')?.textContent).toContain(t.hero.stillHere);
    // The tile's word stays on the tile: the sentence says the leave-by passed and where they
    // are, never that the people are late (§Z5 §M4, and ADR-0208 §1 keeps the distinction).
    expect(row.textContent).not.toContain(t.board.late);
  });

  // **§4 — a stale fix is worse than no fix.** Twenty minutes old at the origin would EARN a mark
  // for somebody who left fifteen minutes ago, which is a hedge turned into an assertion.
  it('ignores a stale fix rather than earning a mark from it', () => {
    geoFix = { coords: between(0), fixedAt: Date.parse(NOW) - 20 * 60_000 };
    show();
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
    expect(tile()?.classList.contains('missed')).toBe(true);
    fireEvent.click(document.querySelector('.wp-board')!);
    expect(document.querySelector('.hero-trv-here')?.textContent).toContain(t.hero.stillHere);
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
    expect(unit()).toBe(t.board.late);
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
    expect(unit()).toBe(t.board.late);
  });
});
