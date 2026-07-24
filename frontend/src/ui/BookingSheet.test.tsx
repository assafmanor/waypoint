// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BOOKING_SOURCE, BOOKING_TYPE, type Booking, type Place } from '@waypoint/shared';

Element.prototype.scrollIntoView = vi.fn();

const places: Place[] = [
  {
    id: 'pl-tlv',
    tripId: 't1',
    name: 'תל אביב',
    lat: 32,
    lng: 34.8,
    timezone: 'Asia/Jerusalem',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  },
  {
    id: 'pl-nrt',
    tripId: 't1',
    name: 'טוקיו',
    lat: 35.7,
    lng: 139.7,
    timezone: 'Asia/Tokyo',
    createdAt: '',
    updatedAt: '',
    updatedBy: 'u',
  },
  // A coordless Place-lite: minted offline or when Google matched nothing, so it
  // has NO timezone — the case the zone override exists for (ADR-0107 §6).
  { id: 'pl-lite', tripId: 't1', name: 'קפלאוויק', createdAt: '', updatedAt: '', updatedBy: 'u' },
];

const indexVerbs = {
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  createPlace: vi.fn(),
  resolvePlace: vi.fn(),
};

vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: {
      id: 't1',
      name: 'טיול',
      timezone: 'Asia/Tokyo',
      startDate: '2026-07-19',
      endDate: '2026-07-30',
    },
    events: [],
    bookings: [],
    maybeItems: [],
    places,
    indexVerbs,
  }),
}));

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { BookingSheet } from './BookingSheet';
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

const flight: Booking = {
  id: 'bk',
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: 'תל אביב → טוקיו',
  fromPlaceId: 'pl-tlv',
  toPlaceId: 'pl-nrt',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
};

describe('BookingSheet — transport route as picked places (ADR-0113 follow-up)', () => {
  afterEach(() => cleanup());

  it('a transport booking shows its endpoints as place pickers + a route preview', () => {
    render(wrap(<BookingSheet booking={flight} onClose={() => {}} />));
    // Both endpoint names render (the title-row RouteLabel preview + each picker
    // trigger), and there's no longer a free-text route input.
    expect(screen.getAllByText('תל אביב').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('טוקיו').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(t.index.form.routeLabel)).toBeTruthy();
    // The origin/destination pickers are labelled place pickers, not text inputs.
    expect(screen.getByRole('button', { name: t.index.form.originLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.index.form.destLabel })).toBeTruthy();
  });

  it('a fresh transport booking shows the route-preview ghost until endpoints are picked', () => {
    render(
      wrap(<BookingSheet booking={null} seed={{ type: BOOKING_TYPE.FLIGHT }} onClose={() => {}} />),
    );
    expect(screen.getByText(t.index.form.routePreviewGhost)).toBeTruthy();
  });

  it('shows a zone note so each leg reads in its own zone (ADR-0107 form authoring)', () => {
    // The sheet renders through a Modal portal, so query the document, not the
    // render container.
    render(wrap(<BookingSheet booking={flight} onClose={() => {}} />));
    // The flight crosses zones (Jerusalem → Tokyo, Tokyo 6h ahead): the note says
    // each end is local time + the destination is ahead — no English city names.
    const note = document.querySelector('.bs-zone-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('זמן מקומי בכל עיר');
    expect(note!.textContent).toContain('קדימה'); // destination (Tokyo) ahead
    expect(note!.textContent).not.toContain('Tokyo');
    expect(note!.textContent).not.toContain('Jerusalem');
  });
});

describe('BookingSheet — per-end zone overrides (ADR-0107 §6 session-99 amendment)', () => {
  afterEach(() => {
    cleanup();
    indexVerbs.updateBooking.mockClear();
  });

  /** A flight between a real place and a coordless Place-lite: the destination's
   *  zone is unknowable, which is exactly when the chip becomes editable. */
  const halfKnown: Booking = { ...flight, toPlaceId: 'pl-lite' };

  const chips = () => Array.from(document.querySelectorAll('.zchip'));

  it('states each leg zone, and only the unknowable end is correctable', () => {
    render(wrap(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    const [start, end] = chips();
    // Origin: a real place answers the zone → a statement, no control (§3 — the
    // honest edit is the place itself).
    expect(start.querySelector('.zchip-btn')).toBeNull();
    expect(start.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
    // Destination: coordless, so nothing derives it → editable.
    expect(end.querySelector('.zchip-btn')).not.toBeNull();
  });

  it('both legs are correctable when neither endpoint resolves a zone', () => {
    render(
      wrap(
        <BookingSheet
          booking={{ ...flight, fromPlaceId: 'pl-lite', toPlaceId: 'pl-lite' }}
          onClose={() => {}}
        />,
      ),
    );
    expect(chips().every((c) => c.querySelector('.zchip-btn'))).toBe(true);
  });

  it('pins ONE end only — a crossing needs two overrides, not one for both', () => {
    render(wrap(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    fireEvent.click(chips()[1].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    fireEvent.click(screen.getByText(t.common.save));

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect(patch.endDisplayTimezone).toBe('Atlantic/Reykjavik');
    // The origin still derives from its place, so nothing is written for it.
    expect('startDisplayTimezone' in patch).toBe(false);
  });

  it('reads a stored override back as pinned, and the reset clears it with null', () => {
    render(
      wrap(
        <BookingSheet
          booking={{ ...halfKnown, endDisplayTimezone: 'Atlantic/Reykjavik' }}
          onClose={() => {}}
        />,
      ),
    );
    const end = chips()[1];
    expect(end.querySelector('.zchip-btn.pinned')).not.toBeNull();
    expect(end.querySelector('.zchip-zone')!.textContent).toContain('Reykjavik');

    fireEvent.click(end.querySelector<HTMLElement>('.zchip-reset')!);
    fireEvent.click(screen.getByText(t.common.save));
    expect(indexVerbs.updateBooking.mock.calls[0][1].endDisplayTimezone).toBeNull();
  });

  it('a single-place booking has one chip, and saving clears the unused end', () => {
    render(
      wrap(
        <BookingSheet
          booking={{
            ...flight,
            type: BOOKING_TYPE.RESTAURANT,
            fromPlaceId: undefined,
            toPlaceId: undefined,
            placeId: 'pl-lite',
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(chips()).toHaveLength(1);
    fireEvent.click(chips()[0].querySelector<HTMLElement>('.zchip-btn')!);
    fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
      target: { value: 'reykjavik' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reykjavik/ }));
    fireEvent.click(screen.getByText(t.common.save));

    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    // One zone drives both ends for a single-place booking, so `start` carries it
    // and nothing is written for the unused end.
    expect(patch.startDisplayTimezone).toBe('Atlantic/Reykjavik');
    expect('endDisplayTimezone' in patch).toBe(false);
  });

  it('an untouched form sends no zone keys at all', () => {
    render(wrap(<BookingSheet booking={halfKnown} onClose={() => {}} />));
    fireEvent.click(screen.getByText(t.common.save));
    const patch = indexVerbs.updateBooking.mock.calls[0][1];
    expect('startDisplayTimezone' in patch).toBe(false);
    expect('endDisplayTimezone' in patch).toBe(false);
  });
});
