// @vitest-environment jsdom
//
// Home's LIFT WIRING (ADR-0160), and it has its own file because it is the seam
// neither half's unit tests can see: `lib/hero-horizon.ts` is tested pure and
// `ui/domain/HeroLift.tsx` is tested with hand-built props, so nothing yet asserts
// that Home actually connects one to the other — that the board becomes pressable
// exactly when `canLift` says so, and that pressing it opens the horizon Home
// derived rather than an empty one.
//
// It is also the only place the `shownNext` subtlety is observable. A hotel
// check-out is an END transition `deriveNow` cannot surface, so the board sometimes
// shows a next that is not `deriveNow`'s — and the horizon has to follow the board,
// not re-derive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Note,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { BEAT } from '../lib/one-shot';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';

const DAY = '2026-08-03';
/** Pinned: these fixtures carry fixed dates, so reading the real clock would make
 *  the suite mean something different every day it ran. */
const NOW = `${DAY}T12:30:00Z`;

const ev = (id: string, e: Partial<TripEvent> = {}): TripEvent => ({
  id,
  tripId: 't1',
  title: `event ${id}`,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  date: DAY,
  startsAt: `${DAY}T12:00:00Z`,
  endsAt: `${DAY}T13:00:00Z`,
  sortOrder: 0,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
  ...e,
});

const place: Place = {
  id: 'p1',
  tripId: 't1',
  name: 'Via dei Tribunali 32',
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

const bookingFixture: Booking = {
  id: 'b1',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: 'מלון סנטרו',
  confirmationCode: '7QK4LM',
  placeId: 'p1',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

/** Swapped per test before rendering. */
let tripEvents: TripEvent[] = [];
let tripNotes: Note[] = [];
let tripBookings: Booking[] = [];
let tripPlaces: Place[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Europe/Rome', startDate: DAY, endDate: DAY, updatedBy: 'u1' },
    bookings: tripBookings,
    places: tripPlaces,
    events: tripEvents,
    notes: tripNotes,
    documents: [],
    maybeItems: [],
    members: [],
    // The real shape (`lib/places.ts`): the resolver reads the itinerary out of it,
    // so a partial object crashes rather than defaulting.
    zoneEvidence: {
      events: tripEvents,
      bookings: tripBookings,
      places: tripPlaces,
      crossings: [],
      primaryZone: 'Europe/Rome',
    },
    activeDate: DAY,
    changeFeed: [],
    dismissChange: () => {},
    clearChangeFeed: () => {},
  }),
}));

const done = vi.fn();
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({ done, skip: vi.fn(), restore: vi.fn() }),
}));

const { Home } = await import('./Home');

const show = () => render(wrapNav(<Home />));
/** The board is the tap target now, so "is it liftable" is "is it a button". */
const board = () => document.querySelector('.wp-board');

describe('Home — the lift wiring', () => {
  beforeEach(() => {
    setSimulatedNow(Date.parse(NOW));
    tripEvents = [];
    tripNotes = [];
    tripBookings = [];
    tripPlaces = [];
    done.mockClear();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('a board whose whole horizon adds nothing is NOT a button', () => {
    // In progress, but no place, no note, no booking, nothing concurrent, nothing
    // after. The collapsed board already says everything there is, so there is
    // nothing to open and the board is not pressable.
    tripEvents = [ev('now')];
    show();
    expect(board()?.tagName).toBe('DIV');
  });

  // THE OWNER'S REPORT, as a test: "it does lift but only when there's an event
  // happening". A gap is most of a real day, and the horizon in it still holds the
  // next thing's place, note and booking reach.
  it('lifts in a GAP, with nothing in progress at all', () => {
    tripEvents = [
      ev('later', {
        startsAt: `${DAY}T16:00:00Z`,
        endsAt: `${DAY}T17:00:00Z`,
        placeId: 'p1',
        title: 'מלון סנטרו',
      }),
    ];
    tripPlaces = [place];
    show();
    // Nothing is in progress: the collapsed board is the `free` variant.
    expect(document.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.freeTitle);
    const b = board();
    expect(b?.tagName).toBe('BUTTON');
    fireEvent.click(b!);
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    // And what it opened onto is the next thing's where — the thing you actually
    // want when you are free now.
    expect(screen.getByText(t.hero.where)).toBeTruthy();
    expect(screen.getByText(/Via dei Tribunali/)).toBeTruthy();
  });

  it('a board with a place IS a button, and pressing it opens the horizon', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    show();
    const b = board();
    expect(b?.tagName).toBe('BUTTON');

    fireEvent.click(b!);
    // The lifted hero is up, and it carries the depth the collapsed board cannot.
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    expect(screen.getByText(t.hero.where)).toBeTruthy();
    expect(screen.getByText(/Via dei Tribunali/)).toBeTruthy();
  });

  it('the note reaches the hero from the event, and settling calls the verb', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    tripNotes = [
      {
        id: 'n1',
        tripId: 't1',
        body: 'הכניסה מהחצר האחורית',
        eventId: 'now',
        source: 'member',
        createdBy: 'u1',
        createdAt: `${DAY}T10:00:00Z`,
        updatedAt: `${DAY}T10:00:00Z`,
        updatedBy: 'u1',
      },
    ];
    show();
    fireEvent.click(board()!);
    expect(screen.getByText('הכניסה מהחצר האחורית')).toBeTruthy();

    // The settle strip is the shipped control at its board density, and its verb
    // goes through `verbs.done` like every other host's.
    expect(document.querySelector('.wp-settle.board')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.actions.wasThere }));
    expect(done).toHaveBeenCalledOnce();
  });

  it('the ✕ closes it, and the collapsed board is pressable again', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    show();
    fireEvent.click(board()!);
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.hero.close }));
    expect(document.querySelector('.hero-lifted')).toBeNull();
    expect(board()?.tagName).toBe('BUTTON');
  });

  // The collapsed board and the lifted hero are the SAME object (ADR-0160 §1), so both
  // being on screen at once is the overlay grammar the promotion exists to reject —
  // reported from a phone as _"rendering the hero twice instead of lifting up"_.
  it('hides the collapsed board while the hero is lifted out of it', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    show();
    expect(board()!.className).not.toContain('is-lifted');
    fireEvent.click(board()!);
    expect(board()!.className).toContain('is-lifted');
  });

  // The trap this guards is React's, not the animation's: `className` is a controlled
  // attribute, so dropping `is-lifted` rewrites the whole thing — and a beat class added
  // imperatively in the close handler, before that reconcile, is silently wiped by it.
  // Hence the effect. In jsdom `--t-quick` is unreadable, so `playBeat` schedules the
  // removal on a 0ms timer and the class is observable until it runs.
  it('plays the landing beat on the board that comes back', () => {
    vi.useFakeTimers();
    try {
      tripEvents = [ev('now', { placeId: 'p1' })];
      tripPlaces = [place];
      show();
      fireEvent.click(board()!);
      fireEvent.click(screen.getByRole('button', { name: t.hero.close }));
      expect(board()!.className).toContain(BEAT.LANDING);
      expect(board()!.className).not.toContain('is-lifted');
      // `advanceTimersByTime`, not `runAllTimers`: Home is a live surface and its
      // clock re-arms every second, so draining every timer never terminates.
      vi.advanceTimersByTime(1);
      expect(board()!.className).not.toContain(BEAT.LANDING);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not land a beat on a board nobody lifted', () => {
    vi.useFakeTimers();
    try {
      tripEvents = [ev('now', { placeId: 'p1' })];
      tripPlaces = [place];
      show();
      expect(board()!.className).not.toContain(BEAT.LANDING);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a booking-backed event reaches the hero with its booking’s place', () => {
    // The booking is the place authority for a linked event, so the horizon must
    // show the BOOKING's place — the same rule the day row follows.
    tripEvents = [ev('now', { bookingId: 'b1' })];
    tripBookings = [bookingFixture];
    tripPlaces = [place];
    show();
    fireEvent.click(board()!);
    expect(screen.getByText(/Via dei Tribunali/)).toBeTruthy();
    // And the way through to the booking, which is what the horizon adds over the
    // collapsed board's code.
    expect(screen.getByRole('button', { name: new RegExp(t.hero.toBooking) })).toBeTruthy();
  });

  it('a concurrent sibling alone makes it liftable, and both equals get depth', () => {
    // Two soft events at once with no hard anchor is the group split (ADR-0041 §6):
    // no primary, so neither is promoted and each carries the same depth.
    tripEvents = [ev('a'), ev('b', { sortOrder: 1 })];
    show();
    expect(board()?.tagName).toBe('BUTTON');
    fireEvent.click(board()!);
    // The label is on the collapsed board AND in the hero — both correct, so the
    // assertion is scoped to the hero rather than global.
    expect(document.querySelector('.hero-lifted')?.textContent).toContain(t.board.concurrentNow);
    expect(document.querySelectorAll('.hero-equal-hd')).toHaveLength(2);
    expect(document.querySelectorAll('.hero-point[data-lead]')).toHaveLength(0);
  });

  it('אחר כך is the third point, one line, with nothing to press', () => {
    tripEvents = [
      ev('now', { placeId: 'p1' }),
      ev('next', { startsAt: `${DAY}T14:00:00Z`, endsAt: `${DAY}T15:00:00Z` }),
      ev('later', {
        startsAt: `${DAY}T19:30:00Z`,
        endsAt: `${DAY}T20:30:00Z`,
        title: 'ארוחת ערב',
      }),
    ];
    tripPlaces = [place];
    show();
    fireEvent.click(board()!);
    const then = document.querySelector('.hero-then')!;
    expect(then.textContent).toContain('ארוחת ערב');
    expect(then.querySelectorAll('button, a')).toHaveLength(0);
  });
});
