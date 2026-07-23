import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Place, PlacePrediction } from '@waypoint/shared';
import { PLACE_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_MIN_CHARS } from '../constants';
import { useTrip } from '../state/trip-state';
import { isRateLimitedError, searchPlaces } from './api';
import { referencedPlaceIds } from './places';

export interface UsePlaceSearch {
  query: string;
  setQuery: (q: string) => void;
  predictions: PlacePrediction[];
  loading: boolean;
  /** The proxy's rate limit tripped — degrade softly with a "try again" cue. */
  rateLimited: boolean;
  /** A non-429 search failure (offline / upstream fault). The name-only fallback stays open. */
  failed: boolean;
  /** True while the query is at/above the min-chars floor (a search is warranted). */
  active: boolean;
  /** A prediction already enriched in this trip — used for the "כבר בטיול" chip and
   *  to short-circuit {@link pick} (a match links to the existing row, zero Google spend). */
  alreadyInTrip: (prediction: PlacePrediction) => Place | undefined;
  /** Terminate the session on a pick: link to the existing row if the place is already
   *  in the trip, else enrich-on-pick through the proxy. Returns the canonical Place. */
  pick: (prediction: PlacePrediction) => Promise<Place>;
  /** Offline / no-match fallback: queue a coordless Place-lite via the outbox (never the
   *  proxy — it needs Google). Returns the new place id. */
  saveNameOnly: (name: string) => Promise<string>;
  /** Retire the session token + clear state (call on shell close without a pick). */
  reset: () => void;
}

/**
 * The shared search core behind the Places picker (ADR-0110 §1). Owns the whole
 * lifecycle so every shell reuses it: the FE-minted session token (lazy, threaded
 * through every search + the terminating pick, retired on pick or reset), the
 * mandatory pause-gated debounce (a cost control, ADR-0108 §1), the snapshot-derived
 * `alreadyInTrip` dedup, soft 429 handling, and the offline name-only fallback.
 *
 * @param enrichPlaceId when the picker is opened on a field already holding a coordless
 *   Place-lite, its id — so a pick enriches that row in place instead of minting a duplicate.
 */
export function usePlaceSearch(enrichPlaceId?: string): UsePlaceSearch {
  const { trip, places, events, bookings, maybeItems, indexVerbs } = useTrip();
  const { createPlace, resolvePlace } = indexVerbs;
  const tripId = trip.id;

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [failed, setFailed] = useState(false);

  // Minted lazily on the first keystroke of a pick session; the SAME token is threaded
  // through every search and the terminating resolve (what bills in-session autocomplete
  // at $0, ADR-0108 §1), then retired on a pick or a reset so the next open mints fresh.
  const sessionTokenRef = useRef<string | null>(null);
  const ensureToken = useCallback((): string => {
    sessionTokenRef.current ??= crypto.randomUUID();
    return sessionTokenRef.current;
  }, []);
  const retireSession = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const trimmed = query.trim();
  const active = trimmed.length >= PLACE_SEARCH_MIN_CHARS;

  // Trailing, pause-gated debounce: each keystroke resets the timer and aborts the
  // in-flight request; below the min-chars floor nothing fires (ADR-0108 §1).
  useEffect(() => {
    if (!active) {
      setPredictions([]);
      setLoading(false);
      setRateLimited(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setRateLimited(false);
    setFailed(false);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(tripId, {
        input: trimmed,
        sessionToken: ensureToken(),
        signal: controller.signal,
      })
        .then((results) => {
          if (controller.signal.aborted) return;
          setPredictions(results);
          setLoading(false);
        })
        .catch((err) => {
          if (controller.signal.aborted) return; // superseded by a newer keystroke
          setPredictions([]);
          setRateLimited(isRateLimitedError(err));
          setFailed(!isRateLimitedError(err));
          setLoading(false);
        });
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, tripId, ensureToken]);

  // "In the trip" = referenced by a saved entity, NOT merely cached as a row: a
  // picked-but-unsaved place stays as a dedup cache row but reads as not-in-trip
  // (ADR-0112). The chip and the pick short-circuit both key off this, so a
  // cancelled pick never shows "already in the trip"; re-picking a cached-only row
  // still dedups server-side at zero Google spend (it just isn't a local link).
  const referenced = useMemo(
    () => referencedPlaceIds(events, bookings, maybeItems),
    [events, bookings, maybeItems],
  );
  const alreadyInTrip = useCallback(
    (prediction: PlacePrediction): Place | undefined =>
      places.find((p) => p.googlePlaceId === prediction.googlePlaceId && referenced.has(p.id)),
    [places, referenced],
  );

  const pick = useCallback(
    async (prediction: PlacePrediction): Promise<Place> => {
      const existing = alreadyInTrip(prediction);
      if (existing) {
        // Already in the trip — link to it, no Google spend (ADR-0110 §1).
        retireSession();
        return existing;
      }
      const place = await resolvePlace({
        googlePlaceId: prediction.googlePlaceId,
        sessionToken: ensureToken(),
        enrichPlaceId,
      });
      retireSession();
      return place;
    },
    [alreadyInTrip, ensureToken, resolvePlace, retireSession, enrichPlaceId],
  );

  const saveNameOnly = useCallback(
    async (name: string): Promise<string> => {
      const id = await createPlace({ name });
      retireSession();
      return id;
    },
    [createPlace, retireSession],
  );

  const reset = useCallback(() => {
    retireSession();
    setQuery('');
    setPredictions([]);
    setLoading(false);
    setRateLimited(false);
    setFailed(false);
  }, [retireSession]);

  return {
    query,
    setQuery,
    predictions,
    loading,
    rateLimited,
    failed,
    active,
    alreadyInTrip,
    pick,
    saveNameOnly,
    reset,
  };
}
