// **The trip recap, as the app reads it** (ADR-0239 §9) — the client half of the two adapters.
//
// The snapshot supplies the rows and the device's leg cache supplies the distances: the same
// `RouteLeg` rows the server reads, carried here by the route pack (`useTripRoutePack`, which
// hydrates whatever pack the device holds even for a finished trip) or by any day that was opened
// while the trip was live. A leg this device never held is a great-circle estimate and says so.
//
// Nothing is decided here: `tripRecap` in `@waypoint/shared` is the one derivation, so this page
// and every share print the same number.
import { useEffect, useMemo, useState } from 'react';
import {
  tripRecap,
  tripRecapLegKeys,
  type Trip,
  type TripRecap,
  type TravelEstimate,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { readCachedSnapshot } from './cache';
import { usePlaceLabels } from '../state/place-labels';
import { shotOf, type DayShot } from './day-photo';
import { placeLabelOf } from './place-label';
import { readCachedTravelEstimates } from './travel';

export type AppTripRecap = Omit<TripRecap, 'cover'> & { cover: DayShot | undefined };

/**
 * The recap for the trip in context, or `undefined` until the local leg read answers — one
 * IndexedDB read, and waiting for it is what keeps a distance from appearing as an estimate and
 * then changing under the reader a frame later.
 *
 * **Only the first read is waited for.** A row marked on the memory Home changes which legs the
 * recap names, and answering `undefined` again while the new read is out blanked every figure and
 * emptied the stragglers list under the sheet walking it, closing it after one answer (epic
 * 4.4). A re-read recaps against the legs already held; one the recap newly names is an estimate
 * for that moment, as it would be on a device that never held it.
 */
export function useTripRecap(): AppTripRecap | undefined {
  const { trip, events, bookings, places, maybeItems, enrichments, travelModeOverrides } =
    useTrip();
  const labels = usePlaceLabels();

  const input = useMemo(
    () => ({
      trip,
      events,
      bookings,
      places,
      maybes: maybeItems,
      enrichments,
      overrides: travelModeOverrides,
      placeLabel: (placeId: string) =>
        placeLabelOf(labels, placeId, places.find((place) => place.id === placeId)?.name),
    }),
    [trip, events, bookings, places, maybeItems, enrichments, travelModeOverrides, labels],
  );
  const keys = useMemo(() => tripRecapLegKeys(input), [input]);
  const keyId = keys.join('|');

  const [read, setRead] = useState<{ keyId: string; legs: Map<string, TravelEstimate> }>();
  useEffect(() => {
    let live = true;
    const settle = (legs: Map<string, TravelEstimate>) => {
      if (live) setRead({ keyId, legs });
    };
    // A failed read is a device with nothing cached: every leg an estimate, never no recap.
    readCachedTravelEstimates(keys).then(settle, () => settle(new Map()));
    return () => {
      live = false;
    };
    // `keys` is fingerprinted by `keyId`: a fresh array with the same keys is the same read.
  }, [keyId]);

  return useMemo(() => {
    if (!read) return undefined;
    const recap = tripRecap({ ...input, legs: read.legs });
    return { ...recap, cover: recap.cover && shotOf(recap.cover, enrichments) };
  }, [input, read, keyId, enrichments]);
}

/**
 * **The covers of the trips on `/trips`** (ADR-0240 §7), by trip id: `tripRecap`'s cover over
 * each trip's cached snapshot, so a card shows the same picture its memory Home opens on. No
 * trip is in context here, so the rows come from the device; a trip this device never opened
 * has no snapshot and keeps its flag. Legs are not read: they move figures, never the cover.
 */
export function useTripCovers(trips: readonly Pick<Trip, 'id'>[]): ReadonlyMap<string, DayShot> {
  const ids = trips.map((trip) => trip.id).join('|');
  const [covers, setCovers] = useState<ReadonlyMap<string, DayShot>>(new Map());
  useEffect(() => {
    let live = true;
    const read = async (tripId: string) => {
      const snapshot = await readCachedSnapshot(tripId);
      if (!snapshot) return undefined;
      const { cover } = tripRecap({
        ...snapshot,
        maybes: snapshot.maybeItems,
        overrides: snapshot.travelModeOverrides,
        legs: new Map(),
      });
      const shot = cover && shotOf(cover, snapshot.enrichments);
      return shot && ([tripId, shot] as const);
    };
    void Promise.all(ids ? ids.split('|').map(read) : []).then((pairs) => {
      if (live) setCovers(new Map(pairs.filter((pair) => pair !== undefined)));
    });
    return () => {
      live = false;
    };
  }, [ids]);
  return covers;
}
