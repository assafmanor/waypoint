// **Enrichment for a place the trip does not hold yet** (ADR-0166 §17, ADR-0167 §9.1) — the
// deciding surface's half of the pipe.
//
// The trip's own places get their enrichment pushed: it rides the snapshot and a WS nudge, both
// keyed by `placeId`. A Google search result has no `placeId` and no row anywhere, so nothing can
// be pushed to it — this hook asks, and it asks about exactly one place: **the one you tapped**.
//
// That trigger is the owner's call (2026-08-05), and it is the narrow end of a real range. Enriching
// every result of every query would mean several fetches per search, most of them for places nobody
// keeps, and Wikimedia etiquette is the constraint there rather than our cost (§17). A tap already
// means "this one", so it is one fetch per place a person actually looked at — no cap to tune, and
// the request rides a gesture that was happening anyway.
//
// **Answers are kept for the session, not cached.** Re-selecting a result you already looked at is
// instant and asks nothing, and an empty answer is remembered as an answer — the majority case is
// "we know nothing" (§11.3), and re-asking about it on every tap would be the one way to turn a
// polite trigger into a rude one. Nothing goes to Dexie: a candidate is not trip data, and the
// search that produced it needs the network anyway, so there is no offline state to keep.
import { useEffect, useRef, useState } from 'react';
import type { DeliveredEnrichmentFields, PlaceResult } from '@waypoint/shared';
import { lookupEnrichment } from './api';

/** What we know about the tapped candidate, or `undefined` while nothing has come back yet —
 *  which the surface renders as the row it always was (ADR-0109 §7). */
export function useCandidateEnrichment({
  tripId,
  candidate,
  offline,
}: {
  tripId: string;
  /** The selected Google result, or absent when nothing is selected — or when the trip already
   *  owns it, in which case the snapshot's own enrichment is the answer and this must not ask. */
  candidate?: PlaceResult;
  offline: boolean;
}): DeliveredEnrichmentFields | undefined {
  const [known, setKnown] = useState<Record<string, DeliveredEnrichmentFields>>({});
  // The answers, read inside the effect without making it re-run when one arrives — which it
  // must not: the effect's job is "ask about a place we have not asked about", and re-running it
  // on its own result is how that becomes a loop.
  const knownRef = useRef(known);
  knownRef.current = known;

  // Depended on as PRIMITIVES, not as the result object: `predictions` is a fresh array on every
  // search response, so an object dep would abort and re-ask for the same place on a re-render
  // that changed nothing about it.
  const googlePlaceId = candidate?.googlePlaceId;
  const name = candidate?.primaryText;
  const lat = candidate?.lat ?? undefined;
  const lng = candidate?.lng ?? undefined;

  useEffect(() => {
    if (!googlePlaceId || !name || offline) return;
    if (knownRef.current[googlePlaceId]) return;

    // A superseding tap abandons the answer to the previous one — the same shape the search
    // itself uses for a superseded keystroke.
    const controller = new AbortController();
    void lookupEnrichment(tripId, { googlePlaceId, name, lat, lng }, controller.signal)
      .then((fields) => setKnown((prev) => ({ ...prev, [googlePlaceId]: fields })))
      .catch(() => {
        // **Nothing to report.** A refused lookup (rate limit), a failed one, or an aborted one
        // all leave the card exactly as it would look for the majority of places — which is a
        // complete state, not an error state, so there is no banner and nothing to retry. Not
        // remembered either, so the next tap on this place may still get an answer.
      });
    return () => controller.abort();
  }, [tripId, googlePlaceId, name, lat, lng, offline]);

  return googlePlaceId ? known[googlePlaceId] : undefined;
}
