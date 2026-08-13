// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';

// jsdom has no layout engine, so it doesn't implement scrollIntoView — the
// create-booking seed test below is the first one here to actually mount
// BookingSheet, whose focus-capture handler calls it on every focused field.
Element.prototype.scrollIntoView = vi.fn();

const flight: Booking = {
  id: 'b1',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'טוקיו',
  confirmationCode: 'ABC123',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};
const hotel: Booking = {
  id: 'b2',
  tripId: 't1',
  type: BOOKING_TYPE.HOTEL,
  placeId: 'pl-hotel',
  title: 'Shinjuku Granbell',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};
const restaurant: Booking = {
  id: 'b4',
  tripId: 't1',
  type: BOOKING_TYPE.RESTAURANT,
  title: 'Ichiran Ramen',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};
// A past FLIGHT so the flight category has a past match while the hotel
// category (still non-empty overall) has none — exercises the past-toggle's
// per-category gate distinctly from the trip-wide past count.
const pastFlight: Booking = {
  id: 'b3',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'הגעה מטוקיו',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  updatedBy: 'u1',
};
const pastFlightEvent: TripEvent = {
  id: 'e1',
  tripId: 't1',
  date: '2026-07-01',
  title: 'הגעה מטוקיו',
  kind: EVENT_KIND.HARD,
  startsAt: '2026-07-01T01:00:00Z',
  status: EVENT_STATUS.PLANNED,
  bookingId: 'b3',
  sortOrder: 0,
  source: EVENT_SOURCE.MANUAL,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  updatedBy: 'u1',
};

let tripBookings = [flight, hotel];
let tripEvents: TripEvent[] = [];
// ADR-0174 §1's document mark, so ADR-0179 §5's claim that the marks moved to the
// title line is asserted rather than described.
let tripAttachments: { id: string; tripId: string; documentId: string; bookingId: string }[] = [];

// A coord-bearing place for the hotel, so its row can reach the map; the flight has
// none, so its row must not offer the affordance at all.
const hotelPlace = {
  id: 'pl-hotel',
  tripId: 't1',
  name: 'Shinjuku Granbell',
  lat: 35.69,
  lng: 139.7,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};
let showPlaceOnMap: ((placeId: string) => void) | null = null;
vi.mock('../state/map-scope-state', () => ({
  useShowPlaceOnMap: () => showPlaceOnMap,
  // Every form host takes the errand's answer on return (ADR-0134 §2); nothing here
  // asserts it, so the hook just has to exist and report nothing pending.
  usePlaceErrandReturn: () => null,
  // `BookingDetail` renders inside this view, and its `＋ מיקום` is an errand now
  // (ADR-0134 §1). Nothing here asserts the errand; it just has to exist.
  useStartPlaceErrand: () => () => {},
}));

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // The attachment link list every documents surface reads (ADR-0173/0174).
    documentAttachments: tripAttachments,
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex(tripEvents, tripBookings),
    // Note hosts resolve through trip-state's one index; this file asserts nothing
    // about an inherited name or category, so the index-miss fallback carries it.
    noteHosts: new Map(),
    trip: {
      id: 't1',
      name: "לפלנד ולשם וכאן '26",
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
      updatedBy: 'u1',
    },
    bookings: tripBookings,
    places: [hotelPlace],
    events: tripEvents,
    documents: [],
    // The booking detail reads it for the airport codes (ADR-0166 §18). Empty is the
    // normal state for most places, and the fact is simply absent.
    enrichments: {},
    notes: [],
    users: [],
    noteVerbs: {
      createNote: async () => {},
      updateNote: async () => {},
      deleteNote: async () => {},
    },
  }),
}));
vi.mock('../lib/useClock', () => ({ useClock: () => new Date('2026-07-20T00:00:00Z') }));
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return {
    ...actual,
    useSyncStatus: (id: string) =>
      id === 'b1' ? ({ state: 'pending' } as const) : ({ state: 'synced' } as const),
    usePendingUploads: () => [],
  };
});

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';
import { IndexBookingsView } from './IndexBookingsView';
import { t } from '../i18n/he';
import { buildHostContextIndex } from '../lib/host-context';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>
          <ModeProvider>{node}</ModeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('IndexBookingsView (ADR-0098/ADR-0101)', () => {
  afterEach(() => {
    cleanup();
    tripBookings = [flight, hotel];
    tripEvents = [];
    showPlaceOnMap = null;
  });

  it('renders both booking rows on the shared ListRow, with per-row sync + manage kebab', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shinjuku Granbell' })).toBeTruthy();
    expect(screen.getByRole('img', { name: t.sync.badge.pending })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: t.index.detail.actions })).toHaveLength(2);
  });

  it('titles the screen "הזמנות" (ADR-0101), not the generic "אינדקס"', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    expect(screen.getByText(t.index.bookingsTitle)).toBeTruthy();
    expect(screen.queryByText(t.index.back)).toBeNull();
  });

  it('calls onClose when the back button is tapped with no category filter active', () => {
    const onClose = vi.fn();
    render(wrap(<IndexBookingsView onClose={onClose} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('back resets an active category filter instead of leaving, then leaves on the next tap (ADR-0102)', () => {
    const onClose = vi.fn();
    render(wrap(<IndexBookingsView onClose={onClose} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));

    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radio', { name: t.index.filter.all }).getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters rows by category chip', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));
    const hotelRow = screen.getByRole('button', { name: 'Shinjuku Granbell' });
    const flightRow = screen.getByRole('button', { name: 'טוקיו' });
    expect(hotelRow.closest('.wp-reveal')?.className).not.toContain('hidden');
    expect(flightRow.closest('.wp-reveal')?.className).toContain('hidden');
  });

  it('omits category chips for booking types the trip has none of', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    expect(screen.getByRole('radio', { name: t.index.bookingType.flight })).toBeTruthy();
    expect(screen.getByRole('radio', { name: t.index.bookingType.hotel })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: t.index.bookingType.restaurant })).toBeNull();
    expect(screen.queryByRole('radio', { name: t.index.bookingType.train })).toBeNull();
    expect(screen.queryByRole('radio', { name: t.index.bookingType.other })).toBeNull();
  });

  it('opens full-screen search mode and live-filters by title or confirmation code', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
    // The main list is hidden while search mode is open — no duplicate rows.
    expect(screen.queryAllByRole('button', { name: 'טוקיו' })).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText(t.index.search.placeholder), {
      target: { value: 'ABC123' },
    });
    const flightRow = screen.getByRole('button', { name: 'טוקיו' });
    const hotelRow = screen.getByRole('button', { name: 'Shinjuku Granbell' });
    expect(flightRow.closest('.wp-reveal')?.className).not.toContain('hidden');
    expect(hotelRow.closest('.wp-reveal')?.className).toContain('hidden');
  });

  it('search mode ignores whatever category was selected before opening it (ADR-0102)', () => {
    tripBookings = [flight, hotel, restaurant];
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.flight }));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
    // Every booking is visible in search mode, despite the flight chip having
    // been selected before entering it.
    for (const title of ['טוקיו', 'Shinjuku Granbell', 'Ichiran Ramen']) {
      expect(
        screen.getByRole('button', { name: title }).closest('.wp-reveal')?.className,
      ).not.toContain('hidden');
    }
  });

  it('matches a query against the booking type label, singular or plural (ADR-0102)', () => {
    tripBookings = [flight, hotel, restaurant];
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
    const input = screen.getByPlaceholderText(t.index.search.placeholder);
    const rowClass = (title: string) =>
      screen.getByRole('button', { name: title }).closest('.wp-reveal')?.className;

    fireEvent.change(input, { target: { value: t.index.bookingTypePlural.restaurant } });
    expect(rowClass('Ichiran Ramen')).not.toContain('hidden');
    expect(rowClass('טוקיו')).toContain('hidden');

    fireEvent.change(input, { target: { value: t.index.bookingType.restaurant } });
    expect(rowClass('Ichiran Ramen')).not.toContain('hidden');

    fireEvent.change(input, { target: { value: t.index.bookingTypePlural.flight } });
    expect(rowClass('טוקיו')).not.toContain('hidden');
    expect(rowClass('Ichiran Ramen')).toContain('hidden');

    fireEvent.change(input, { target: { value: 'airbnb' } });
    expect(rowClass('Shinjuku Granbell')).not.toContain('hidden');
    expect(rowClass('טוקיו')).toContain('hidden');
  });

  it('shows the shared EmptyState when a search matches nothing', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
    fireEvent.change(screen.getByPlaceholderText(t.index.search.placeholder), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByText(t.index.filter.noResultsTitle)).toBeTruthy();
  });

  it('keeps the active category filter applied when search mode closes', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.backAria }));
    // Back in the main view, the hotel chip is still selected.
    expect(
      screen.getByRole('radio', { name: t.index.bookingType.hotel }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it("opens that booking's detail on mount when given an initialBookingId (ADR-0050 deep link)", () => {
    render(wrap(<IndexBookingsView onClose={() => {}} initialBookingId="b2" />));
    const dialog = screen.getByRole('dialog');
    // Scoped to the heading: the hotel now resolves a coordless-address place, so its
    // `מיקום` fact renders the same name as its value (ADR-0121 §8 amendment — the
    // fact always renders for a single-place type, and says what it knows).
    expect(within(dialog).getByText('Shinjuku Granbell', { selector: '.bk-title' })).toBeTruthy();
  });

  it('seeds the create form with the active category filter', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));
    fireEvent.click(screen.getByRole('button', { name: t.index.form.add }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getByRole('radio', { name: t.index.bookingType.hotel })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('hides the past toggle for a category with no past bookings, shows it for one that has some', () => {
    tripBookings = [flight, hotel, pastFlight];
    tripEvents = [pastFlightEvent];
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));
    expect(screen.queryByText(t.index.pastToggle.show(1))).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.flight }));
    expect(screen.getByText(t.index.pastToggle.show(1))).toBeTruthy();
  });
});

// THE ROW SAYS **WHAT**, THEN **WHEN** (ADR-0179). Every assertion below guards a fact
// the row deliberately stopped drawing, and every one of them was unguarded before this
// suite: the whole 3183-test suite stayed green while the confirmation code, the type chip
// and the 🔗 glyph came off the row, which is exactly why they are pinned now.
describe('IndexBookingsView — what the row draws (ADR-0179)', () => {
  // Clock is mocked to 2026-07-20T00:00:00Z; the trip is Asia/Tokyo, so "today" is 07-20.
  const timedFlight: TripEvent = {
    id: 'ev-flight',
    tripId: 't1',
    date: '2026-07-22',
    title: 'טוקיו',
    kind: EVENT_KIND.HARD,
    startsAt: '2026-07-22T03:30:00Z', // 12:30 Tokyo
    endsAt: '2026-07-22T07:15:00Z',
    status: EVENT_STATUS.PLANNED,
    bookingId: 'b1',
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: '2026-07-19T00:00:00Z',
    updatedAt: '2026-07-19T00:00:00Z',
    updatedBy: 'u1',
  };
  // A stay whose opening day has PASSED, so the row reads its closing edge.
  const midStay: TripEvent = {
    id: 'ev-hotel',
    tripId: 't1',
    date: '2026-07-18',
    endDate: '2026-07-25',
    title: 'Shinjuku Granbell',
    kind: EVENT_KIND.HARD,
    startsAt: '2026-07-18T06:00:00Z',
    endsAt: '2026-07-25T02:00:00Z',
    status: EVENT_STATUS.PLANNED,
    bookingId: 'b2',
    sortOrder: 0,
    source: EVENT_SOURCE.MANUAL,
    createdAt: '2026-07-19T00:00:00Z',
    updatedAt: '2026-07-19T00:00:00Z',
    updatedBy: 'u1',
  };

  afterEach(() => {
    cleanup();
    tripBookings = [flight, hotel];
    tripEvents = [];
    tripAttachments = [];
  });

  const rowOf = (container: HTMLElement, title: string) =>
    [...container.querySelectorAll('.wp-listrow')].find((r) =>
      r.querySelector('.wp-listrow-title')?.textContent?.includes(title),
    ) as HTMLElement;

  it('draws no confirmation code on the row — it is a read, not a row (§2c)', () => {
    tripEvents = [timedFlight];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    // `flight.confirmationCode` is 'ABC123'; the trailing slot used to carry it, sized by
    // its own content, which is what squeezed the title to 13% of the row.
    expect(container.querySelector('.wp-listrow .code')).toBeNull();
    expect(screen.queryByText(/ABC123/)).toBeNull();
  });

  it('drops the type chip and the 🔗 glyph the badge and the sentence already say (§2a/§2b)', () => {
    tripEvents = [timedFlight];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    expect(row.querySelector('.tag-type')).toBeNull();
    expect(row.querySelector('.link-cue')).toBeNull();
  });

  it('puts exactly ONE lock, in the when line, on a hard booking (§3)', () => {
    tripEvents = [timedFlight];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    expect(row.querySelector('.bk-when .hard-lock')).toBeTruthy();
    // Being drawn more than once is the defect the mark was collected to end.
    expect(row.querySelectorAll('.hard-lock')).toHaveLength(1);
    // And it is the SHARED mark, not a third copy of it.
    expect(row.querySelector('.wp-listrow-title .hard-lock')).toBeNull();
  });

  it('draws no transition verb on a start edge, where the badge already says the type (§2d)', () => {
    tripEvents = [timedFlight];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    expect(row.querySelector('.bk-verb')).toBeNull();
    // The facts it DOES keep: the day and the clock, the two that tell rows apart.
    expect(row.querySelector('.bk-day')?.textContent).toBeTruthy();
    expect(row.querySelector('.bk-clock')?.textContent).toBe('12:30');
  });

  it('draws the verb on a closing edge, where it is the only thing that can say which end (§2d)', () => {
    tripEvents = [midStay];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'Shinjuku Granbell');
    expect(row.querySelector('.bk-verb')?.textContent).toBe('צ׳ק-אאוט');
  });

  it('yields the duration to the verb — one annotation, and `5 לילות` beside a check-out misreads (§4)', () => {
    tripEvents = [midStay];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'Shinjuku Granbell');
    expect(row.querySelector('.bk-verb')).toBeTruthy();
    expect(row.querySelector('.bk-dur')).toBeNull();
  });

  it('keeps the duration where there is no verb to yield to', () => {
    tripEvents = [timedFlight];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    expect(row.querySelector('.bk-verb')).toBeNull();
    expect(row.querySelector('.bk-dur')?.textContent).toBeTruthy();
  });

  it('rides the marks on the TITLE line, not the when line (§5)', () => {
    tripEvents = [timedFlight];
    tripAttachments = [{ id: 'a1', tripId: 't1', documentId: 'd1', bookingId: 'b1' }];
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    // They are unshrinkable by nature, and on the when line they took the room the day
    // needed — measured as four rows losing their day to the ellipsis at 360px.
    expect(row.querySelector('.wp-listrow-title .doc-mark')).toBeTruthy();
    expect(row.querySelector('.bk-when .doc-mark')).toBeNull();
  });

  it('says "not scheduled" in words where there is no when line at all', () => {
    const { container } = render(wrap(<IndexBookingsView onClose={() => {}} />));
    const row = rowOf(container, 'טוקיו');
    expect(row.querySelector('.bk-when')).toBeNull();
    expect(row.querySelector('.unlinked')?.textContent).toBe(t.index.unlinked);
  });
});

// Every event and booking gets an easy way to its pin (ADR-0121 §8 amendment). On a
// managed list that rides the shared `ListRow`'s badge, so the row spends no width.
describe('IndexBookingsView — the way to the map', () => {
  afterEach(() => {
    cleanup();
    showPlaceOnMap = null;
  });

  it('offers מפה on the row of a booking with a coord-bearing place, and only that row', () => {
    showPlaceOnMap = vi.fn();
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    // The hotel resolves a place; the flight has neither endpoint, so it has none.
    expect(screen.getAllByRole('button', { name: t.actions.showOnMap })).toHaveLength(1);
  });

  it('closes this screen before the tab changes underneath it', () => {
    const order: string[] = [];
    showPlaceOnMap = () => order.push('navigate');
    render(wrap(<IndexBookingsView onClose={() => order.push('close')} />));
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(order).toEqual(['close', 'navigate']);
  });

  it('drops the affordance outside the trip shell', () => {
    showPlaceOnMap = null;
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    expect(screen.queryByRole('button', { name: t.actions.showOnMap })).toBeNull();
    // The rows themselves are unaffected — absent, not broken.
    expect(screen.getByRole('button', { name: 'Shinjuku Granbell' })).toBeTruthy();
  });
});
