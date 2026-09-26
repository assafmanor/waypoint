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
import { tripRecap, tripRecapLegKeys, type TripRecap, type TravelEstimate } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { usePlaceLabels } from '../state/place-labels';
import { shotOf, type DayShot } from './day-photo';
import { placeLabelOf } from './place-label';
import { readCachedTravelEstimates } from './travel';

export type AppTripRecap = Omit<TripRecap, 'cover'> & { cover: DayShot | undefined };

/**
 * The recap for the trip in context, or `undefined` until the local leg read answers — one
 * IndexedDB read, and waiting for it is what keeps a distance from appearing as an estimate and
 * then changing under the reader a frame later.
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
    if (read?.keyId !== keyId) return undefined;
    const recap = tripRecap({ ...input, legs: read.legs });
    return { ...recap, cover: recap.cover && shotOf(recap.cover, enrichments) };
  }, [input, read, keyId, enrichments]);
}
