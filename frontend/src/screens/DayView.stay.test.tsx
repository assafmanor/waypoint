// @vitest-environment jsdom
//
// **THE ROW THAT CAN CLEAR `נותרו היום`** (ADR-0209 §1, holding ADR-0171 §6 and ADR-0184 §6
// together).
//
// The stay's bookend row is the ONLY place in the app that can answer a check-in, because
// ADR-0209 took the edge row out of the list — and the glance keeps that edge in its count until
// somebody answers it. So the gate on this control is not a presentation choice: it decides
// whether a number on Home can ever reach zero.
//
// The reported defect, with a screenshot of both surfaces at ⁦20:05⁩ (owner, 2026-09-15): a
// guesthouse booked ⁦17:00–22:00⁩ read `נותר דבר אחד היום` beside `מסתיים ~18:30`, with the day
// already over and nothing on it able to say the check-in had happened. The count was ADR-0184
// §6 working as designed; the missing control was this gate asking `not-before` for a rule that
// had been widened to windows.
//
// Pinned clock, and no environment this file did not set (`frontend/CLAUDE.md`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEnrichments,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { buildDayGlance } from '../lib/glance';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import { buildHostContextIndex } from '../lib/host-context';
import { buildNoteHosts } from '../lib/notes';
import '../test/scroll-into-view';

const DAY = '2026-09-15';
const NOW = `${DAY}T20:05:00Z`;
const ZONE = 'Atlantic/Reykjavik';

const at = (clock: string, date = DAY) => `${date}T${clock}:00Z`;

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

/** The day's own last stop, done and behind you — so nothing but the stay can be counted. */
const waterfall = ev('fossalar', {
  title: 'Fossálar',
  status: EVENT_STATUS.DONE,
  startsAt: at('18:15'),
  endsAt: at('18:30'),
});

/** The reported guesthouse: a multi-night stay checking in today, inside an authored window. */
const guesthouse = (e: Partial<TripEvent> = {}): TripEvent =>
  ev('stay', {
    title: 'Lækjaborgir Guesthouse',
    category: 'lodging',
    icon: '🏨',
    kind: EVENT_KIND.HARD,
    bookingId: 'bk',
    startsAt: at('17:00'),
    startWindowEnd: at('22:00'),
    endsAt: at('10:00', '2026-09-17'),
    endDate: '2026-09-17',
    ...e,
  });

const booking: Booking = {
  id: 'bk',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  title: 'Lækjaborgir Guesthouse',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
} as Booking;

let tripEvents: TripEvent[] = [];
const tripEnrichments: TripEnrichments = {};
let activeDate = DAY;

vi.mock('../state/trip-state', () => ({
  byStart: (a: TripEvent, b: TripEvent) =>
    Date.parse(a.startsAt ?? a.date) - Date.parse(b.startsAt ?? b.date),
  useTrip: () => ({
    documentAttachments: [],
    travelModeOverrides: [],
    travelModeVerbs: { setLegMode: vi.fn(), clearLegMode: vi.fn() },
    hostContexts: buildHostContextIndex(tripEvents, [booking]),
    noteHosts: buildNoteHosts({
      events: tripEvents,
      bookings: [booking],
      places: [],
      maybeItems: [],
      documents: [],
    }),
    trip: {
      id: 't1',
      timezone: ZONE,
      destination: 'איסלנד',
      startDate: DAY,
      endDate: '2026-09-17',
      updatedBy: 'u1',
    },
    bookings: [booking],
    places: [],
    enrichments: tripEnrichments,
    events: tripEvents,
    maybeItems: [],
    justAddedIdea: null,
    notes: [],
    documents: [],
    members: [],
    zoneEvidence: {
      events: tripEvents,
      bookings: [booking],
      places: [],
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

const done = vi.fn();
vi.mock('../state/verbs', () => ({
  useVerbs: () => ({
    done,
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

/** What Home's glance counts for this day at this instant — the number the row has to reach. */
const remaining = (events: TripEvent[]) =>
  buildDayGlance(
    events,
    DAY,
    Date.parse(NOW),
    Date.parse(at('07:00')),
    Date.parse(at('23:00')),
    ZONE,
  ).remaining;

beforeEach(() => {
  setSimulatedNow(Date.parse(NOW));
  tripEvents = [waterfall, guesthouse()];
  activeDate = DAY;
  done.mockClear();
});

afterEach(() => {
  cleanup();
  setSimulatedNow(null);
});

describe("DayView — a stay's check-in can be answered wherever the count holds it", () => {
  // THE REPORT. Before the fix this row rendered no `.wp-settle` at all, so the only thing
  // `נותרו היום` was still counting had no answer anywhere in the app.
  it('offers the settle pair on a WINDOWED check-in, which the count holds to its ceiling', () => {
    expect(remaining(tripEvents)).toBe(1); // the day is over; the check-in is the one thing left
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle')).toBeTruthy();
  });

  it('settles that edge, and settling is what clears the number', () => {
    const { container } = show();
    fireEvent.click(container.querySelector('.stay-bookend .wp-settle-btn.done')!);
    // **The OPENING edge, named** (ADR-0224 §1) — `'start'` is what `status` always meant, and
    // saying so here is what the closing edge's own test below can contradict.
    expect(done).toHaveBeenCalledWith(guesthouse(), 'start');
    // The other half of the loop, where the glance already agreed: a settled edge counts nothing.
    expect(remaining([waterfall, guesthouse({ status: EVENT_STATUS.DONE })])).toBe(0);
  });

  // The bare floor, which never lost its control — kept so the widening is not a swap.
  it('still offers it on a check-in with no window at all', () => {
    tripEvents = [waterfall, guesthouse({ startWindowEnd: undefined })];
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle')).toBeTruthy();
  });

  it('shows the record instead of the pair once the edge is settled (ADR-0230)', () => {
    tripEvents = [waterfall, guesthouse({ status: EVENT_STATUS.DONE })];
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle-tag.ok')).toBeTruthy();
  });

  // **AND IT ASKS IN THE CHECK-IN'S OWN WORD** (ADR-0224 §3). The pair on this row said
  // `היינו` / `דילגנו` — `SettleControl`'s stop vocabulary — although the row is one END of a
  // bracketed span and `TransitionRow` has asked `נכנסנו` since the ADR shipped.
  it("asks in the check-in's own words", () => {
    const { container } = show();
    // `compact` is icon-only (ADR-0139), so the word rides the accessible name.
    expect(
      container.querySelector('.stay-bookend .wp-settle-btn.done')!.getAttribute('aria-label'),
    ).toBe('נכנסנו');
  });
});

// ── THE OTHER END OF THE SAME BOOKING ────────────────────────────────────────────────────
//
// **The 2026-09-16 report**, owner: _"when you check in or out, you can mark היינו. Marking
// that makes it היינו for both check in and out."_
//
// ADR-0224 §1 split a bracketed span's answer in two — `status` opens, `endStatus` closes — and
// wired `TransitionRow`, the lifted hero and the three derivations that read them. The bookend
// row was not among them: it asked `edgeOutlivesItsInstant(stay, 'start')` and then read and
// wrote `status` whichever end of the day it was drawing, so the hotel you left this morning and
// the one you sleep in tonight were one switch with two handles.
// **AND A RECORD IS ABOUT A DAY YOU HAVE REACHED** (owner, 2026-09-16, on a day-21 screenshot
// taken at ⁦21:37⁩ with a `היום` jump button on screen: _"I think that it's only relevant for the
// current day, not for future days"_). ADR-0228 §5a's table already ends with "another day, past
// or future — none"; it was applied to the card's verb band and never to the rows.
describe('DayView — a day you have not reached has nothing to record', () => {
  const AHEAD = '2026-09-17'; // NOW is still 2026-09-15T20:05

  beforeEach(() => {
    tripEvents = [guesthouse()];
    activeDate = AHEAD;
    done.mockClear();
  });

  it('offers no settle pair on a future day', () => {
    const { container } = show();
    expect(container.querySelector('.stay-bookend')).toBeTruthy();
    expect(container.querySelector('.stay-bookend .wp-settle')).toBeNull();
  });

  // The rule is the DAY's, not the row type's — so the car hire's pick-up and return, which are
  // `TransitionRow`s rather than bookends, lose it on the same day for the same reason. This is
  // the other half of the reported screenshot, where `החזרת הרכב` carried ✓/✕ three days out.
  it('offers no pair on a transition row of that day either', () => {
    tripEvents = [
      guesthouse(),
      ev('hire', {
        title: 'Iceland Car Rental',
        category: 'transport',
        icon: '🚗',
        kind: EVENT_KIND.HARD,
        // Collected on the day of the report and due back on the day being browsed — which is
        // what makes the return an edge ROW rather than a card (ADR-0063), exactly as in the
        // screenshot.
        date: DAY,
        startsAt: at('09:00'),
        endDate: AHEAD,
        endsAt: at('21:30', AHEAD),
      }),
    ];
    const { container } = show();
    // Both row kinds are on screen — the bookend and at least one of the hire's edges…
    expect(container.querySelectorAll('.transition-row').length).toBeGreaterThan(1);
    // …and not one of them is asking.
    expect(container.querySelector('.transition-row .wp-settle')).toBeNull();
  });

  // …and the undo is never what goes (ADR-0139 §2). An edge with an answer keeps its record,
  // which since ADR-0230 IS the control that takes it back.
  it('keeps the record and its undo on a future day that already has an answer', () => {
    tripEvents = [guesthouse({ endStatus: EVENT_STATUS.DONE })];
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle-tag.ok')).toBeTruthy();
    expect(container.querySelector('.stay-bookend .wp-settle-btn.undo')).toBeTruthy();
    // The pair itself stays gone — a record is not a question.
    expect(container.querySelector('.stay-bookend .wp-settle-btn.done')).toBeNull();
  });
});

describe('DayView — a check-out is answered on its own', () => {
  const CHECKOUT = '2026-09-17';

  beforeEach(() => {
    setSimulatedNow(Date.parse(`${CHECKOUT}T09:00:00Z`));
    tripEvents = [guesthouse()];
    activeDate = CHECKOUT;
    done.mockClear();
  });

  it("asks in the check-out's own words", () => {
    const { container } = show();
    // `compact` is icon-only (ADR-0139), so the word rides the accessible name.
    expect(
      container.querySelector('.stay-bookend .wp-settle-btn.done')!.getAttribute('aria-label'),
    ).toBe('יצאנו');
  });

  it('writes the CLOSING edge, so the check-in is left alone', () => {
    const { container } = show();
    fireEvent.click(container.querySelector('.stay-bookend .wp-settle-btn.done')!);
    expect(done).toHaveBeenCalledWith(guesthouse(), 'end');
  });

  // THE REPORT, as an assertion: a check-in answered two days ago leaves the check-out open.
  it('does not wear the check-in’s answer', () => {
    tripEvents = [guesthouse({ status: EVENT_STATUS.DONE })];
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle-tag')).toBeNull();
    expect(container.querySelector('.stay-bookend .wp-settle-btn.done')).toBeTruthy();
  });

  it('wears its own once it has one', () => {
    tripEvents = [guesthouse({ endStatus: EVENT_STATUS.DONE })];
    const { container } = show();
    expect(container.querySelector('.stay-bookend .wp-settle-tag.ok')!.textContent).toContain(
      'יצאנו',
    );
  });

  // **A MIDDLE NIGHT IS NEITHER END** — and the old gate, which only ever asked about the
  // check-in, offered a control on every night of the stay. There is no transition on this day
  // to answer for, so the row states the night and says nothing else.
  it('offers no pair on a night that is neither end of the stay', () => {
    activeDate = '2026-09-16';
    setSimulatedNow(Date.parse('2026-09-16T09:00:00Z'));
    const { container } = show();
    expect(container.querySelector('.stay-bookend')).toBeTruthy();
    expect(container.querySelector('.stay-bookend .wp-settle')).toBeNull();
  });
});
