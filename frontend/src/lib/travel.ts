// **The client's half of a travel time** (ADR-0205 §7) — a Dexie table, one ask per day, and a
// read that answers `TravelEstimate | null`.
//
// Nothing here decides what a travel time SAYS: the derivations are `@waypoint/shared`'s
// (`travel-time.ts`) and the words are ADR-0206's. This file is the pipe between the endpoint M4
// shipped and the surfaces M6/M7/M9 will read, and it exists so no component ever holds a
// `RouteBatch`.
//
// **Three things about it are decided rather than incidental:**
//
//   1. **A Dexie table of its own** (§7). Not `byte-cache`, which is for blobs — a leg is a small
//      JSON record. Not `CACHE_CHANNELS` either, and it cannot be one: that registry is keyed by
//      `ENTITY_TYPE` and driven by a `Change`, and a route is deliberately outside the change log
//      (§4) — no `tripId`, no entity type, no `seq`, and **no writer on this device**. It is a
//      mirror of a server-owned cache, so there is nothing to reconcile and nothing to undo.
//   2. **`null` is the ordinary answer** (ADR-0206 §D4). Offline, refused by the gate, still
//      warming, provider down, kill switch on — every one of them reads the same, and every
//      consumer falls back to `formatDistance`'s crow-flies chip. There is no error state here to
//      design, which is why this module never throws and never reports.
//   3. **A peek never fetches** (ADR-0200 §7, and see `useDayTravel`).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  routeLegKey,
  TRAVEL_MODES,
  type LatLng,
  type RoutedLeg,
  type TravelEstimate,
  type TravelMode,
} from '@waypoint/shared';
import { db } from '../db';
import { fetchRoutes } from './api';
import { useIsDayPreview } from '../state/day-preview';
import { useIsOffline } from './outbox';
import { getNow } from './useClock';

/** **One estimate as this device holds it.** Kept beside the table rather than in `constants.ts`
 *  for the reason `map-archive-cache.ts`'s own budget is: nothing outside this file reads it. */
export interface CachedRouteLeg {
  /** `routeLegKey(from, to, mode)` — the **server's** spelling, imported and never re-derived.
   *  ADR-0205 §4 states the rule and the cost of breaking it: two spellings is a client that can
   *  never hit a row the server stored. */
  key: string;
  estimate: TravelEstimate;
  /** When this device stored it. **Provenance, never an expiry** — a walk between two fixed
   *  points is invalidated by an OSM refresh and by nothing else (§4), so there is no TTL to
   *  compare it against. Indexed because it is the only ordering an eviction sweep could use. */
  cachedAt: number;
}

/** A `Retry-After` we do not control must not be able to park a timer for an hour. */
const WARM_RETRY_MAX_MS = 60_000;

const LEG_KEY_SEPARATOR = '|';

/** **Days answered in full during this session**, so swiping back and forth costs no requests.
 *  Dexie cannot answer this on its own: a refused mode is never a row, so "do we hold every key
 *  we would ask about" is false for every day that has one refusal in it, forever.
 *
 *  A day that came back **still warming** is deliberately not recorded — that is how it gets its
 *  numbers at all: the next time you open it, it asks again. */
const askedDays = new Set<string>();

/** Test seam. The set above is module state by design (it outlives every day surface), so a spec
 *  that mounts the same day twice needs to be able to clear it. */
export function resetAskedDaysForTests(): void {
  askedDays.clear();
}

/** Every (consecutive pair × mode) key a day would ask about. Consecutive only: a day is a
 *  sequence and ADR-0206 §V1 is about the leg between two adjacent stops — the matrix answering
 *  the other pairs too is an efficiency of the call, not a shape of the question. */
function dayLegKeys(stops: readonly LatLng[], modes: readonly TravelMode[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    for (const mode of modes) keys.push(routeLegKey(stops[i]!, stops[i + 1]!, mode));
  }
  return keys;
}

/** The answered legs of a batch, keyed the way the table is. `refusedModes` and `pendingModes`
 *  are read by nobody here on purpose: both render as absence (ADR-0206 §D4), and the split
 *  exists so the CLIENT can tell "never coming" from "not yet" — which is the retry decision
 *  below, taken from the envelope's `retryAfterSeconds` rather than per leg. */
function estimatesOf(
  stops: readonly LatLng[],
  legs: readonly RoutedLeg[],
): Map<string, TravelEstimate> {
  const found = new Map<string, TravelEstimate>();
  for (const leg of legs) {
    const from = stops[leg.fromIndex];
    const to = stops[leg.toIndex];
    if (!from || !to) continue;
    for (const estimate of leg.estimates) {
      found.set(routeLegKey(from, to, estimate.mode), estimate);
    }
  }
  return found;
}

/** Mirror what came back. Idempotent and last-write-wins by nature — the server is the only
 *  author, so there is nothing to reconcile. */
export async function cacheTravelEstimates(
  stops: readonly LatLng[],
  legs: readonly RoutedLeg[],
): Promise<void> {
  const found = estimatesOf(stops, legs);
  if (!found.size) return;
  const now = getNow();
  await db.routeLegs.bulkPut(
    [...found].map(([key, estimate]) => ({ key, estimate, cachedAt: now })),
  );
}

/** What this device already holds for the given keys. Missing keys are simply absent. */
export async function readCachedTravelEstimates(
  keys: readonly string[],
): Promise<Map<string, TravelEstimate>> {
  const rows = await db.routeLegs.bulkGet([...keys]);
  const found = new Map<string, TravelEstimate>();
  for (const row of rows) {
    if (row) found.set(row.key, row.estimate);
  }
  return found;
}

/** **What one day surface reads.** One function, because there is nothing else to say: an
 *  estimate, or `null` — and `null` is ordinary. */
export interface DayTravel {
  estimateFor(from: LatLng, to: LatLng, mode: TravelMode): TravelEstimate | null;
}

const NOTHING_KNOWN: ReadonlyMap<string, TravelEstimate> = new Map();

function merge(
  prev: ReadonlyMap<string, TravelEstimate>,
  next: ReadonlyMap<string, TravelEstimate>,
): ReadonlyMap<string, TravelEstimate> {
  if (!next.size) return prev;
  const merged = new Map(prev);
  for (const [key, estimate] of next) merged.set(key, estimate);
  return merged;
}

const warmRetryMs = (seconds: number) => Math.min(Math.max(seconds, 0) * 1000, WARM_RETRY_MAX_MS);

/**
 * **The travel times for one day**, asked for once and read many times.
 *
 * `stops` is the day's ordered coordinates, in the order they are visited; `modes` defaults to
 * every mode, which is what makes ADR-0206 §Z2's mode switch a read from what the client already
 * holds rather than a fetch. Nothing is passed for offline or for whether this is the visible
 * day: both are read here, because both are facts about the app rather than about the day.
 *
 * **`TRAVEL_MODES` is read here as "every mode the endpoint can answer", and ADR-0206 §AA4 is
 * about to make those two different things.** The declared תחב״צ mark is a stored mode value with
 * **no provider** — no gate, no request, ever — so whoever adds it must keep it out of this
 * default rather than let a day ask for a route nobody can compute. `TRAVEL_GATE`'s
 * `Record<TravelMode, TravelGateRule>` is what forces the question: adding the value stops that
 * record compiling until somebody answers it.
 *
 * **A peek never fetches.** `DayPeek` mounts the two neighbouring days as REAL surfaces
 * (ADR-0200 §7) — that is the whole design, and it means a naive per-day fetch fires **three**
 * matrices per swipe for two days nobody is reading. A request is precisely what
 * `useIsDayPreview` exists to suppress ("anything that reaches OUT of the pane"), so a peek
 * renders whatever Dexie already holds and falls back to the crow-flies chip for the rest, until
 * the swipe commits and it becomes the visible day.
 *
 * **A warming answer is re-asked once and then let go.** ADR-0187's flow: the server answers
 * what it has plus how long to wait, so one wait covers the ordinary cold day. Beyond that the
 * day is already correct with fewer numbers in it (§D4), and a client that keeps polling a day
 * nobody is looking at is the failure this whole layer is shaped to avoid.
 */
export function useDayTravel(opts: {
  tripId: string;
  stops: readonly LatLng[];
  modes?: readonly TravelMode[];
}): DayTravel {
  const { tripId, stops, modes = TRAVEL_MODES } = opts;
  const preview = useIsDayPreview();
  const offline = useIsOffline();
  const [known, setKnown] = useState<ReadonlyMap<string, TravelEstimate>>(NOTHING_KNOWN);

  // **Keyed on CONTENT, never on the array's identity.** A day surface derives `stops` from its
  // entries, so it hands us a fresh array on every render — and this screen re-renders on the
  // clock. An object dep would re-read Dexie and re-ask the server on a render that changed
  // nothing at all (`frontend/CLAUDE.md`'s memo/content-key rule). The fingerprint is derived
  // from every input the effects below use, so it is the one thing they depend on; the values
  // themselves are read through a ref, which is `useCandidateEnrichment`'s shape for the same
  // problem.
  const legKeys = dayLegKeys(stops, modes);
  const fingerprint = legKeys.join(LEG_KEY_SEPARATOR);
  const day = useRef({ stops, modes, legKeys });
  day.current = { stops, modes, legKeys };

  // **What the device already knows — first, and regardless of everything else.** This is the
  // whole of "an estimate survives a reload offline", and it runs inside a peek too: reading
  // Dexie reaches out of nothing, so a day you have already visited peeks with its real numbers.
  useEffect(() => {
    if (!fingerprint) return;
    let live = true;
    void readCachedTravelEstimates(day.current.legKeys)
      .then((cached) => {
        if (live) setKnown((prev) => merge(prev, cached));
      })
      .catch(() => {
        // A cache read that fails leaves every consumer on the crow-flies chip, which is a
        // complete state rather than a degraded one.
      });
    return () => {
      live = false;
    };
  }, [fingerprint]);

  useEffect(() => {
    if (preview || offline || !fingerprint || askedDays.has(fingerprint)) return;

    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    const ask = (isRetry: boolean): void => {
      const { stops: at, modes: want } = day.current;
      void fetchRoutes(tripId, { stops: [...at], modes: [...want] }, controller.signal)
        .then((batch) => {
          const found = estimatesOf(at, batch.legs);
          setKnown((prev) => merge(prev, found));
          void cacheTravelEstimates(at, batch.legs).catch(() => {
            // Storing is an optimisation for the next visit; failing it costs this visit
            // nothing, since the answer is already in state.
          });
          if (batch.retryAfterSeconds === undefined) {
            askedDays.add(fingerprint);
            return;
          }
          if (isRetry) return;
          retry = setTimeout(() => ask(true), warmRetryMs(batch.retryAfterSeconds));
        })
        .catch(() => {
          // **Nothing to report.** Offline, a refused request, a failed one, an aborted one —
          // all of them leave the day exactly as it looks before any answer arrives, and that
          // is a complete state (ADR-0206 §D4). Not recorded either, so opening the day again
          // asks again.
        });
    };
    ask(false);

    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [tripId, fingerprint, preview, offline]);

  // Memoized on what it reads, so a consumer may hand it to a `memo`ized child without undoing
  // that child's memo on every render.
  return useMemo(
    () => ({
      estimateFor: (from: LatLng, to: LatLng, mode: TravelMode) =>
        known.get(routeLegKey(from, to, mode)) ?? null,
    }),
    [known],
  );
}
