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
  type TravelModeOverride,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { BEAT } from '../lib/one-shot';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { buildHostContextIndex } from '../lib/host-context';

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

/** A flight IN THE AIR: `transport` is the bracketed category, so `deriveHeroBooking`
 *  answers `in-transit` while the clock sits between its ends (ADR-0059 §1).
 *
 *  **The glyph is load-bearing, not decoration.** Wording resolves per mode off the
 *  event's own icon (`ICON_TIME_PROFILE`), so without `✈️` this fixture is a generic
 *  carrier — `הגעה` and `בדרך` rather than `נחיתה` and `בטיסה`. That is the correct
 *  answer for a manual transport event, and it is what the train case below asserts;
 *  a real flight has the glyph, because the booking's seed carries
 *  `BOOKING_TYPE_ICON[type]`. */
const flight = (over: Partial<TripEvent> = {}): TripEvent =>
  ev('fl', {
    title: 'FR 8123',
    category: 'transport',
    icon: '✈️',
    kind: EVENT_KIND.HARD,
    bookingId: 'bk-fl',
    startsAt: `${DAY}T11:00:00Z`,
    endsAt: `${DAY}T14:00:00Z`,
    ...over,
  });

const flightBooking: Booking = {
  id: 'bk-fl',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'FR 8123',
  confirmationCode: 'ABC123',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

/** Swapped per test before rendering. */
let tripEvents: TripEvent[] = [];
/** The day the strip is parked on. Only a red-eye needs it to differ from `DAY`: past
 *  midnight the calendar day has rolled while the flight is still in the air. */
let tripActiveDate = DAY;
let tripNotes: Note[] = [];
let tripBookings: Booking[] = [];
let tripPlaces: Place[] = [];

const tripOverrides: TravelModeOverride[] = [];

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // The attachment link list every documents surface reads (ADR-0173/0174).
    documentAttachments: [],
    // **The declared legs** (ADR-0206 §AM/§AQ2), mutable so a spec can declare one and re-render.
    // Stated rather than omitted: `useDayTravelReads` takes it as a REQUIRED list precisely so a
    // surface cannot forget to wire it and silently ignore every declaration on the trip — and the
    // board reads it since §AQ2, which is why this fixture gained it.
    travelModeOverrides: tripOverrides,
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
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
    activeDate: tripActiveDate,
    changeFeed: [],
    dismissChange: () => {},
    clearChangeFeed: () => {},
    // Money (ADR-0180). Null is the honest fixture for this file: the trip above
    // carries no `currency`, so `מבט מהיר` is absent either way and the lift
    // wiring — the one thing here — is measured against the same Home as before.
    fxRates: null,
    refreshFx: async () => {},
    // The Trip Home task band (ADR-0188 §6). Empty is the honest fixture here: the band is
    // ABSENT with nothing due, so the lift wiring — the one thing this file measures — is
    // read against the same Home as before.
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

// Home reads the member's HOME currency off the account (ADR-0180 §2), so it now
// needs an auth context. Mocked rather than wrapped, like the two above it.
vi.mock('../state/auth-state', () => ({
  useAuth: () => ({ me: null }),
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
    tripActiveDate = DAY;
    done.mockClear();
  });
  afterEach(() => {
    cleanup();
    setSimulatedNow(null);
  });

  it('a board whose whole horizon adds nothing is NOT a button', () => {
    // In progress, but no place, no note, no booking, nothing concurrent, nothing
    // after. The collapsed board already says everything there is, so there is
    // nothing to open — and it must not announce a control it cannot honour, which is
    // Plan's prep-hero reasoning (ADR-0160 §H) reaching this surface.
    tripEvents = [ev('now')];
    show();
    expect(board()?.tagName).toBe('DIV');
    expect(board()?.getAttribute('role')).toBeNull();
    expect(board()?.getAttribute('tabindex')).toBeNull();
  });

  // **The owner's report, and it reverses §A's silence** (ADR-0160 §Q): _"when there's
  // nothing to lift, clicking currently does nothing. I want the little nudge animation
  // like in plan mode."_ Not a control, but not dead either.
  it('answers a press with the rebuff beat when there is nothing to lift', () => {
    vi.useFakeTimers();
    try {
      tripEvents = [ev('now')];
      show();
      expect(board()?.className).not.toContain(BEAT.REBUFF);
      fireEvent.click(board()!);
      expect(board()?.className).toContain(BEAT.REBUFF);
      // Nothing opened: the beat is the whole answer.
      expect(document.querySelector('.hero-lifted')).toBeNull();
      // jsdom cannot read `--t-base`, so `motionDurationMs` answers 0 and the removal is
      // the next task (`lib/one-shot.ts`) — which is also what lets a second press be
      // felt again rather than doing nothing.
      vi.advanceTimersByTime(1);
      expect(board()?.className).not.toContain(BEAT.REBUFF);
      fireEvent.click(board()!);
      expect(board()?.className).toContain(BEAT.REBUFF);
    } finally {
      vi.useRealTimers();
    }
  });

  // It is the RISE, not the form-refusal shake: pressing something that was never a
  // control is not an error, and this is the one channel the answer has.
  it('rebuffs rather than nudging', () => {
    tripEvents = [ev('now')];
    show();
    fireEvent.click(board()!);
    expect(board()?.className).toContain('is-rebuffing');
    expect(board()?.className).not.toContain('is-nudging');
  });

  // A liftable board opens instead — the beat is for the empty case only, so it must not
  // fire on the way into the horizon.
  it('does not rebuff a board that has something to lift', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    show();
    fireEvent.click(board()!);
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    expect(document.querySelector(`.${BEAT.REBUFF}`)).toBeNull();
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
    const hero = document.querySelector('.hero-lifted');
    expect(hero).toBeTruthy();
    // The words survive the lift: the board said `זמן חופשי` and the hero says it too.
    // They used to disappear, because a gap has no now point to render.
    expect(hero?.querySelector('.wp-board-now-title')?.textContent).toBe(t.board.freeTitle);
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

  // ── IN TRANSIT (ADR-0160 §10) ─────────────────────────────────────────────────
  // The variant that was deliberately NOT liftable through phases 1-4, because §10 asks it
  // for its own content rather than just the gate.

  it('a flight in the air is liftable, and the hero leads with the flight', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    // The collapsed board is in its transit costume…
    expect(board()!.className).toContain('transit');
    expect(board()!.tagName).toBe('BUTTON');
    fireEvent.click(board()!);
    // …and the lifted hero leads with the same flight, not with something else the
    // horizon happened to derive.
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    expect(screen.getAllByText(/FR 8123/).length).toBeGreaterThan(0);
  });

  // "A flight you are sitting inside settles itself by landing" — not a density question
  // but a nonsense one, and the one part of §10 that is a REMOVAL.
  it('drops the settle verbs on the flight', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    expect(document.querySelector('.hero-lifted')).toBeTruthy();
    expect(document.querySelector('.wp-settle')).toBeNull();
    expect(screen.queryByRole('button', { name: t.actions.wasThere })).toBeNull();
  });

  // …while a soft event running concurrently with the flight keeps its own, because the
  // rule is about the flight and not about the state.
  it('keeps the verbs on an event running alongside the flight', () => {
    tripEvents = [flight(), ev('walk', { startsAt: `${DAY}T12:00:00Z` })];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    expect(document.querySelector('.wp-settle')).toBeTruthy();
  });

  // **THE REPORT (session 215): the rail read as the NEXT event's.** It was pinned as the
  // card's foot, one full `הבא בתור` block below the flight it describes — 258px under the
  // route, against 36px inside the point (`mockups/hero-in-transit-v1.html` §2). ADR-0059
  // §2 still holds (the flight IS the current activity, so no day rail); what changed is
  // WHERE its own rail goes, which that section never said.
  it('puts the journey rail inside the flight’s own point, not in the foot', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    const lead = document.querySelector('.hero-point[data-lead]')!;
    expect(lead.querySelector('.hero-transit .wp-board-transit-prog')).toBeTruthy();
    // Nothing is pinned at all in transit: no rail below `הבא בתור`, and no day rail
    // either — a second rail on one surface invites the comparison the first one lost.
    expect(document.querySelector('.hero-foot')).toBeNull();
    expect(document.querySelector('.wp-board-progress')).toBeNull();
    // One rail on the LIFTED surface, not the foot's copy plus the point's. Scoped to the
    // hero on purpose: the collapsed board stays mounted underneath (it keeps its box while
    // lifted, ADR-0160 §1), so a document-wide count is 2 by design.
    expect(document.querySelectorAll('.hero-lifted .wp-board-transit-prog')).toHaveLength(1);
  });

  // **REPORT 4, as a test:** the collapsed board reads better because it HAS a mid-span
  // grammar. The lifted hero prints the same four things now — the teal live word, the
  // slot label, the end chip, and the rail under the route — instead of dressing a flight
  // as an ordinary hard event (`קשיח` + `עד`).
  it('lifts the collapsed board’s own in-transit grammar, not the now-grammar', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    const hero = document.querySelector('.hero-lifted')!;
    // The live badge is the mode's word in teal, as the board below says it.
    const live = hero.querySelector('.wp-board-live')!;
    expect(live.className).toContain('loc');
    expect(live.textContent).toContain(t.board.midSpan.flightLive);
    expect(live.textContent).not.toContain(t.common.now);
    // The slot label and the end chip, both teal; and no `קשיח` on a flight you are in.
    expect(hero.querySelector('.wp-board-now-label.loc')?.textContent).toBe(
      t.board.midSpan.transitLabel,
    );
    expect(hero.querySelector('.wp-board-now-meta .tlabel.loc')?.textContent).toBe(
      t.glance.transition.flightArrival,
    );
    expect(hero.textContent).not.toContain(t.event.hard);
  });

  // The owner's widening: *"this of course applies to other kinds of transit (train, bus)
  // but not rental cars that are different"*. Same state, same wiring, different mode — and
  // the words are the generic carrier's, both on the board and one elevation up.
  it('a train in motion is a journey in its own words, not a flight', () => {
    tripEvents = [flight({ icon: '🚄', title: 'שינקנסן' })];
    tripBookings = [flightBooking];
    show();
    // The collapsed board first: this is where a train read `בטיסה` before session 215.
    expect(document.querySelector('.wp-board-live')?.textContent).toContain(
      t.board.midSpan.transitLive,
    );
    expect(document.querySelector('.tp-plane')?.textContent).toBe('🚄');
    fireEvent.click(board()!);
    const hero = document.querySelector('.hero-lifted')!;
    expect(hero.querySelector('.wp-board-live')?.textContent).toContain(
      t.board.midSpan.transitLive,
    );
    expect(hero.querySelector('.wp-board-now-meta .tlabel')?.textContent).toBe(
      t.glance.transition.arrival,
    );
    expect(hero.textContent).not.toContain(t.board.midSpan.flightLive);
  });

  // **THE DAY-BOUNDARY REPORT** (owner): *"when the flight (or anything really) crossed the
  // day boundary, the hero doesn't recognize it as currently happening and just has the
  // landing as the next event."* Its own case at this level because the cause was a filter in
  // THIS file: an overnight flight carries an `endDate`, which makes it `isMultiDay` and so
  // ambient — and `scheduleEvents` dropped every started ambient event from `deriveNow`, so
  // the board could not see the flight at all.
  it('keeps a red-eye as the live board past midnight', () => {
    // 22:00 → 01:15, read at 00:40 on the LANDING day: the clock has rolled, the flight has
    // not landed.
    const NEXT = '2026-08-04';
    tripEvents = [
      flight({
        startsAt: `${DAY}T22:00:00Z`,
        endsAt: `${NEXT}T01:15:00Z`,
        endDate: NEXT,
      }),
    ];
    tripBookings = [flightBooking];
    tripActiveDate = NEXT;
    setSimulatedNow(Date.parse(`${NEXT}T00:40:00Z`));
    show();

    // The board is in its transit costume, with the flight in the NOW slot…
    expect(board()!.className).toContain('transit');
    expect(document.querySelector('.wp-board-live')?.textContent).toContain(
      t.board.midSpan.flightLive,
    );
    expect(document.querySelector('.wp-board-now-title')?.textContent).toContain('FR 8123');
    // …and the `הבא בתור` slot is gone entirely, which is the stronger form of "the landing
    // is not the next event": in transit the journey IS the current activity, so the board
    // shows no next-row at all (ADR-0059 §2). It was the only slot the flight could reach
    // before this fix.
    expect(document.querySelector('.wp-board-next-row')).toBeNull();
    // And it is not ALSO claimed by the mid-stay strip, which is for a span whose middle is
    // passive — being in two places at once is the failure the guard prevents.
    expect(document.querySelector('.stay-strip')).toBeNull();
  });

  // The same event, before midnight, so the fix cannot be "special-case the landing day".
  it('keeps a red-eye as the live board before midnight too', () => {
    const NEXT = '2026-08-04';
    tripEvents = [
      flight({ startsAt: `${DAY}T22:00:00Z`, endsAt: `${NEXT}T01:15:00Z`, endDate: NEXT }),
    ];
    tripBookings = [flightBooking];
    setSimulatedNow(Date.parse(`${DAY}T23:30:00Z`));
    show();
    expect(board()!.className).toContain('transit');
    expect(document.querySelector('.wp-board-now-title')?.textContent).toContain('FR 8123');
  });

  // **The follow-up the day-boundary fix earned** (owner: *"would we want to know that we
  // land tomorrow, or we'd rather know how many hours/minutes to landing?"* — both, and the
  // hours are already there). Once a red-eye can hold the board at all, its arrival time is
  // the thing that misleads: `06:00` reads as this morning. So the day joins it, and only
  // when there is something to disambiguate.
  it('says which day a red-eye lands on, on the board and in the lifted hero', () => {
    // 21:00 → 06:00 Rome, read at 21:30 the evening before: the landing is genuinely
    // tomorrow in the zone you are standing in.
    const NEXT = '2026-08-04';
    tripEvents = [
      flight({ startsAt: `${DAY}T19:00:00Z`, endsAt: `${NEXT}T04:00:00Z`, endDate: NEXT }),
    ];
    tripBookings = [flightBooking];
    setSimulatedNow(Date.parse(`${DAY}T19:30:00Z`));
    show();

    const meta = () => document.querySelector('.wp-board-now-meta')!;
    expect(meta().textContent).toContain('06:00');
    expect(meta().textContent).toContain('מחר');
    // Both facts, not one instead of the other: the hours are what you act on and they
    // stay on the rail, the day is the disambiguator beside the time.
    expect(document.querySelector('.tp-left')?.textContent).toContain(t.board.remaining);

    // The lifted hero carries the same token — one widget, one answer (ADR-0139).
    fireEvent.click(board()!);
    const hero = document.querySelector('.hero-lifted')!;
    expect(hero.querySelector('.wp-board-now-meta')?.textContent).toContain('מחר');
    expect(hero.querySelector('.hero-eta')?.textContent).toBeTruthy();
  });

  // And the case that is nearly every case: a flight that lands the same afternoon says
  // nothing about the day, because there is nothing to disambiguate.
  it('says nothing about the day when the journey lands today', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    const meta = document.querySelector('.wp-board-now-meta')!;
    expect(meta.textContent).toContain('16:00'); // 14:00Z, Rome
    expect(meta.textContent).not.toContain('מחר');
  });

  // **THE EXCLUSION** (owner: *"but not rental cars that are different"*). A same-day hire
  // reaches this exact state — only a MULTI-day span is ambient — so before session 215 it
  // announced `בטיסה`, drew a plane crossing a progress bar, and called its return an
  // arrival. Its middle is a resource you are HOLDING: no rail, no travelling mark, an
  // amber deadline rather than a teal arrival, and a line saying since when it is ours.
  it('a same-day car hire is held, not travelling', () => {
    const hire = flight({ icon: '🚗', title: 'Hertz', bookingId: 'bk-car' });
    tripEvents = [hire];
    tripBookings = [{ ...flightBooking, id: 'bk-car', type: BOOKING_TYPE.CAR, title: 'Hertz' }];
    show();
    // The collapsed board: the car's own words, and nothing that says "in flight".
    expect(document.querySelector('.wp-board-live')?.textContent).toContain(
      t.board.midSpan.carHoldLive,
    );
    expect(document.querySelector('.wp-board-now-label')?.textContent).toBe(
      t.board.midSpan.carHoldLabel,
    );
    expect(document.querySelector('.wp-board-transit-prog')).toBeNull();
    expect(document.querySelector('.tp-plane')).toBeNull();
    // Its end is `החזרת הרכב` — amber (a deadline), not the teal of an arrival.
    const chip = document.querySelector('.wp-board-now-meta .tlabel')!;
    expect(chip.textContent).toBe(t.glance.transition.carDropoff);
    expect(chip.className).not.toContain('loc');
    // The meta row carries the countdown a journey would have put on its rail…
    expect(document.querySelector('.wp-board-now-meta')?.textContent).toContain(
      t.board.inPhrase('1:30 שע׳'),
    );
    // …and the held line says since when the car is ours — 11:00Z, read in the zone the
    // span starts in (Europe/Rome), which is the sticky-display rule (ADR-0107 §2-3).
    expect(document.querySelector('.wp-board-held')?.textContent).toBe(t.board.heldSince('13:00'));

    // And the same, one elevation up.
    fireEvent.click(board()!);
    const hero = document.querySelector('.hero-lifted')!;
    expect(hero.querySelector('.wp-board-now-label.loc')?.textContent).toBe(
      t.board.midSpan.carHoldLabel,
    );
    expect(hero.querySelector('.wp-board-transit-prog')).toBeNull();
    expect(hero.querySelector('.wp-board-held')?.textContent).toBe(t.board.heldSince('13:00'));
  });

  // The owner's content idea, wired: the crossing said out loud, plus the destination's
  // clock now. `Europe/Rome` (the trip) → `Asia/Tokyo` (the destination place) is +7 in
  // August, and the direction must follow the sign.
  it('says the clock jump in words, and what time it is there', () => {
    const tokyo: Place = { ...place, id: 'p-tyo', name: 'Haneda', timezone: 'Asia/Tokyo' };
    tripEvents = [flight()];
    tripBookings = [{ ...flightBooking, fromPlaceId: 'p1', toPlaceId: 'p-tyo' }];
    tripPlaces = [place, tokyo];
    show();
    fireEvent.click(board()!);
    const line = document.querySelector('.hero-clockshift')!;
    expect(line.textContent).toBe(t.board.clockShift('7 שעות', t.board.clockForward));
    // **And nothing beside it.** A "the time there" chip was drawn and then dropped: mid-
    // journey the live zone IS the destination's (ADR-0107 §4), so the card's own clock is
    // already the time there and the chip printed the same number twice.
    // The sentence is the LIFT's form of the pill; the collapsed board keeps the pill.
    expect(document.querySelector('.wp-board:not(.hero-lifted) .hero-clockshift')).toBeNull();
    expect(document.querySelector('.wp-board .wp-tzshift')).toBeTruthy();
  });

  it('says nothing about the clock on a single-zone leg', () => {
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    expect(document.querySelector('.hero-clockshift')).toBeNull();
  });

  // The other half of the same correction: mid-flight the pin is where you are GOING.
  it('offers the destination in איפה, not the airport you left', () => {
    const tokyo: Place = { ...place, id: 'p-tyo', name: 'Haneda' };
    tripEvents = [flight()];
    tripBookings = [{ ...flightBooking, fromPlaceId: 'p1', toPlaceId: 'p-tyo' }];
    tripPlaces = [place, tokyo];
    show();
    fireEvent.click(board()!);
    const where = document.querySelector('.hero-lifted .hero-where-nm')!;
    expect(where.textContent).toContain('Haneda');
    expect(where.textContent).not.toContain('Via dei Tribunali');
  });

  // Report 3: "the least we can do is give the expanded hero more transit info such as
  // estimated time till arrival". Derived from the schedule — there is no live feed and
  // the copy must not imply one.
  it('says how long is left on the meta row, beside the arrival time', () => {
    // NOW is 12:30 and the flight lands at 14:00 → an hour and a half.
    tripEvents = [flight()];
    tripBookings = [flightBooking];
    show();
    fireEvent.click(board()!);
    const meta = document.querySelector('.hero-point[data-lead] .wp-board-now-meta')!;
    expect(meta.querySelector('.hero-eta')?.textContent).toBe(t.board.inPhrase('1:30 שע׳'));
  });

  // The ordinary case, asserted beside it so the swap is a swap rather than a loss.
  it('pins the day rail as the foot when nothing is in the air', () => {
    tripEvents = [ev('now', { placeId: 'p1' })];
    tripPlaces = [place];
    show();
    fireEvent.click(board()!);
    const foot = document.querySelector('.hero-foot')!;
    expect(foot.querySelector('.wp-board-progress')).toBeTruthy();
    expect(foot.querySelector('.wp-board-transit-prog')).toBeNull();
  });
});
