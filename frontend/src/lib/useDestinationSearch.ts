import { useCallback, useEffect, useRef, useState } from 'react';
import type { DestinationResult, PlacePrediction } from '@waypoint/shared';
import { PLACE_SEARCH_DEBOUNCE_MS, PLACE_SEARCH_MIN_CHARS } from '../constants';
import { isRateLimitedError, resolveDestination, searchDestinations } from './api';

export interface UseDestinationSearch {
  query: string;
  setQuery: (q: string) => void;
  predictions: PlacePrediction[];
  loading: boolean;
  rateLimited: boolean;
  failed: boolean;
  /** Geocode a picked prediction into its point + country + derived zone. */
  resolve: (prediction: PlacePrediction) => Promise<DestinationResult>;
  reset: () => void;
}

/**
 * The creation-time counterpart to {@link usePlaceSearch} (ADR-0113 §consequences):
 * a lighter core over the trip-agnostic `/destinations/*` endpoints. It shares the
 * session-token + pause-gated-debounce cost discipline (ADR-0108 §1) but drops
 * everything trip-scoped — no snapshot dedup, no persistence, no offline outbox —
 * because there's no trip yet at creation. Generalizing `usePlaceSearch` to inject
 * both was heavier than this focused hook (the ADR left the choice to build).
 */
export function useDestinationSearch(): UseDestinationSearch {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [failed, setFailed] = useState(false);

  const sessionTokenRef = useRef<string | null>(null);
  const ensureToken = useCallback((): string => {
    sessionTokenRef.current ??= crypto.randomUUID();
    return sessionTokenRef.current;
  }, []);
  const retire = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const trimmed = query.trim();
  const active = trimmed.length >= PLACE_SEARCH_MIN_CHARS;

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
      searchDestinations({ input: trimmed, sessionToken: ensureToken(), signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) return;
          setPredictions(results);
          setLoading(false);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
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
  }, [active, trimmed, ensureToken]);

  const resolve = useCallback(
    async (prediction: PlacePrediction): Promise<DestinationResult> => {
      const result = await resolveDestination({
        googlePlaceId: prediction.googlePlaceId,
        sessionToken: ensureToken(),
      });
      retire();
      return result;
    },
    [ensureToken, retire],
  );

  const reset = useCallback(() => {
    retire();
    setQuery('');
    setPredictions([]);
    setLoading(false);
    setRateLimited(false);
    setFailed(false);
  }, [retire]);

  return { query, setQuery, predictions, loading, rateLimited, failed, resolve, reset };
}
