// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Place } from '@waypoint/shared';
import { PLACE_SEARCH_DEBOUNCE_MS } from '../constants';

// Real ApiError/isRateLimitedError; only the network call is stubbed.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, searchPlaces: vi.fn() };
});

let places: Place[] = [];
const createPlace = vi.fn();
const resolvePlace = vi.fn();
vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    places,
    indexVerbs: { createPlace, resolvePlace },
  }),
}));

import { ApiError, searchPlaces } from './api';
import { usePlaceSearch } from './usePlaceSearch';

const searchMock = searchPlaces as unknown as Mock;
const PREDICTION = { googlePlaceId: 'g-shibuya', primaryText: 'Shibuya', secondaryText: 'Tokyo' };

describe('usePlaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    places = [];
    searchMock.mockReset().mockResolvedValue([PREDICTION]);
    createPlace.mockReset().mockResolvedValue('pl-new');
    resolvePlace.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('does not fire a search below the min-chars floor', async () => {
    const { result } = renderHook(() => usePlaceSearch());
    act(() => result.current.setQuery('s'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('fires one debounced search once past the floor and surfaces predictions', async () => {
    const { result } = renderHook(() => usePlaceSearch());
    act(() => result.current.setQuery('sh'));
    // Before the debounce window elapses, nothing has fired yet.
    expect(searchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(result.current.predictions).toEqual([PREDICTION]);
  });

  it('picking a prediction already in the trip links to it with no resolve spend', async () => {
    places = [{ id: 'pl-existing', googlePlaceId: 'g-shibuya', name: 'Shibuya' } as Place];
    const { result } = renderHook(() => usePlaceSearch());
    let picked: Place | undefined;
    await act(async () => {
      picked = await result.current.pick(PREDICTION);
    });
    expect(picked?.id).toBe('pl-existing');
    expect(resolvePlace).not.toHaveBeenCalled();
  });

  it('picking a new prediction resolves through the proxy with the session token + enrichPlaceId', async () => {
    resolvePlace.mockResolvedValue({ id: 'pl-resolved', googlePlaceId: 'g-shibuya' } as Place);
    const { result } = renderHook(() => usePlaceSearch('pl-lite'));
    // Mint the session token by starting a search first.
    act(() => result.current.setQuery('sh'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    await act(async () => {
      await result.current.pick(PREDICTION);
    });
    expect(resolvePlace).toHaveBeenCalledTimes(1);
    const arg = resolvePlace.mock.calls[0][0];
    expect(arg.googlePlaceId).toBe('g-shibuya');
    expect(arg.enrichPlaceId).toBe('pl-lite');
    expect(typeof arg.sessionToken).toBe('string');
    expect(arg.sessionToken.length).toBeGreaterThan(0);
  });

  it('surfaces a soft rateLimited state instead of throwing', async () => {
    searchMock.mockRejectedValue(new ApiError(429, 'RATE_LIMITED'));
    const { result } = renderHook(() => usePlaceSearch());
    act(() => result.current.setQuery('sh'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(result.current.rateLimited).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.predictions).toEqual([]);
  });
});
