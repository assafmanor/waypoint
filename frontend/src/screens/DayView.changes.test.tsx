// @vitest-environment jsdom
//
// **THE DAY IS CHANGED WHERE YOU STAND** (ADR-0231) — the screen's half. The components are
// tested with hand-built props beside them (`EventCard`, `DaySlotPicker`, `DelaySheet`,
// `QuickAddSheet`, `ParkedEventSheet`) and the derivations in `lib/`. What is only observable
// HERE is that the screen connects them the way the ADR says, on the day the ADR counted:
//
//  1 · a planned row's time opens the day's positions, `עכשיו` first and nothing behind the
//      clock, and a pick is a move that keeps the row's length (§1);
//  2 · a settled row's time is a readout — its chip is the undo, there is nothing to move;
//  3 · the head offers `מאחרים` while something ahead can move, and a chip is one write (§5);
//  4 · the head's ＋ on today is the quick add, landing on now, and `הוספה` is a create (§3);
//  5 · a parked booking says `לא מתקיים` and its tap opens the sheet, not a restore (§2).
//
// Pinned clock — today at 13:51 in the trip's zone — and no environment this file did not set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { setSimulatedNow } from '../lib/useClock';
import { t } from '../i18n/he';
import { wrapNav } from '../test/nav-harness';
import { MapScopeProvider } from '../state/map-scope-state';
import { DragProvider } from '../state/drag-state';
import { buildHostContextIndex } from '../lib/host-context';
import { buildNoteHosts } from '../lib/notes';
import '../test/scroll-into-view';

const DAY = '2026-09-16';
const ZONE = 'Asia/Tokyo';
/** 13:51 in Tokyo. */
const NOW = `${DAY}T04:51:00Z`;
const at = (hhmm: string) => `${DAY}T${hhmm}:00+09:00`;
const iso = (hhmm: string) => new Date(Date.parse(at(hhmm))).toISOString();

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

const booking: Booking = {
  id: 'b-ramen',
  tripId: 't1',
  type: BOOKING_TYPE.RESTAURANT,
  title: 'Ichiran Ramen',
  confirmationCode: '4471',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: `${DAY}T00:00:00Z`,
  updatedAt: `${DAY}T00:00:00Z`,
  updatedBy: 'u1',
};

// The seeded Tokyo day the ADR counted on.
const tour = ev('tour', {
  title: 'סיור יום',
  startsAt: at('10:00'),
  endsAt: at('16:00'),
  status: EVENT_STATUS.DONE,
});
const free = ev('free', { title: 'זמן חופשי', startsAt: at('16:30'), endsAt: at('19:30') });
const ramen = ev('ramen', {
  title: 'Ichiran Ramen',
  kind: EVENT_KIND.HARD,
  bookingId: booking.id,
  startsAt: at('19:30'),
  endsAt: at('21:00'),
});
const bar = ev('bar', { title: 'גולדן גאי', startsAt: at('21:30'), endsAt: at('22:30') });

let tripEvents: TripEvent[] = [];
const activeDate = DAY;

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
      destination: 'טוקיו',
      startDate: '2026-09-14',
      endDate: '2026-09-23',
      updatedBy: 'u1',
    },
    bookings: [booking],
    places: [],
    enrichments: {},
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

const verbs = {
  done: vi.fn(),
  skip: vi.fn(),
  restore: vi.fn(),
  onWay: vi.fn(),
  rippleApply: vi.fn(),
  rippleDismiss: vi.fn(),
  reorder: vi.fn(),
  delay: vi.fn(),
  earlier: vi.fn(),
  update: vi.fn(),
  create: vi.fn(() => Promise.resolve()),
  delayDay: vi.fn(),
  park: vi.fn(),
  remove: vi.fn(),
};
vi.mock('../state/verbs', () => ({ useVerbs: () => verbs }));

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

const DAY_PAGE = '.day-swipe:not([data-preview]) > .day-page';
const row = (id: string) => document.querySelector(`${DAY_PAGE} .wp-event[data-event="${id}"]`)!;
const sheet = () => document.querySelector('.modal-card[role="dialog"]')!;

beforeEach(() => {
  setSimulatedNow(Date.parse(NOW));
  tripEvents = [tour, free, ramen, bar];
  Object.values(verbs).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  cleanup();
  setSimulatedNow(null);
});

describe('DayView — the day is changed where you stand (ADR-0231)', () => {
  it('a planned row’s time opens the positions: עכשיו first, nothing behind the clock, Trip’s accent', () => {
    show();
    const time = row('free').querySelector('.wp-event-time')!;
    expect(time.getAttribute('role')).toBe('button');
    fireEvent.click(time);
    const picker = sheet().querySelector('.slotpick')!;
    expect(picker.getAttribute('data-mode')).toBe('trip');
    const options = [...picker.querySelectorAll('.slotpick-opt:not(.escape)')];
    expect(options[0].classList.contains('now')).toBe(true);
    expect(options[0].querySelector('.tm')!.textContent).toBe('13:55');
    // Every position offered starts at or after now.
    for (const o of options) expect(o.querySelector('.tm')!.textContent! >= '13:55').toBe(true);
    // The hole before the 10:00 tour — the one the shelf schedule wrote into — is not listed.
    expect(options.some((o) => o.textContent!.includes(t.planDay.seamDayStart))).toBe(false);
  });

  it('picking עכשיו moves the row to now and keeps its three hours (ADR-0161 §1)', () => {
    show();
    fireEvent.click(row('free').querySelector('.wp-event-time')!);
    fireEvent.click(sheet().querySelector('.slotpick-opt.now')!);
    expect(verbs.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'free' }), {
      date: DAY,
      startsAt: iso('13:55'),
      endsAt: iso('16:55'),
    });
  });

  it('a settled row’s time is a readout — the chip is its undo, there is nothing to move', () => {
    show();
    expect(row('tour').querySelector('.wp-event-time')!.getAttribute('role')).toBeNull();
  });

  it('the head offers מאחרים while something ahead can move, names the anchor, and a chip is one write', () => {
    show();
    const late = screen.getByRole('button', { name: new RegExp(t.day.late.action) });
    fireEvent.click(late);
    expect(sheet().textContent).toContain(t.day.late.what(1, '16:30'));
    expect(sheet().querySelector('.late-anchor')!.textContent).toContain('Ichiran Ramen');
    fireEvent.click(
      within(sheet() as HTMLElement).getByRole('radio', { name: t.day.late.minutes(30) }),
    );
    expect(verbs.delayDay).toHaveBeenCalledTimes(1);
    const [dayEvents, nowMs, minutes] = verbs.delayDay.mock.calls[0];
    expect(minutes).toBe(30);
    expect(nowMs).toBe(Date.parse(NOW));
    expect((dayEvents as TripEvent[]).map((e) => e.id)).toContain('free');
  });

  it('does not offer מאחרים when nothing ahead of now can move', () => {
    tripEvents = [tour, ramen];
    show();
    expect(screen.queryByRole('button', { name: new RegExp(t.day.late.action) })).toBeNull();
  });

  // The reported symptom of ADR-0231 §5's 2026-09-19 amendment: the head kept the control
  // to itself for as long as a commitment was the next thing ahead, over an afternoon it
  // handed back the minute that commitment started.
  it('offers מאחרים with a commitment next ahead and a soft afternoon behind it', () => {
    const shrine = ev('shrine', {
      title: 'מקדש',
      kind: EVENT_KIND.HARD,
      startsAt: at('14:00'),
      endsAt: at('15:30'),
    });
    tripEvents = [tour, shrine, free, bar];
    show();
    expect(screen.getByRole('button', { name: new RegExp(t.day.late.action) })).toBeTruthy();
  });

  it('the head’s ＋ on today is the quick add, landing on now, and הוספה is a soft create', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.actions.newEvent) }));
    expect(sheet().textContent).toContain(t.day.quickAdd.title);
    expect(within(sheet() as HTMLElement).getByText('13:55')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(t.day.quickAdd.titlePlaceholder), {
      target: { value: 'קפה שמצאנו' },
    });
    fireEvent.click(
      within(sheet() as HTMLElement).getByRole('button', { name: new RegExp(t.day.quickAdd.add) }),
    );
    expect(verbs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'קפה שמצאנו',
        kind: EVENT_KIND.SOFT,
        status: EVENT_STATUS.PLANNED,
        date: DAY,
        startsAt: iso('13:55'),
        endsAt: iso('14:55'),
      }),
    );
  });

  it('a parked booking says לא מתקיים, and its tap opens the sheet rather than restoring', () => {
    tripEvents = [tour, free, { ...ramen, status: EVENT_STATUS.SKIPPED }, bar];
    show();
    const card = document.querySelector(`${DAY_PAGE} .skipped-card`)!;
    expect(card.textContent).toContain(t.day.notHappeningTag);
    fireEvent.click(card);
    expect(verbs.restore).not.toHaveBeenCalled();
    fireEvent.click(
      within(sheet() as HTMLElement).getByRole('button', { name: t.day.parked.restore }),
    );
    expect(verbs.restore).toHaveBeenCalledWith(expect.objectContaining({ id: 'ramen' }));
  });
});
