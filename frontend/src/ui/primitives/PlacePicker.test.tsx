// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Place } from '@waypoint/shared';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, searchPlaces: vi.fn() };
});

let places: Place[] = [];
const createPlace = vi.fn();
const resolvePlace = vi.fn();
vi.mock('../../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    places,
    events: [],
    bookings: [],
    maybeItems: [],
    indexVerbs: { createPlace, resolvePlace },
  }),
}));

import { searchPlaces } from '../../lib/api';
import { NavProvider } from '../../state/nav-state';
import { ToastProvider } from '../Toast';
import { PlacePicker } from './PlacePicker';
import { t } from '../../i18n/he';

const searchMock = searchPlaces as unknown as Mock;
const PREDICTION = { googlePlaceId: 'g-shibuya', primaryText: 'Shibuya', secondaryText: 'Tokyo' };

const wrap = (node: ReactNode) => (
  <MemoryRouter>
    <ToastProvider>
      <NavProvider>{node}</NavProvider>
    </ToastProvider>
  </MemoryRouter>
);

describe('PlacePicker', () => {
  beforeEach(() => {
    places = [];
    searchMock.mockReset().mockResolvedValue([PREDICTION]);
    createPlace.mockReset().mockResolvedValue('pl-new');
    resolvePlace.mockReset().mockResolvedValue({ id: 'pl-resolved' } as Place);
  });
  afterEach(() => cleanup());

  it('shows the placeholder when empty and the place name when filled', () => {
    places = [{ id: 'pl1', name: 'Shibuya Crossing' } as Place];
    const { rerender } = render(wrap(<PlacePicker onChange={() => {}} placeholder="pick" />));
    expect(screen.getByText('pick')).toBeTruthy();
    rerender(wrap(<PlacePicker value="pl1" onChange={() => {}} placeholder="pick" />));
    expect(screen.getByText('Shibuya Crossing')).toBeTruthy();
  });

  it('opens the search sheet, debounces a search, and resolves the pick', async () => {
    const onChange = vi.fn();
    render(wrap(<PlacePicker onChange={onChange} />));
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));

    const input = await screen.findByPlaceholderText(t.placePicker.searchPlaceholder);
    fireEvent.change(input, { target: { value: 'shibuya' } });

    const result = await screen.findByText('Shibuya', {}, { timeout: 2000 });
    fireEvent.click(result);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('pl-resolved'));
    expect(resolvePlace).toHaveBeenCalledTimes(1);
  });

  // ADR-0131 §10: the owner's rule is that adding a place must not send you anywhere when
  // the place already exists — and until now this sheet only knew how to ask Google, so
  // the most common add bought a paid session to find something the trip already held.
  describe('the trip’s own places come first, and cost nothing (ADR-0131 §10)', () => {
    const open = async () => {
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      return screen.findByPlaceholderText(t.placePicker.searchPlaceholder);
    };

    it('a pick from `בטיול` assigns straight away — no Google call, nothing minted', async () => {
      places = [
        { id: 'pl-hotel', name: 'Shinjuku Grand', address: 'Shinjuku', lat: 35.6, lng: 139.7 },
        { id: 'pl-far', name: 'Somewhere else', lat: 35.1, lng: 139.1 },
      ] as Place[];
      const onChange = vi.fn();
      render(wrap(<PlacePicker onChange={onChange} />));
      fireEvent.change(await open(), { target: { value: 'shinjuku' } });

      expect(screen.getByText(t.placePicker.tripGroup)).toBeTruthy();
      fireEvent.click(screen.getByText('Shinjuku Grand'));
      expect(onChange).toHaveBeenCalledWith('pl-hotel');
      // The whole point: the free half answered, so nothing was resolved and nothing minted.
      expect(resolvePlace).not.toHaveBeenCalled();
      expect(createPlace).not.toHaveBeenCalled();
    });

    it('only offers places that can actually supply a location', async () => {
      places = [
        { id: 'pl-lite', name: 'Shinjuku by name only' },
        { id: 'pl-real', name: 'Shinjuku Station', lat: 35.69, lng: 139.7 },
      ] as Place[];
      render(wrap(<PlacePicker onChange={() => {}} />));
      fireEvent.change(await open(), { target: { value: 'shinjuku' } });

      // A coordless Place-lite would offer the problem back — this sheet exists to give a
      // row a location.
      expect(screen.queryByText('Shinjuku by name only')).toBeNull();
      expect(screen.getByText('Shinjuku Station')).toBeTruthy();
    });

    it('never offers the place you are replacing', async () => {
      places = [{ id: 'pl-cur', name: 'Shinjuku Grand', lat: 35.6, lng: 139.7 }] as Place[];
      render(wrap(<PlacePicker value="pl-cur" onChange={() => {}} />));
      fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
      fireEvent.change(await screen.findByPlaceholderText(t.placePicker.searchPlaceholder), {
        target: { value: 'shinjuku' },
      });
      expect(screen.queryByText(t.placePicker.tripGroup)).toBeNull();
    });

    it('answers below the min-chars floor, where the paid half cannot', async () => {
      places = [{ id: 'pl-hotel', name: 'Ao', lat: 35.6, lng: 139.7 }] as Place[];
      render(wrap(<PlacePicker onChange={() => {}} />));
      fireEvent.change(await open(), { target: { value: 'Ao' } });
      // Two characters: the floor (ADR-0131 §8b) is a COST control, and there is no cost
      // on this side, so the free half answers from the first character.
      expect(screen.getByText('Ao')).toBeTruthy();
      expect(searchMock).not.toHaveBeenCalled();
    });
  });

  it('offers a name-only fallback that queues a Place-lite without hitting the proxy', async () => {
    const onChange = vi.fn();
    searchMock.mockResolvedValue([]); // no predictions
    render(wrap(<PlacePicker onChange={onChange} />));
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));

    const input = await screen.findByPlaceholderText(t.placePicker.searchPlaceholder);
    fireEvent.change(input, { target: { value: 'Grandma’s place' } });

    const nameOnly = await screen.findByText(t.placePicker.saveNameOnly('Grandma’s place'));
    fireEvent.click(nameOnly);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('pl-new'));
    expect(createPlace).toHaveBeenCalledWith({ name: 'Grandma’s place' });
    expect(resolvePlace).not.toHaveBeenCalled();
  });
});
