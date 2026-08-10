// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Place } from '@waypoint/shared';
import { PLACE_SEARCH_KIND } from '@waypoint/shared';
import { PLACE_CORPUS, PLACE_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_MIN_CHARS } from '../constants';
import type { MapBounds } from './map-camera';

// Real ApiError/isRateLimitedError; only the network call is stubbed.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, searchPlaces: vi.fn(), searchPlacesText: vi.fn() };
});

let places: Place[] = [];
let events: unknown[] = [];
let bookings: unknown[] = [];
let maybeItems: unknown[] = [];
const createPlace = vi.fn();
const resolvePlace = vi.fn();
vi.mock('../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Tokyo' },
    places,
    events,
    bookings,
    maybeItems,
    indexVerbs: { createPlace, resolvePlace },
  }),
}));

import { ApiError, searchPlaces, searchPlacesText } from './api';
import { usePlaceSearch } from './usePlaceSearch';

const searchMock = searchPlaces as unknown as Mock;
const textSearchMock = searchPlacesText as unknown as Mock;
const PREDICTION = { googlePlaceId: 'g-shibuya', primaryText: 'Shibuya', secondaryText: 'Tokyo' };

// Derived from the floor, never hardcoded against it. ADR-0131 §8b raised
// `PLACE_SEARCH_MIN_CHARS` 2 → 3 and three cases here were fixtured on a literal
// 2-char query, which does not FAIL at the higher floor — it goes inert and keeps
// passing while testing nothing. Deriving both sides means the next change to the
// floor cannot silently disable a test.
const BELOW_FLOOR = 'x'.repeat(PLACE_SEARCH_MIN_CHARS - 1);
const PAST_FLOOR = 'shibuya'.slice(0, Math.max(PLACE_SEARCH_MIN_CHARS, 1));

describe('usePlaceSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    places = [];
    events = [];
    bookings = [];
    maybeItems = [];
    searchMock.mockReset().mockResolvedValue([PREDICTION]);
    textSearchMock.mockReset().mockResolvedValue([PREDICTION]);
    createPlace.mockReset().mockResolvedValue('pl-new');
    resolvePlace.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('does not fire a search below the min-chars floor', async () => {
    const { result } = renderHook(() => usePlaceSearch());
    act(() => result.current.setQuery(BELOW_FLOOR));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('fires one debounced search once past the floor and surfaces predictions', async () => {
    const { result } = renderHook(() => usePlaceSearch());
    act(() => result.current.setQuery(PAST_FLOOR));
    // Before the debounce window elapses, nothing has fired yet.
    expect(searchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(result.current.predictions).toEqual([PREDICTION]);
  });

  it('picking a place already REFERENCED in the trip links to it with no resolve spend', async () => {
    places = [{ id: 'pl-existing', googlePlaceId: 'g-shibuya', name: 'Shibuya' } as Place];
    // A saved event references it → it is genuinely "in the trip" (ADR-0112).
    events = [{ id: 'e1', placeId: 'pl-existing' }];
    const { result } = renderHook(() => usePlaceSearch());
    expect(result.current.alreadyInTrip(PREDICTION)?.id).toBe('pl-existing');
    let picked: Place | undefined;
    await act(async () => {
      picked = await result.current.pick(PREDICTION);
    });
    expect(picked?.id).toBe('pl-existing');
    expect(resolvePlace).not.toHaveBeenCalled();
  });

  it('a cached-but-unreferenced place is NOT "already in trip"; re-picking it re-resolves (server dedups)', async () => {
    // The row exists (a prior pick was never saved), but nothing references it.
    places = [{ id: 'pl-cached', googlePlaceId: 'g-shibuya', name: 'Shibuya' } as Place];
    events = [];
    resolvePlace.mockResolvedValue({ id: 'pl-cached', googlePlaceId: 'g-shibuya' } as Place);
    const { result } = renderHook(() => usePlaceSearch());
    expect(result.current.alreadyInTrip(PREDICTION)).toBeUndefined();
    await act(async () => {
      await result.current.pick(PREDICTION);
    });
    // Falls through to resolve; the server dedups to the cached row (zero Google spend).
    expect(resolvePlace).toHaveBeenCalledTimes(1);
  });

  it('picking a new prediction resolves through the proxy with the session token + enrichPlaceId', async () => {
    resolvePlace.mockResolvedValue({ id: 'pl-resolved', googlePlaceId: 'g-shibuya' } as Place);
    const { result } = renderHook(() => usePlaceSearch({ enrichPlaceId: 'pl-lite' }));
    // Mint the session token by starting a search first.
    act(() => result.current.setQuery(PAST_FLOOR));
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
    act(() => result.current.setQuery(PAST_FLOOR));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(result.current.rateLimited).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(result.current.predictions).toEqual([]);
  });
});

/* ── AIRPORT-ONLY SEARCH (field report #6) ─────────────────────────────────────────────────
   The Map tab searches the Text Search corpus, and an errand can say what would answer it. */
describe('usePlaceSearch — restricting the corpus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    places = [];
    events = [];
    bookings = [];
    maybeItems = [];
    textSearchMock.mockReset().mockResolvedValue([PREDICTION]);
  });
  afterEach(() => vi.useRealTimers());

  const search = async (options: Parameters<typeof usePlaceSearch>[0]) => {
    const { result } = renderHook(() => usePlaceSearch(options));
    act(() => result.current.setQuery(PAST_FLOOR));
    await act(async () => {
      vi.advanceTimersByTime(PLACE_SEARCH_DEBOUNCE_MS);
    });
    return result;
  };

  it('passes the kind through to the proxy when an errand named one', async () => {
    await search({ corpus: PLACE_CORPUS.text, kind: PLACE_SEARCH_KIND.AIRPORT });
    expect(textSearchMock).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ kind: PLACE_SEARCH_KIND.AIRPORT }),
    );
  });

  it('names no kind when nothing asked for one — free browsing is the whole corpus', async () => {
    await search({ corpus: PLACE_CORPUS.text });
    expect(textSearchMock).toHaveBeenCalledWith('t1', expect.objectContaining({ kind: undefined }));
  });

  // The kind changes what the ANSWER is, unlike the viewport bias, which only changes ranking
  // and is deliberately read at fetch time so a pan cannot re-bill a query.
  it('re-asks when the kind changes under the same query', async () => {
    const { rerender, result } = renderHook(
      ({ kind }: { kind?: typeof PLACE_SEARCH_KIND.AIRPORT }) =>
        usePlaceSearch({ corpus: PLACE_CORPUS.text, kind }),
      { initialProps: {} as { kind?: typeof PLACE_SEARCH_KIND.AIRPORT } },
    );
    act(() => result.current.setQuery(PAST_FLOOR));
    await act(async () => {
      vi.advanceTimersByTime(PLACE_SEARCH_DEBOUNCE_MS);
    });
    expect(textSearchMock).toHaveBeenCalledTimes(1);

    rerender({ kind: PLACE_SEARCH_KIND.AIRPORT });
    await act(async () => {
      vi.advanceTimersByTime(PLACE_SEARCH_DEBOUNCE_MS);
    });
    expect(textSearchMock).toHaveBeenCalledTimes(2);
    expect(textSearchMock).toHaveBeenLastCalledWith(
      't1',
      expect.objectContaining({ kind: PLACE_SEARCH_KIND.AIRPORT }),
    );
  });
});

/* ── THE VIEWPORT BIAS IS A HINT, NOT A REQUIREMENT (field report #34) ─────────────────────────
   A world-wide viewport used to reach Google as a rectangle wider than 180° and come back
   `400 INVALID_ARGUMENT`, so panning out turned address search into the generic failure. The
   server is what guarantees this now; declining to send one is defence in depth. What these
   pin is the lifecycle either way: loading ends, results render, `failed` stays false. */
describe('usePlaceSearch — an unsendable viewport bias', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    places = [];
    events = [];
    bookings = [];
    maybeItems = [];
    textSearchMock.mockReset().mockResolvedValue([PREDICTION]);
  });
  afterEach(() => vi.useRealTimers());

  const searchWithBias = async (bounds: MapBounds) => {
    // One stable ref across renders, as `Map.tsx`'s `useRef` is — a fresh object per render
    // would make the bias an effect dependency that changes every time and re-ask the query.
    const biasRef = { current: bounds };
    const { result } = renderHook(() => usePlaceSearch({ corpus: PLACE_CORPUS.text, biasRef }));
    act(() => result.current.setQuery(PAST_FLOOR));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACE_SEARCH_DEBOUNCE_MS + 50);
    });
    return result;
  };

  it('passes an ordinary city viewport through as the ranking hint it is', async () => {
    const tokyo = { south: 35.6, west: 139.6, north: 35.75, east: 139.8 };
    const result = await searchWithBias(tokyo);
    expect(textSearchMock).toHaveBeenCalledWith('t1', expect.objectContaining({ bias: tokyo }));
    expect(result.current.predictions).toEqual([PREDICTION]);
  });

  it('searches unranked from a world-wide viewport, and the lifecycle completes', async () => {
    const result = await searchWithBias({ south: -85, west: -180, north: 85, east: 180 });
    expect(textSearchMock).toHaveBeenCalledWith('t1', expect.objectContaining({ bias: undefined }));
    // The whole point: results, not the generic failure, and nothing left spinning.
    expect(result.current.predictions).toEqual([PREDICTION]);
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('leaves an empty answer as no-results rather than a failure', async () => {
    textSearchMock.mockResolvedValue([]);
    const result = await searchWithBias({ south: -85, west: -180, north: 85, east: 180 });
    expect(result.current.predictions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(result.current.active).toBe(true);
  });
});
