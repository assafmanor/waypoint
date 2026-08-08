import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Place, PlacePrediction, PlaceResult, PlaceSearchKind } from '@waypoint/shared';
import {
  PLACE_CORPUS,
  PLACE_SEARCH_DEBOUNCE_MS,
  PLACE_SEARCH_MIN_CHARS,
  type PlaceCorpus,
} from '../constants';
import { useTrip } from '../state/trip-state';
import { isRateLimitedError, searchPlaces, searchPlacesText } from './api';
import type { MapBounds } from './map-camera';
import { referencedPlaceIds } from './places';

/** Which corpus a shell is searching, and therefore which SKU it spends (ADR-0132 §7).
 *  Everything else about the lifecycle — the floor, the pause debounce, the abort, the
 *  `alreadyInTrip` dedup, the soft 429 — is identical, which is why this is a parameter
 *  and not a second hook. */
export interface PlaceSearchOptions {
  /** The picker was opened on a field already holding a coordless Place-lite: its id,
   *  so a pick enriches that row in place instead of minting a duplicate. */
  enrichPlaceId?: string;
  /** Defaults to Autocomplete, which is what every in-form picker wants. */
  corpus?: PlaceCorpus;
  /** Text Search only: the canvas's current bounds, read at FETCH time rather than
   *  taken as a dependency — panning the map must not re-bill the query. */
  biasRef?: RefObject<MapBounds | null>;
  /** **What this search is FOR, when the asker knows** (field report #6): a flight leg wants
   *  an airport, so the proxy restricts the corpus to one. A dependency of the effect, unlike
   *  `biasRef` — the kind changes what the answer IS, so a query typed under a new one has to
   *  be re-asked, where a pan only changes ranking. */
  kind?: PlaceSearchKind;
}

export interface UsePlaceSearch {
  query: string;
  setQuery: (q: string) => void;
  /** Autocomplete predictions or Text Search results. One type: a result is a
   *  prediction that also carries coordinates, so the row grammar is shared and only
   *  the canvas cares about the difference. */
  predictions: PlaceResult[];
  loading: boolean;
  /** The proxy's rate limit tripped — degrade softly with a "try again" cue. */
  rateLimited: boolean;
  /** A non-429 search failure (offline / upstream fault). The name-only fallback stays open. */
  failed: boolean;
  /** True while the query is at/above the min-chars floor (a search is warranted). */
  active: boolean;
  /** A prediction already enriched in this trip — used for the "כבר בטיול" chip and
   *  to short-circuit {@link pick} (a match links to the existing row, zero Google spend). */
  alreadyInTrip: (prediction: Pick<PlacePrediction, 'googlePlaceId'>) => Place | undefined;
  /** Terminate the session on a pick: link to the existing row if the place is already
   *  in the trip, else enrich-on-pick through the proxy. Returns the canonical Place. */
  pick: (prediction: PlaceResult) => Promise<Place>;
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
 * Two corpora share it (ADR-0132 §7): **Autocomplete**, whose predictions carry no
 * coordinates and are therefore rows only, and **Text Search**, whose results carry
 * them and can be drawn. The cost models differ in one way that matters — Autocomplete's
 * session token folds a run of keystrokes into the terminating pick's single charge,
 * while Text Search has no session and bills every call — so the token is minted only
 * for the corpus that has one, and the floor + debounce carry more weight for the other.
 */
export function usePlaceSearch({
  enrichPlaceId,
  corpus = PLACE_CORPUS.autocomplete,
  biasRef,
  kind,
}: PlaceSearchOptions = {}): UsePlaceSearch {
  const { trip, places, events, bookings, maybeItems, indexVerbs } = useTrip();
  const { createPlace, resolvePlace } = indexVerbs;
  const tripId = trip.id;

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [failed, setFailed] = useState(false);

  const textCorpus = corpus === PLACE_CORPUS.text;
  // Minted lazily on the first keystroke of a pick session; the SAME token is threaded
  // through every search and the terminating resolve (what bills in-session autocomplete
  // at $0, ADR-0108 §1), then retired on a pick or a reset so the next open mints fresh.
  // Text Search has no session concept, so this stays null there — and that absence IS
  // the cost difference, not an oversight.
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
      // The bias is read HERE, inside the fired request, so the effect does not depend
      // on it: a camera idle must never re-run a billed search.
      const fetching = textCorpus
        ? searchPlacesText(tripId, {
            input: trimmed,
            bias: biasRef?.current ?? undefined,
            kind,
            signal: controller.signal,
          })
        : searchPlaces(tripId, {
            input: trimmed,
            sessionToken: ensureToken(),
            signal: controller.signal,
          });
      fetching
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
  }, [active, trimmed, tripId, ensureToken, textCorpus, biasRef, kind]);

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
    (prediction: Pick<PlacePrediction, 'googlePlaceId'>): Place | undefined =>
      places.find((p) => p.googlePlaceId === prediction.googlePlaceId && referenced.has(p.id)),
    [places, referenced],
  );

  const pick = useCallback(
    async (prediction: PlaceResult): Promise<Place> => {
      const existing = alreadyInTrip(prediction);
      if (existing) {
        // Already in the trip — link to it, no Google spend (ADR-0110 §1).
        retireSession();
        return existing;
      }
      // A Text Search result already carries everything the row needs, so the resolve
      // hands those fields over and the server skips Place Details entirely — one call
      // for the search, none for the add (ADR-0132 §7). An Autocomplete prediction
      // carries no location, so its pick is still the paid terminating call.
      const place = await resolvePlace({
        googlePlaceId: prediction.googlePlaceId,
        ...(textCorpus
          ? {
              details: {
                name: prediction.primaryText,
                address: prediction.secondaryText,
                lat: prediction.lat,
                lng: prediction.lng,
              },
            }
          : { sessionToken: ensureToken() }),
        enrichPlaceId,
      });
      retireSession();
      return place;
    },
    [alreadyInTrip, ensureToken, resolvePlace, retireSession, enrichPlaceId, textCorpus],
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
