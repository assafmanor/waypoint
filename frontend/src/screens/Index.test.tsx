// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

/** Empty by default — the landing's counts and the documents screen's empty state both
 *  assert against zero. A test that needs a document adds one. */
let tripDocuments: unknown[] = [];
const passport = {
  id: 'd1',
  tripId: 't1',
  type: 'passport',
  title: 'דרכון של דנה',
  mimeType: 'image/jpeg',
  sizeBytes: 1024,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
  updatedBy: 'u1',
};

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    // The attachment link list every documents surface reads (ADR-0173/0174).
    documentAttachments: [],
    // The one context index every note surface resolves through (ADR-0172 §1);
    // built from this file's own fixtures so pairing is real rather than stubbed.
    hostContexts: buildHostContextIndex([], [booking]),
    // Note hosts resolve through trip-state's one index; this file asserts nothing
    // about an inherited name or category, so the index-miss fallback carries it.
    noteHosts: new Map(),
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
    documents: tripDocuments,
    maybeItems: [],
    // The booking detail reads it for the airport codes (ADR-0166 §18). Empty is the
    // normal state for most places, and the fact is simply absent.
    enrichments: {},
    notes: [],
    tasks: [],
    // The tasks tile derives its preview against the trip's own crossings (brief §10).
    zoneCrossings: [],
    users: [],
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
import { buildHostContextIndex } from '../lib/host-context';

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
  afterEach(() => {
    cleanup();
    tripDocuments = [];
  });

  it('renders a bookings tile and a documents tile with their counts', () => {
    render(wrap(<Index />));
    expect(screen.getByRole('button', { name: new RegExp(t.index.bookingsTitle) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.docs.title) })).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // bookings count
  });

  // The order is an owner decision (2026-08-15) and nothing else in the app enforces it, so
  // a re-order during an unrelated edit would be silent. After the spine, the rule is
  // whether a tile can be LATE.
  it('orders the tiles bookings · tasks · documents · notes', () => {
    render(wrap(<Index />));
    const titles = [...document.querySelectorAll('.wp-idx-tile-t')].map((e) => e.textContent);
    expect(titles).toEqual([t.index.bookingsTitle, t.tasks.title, t.docs.title, t.notes.title]);
  });

  // The Index is trip-wide, and a remembered `?day=` rides along on its URL now (field
  // report #39) — so the guard is that the param changes NOTHING here: the same tiles, the
  // same counts, the same readiness. There is no date filter on this screen to remove, and
  // this is what stops one growing.
  it('renders the same trip-wide landing with a remembered ?day= on the URL', () => {
    const plain = render(wrap(<Index />, ['/?tab=index'])).container.textContent;
    cleanup();
    const withDay = render(wrap(<Index />, ['/?tab=index&day=2026-07-23'])).container.textContent;
    expect(withDay).toBe(plain);
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

  // …and `?focus=bookings` MOUNTS the bookings screen with nothing on top (session 172).
  // That is the whole point of it: a booking errand returns here so the screen exists to
  // take the answer it is holding and re-open its form.
  it('?focus=bookings mounts the bookings screen, opening no detail', () => {
    render(wrap(<Index />, ['/?tab=index&focus=bookings']));
    expect(screen.getByRole('button', { name: 'טוקיו' })).toBeTruthy(); // the bookings screen
    expect(screen.queryByRole('dialog')).toBeNull(); // and nothing opened on top of it
  });

  it('?focus=docs deep-link (ADR-0050) opens the documents screen directly', () => {
    render(wrap(<Index />, ['/?tab=index&focus=docs']));
    expect(screen.getByText(t.docs.emptyTitle)).toBeTruthy();
  });

  // The way in from a note about a document (ADR-0153 §8's amendment): the same shape
  // `?booking=` has had since ADR-0050, one kind over — mount the screen, hand it the id.
  it('?doc=<id> opens the documents screen with that document open', () => {
    tripDocuments = [passport];
    render(wrap(<Index />, ['/?tab=index&doc=d1']));
    const viewer = screen.getByRole('dialog');
    expect(within(viewer).getByText('דרכון של דנה')).toBeTruthy();
  });

  // A note whose host has since been deleted must land on the screen rather than on a
  // spinner over a document that is not there.
  it('?doc=<id> for a document that is gone opens the screen and nothing on top', () => {
    tripDocuments = [passport];
    render(wrap(<Index />, ['/?tab=index&doc=d-gone']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
