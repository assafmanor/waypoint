// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// jsdom has no scrollIntoView; the form's focus-reveal and the zone picker both
// call it (mirrors ZonePicker.test.tsx).
Element.prototype.scrollIntoView = vi.fn();

// EventForm folds into the Modal primitive (U-01). The state hooks are mocked so
// the test exercises the overlay/focus behavior, not the trip data plane.
// Mutable so the multi-zone tests can add places/crossings without a second mock.
const tripState = {
  trip: {
    id: 't1',
    timezone: 'Asia/Tokyo',
    startDate: '2026-07-19',
    endDate: '2026-07-25',
    updatedBy: 'u1',
  },
  activeDate: '2026-07-20',
  events: [] as unknown[],
  bookings: [] as unknown[],
  zoneCrossings: [] as unknown[],
  // The place field (PlacePicker) reads the snapshot + the place verbs.
  places: [] as unknown[],
  indexVerbs: { createPlace: vi.fn(), resolvePlace: vi.fn() },
};
vi.mock('../state/trip-state', () => ({ useTrip: () => tripState }));
vi.mock('../state/auth-state', () => ({ useAuth: () => ({ me: { user: { id: 'u1' } } }) }));
const verbs = { create: vi.fn(), update: vi.fn(), schedule: vi.fn() };
vi.mock('../state/verbs', () => ({ useVerbs: () => verbs }));

import { ToastProvider } from './Toast';
import { NavProvider } from '../state/nav-state';
import { EventForm } from './EventForm';
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

describe('EventForm (folded into Modal, U-01)', () => {
  afterEach(() => cleanup());

  it('renders as a body-portalled dialog and moves focus into the card', () => {
    render(wrap(<EventForm onClose={() => {}} />));
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.modal-overlay')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
  });

  it('closes on Escape when the form is untouched (overlay/back path)', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click when untouched', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(wrap(<EventForm onClose={() => {}} />));
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('guards a dirty close: Escape prompts a discard confirm instead of closing', () => {
    const onClose = vi.fn();
    render(wrap(<EventForm onClose={onClose} />));
    fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
      target: { value: 'ארוחת ערב' },
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    // The discard confirm appears; confirming it runs the close.
    expect(screen.getByText(t.common.discardTitle)).toBeTruthy();
    fireEvent.click(screen.getByText(t.common.discardConfirm));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ADR-0107 §6 — the zone chip: the resolved zone is stated and correctable, and
  // a correction is a manual override on the event, never a cache of the derived
  // value (§7 / ADR-0110 §94-99).
  describe('the zone chip', () => {
    const TLV = 'Asia/Jerusalem';
    const flight = {
      id: 'ev-f',
      bookingId: 'bk',
      date: '2026-07-20',
      startsAt: '2026-07-20T20:00:00Z',
    };

    afterEach(() => {
      tripState.events = [];
      tripState.bookings = [];
      tripState.places = [];
      tripState.zoneCrossings = [];
      verbs.create.mockClear();
      verbs.update.mockClear();
    });

    const pickZone = (query: string, name: RegExp) => {
      fireEvent.click(document.querySelector<HTMLElement>('.zchip-btn')!);
      fireEvent.change(screen.getByPlaceholderText(t.zonePicker.searchPlaceholder), {
        target: { value: query },
      });
      fireEvent.click(screen.getByRole('button', { name }));
    };

    it('states the trip primary zone when nothing else anchors the event', () => {
      render(wrap(<EventForm onClose={() => {}} />));
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Tokyo');
      expect(document.querySelector('.zchip-btn.pinned')).toBeNull();
    });

    it('states the ITINERARY SEGMENT zone for a time before the outbound crossing', () => {
      // The outbound flight departs 20:00Z on the 20th, so a 15:00-local event that
      // day sits in the origin segment — Jerusalem, not the destination.
      tripState.zoneCrossings = [
        { at: Date.parse(flight.startsAt), fromZone: TLV, toZone: 'Asia/Tokyo' },
      ];
      render(
        wrap(<EventForm defaults={{ date: '2026-07-20', start: '15:00' }} onClose={() => {}} />),
      );
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
    });

    it('a pick pins the zone, and saving sends it as the override', () => {
      render(wrap(<EventForm onClose={() => {}} />));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      pickZone('jerusalem', /Jerusalem/);
      expect(document.querySelector('.zchip-btn.pinned')).toBeTruthy();
      fireEvent.click(screen.getByText(t.eventForm.save));
      expect(verbs.create).toHaveBeenCalledWith(expect.objectContaining({ displayTimezone: TLV }));
    });

    it('interprets the typed time in the PICKED zone (the form and the view agree)', () => {
      render(
        wrap(<EventForm defaults={{ date: '2026-07-20', start: '09:00' }} onClose={() => {}} />),
      );
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      pickZone('jerusalem', /Jerusalem/);
      fireEvent.click(screen.getByText(t.eventForm.save));
      // 09:00 kept as the wall-clock and re-interpreted in Jerusalem (+3) — NOT
      // re-rendered as another time in Tokyo (§8: you meant the time *there*).
      expect(verbs.create).toHaveBeenCalledWith(
        expect.objectContaining({ startsAt: '2026-07-20T06:00:00.000Z' }),
      );
    });

    it('reads an existing override back, and the reset clears it with null', () => {
      const event = {
        ...flight,
        bookingId: undefined,
        title: 'קפה',
        kind: 'soft',
        status: 'planned',
        source: 'manual',
        sortOrder: 1,
        tripId: 't1',
        startsAt: '2026-07-20T06:00:00.000Z',
        displayTimezone: TLV,
        createdAt: '',
        updatedAt: '',
        updatedBy: 'u1',
      };
      render(wrap(<EventForm event={event as never} onClose={() => {}} />));
      // Pinned to Jerusalem, and the stored instant reads back as its 09:00 there.
      expect(document.querySelector('.zchip-btn.pinned')).toBeTruthy();
      expect(document.querySelector('.zchip-zone')!.textContent).toContain('Jerusalem');
      expect(document.querySelector('.modal-overlay')!.textContent).toContain('09:00');

      fireEvent.click(screen.getByRole('button', { name: t.eventForm.zoneReset }));
      fireEvent.click(screen.getByText(t.eventForm.save));
      expect(verbs.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ displayTimezone: null }),
      );
    });

    it('leaves the override untouched when the chip is never used', () => {
      render(wrap(<EventForm onClose={() => {}} />));
      fireEvent.change(screen.getByPlaceholderText(t.eventForm.titlePlaceholder), {
        target: { value: 'קפה' },
      });
      fireEvent.click(screen.getByText(t.eventForm.save));
      // Not null and not the derived zone — an untouched form must not freeze
      // today's derivation onto the event.
      expect(verbs.create.mock.calls[0][0].displayTimezone).toBeUndefined();
    });
  });

  // ADR-0109 §11: category is an explicit ChoiceGrid, not derived from the icon.
  it('offers an explicit category selector for a manual event and marks the pick', () => {
    render(wrap(<EventForm onClose={() => {}} />));
    const group = screen.getByRole('radiogroup', { name: t.eventForm.categoryLabel });
    const food = within(group).getByRole('radio', { name: t.iconPicker.categories.food });
    expect(food.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(food);
    expect(food.getAttribute('aria-checked')).toBe('true');
  });
});
