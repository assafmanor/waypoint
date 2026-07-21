// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BOOKING_SOURCE, BOOKING_TYPE, type Booking } from '@waypoint/shared';

// A pending booking: unlinked, so splitBookings files it under "upcoming".
const booking: Booking = {
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
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>();
  return { ...actual, usePendingUploads: () => [], useIsOffline: () => false };
});

import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';
import { Index } from './Index';
import { t } from '../i18n/he';

function wrap(node: ReactNode, initialEntries?: string[]) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <NavProvider>
          <ModeProvider>{node}</ModeProvider>
        </NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('Index landing (ADR-0098)', () => {
  afterEach(() => cleanup());

  it('renders a bookings tile and a documents tile with their counts', () => {
    render(wrap(<Index />));
    expect(screen.getByRole('button', { name: new RegExp(t.index.bookingsTitle) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.docs.title) })).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // bookings count
  });

  it('opens the bookings screen on tile tap, and returns to the landing on back', () => {
    render(wrap(<Index />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.index.bookingsTitle) }));
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(screen.getByRole('button', { name: new RegExp(t.index.bookingsTitle) })).toBeTruthy();
  });

  it('opens the documents screen on tile tap, and returns to the landing on back', () => {
    render(wrap(<Index />));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.docs.title) }));
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.index.backAria }));
    expect(screen.getByRole('button', { name: new RegExp(t.docs.title) })).toBeTruthy();
  });

  it('?booking=<id> deep-link (ADR-0050) opens the bookings screen with that detail on top', () => {
    render(wrap(<Index />, ['/?tab=index&booking=b1']));
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy(); // the row, on the bookings screen
    expect(screen.getByRole('dialog')).toBeTruthy(); // the detail sheet, opened on top
  });

  it('?focus=docs deep-link (ADR-0050) opens the documents screen directly', () => {
    render(wrap(<Index />, ['/?tab=index&focus=docs']));
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();
  });
});
