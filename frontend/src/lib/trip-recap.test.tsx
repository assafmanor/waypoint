// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { haversineMeters, routeLegKey, type Place, type TripEvent } from '@waypoint/shared';

const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
const A = { id: 'a', name: 'A', lat: 35.6938, lng: 139.7034, ...stamp } satisfies Place;
const B = { id: 'b', name: 'B', lat: 35.6946, lng: 139.7016, ...stamp } satisfies Place;
const row = (id: string, placeId: string, time: string): TripEvent => ({
  id,
  date: '2026-05-01',
  title: id,
  kind: 'soft',
  status: 'done',
  placeId,
  startsAt: `2026-05-01T${time}:00.000Z`,
  sortOrder: 0,
  source: 'manual',
  ...stamp,
});

const trip = {
  trip: { id: 't1', startDate: '2026-05-01', endDate: '2026-05-02' },
  events: [row('1', 'a', '01:00'), row('2', 'b', '02:00')],
  bookings: [],
  places: [A, B],
  maybeItems: [],
  enrichments: {},
  travelModeOverrides: [],
};
vi.mock('../state/trip-state', () => ({ useTrip: () => trip }));

const readCachedTravelEstimates = vi.fn();
vi.mock('./travel', () => ({
  readCachedTravelEstimates: (keys: string[]) => readCachedTravelEstimates(keys),
}));

import { useTripRecap } from './trip-recap';

afterEach(() => readCachedTravelEstimates.mockReset());

describe('useTripRecap: the client adapter (ADR-0239 §9)', () => {
  it('reads the legs the recap names from the device cache, then answers exactly', async () => {
    const key = routeLegKey(A, B, 'walking');
    readCachedTravelEstimates.mockResolvedValue(
      new Map([[key, { mode: 'walking', distanceMeters: 230, durationSeconds: 170 }]]),
    );
    const { result } = renderHook(() => useTripRecap());
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBeDefined());
    expect(readCachedTravelEstimates.mock.calls[0]![0]).toContain(key);
    expect(result.current!.figures.groundMeters).toEqual({ state: 'present', value: 230 });
  });

  it('a device with nothing cached still recaps, as an estimate', async () => {
    readCachedTravelEstimates.mockRejectedValue(new Error('no idb'));
    const { result } = renderHook(() => useTripRecap());
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current!.figures.groundMeters).toEqual({
      state: 'present',
      value: haversineMeters(A, B),
      estimate: true,
    });
    expect(result.current!.cover).toBeUndefined();
  });

  it('keeps answering while a changed trip re-reads its legs', async () => {
    let answer: (legs: Map<string, unknown>) => void = () => {};
    readCachedTravelEstimates.mockResolvedValue(new Map());
    const { result, rerender } = renderHook(() => useTripRecap());
    await waitFor(() => expect(result.current).toBeDefined());

    readCachedTravelEstimates.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const before = trip.events;
    trip.events = [...before, row('3', 'a', '03:00')];
    try {
      act(() => rerender());
      // The read for the new leg is still out, and the recap already counts the new row.
      expect(result.current?.figures.places).toMatchObject({ state: 'present' });
      expect(readCachedTravelEstimates).toHaveBeenCalledTimes(2);
      await act(async () => answer(new Map()));
    } finally {
      trip.events = before;
    }
  });
});
