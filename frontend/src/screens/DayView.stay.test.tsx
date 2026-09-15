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
    expect(done).toHaveBeenCalledWith(guesthouse());
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
});
