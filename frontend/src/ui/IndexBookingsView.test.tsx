// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BOOKING_SOURCE, BOOKING_TYPE, type Booking } from '@waypoint/shared';

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

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-25',
      updatedBy: 'u1',
    },
    bookings: [flight, hotel],
    places: [],
    events: [],
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
import { IndexBookingsView } from './IndexBookingsView';
import { t } from '../i18n/he';

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('IndexBookingsView (ADR-0098)', () => {
  afterEach(() => cleanup());

  it('renders both booking rows on the shared ListRow, with per-row sync + manage kebab', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shinjuku Granbell' })).toBeTruthy();
    expect(screen.getByRole('img', { name: t.sync.badge.pending })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: t.index.detail.actions })).toHaveLength(2);
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

  it('filters rows by search query (title or confirmation code)', () => {
    render(wrap(<IndexBookingsView onClose={() => {}} />));
    fireEvent.click(screen.getByRole('button', { name: t.index.search.button }));
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

  it("opens that booking's detail on mount when given an initialBookingId (ADR-0050 deep link)", () => {
    render(wrap(<IndexBookingsView onClose={() => {}} initialBookingId="b2" />));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Shinjuku Granbell')).toBeTruthy();
  });
});
