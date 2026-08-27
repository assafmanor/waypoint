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
 *  author, so there is nothing to reconcile.
 *
 *  **Last-write-wins costs a shape, deliberately.** A matrix answer carries no geometry (ADR-0205
 *  §4), so `useDayTravel`'s all-modes ask overwrites rows `useDayShapes` had fetched a `shape`
 *  into. The answer is for the map to ask again, not for this to read-modify-write: reading first
 *  lands the write an IndexedDB transaction later than a caller can observe it, which trades a
 *  race on the DAY's hot path for one saved request on the map's. `useDayShapes` closes it from
 *  its own side — it asks whenever any leg is missing a LINE, so a wiped shape simply comes
 *  back. */
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

/**
 * **Fill the gaps from an offline route pack** (ADR-0206 §V1.8) — the same table, the same
 * `routeLegKey`, written the one way a pack may write it.
 *
 * **It never overwrites a row this device already holds**, and that is the difference from
 * `cacheTravelEstimates` above rather than an omission. A pack carries no geometry (§AO, measured
 * at ten times the bytes), so a plain `bulkPut` would wipe every `shape` `useDayShapes` had
 * fetched — and the note above says the map simply asks again, which is exactly what a device on
 * a plane cannot do. A pack is a **floor** under what is known, never an update to it.
 */
export async function fillCachedRouteLegs(
  entries: readonly { key: string; estimate: TravelEstimate }[],
): Promise<number> {
  if (!entries.length) return 0;
  const held = await db.routeLegs.bulkGet(entries.map((entry) => entry.key));
  const now = getNow();
  const missing = entries.filter((_, index) => !held[index]);
  if (missing.length) {
    await db.routeLegs.bulkPut(
      missing.map((entry) => ({ key: entry.key, estimate: entry.estimate, cachedAt: now })),
    );
  }
  return missing.length;
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

/** **Every leg of the day, as a drawable line.** `null` for a leg with no geometry yet — refused,
 *  warming, offline — and the caller falls back to the straight segment between the two stops,
 *  which is what the map drew for every leg before this existed. */
export interface DayShapes {
  /** **The mode is the LEG's, not the day's** (ADR-0206 §AM8). A walking line and a driving line
   *  between the same two stops are different roads — one-way streets, motorway ramps, footpaths —
   *  so asking without the mode is what drew a walk's geometry under a declared drive. */
  pathFor(from: LatLng, to: LatLng, mode: TravelMode): readonly LatLng[] | null;
}

const NO_SHAPES: DayShapes = { pathFor: () => null };

/**
 * **The drawable geometry of a whole day**, in one mode, asked for once.
 *
 * **Why the whole day and not one leg** (ADR-0206 §Z5 §M3, the owner's review): _"every leg draws
 * its REAL path; §D8 rations the SOLID AMBER, not the truth of the line."_ A straight segment
 * between two stops is a weaker drawing and a wrong distance, so the dashed order-line is drawn
 * along the route it describes; §D8 still allows exactly one leg to be solid amber.
 *
 * **This is ONE request, and that is what keeps it inside §D8's tripwire.** The card's warning —
 * _"a day of N legs issuing N shape calls means it was done wrong"_ — is about calls from this
 * device. `routableLegs` pairs stops **consecutively** (`i → i+1`), so an N-stop day is N-1 legs
 * in one batch; the per-leg `/route` calls are the SERVER's, paced at `SHAPE_CALLS_PER_PASS` and
 * cached for good. A leg the server did not reach this pass comes back in `pendingModes` with a
 * `retryAfterSeconds`, so nothing is dropped — it simply arrives on the next ask.
 *
 * **The modes the day's legs actually use, which is usually one** (corrected 2026-08-27, ADR-0206
 * §AM8). This said _"one mode, because one day is drawn in one mode"_ and M8b falsified it without
 * revisiting it: the mode is per LEG now, so a day can hold a walk and a declared drive at once,
 * and one mode for the whole day drew the wrong road under the overridden leg — reported from a
 * one-way street the drive entered from the wrong end.
 *
 * Still **one request**, which is what keeps §D8's tripwire satisfied: the union of the day's modes
 * is one mode on a trip nobody has overridden (byte-identical to before) and two on a day with an
 * override. `useDayTravel` next door still fetches every mode's DURATION so §Z2's switch is
 * instant; geometry is bought only for the modes actually drawn, never for all three.
 *
 * Deliberately **separate from `useDayTravel`** rather than a widening of it: the day LIST reads
 * that hook and needs no geometry at all, and putting shapes behind it would buy lines for a
 * surface that never draws one. Same table, same `routeLegKey`, so the two cannot disagree.
 */
export function useDayShapes(opts: {
  tripId: string;
  stops: readonly LatLng[];
  /** Every routable mode the day's legs are drawn in. The caller derives it from its own per-leg
   *  modes, deduped — so the common day asks for exactly what it asked for before this was a set. */
  modes: readonly TravelMode[];
}): DayShapes {
  const { tripId, stops, modes } = opts;
  const preview = useIsDayPreview();
  const offline = useIsOffline();
  const [known, setKnown] = useState<ReadonlyMap<string, TravelEstimate>>(NOTHING_KNOWN);

  // Content-keyed for `useDayTravel`'s own reason: the map rebuilds its pins every render and
  // re-renders on the clock, so an array dep would re-ask on a render that changed nothing.
  const legKeys = dayLegKeys(stops, modes);
  const fingerprint = legKeys.join(LEG_KEY_SEPARATOR);
  // `modes` rides the ref beside the stops for the same reason they do, and the same way
  // `useDayTravel` above does it: the ask happens after an async cache read, so it must read the
  // day it is asking about rather than the one the effect closed over.
  const day = useRef({ stops, modes, legKeys });
  day.current = { stops, modes, legKeys };

  useEffect(() => {
    if (!fingerprint) return;
    let live = true;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;

    const ask = (isRetry: boolean): void => {
      const { stops: at, modes: want } = day.current;
      void fetchRoutes(
        tripId,
        { stops: [...at], modes: [...want], withShapes: true },
        controller.signal,
      )
        .then((batch) => {
          const found = estimatesOf(at, batch.legs);
          if (live) setKnown((prev) => merge(prev, found));
          void cacheTravelEstimates(at, batch.legs).catch(() => {
            // Storing is next visit's optimisation; the lines are already drawn.
          });
          // Shapes arrive in passes, so a warming answer here is the ORDINARY case for a long
          // day rather than a cold-start edge — one wait, then let the next natural read finish
          // it, exactly as the day's own numbers do.
          if (batch.retryAfterSeconds === undefined || isRetry) return;
          retry = setTimeout(() => ask(true), warmRetryMs(batch.retryAfterSeconds));
        })
        .catch(() => {
          // Nothing to report (§D4): every leg falls back to its straight segment.
        });
    };

    void readCachedTravelEstimates(day.current.legKeys)
      .then((cached) => {
        if (!live) return;
        setKnown((prev) => merge(prev, cached));
        // Ask only when some leg is still missing a LINE — a day already drawn in full costs
        // nothing on a revisit, which is what makes swiping back and forth free.
        //
        // **No "already asked" set here, unlike `useDayTravel`, and the trade is deliberate.** A
        // day holding one gate-refused leg is never "complete", so it re-asks once per visit —
        // one batch the server answers from its own cache for every other leg. Recording the day
        // instead would be the cheaper half and the wrong one: `useDayTravel`'s shapeless matrix
        // overwrites these rows (see `cacheTravelEstimates`), and a day remembered as asked would
        // lose its lines for the rest of the session with no way to get them back.
        const complete = day.current.legKeys.every((key) => cached.get(key)?.shape);
        if (!complete && !preview && !offline) ask(false);
      })
      .catch(() => {
        if (live && !preview && !offline) ask(false);
      });

    return () => {
      live = false;
      controller.abort();
      clearTimeout(retry);
    };
    // `fingerprint` already carries every mode (it is built from `legKeys`), so `modes` is not a
    // dep of its own — an array literal at the call site would re-ask on every render.
  }, [tripId, fingerprint, preview, offline]);

  return useMemo(() => {
    if (!known.size) return NO_SHAPES;
    return {
      pathFor: (from: LatLng, to: LatLng, mode: TravelMode) => {
        const shape = known.get(routeLegKey(from, to, mode))?.shape;
        if (!shape) return null;
        const points = decodeShape(shape);
        // A one-point line is not a line, and a truncated polyline decodes to nothing (ADR-0205
        // §1) — both fall back to the straight segment rather than drawing a path to nowhere.
        return points.length >= 2 ? points : null;
      },
    };
  }, [known]);
}
