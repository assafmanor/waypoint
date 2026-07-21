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
  title: 'Shinjuku Granbell',
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

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      name: "לפלנד ולשם וכאן '26",
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
      updatedBy: 'u1',
    },
    bookings: tripBookings,
    places: [],
    events: tripEvents,
    documents: [],
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

  it('calls onClose when the back button is tapped', () => {
    const onClose = vi.fn();
    render(wrap(<IndexBookingsView onClose={onClose} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters rows by category chip', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: t.index.bookingType.hotel }));
    const hotelRow = screen.getByRole('button', { name: 'Shinjuku Granbell' });
    const flightRow = screen.getByRole('button', { name: 'טוקיו' });
    expect(hotelRow.closest('.idx-row')?.className).not.toContain('hidden');
    expect(flightRow.closest('.idx-row')?.className).toContain('hidden');
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
    expect(flightRow.closest('.idx-row')?.className).not.toContain('hidden');
    expect(hotelRow.closest('.idx-row')?.className).toContain('hidden');
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
    expect(within(dialog).getByText('Shinjuku Granbell')).toBeTruthy();
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
