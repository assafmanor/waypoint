// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BOOKING_TYPE, type Booking } from '@waypoint/shared';

// A pending booking: unlinked, so splitBookings files it under "upcoming".
const booking: Booking = {
  id: 'b1',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'טוקיו',
  confirmationCode: 'ABC123',
  source: 'manual',
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
    bookings: [booking],
    places: [],
    events: [],
    documents: [],
  }),
}));
vi.mock('../lib/useClock', () => ({ useClock: () => new Date('2026-07-20T00:00:00Z') }));
// Only the sync-status hooks are overridden — the row wires the real `useSyncStatus`
// into the ListRow's trailing slot (U-04); here it reports the booking as pending.
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return {
    ...actual,
    useSyncStatus: (id: string) =>
      id === 'b1' ? ({ state: 'pending' } as const) : ({ state: 'synced' } as const),
    usePendingUploads: () => [],
  };
});

import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { Index } from './Index';
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

describe('Index booking row (ListRow migration, U-03/U-04)', () => {
  afterEach(() => cleanup());

  it('renders a booking row on the shared ListRow with a per-row SyncBadge for a pending booking', () => {
    render(wrap(<Index />));
    // The open-body carries the booking title as its accessible name.
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy();
    // The trailing slot holds the sync affordance in its pending state (U-04).
    expect(screen.getByRole('img', { name: t.sync.badge.pending })).toBeTruthy();
    // And the row still exposes the manage kebab by its accessible name.
    expect(screen.getByRole('button', { name: t.index.detail.actions })).toBeTruthy();
  });
});
