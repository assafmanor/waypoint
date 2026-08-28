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
import { DAY_TRAVEL_SETTLE_MAX_MS, DAY_TRAVEL_WARM_ATTEMPTS } from '../constants';
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

/** **Days whose LOCAL read has finished during this session**, which is a different question from
 *  the set above and the reason `settled` can be answered during the first render (ADR-0206 §AT).
 *
 *  `askedDays` is about the SERVER: has this day been answered in full. This is about the DEVICE:
 *  has Dexie told us what it holds for this day yet. A day is in here whether the read found
 *  everything, something or nothing — the point is only that the answer is in, so a remount does
 *  not have to hold for a read whose result it already has. */
const readDays = new Set<string>();

/** **What this session has read out of Dexie or been told by the server**, so a day mounting a
 *  second time starts with its numbers rather than waiting a frame for them (ADR-0206 §AT).
 *
 *  The peek is what makes this load-bearing rather than a saving: `DayPeek` mounts the two
 *  neighbouring days as real surfaces, so by the time a swipe commits, the day it lands on has
 *  already read its own legs — and the committed mount is then complete on its first paint. */
const sessionKnown = new Map<string, TravelEstimate>();

/** Test seam. The state above is module state by design (it outlives every day surface), so a spec
 *  that mounts the same day twice needs to be able to clear it. */
export function resetAskedDaysForTests(): void {
  askedDays.clear();
  readDays.clear();
  sessionKnown.clear();
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

/** The answered legs of a batch, keyed the way the table is. `pendingModes` is read by nobody
 *  here — the retry decision below is taken from the envelope's `retryAfterSeconds` rather than
 *  per leg — but `refusedModes` now is, by `refusedOf` beneath this: ADR-0206 §AU1 turns the
 *  split the server has always sent into a state the READER can see, and "never coming" is
 *  exactly the half that must not read as `מחשב…`. */
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

/** **Every (leg, mode) the gate refused**, keyed the same way. Never coming, whatever anyone waits
 *  for (ADR-0205 §3) — so this is the set that keeps `warmingFor` honest: a refused mode holds no
 *  estimate for the same reason a warming one does, and only the server can tell them apart. */
function refusedOf(stops: readonly LatLng[], legs: readonly RoutedLeg[]): Set<string> {
  const refused = new Set<string>();
  for (const leg of legs) {
    const from = stops[leg.fromIndex];
    const to = stops[leg.toIndex];
    if (!from || !to) continue;
    for (const mode of leg.refusedModes) refused.add(routeLegKey(from, to, mode));
  }
  return refused;
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
  /**
   * **Is this leg's number still being computed?** (ADR-0206 §AU1.)
   *
   * `true` while this day has an ask in flight or scheduled AND holds no estimate for the pair —
   * minus what the server has told us it REFUSED, which is the one absence that is never coming.
   *
   * **It is deliberately not "the server said `pendingModes`".** The gap the field report fell
   * into opens *before* the first answer lands: a day whose stops just changed holds nothing and
   * has been told nothing, and that is precisely the second the reader is looking at the screen
   * asking why their new stop has no route. So this reads the ASK rather than the answer, and
   * narrows it with `refusedModes` as answers arrive.
   *
   * **`false` the moment this day stops asking** — answered in full, out of attempts, offline, or
   * a peek that never asks at all — at which point every consumer is back on §D4's crow-flies
   * chip. A spinner that outlives the request it describes is worse than no spinner.
   */
  warmingFor(from: LatLng, to: LatLng, mode: TravelMode): boolean;
  /**
   * **Has this device said what it holds yet?** (ADR-0206 §AT.)
   *
   * `false` only while the local read for this day's legs is still in flight — never for a
   * network answer, which no surface may wait on. It exists because §D4 collapses two states
   * into one absence, and M6a/M11 made that collapse STRUCTURAL: a journey row and the day's
   * total appear when an estimate lands, so a day that paints before its own cache has answered
   * paints twice, the second time ⁦162px⁩ taller. The surfaces hold their first paint on this;
   * nothing else reads it, and no derivation branches on it.
   *
   * `true` immediately for a day with no legs to read, for a peek (which never fetches and must
   * not hold a pane mid-gesture), and for any day this session has already read.
   */
  settled: boolean;
}

const NOTHING_KNOWN: ReadonlyMap<string, TravelEstimate> = new Map();

/** The resting state of the warm signal: nothing asked, nothing refused. Shared rather than a
 *  fresh literal so a day that never asks (a peek, an offline device) keeps one identity and the
 *  memo below does not rebuild its reads on every render. */
const NOT_WARMING: { asking: boolean; refused: ReadonlySet<string> } = {
  asking: false,
  refused: new Set(),
};

function merge(
  prev: ReadonlyMap<string, TravelEstimate>,
  next: ReadonlyMap<string, TravelEstimate>,
): ReadonlyMap<string, TravelEstimate> {
  if (!next.size) return prev;
  for (const [key, estimate] of next) sessionKnown.set(key, estimate);
  const merged = new Map(prev);
  for (const [key, estimate] of next) merged.set(key, estimate);
  return merged;
}

/** What this session already holds for the keys a day asks about — the synchronous half of the
 *  cache read, so a day already seen renders complete on its first paint. */
function knownHere(legKeys: readonly string[]): ReadonlyMap<string, TravelEstimate> {
  const found = new Map<string, TravelEstimate>();
  for (const key of legKeys) {
    const estimate = sessionKnown.get(key);
    if (estimate) found.set(key, estimate);
  }
  return found.size ? found : NOTHING_KNOWN;
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
 * **A warming answer is re-asked until it lands, up to `DAY_TRAVEL_WARM_ATTEMPTS` rounds**
 * (ADR-0206 §AU1). ADR-0187's flow: the server answers what it has plus how long to wait, and each
 * round sleeps the interval that answer carried. This said "one wait covers the ordinary cold day"
 * and measurement says it does not — see the effect below for the arithmetic and the field report.
 * The bound is what keeps the old rule's point intact: past it the day is already correct with
 * fewer numbers in it (§D4), and a client that keeps polling a day nobody is looking at is the
 * failure this whole layer is shaped to avoid.
 */
export function useDayTravel(opts: {
  tripId: string;
  stops: readonly LatLng[];
  modes?: readonly TravelMode[];
}): DayTravel {
  const { tripId, stops, modes = TRAVEL_MODES } = opts;
  const preview = useIsDayPreview();
  const offline = useIsOffline();

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

  // **Seeded from what this session already read**, which is what makes a second mount of the same
  // day complete on its first paint rather than one Dexie read later (ADR-0206 §AT). The initial
  // value is read once by `useState`; a day whose fingerprint changes under the same hook is
  // covered by the effect below, which merges into whatever is there.
  const [known, setKnown] = useState<ReadonlyMap<string, TravelEstimate>>(() => knownHere(legKeys));
  /** **What this day is still waiting on** (ADR-0206 §AU1) — `asking` is true from the moment the
   *  request effect starts until it has nothing left to wait for, and `refused` narrows it with
   *  the modes the server has said it will never answer. A day whose fingerprint changes remounts
   *  the effect below, which resets both: a new stop starts a new wait, not a continued one. */
  const [warm, setWarm] = useState<{ asking: boolean; refused: ReadonlySet<string> }>(NOT_WARMING);
  // Bumped when a local read lands, and that is its whole job: an empty cache read merges nothing,
  // so `setKnown` would change no state at all and the hold below would never lift. The SET is
  // where the answer actually lives (it outlives this mount); this is only what re-renders.
  const [, markRead] = useState(0);
  const settled = !fingerprint || preview || readDays.has(fingerprint);

  // **What the device already knows — first, and regardless of everything else.** This is the
  // whole of "an estimate survives a reload offline", and it runs inside a peek too: reading
  // Dexie reaches out of nothing, so a day you have already visited peeks with its real numbers.
  useEffect(() => {
    if (!fingerprint || readDays.has(fingerprint)) return;
    let live = true;
    // A read that fails settles the day exactly as an empty one does: every consumer falls back to
    // the crow-flies chip, which is a complete state rather than a degraded one — and a surface
    // holding its paint for a read that will never answer is the one outcome worse than a jump.
    const done = () => {
      clearTimeout(deadline);
      readDays.add(fingerprint);
      if (live) markRead((n) => n + 1);
    };
    // …and a read that never settles at all is the one failure the hold could cause rather than
    // cure: a Dexie upgrade blocked by another tab would leave the day laid out and never painted.
    // Past the deadline it paints with what it has, which is what it did before the hold existed.
    const deadline = setTimeout(done, DAY_TRAVEL_SETTLE_MAX_MS);
    void readCachedTravelEstimates(day.current.legKeys)
      .then((cached) => {
        if (live) setKnown((prev) => merge(prev, cached));
        done();
      })
      .catch(done);
    return () => {
      live = false;
      clearTimeout(deadline);
    };
  }, [fingerprint]);

  // **THE ASK, AND IT KEEPS ASKING UNTIL THE DAY IS ANSWERED** (ADR-0206 §AU1).
  //
  // It used to ask once, retry once, and let go — written as "one wait covers the ordinary cold
  // day", which measurement says it does not: a cold day is three matrix calls paced ⁦1/s⁩ by the
  // server's `PolitenessLimiter`, and `retryAfterFor` floors `Retry-After` at ⁦2s⁩, so the single
  // retry regularly landed while the last call was still in flight. The day then sat silent with
  // no route and no way to get one, until something changed the fingerprint or the surface
  // remounted — which is exactly the shape of the report: _"I left the app and came back after
  // some time, and then I had a route."_
  //
  // Each pass now sleeps the interval the ANSWER carried, up to `DAY_TRAVEL_WARM_ATTEMPTS` rounds,
  // and every one of them is a DB read plus a warm the server dedupes (`RoutingService.once`) —
  // so the extra rounds cost requests, never provider work.
  useEffect(() => {
    if (preview || offline || !fingerprint || askedDays.has(fingerprint)) {
      setWarm(NOT_WARMING);
      return;
    }

    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    // **The wait opens with the request, not with the first answer.** The second a stop is added
    // the day holds nothing and has been told nothing, and that is the second the reader is
    // looking at it — see `DayTravel.warmingFor`.
    setWarm({ asking: true, refused: new Set() });
    // Whatever happens, the day stops claiming to be computing: answered, out of attempts, or
    // failed. `asking` outliving its request is the one way this signal could lie.
    const done = () => {
      if (live) setWarm((prev) => (prev.asking ? { ...prev, asking: false } : prev));
    };

    const ask = (attempt: number): void => {
      const { stops: at, modes: want } = day.current;
      void fetchRoutes(tripId, { stops: [...at], modes: [...want] }, controller.signal)
        .then((batch) => {
          const found = estimatesOf(at, batch.legs);
          setKnown((prev) => merge(prev, found));
          // A refused mode is never coming, so it must stop reading as "computing" the moment the
          // server says so — otherwise the ⁦127 km⁩ walk would spin for six rounds and then blank.
          const refused = refusedOf(at, batch.legs);
          if (live && refused.size) {
            setWarm((prev) => ({
              asking: prev.asking,
              refused: new Set([...prev.refused, ...refused]),
            }));
          }
          void cacheTravelEstimates(at, batch.legs).catch(() => {
            // Storing is an optimisation for the next visit; failing it costs this visit
            // nothing, since the answer is already in state.
          });
          // **RECORDED ONLY IF IT TAUGHT US SOMETHING** (owner, 2026-08-28: _"sometimes …
          // the driving/walking rows don't show up, and it stays that way until I restart the
          // app"_). `retryAfterSeconds === undefined` means "nothing more is coming"; it does
          // NOT mean "something arrived". A batch that answers with no legs used to be recorded
          // here all the same — and since `merge` stores nothing for an empty set, the day was
          // marked answered in full while holding no numbers, in `askedDays`, which is module
          // state. Every later visit then early-returned, and only a reload could clear it.
          // "Until I restart the app" is that set, exactly.
          //
          // The rule was already written for the neighbouring case and simply not applied to
          // this one: a still-warming day is deliberately not recorded, because "that is how it
          // gets its numbers at all". A day that learned nothing is in the same position.
          //
          // Refusals count as learning: they are an answer that is never coming again, which is
          // the whole reason `refusedOf` exists — so a day of nothing but refusals is settled and
          // must not re-ask on every visit.
          if (batch.retryAfterSeconds === undefined) {
            if (found.size || refused.size) askedDays.add(fingerprint);
            done();
            return;
          }
          // Out of rounds. The day is already CORRECT with fewer numbers in it (§D4) and a client
          // that polls a day nobody is looking at is what this whole layer is shaped to avoid.
          if (attempt >= DAY_TRAVEL_WARM_ATTEMPTS) {
            done();
            return;
          }
          retry = setTimeout(() => ask(attempt + 1), warmRetryMs(batch.retryAfterSeconds));
        })
        .catch(() => {
          // **Nothing to report.** Offline, a refused request, a failed one, an aborted one —
          // all of them leave the day exactly as it looks before any answer arrives, and that
          // is a complete state (ADR-0206 §D4). Not recorded either, so opening the day again
          // asks again.
          done();
        });
    };
    ask(1);

    return () => {
      live = false;
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
      warmingFor: (from: LatLng, to: LatLng, mode: TravelMode) => {
        if (!warm.asking) return false;
        const key = routeLegKey(from, to, mode);
        return !known.has(key) && !warm.refused.has(key);
      },
      settled,
    }),
    [known, settled, warm],
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
