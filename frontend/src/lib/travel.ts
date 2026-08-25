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
  decodeShape,
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

/** **Legs there is no geometry to be had for** — `useLegShape`'s half of the set above, and
 *  deliberately a second one rather than a shared one: a one-leg day's fingerprint IS a
 *  `routeLegKey`, so a shape ask recorded in `askedDays` would silently convince that day its
 *  matrix had already been answered.
 *
 *  **Only a leg that answered with NOTHING is recorded** — refused by the gate, over the ceiling,
 *  provider down. A leg that answered without a `shape` is deliberately left askable: that is what
 *  a day's shapeless matrix leaves behind when it overwrites a row this hook had filled (see
 *  `cacheTravelEstimates`), and recording it would delete the line for the rest of the session.
 *  Asking again heals it, at one request per day-visit cycle. */
const askedLegShapes = new Set<string>();

/** Test seam. Both sets above are module state by design (they outlive every surface), so a spec
 *  that mounts the same day or the same leg twice needs to be able to clear them. */
export function resetAskedDaysForTests(): void {
  askedDays.clear();
  askedLegShapes.clear();
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
 *  author, so there is nothing to reconcile.
 *
 *  **Last-write-wins costs a shape, deliberately.** A matrix answer carries no geometry (ADR-0205
 *  §4), so a day's ask overwrites a row `useLegShape` had fetched a `shape` into. The answer to
 *  that is for the map to ask again, not for this to read-modify-write: reading first lands the
 *  write an IndexedDB transaction later than a caller can observe it, which trades a race on the
 *  DAY's hot path for one saved request on the map's. `useLegShape` closes it from its own side
 *  by never recording a shapeless answer as final. */
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

/** **One leg, as a pair of points.** Not `RoutedLeg`'s index pair: the map names the two ends it
 *  wants a line between, and indices into an array it does not hold would be a second thing to
 *  keep in step. */
export interface TravelLeg {
  from: LatLng;
  to: LatLng;
}

/**
 * **The drawable geometry of ONE leg** — ADR-0206 §D8's "at most one route line drawn at a time",
 * as a fetch rather than as a rule someone remembers.
 *
 * `useDayTravel` above deliberately never asks for geometry: a matrix answers a whole day's
 * durations in one call and returns **no shape at all** (ADR-0205 §4), so a drawable line is a
 * second call **per leg**. Widening the day's own request would therefore put N calls behind
 * every day view for a surface that draws one line — which is the thing §D8 exists to prevent.
 * So the ask lives here, one leg at a time, and the map hands it the selected-or-next leg.
 *
 * **The tripwire, stated so a later change trips it rather than shipping:** a day of N legs
 * issuing N shape calls means this was called per leg. One line drawn is one shape asked for.
 *
 * **One mode, because one line is drawn.** ADR-0206 §Z2 fetches every mode's DURATION up front
 * so the mode control answers from cache — but a shape costs an upstream route call per mode, and
 * M8's control does not exist yet. When it does, the widening is this array: `modes: [mode]`
 * becomes the modes the gate admits, and the switch stays request-free (§Z5 §M5).
 *
 * **`mode` is REQUIRED, and that is the fix for a shipped defect rather than strictness for its
 * own sake.** It was optional with a `walking` default, so the map drew every line as a
 * `pedestrian` route — through alleys and parks, on legs the trip drives. A footpath drawn over a
 * drive is not a rounding error, it is a wrong route, and a default is what made it invisible.
 * Callers derive the mode (`derivedTravelMode`, ADR-0206 §Z2); the compiler now says so.
 *
 * It reads back through **the same `routeLegKey` and the same Dexie table** `useDayTravel` uses,
 * so the line and the day's numbers can never disagree about a leg — and a leg whose shape is
 * already stored draws with no request at all.
 *
 * `null` is ordinary, exactly as it is above: no leg, offline, inside a peek, refused by the
 * gate, still warming, a shape that decoded to nothing. The dashed connector stands and nobody
 * sees an error (§D4).
 */
export function useLegShape(opts: {
  tripId: string;
  leg: TravelLeg | null;
  mode: TravelMode;
}): readonly LatLng[] | null {
  const { tripId, leg, mode } = opts;
  const preview = useIsDayPreview();
  const offline = useIsOffline();
  const [drawn, setDrawn] = useState<{ key: string; points: readonly LatLng[] } | null>(null);

  // Keyed on CONTENT for the reason the day's fingerprint is: the map derives its pins every
  // render and re-renders on the clock, so an object dep would re-ask on a render that changed
  // nothing. The values themselves are read through a ref.
  const key = leg ? routeLegKey(leg.from, leg.to, mode) : '';
  const at = useRef({ leg, mode });
  at.current = { leg, mode };

  useEffect(() => {
    if (!key) return;
    const { leg: want, mode: wanted } = at.current;
    if (!want) return;
    const stops = [want.from, want.to];
    const controller = new AbortController();
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    /** True when the estimate carried geometry worth drawing. A one-point line is not a line. */
    const take = (estimate?: TravelEstimate): boolean => {
      const points = estimate?.shape ? decodeShape(estimate.shape) : [];
      if (points.length < 2) return false;
      if (live) setDrawn({ key, points });
      return true;
    };

    const ask = (isRetry: boolean): void => {
      void fetchRoutes(tripId, { stops, modes: [wanted], withShapes: true }, controller.signal)
        .then((batch) => {
          const answer = estimatesOf(stops, batch.legs).get(key);
          take(answer);
          void cacheTravelEstimates(stops, batch.legs).catch(() => {
            // Storing is an optimisation for the next visit; the line is already drawn.
          });
          if (batch.retryAfterSeconds === undefined) {
            // Nothing answered means nothing ever will; an answer that merely carried no shape
            // stays askable (see `askedLegShapes`).
            if (!answer) askedLegShapes.add(key);
            return;
          }
          // Warming: one wait, then let it go — same rule as the day's, and for the same
          // reason. Not recorded, so selecting this leg again asks again.
          if (isRetry) return;
          retry = setTimeout(() => ask(true), warmRetryMs(batch.retryAfterSeconds));
        })
        .catch(() => {
          // Nothing to report (§D4). The dashed connector is a complete state.
        });
    };

    const askIfWorthIt = (): void => {
      if (preview || offline || askedLegShapes.has(key)) return;
      ask(false);
    };

    void readCachedTravelEstimates([key])
      .then((cached) => {
        if (!live) return;
        if (!take(cached.get(key))) askIfWorthIt();
      })
      .catch(() => {
        if (live) askIfWorthIt();
      });

    return () => {
      live = false;
      controller.abort();
      clearTimeout(retry);
    };
  }, [tripId, key, preview, offline]);

  // Answering only for the leg currently asked about: a shape that arrives after the selection
  // moved belongs to a leg nobody is looking at, and drawing it would put an amber line between
  // two points the map is no longer talking about.
  return drawn && drawn.key === key ? drawn.points : null;
}
