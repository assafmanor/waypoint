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
