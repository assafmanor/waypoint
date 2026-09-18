import { useEffect, useState } from 'react';
import type { Trip } from '@waypoint/shared';
import { loadTripList, readCachedTripList } from './cache';
import { standInAfter } from './deadline';
import { STAND_IN_AFTER_MS } from '../constants';

/**
 * **The trip list, from the network or from the last one we mirrored** (sync-and-offline.md
 * "Read"). `null` while nothing has arrived yet — both readers render a boot/blank on it, and
 * neither may read it as "no trips": that is `[]`, and it navigates to the zero state.
 *
 * One hook rather than the effect each screen used to hold, because there are two of them and
 * this change would otherwise have made the duplication three deep: `loadTripList` already
 * falls back to the cache when the fetch FAILS, and what is added here is the fallback for a
 * fetch that merely takes too long — the cache stands in after `STAND_IN_AFTER_MS` and the
 * live list replaces it whenever it lands.
 */
export function useTripList(): Trip[] | null {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const adopt = (list: Trip[]) => {
      if (!cancelled) setTrips(list);
    };
    void standInAfter(
      STAND_IN_AFTER_MS,
      loadTripList().then(({ trips: list }) => list),
      async () => {
        const cached = await readCachedTripList();
        // **An empty cache is not an answer here.** `[]` is a real state that resolves to the
        // zero state and navigates, so standing in with one would tell a member with trips
        // that they have none — for as long as the live read takes to contradict it.
        return cached.length > 0 ? cached : null;
      },
      adopt,
    ).then(adopt, () => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return trips;
}
