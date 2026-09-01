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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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

/** **The first back-off after a FAILED request** (ADR-0206 §AZ4), doubling from here under the
 *  same attempt bound the warm uses. A failure carries no `Retry-After` to pace it, and the two
 *  costs to balance are a day that stays blank and a phone that retries a dead endpoint in a
 *  tight loop: ⁦2s⁩ → ⁦4s⁩ → ⁦8s⁩ → ⁦16s⁩ → ⁦32s⁩ covers a cold container and a lift's worth of no
 *  signal inside the six rounds, and stops well short of a poll. */
const FAILED_RETRY_BASE_MS = 2_000;

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

/** **And what the server has said it will never answer** (ADR-0206 §AU1's own rule, applied to the
 *  half that was not retained). A refusal is an ANSWER — "never coming" — so it belongs in module
 *  state for exactly `sessionKnown`'s reason: `askedDays` remembers that the day was asked, and a
 *  day whose refusals lived only in the mount re-entered `מחשב…` on every later ask for a leg the
 *  gate had already closed. The set the spinner is narrowed by has to outlive the mount that
 *  learned it, or the narrowing is only ever true once. */
const sessionRefused = new Set<string>();

/**
 * **WHAT THE SESSION KNOWS IS A STORE, AND EVERY MOUNTED DAY READS IT** (ADR-0206 §BA1).
 *
 * `sessionKnown` and `sessionRefused` outlive every day surface, and until this existed each mount
 * took a COPY of them at mount time and merged into it afterwards. A copy taken once is a copy
 * that goes stale the moment the same mount is asked about a different day — which is every swipe,
 * because the day surface is one component instance with a date from context, not a keyed remount.
 *
 * So the version is what a day subscribes to, and what it holds is derived from the store on every
 * bump rather than accumulated beside it. Nothing can now be in the store and absent from a screen.
 */
let learnedVersion = 0;
const learners = new Set<() => void>();

/** Announce that the store gained something — an answer, a refusal, or the end of a read. */
function learned(): void {
  learnedVersion += 1;
  for (const listener of [...learners]) listener();
}

function subscribeToAnswers(listener: () => void): () => void {
  learners.add(listener);
  return () => {
    learners.delete(listener);
  };
}

const answersVersion = (): number => learnedVersion;

/** Test seam. The state above is module state by design (it outlives every day surface), so a spec
 *  that mounts the same day twice needs to be able to clear it. */
export function resetAskedDaysForTests(): void {
  askedDays.clear();
  readDays.clear();
  sessionKnown.clear();
  sessionRefused.clear();
  learned();
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
    // **A PACK REACHES THE DAY THAT IS ALREADY OPEN** (ADR-0206 §AZ5, finished in §BA1). Putting
    // the legs in Dexie is not enough on its own: `readDays` stops a mount re-reading the table,
    // and clearing that set retires the mark for the NEXT mount without telling the current one.
    // Retaining into the session store does both — every mounted day re-derives from it — and
    // clearing `readDays` beside it keeps the next mount honest about what the table now holds.
    retain(new Map(missing.map((entry) => [entry.key, entry.estimate])));
    forgetLocalReads();
  }
  return missing.length;
}

/**
 * **Retire what this session has read from Dexie**, so the next mount reads it again.
 *
 * The one caller is `fillCachedRouteLegs` above, and the rule is stated as a function rather than
 * a line inside it so the next writer that puts legs in the table from outside this hook cannot
 * miss it: `readDays` is an optimisation over a read, and any write to what it read invalidates
 * it. `sessionKnown` is deliberately NOT cleared — it holds answers, and an answer does not stop
 * being true because a new one arrived beside it.
 */
export function forgetLocalReads(): void {
  readDays.clear();
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

/** The resting refusal set. Shared rather than a fresh literal so a day with nothing refused keeps
 *  one identity and the memo below does not rebuild its reads on every render. */
const NOTHING_REFUSED: ReadonlySet<string> = new Set();

/**
 * **KEEP WHAT ARRIVED, AT THE MOMENT IT ARRIVES** — before anything can decide not to render it.
 *
 * **This used to live inside `merge`, and that is the whole of the defect it was reported as**
 * (owner, 2026-09-01: a peer's change and _"the calculated fields disappear · the transit rows,
 * time calculations, total duration"_). Retention ran inside the `setKnown` UPDATER, and React
 * never runs an updater for a component that has gone — while `askedDays.add` / `readDays.add`,
 * one and four lines below their own merges, ran regardless. So an answer landing in the window
 * between a day unmounting and its state settling recorded the day as **answered in full** and
 * kept nothing: the next mount read `sessionKnown` and found nothing, the local read was skipped
 * because the fingerprint was in `readDays`, and the ask was skipped because it was in
 * `askedDays`. Dexie held every row the whole time. Only a reload cleared the two sets, which is
 * the previous field report's _"stays that way until I restart the app"_ reached by a second door.
 *
 * The invariant the split buys, and the one to keep: **whatever marks a fingerprint handled must
 * run in the same breath as the retention that makes the mark true.** Retaining first, outside
 * any React work, is what makes every `add` below honest — a mount is not a condition for having
 * learned something.
 */
function retain(next: ReadonlyMap<string, TravelEstimate>): void {
  if (!next.size) return;
  for (const [key, estimate] of next) sessionKnown.set(key, estimate);
  learned();
}

/**
 * **The map's own merge, and it keeps a map of its own for a reason** (ADR-0206 §BA1).
 *
 * `useDayTravel` derives from the session store now; `useDayShapes` may not, and the asymmetry is
 * the geometry. A shape rides on a `TravelEstimate`, and the day list's all-modes matrix answers
 * WITHOUT one — so retaining its answers into a store the map read from would blank the map's
 * lines the moment a day surface asked (`cacheTravelEstimates` records the same trade for Dexie).
 * The map therefore keeps what it fetched, and this is the only merge left.
 */
function merge(
  prev: ReadonlyMap<string, TravelEstimate>,
  next: ReadonlyMap<string, TravelEstimate>,
): ReadonlyMap<string, TravelEstimate> {
  if (!next.size) return prev;
  const merged = new Map(prev);
  for (const [key, estimate] of next) merged.set(key, estimate);
  return merged;
}

/** **And the refusals**, for the reason `sessionRefused` gives. */
function retainRefusals(next: ReadonlySet<string>): void {
  if (!next.size) return;
  for (const key of next) sessionRefused.add(key);
  learned();
}

/**
 * **Has every hole in this day been answered at all?** (ADR-0206 §AZ4.)
 *
 * The question `askedDays` needs, and the one it was not asking: a batch that answers three legs
 * of five and offers no `Retry-After` used to record the whole day, so the two the provider had
 * quietly dropped could not be asked about again for the rest of the session. `found.size ||
 * refused.size` is "something arrived", which is a different claim from "nothing is missing".
 *
 * **Per (leg, MODE), and §AZ4's per-leg version was the defect** (ADR-0206 §BA2). That rule asked
 * whether any mode had answered for a pair — and on a driving trip the gate refuses WALKING on
 * every leg past ⁦15 km⁩, so a refusal nobody was waiting for marked the leg answered while the
 * only mode the day draws was still pending. One response, every long leg "answered", the day into
 * `askedDays`, and no driving duration for the rest of the session: the report this rule was
 * written to prevent, reproduced by the rule itself.
 *
 * The strict version costs a re-ask on a day the provider never fully answers, which is one
 * request the server serves from its own cache — and the alternative is the silence this whole
 * layer keeps being reported for. Once a warm completes every mode is estimated or refused, so a
 * finished day settles and stops asking.
 *
 * Read off the session store rather than any mount's state: that is where the answer lives, and
 * `retain` has already run by the time this is called.
 */
function answeredInFull(stops: readonly LatLng[], modes: readonly TravelMode[]): boolean {
  return dayLegKeys(stops, modes).every((key) => sessionKnown.has(key) || sessionRefused.has(key));
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

/** The refusals this session already holds for the keys a day asks about — `knownHere`'s peer, and
 *  narrowed to the day's own legs for the same reason: the resting identity is shared, so a day
 *  with nothing refused keeps one object and the reads memo does not rebuild every render. */
function refusedHere(legKeys: readonly string[]): ReadonlySet<string> {
  const found = new Set<string>();
  for (const key of legKeys) {
    if (sessionRefused.has(key)) found.add(key);
  }
  return found.size ? found : NOTHING_REFUSED;
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

  /**
   * **DERIVED FROM THE SESSION STORE, NEVER COPIED OUT OF IT** (ADR-0206 §BA1).
   *
   * This was `useState(() => knownHere(legKeys))` — a copy taken once, at mount, and merged into
   * afterwards. Its own docblock said a fingerprint change was "covered by the effect below, which
   * merges into whatever is there", and that effect **early-returns on `readDays`**. So the moment
   * a day switched to a fingerprint this session had already READ — which every swipe guarantees,
   * because `DayPeek` mounts the neighbours and they read Dexie — nothing ever put that day's
   * answers into this mount's map. The day surface is one component instance with its date from
   * context, not a keyed remount, so the copy carried yesterday's legs into today and every
   * journey row, the day's total and its feasibility verdict read the same absence.
   *
   * Deriving is what makes that unrepresentable: there is one store, every mounted day reads it,
   * and a bump re-derives whatever this day's keys now resolve to.
   */
  const version = useSyncExternalStore(subscribeToAnswers, answersVersion, answersVersion);
  // `fingerprint` IS the content of `legKeys`, and `version` is what the store has learned since —
  // together they are every input `knownHere` reads, which is why the array itself is not a dep.
  const known = useMemo(() => knownHere(legKeys), [fingerprint, version]);
  /** **The modes the server has said it will never answer**, narrowed to this day (ADR-0205 §3) —
   *  derived beside `known` for its reason, and permanent by nature, so nothing resets it. */
  const refused = useMemo(() => refusedHere(legKeys), [fingerprint, version]);
  /** **Whether THIS day has a request out**, which is the one thing here that is genuinely about
   *  the mount rather than about the store: `warmingFor` says a number is on its way, and only the
   *  effect below knows whether one is (ADR-0206 §AU1). */
  const [asking, setAsking] = useState(false);
  /**
   * **THE HOLD IS A FIRST-PAINT HOLD, AND ONLY THAT** (ADR-0206 §AZ6).
   *
   * §AT holds the day's first paint on this device's own cache read, because the journey rows and
   * the total APPEAR when an estimate lands and a day that paints twice has told the reader
   * something twice. The hold was keyed on the FINGERPRINT, which is a different claim: a
   * fingerprint changes whenever the day's stops do, so a peer adding or moving a stop over the
   * wire flipped `settled` back to false and `.day-page[data-measuring]` hid **the whole day** —
   * not the journey rows, the day — for an IndexedDB round trip, on a surface somebody was
   * reading. A remote edit must never blank the screen it lands on.
   *
   * So the hold is spent once per mount. A day that has painted stays painted and lets the new
   * leg's row arrive the way every other change does; a day that has not is still held, which is
   * the whole of what §AT bought.
   */
  const held = useRef(false);
  const settledNow = !fingerprint || preview || readDays.has(fingerprint);
  if (settledNow) held.current = true;
  const settled = settledNow || held.current;

  // **What the device already knows — first, and regardless of everything else.** This is the
  // whole of "an estimate survives a reload offline", and it runs inside a peek too: reading
  // Dexie reaches out of nothing, so a day you have already visited peeks with its real numbers.
  useEffect(() => {
    if (!fingerprint || readDays.has(fingerprint)) return;
    // A read that fails settles the day exactly as an empty one does: every consumer falls back to
    // the crow-flies chip, which is a complete state rather than a degraded one — and a surface
    // holding its paint for a read that will never answer is the one outcome worse than a jump.
    //
    // **Announced through the store rather than a local counter, and with no `live` guard left to
    // get wrong.** An empty read retains nothing, so a mount-local bump was the only thing that
    // could lift the hold; a bump on the store lifts it for every day waiting on this same read,
    // which during a swipe is three of them — and none of them has to still be mounted for the
    // answer to be kept, which is the invariant `retain`'s docblock is about.
    const done = () => {
      clearTimeout(deadline);
      readDays.add(fingerprint);
      learned();
    };
    // …and a read that never settles at all is the one failure the hold could cause rather than
    // cure: a Dexie upgrade blocked by another tab would leave the day laid out and never painted.
    // Past the deadline it paints with what it has, which is what it did before the hold existed.
    const deadline = setTimeout(done, DAY_TRAVEL_SETTLE_MAX_MS);
    void readCachedTravelEstimates(day.current.legKeys)
      .then((cached) => {
        // **Kept whether or not this effect run was superseded.** An estimate is keyed per leg,
        // so what this read found is as valid for a new stop set as for the old one, and every
        // leg the two share is a number already in hand. Dropping it on a superseded run is what
        // made two peer changes in quick succession blank the legs BETWEEN them: `done()` had
        // recorded the fingerprint in `readDays`, so it was never read again.
        retain(cached);
        done();
      })
      .catch(done);
    return () => clearTimeout(deadline);
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
    // Not asking. The refusals are the store's and need no resetting here — which is what
    // `refused` being derived bought: the branch a day in `askedDays` takes on every later visit
    // used to re-seed them by hand, and getting that wrong lost them for good.
    if (preview || offline || !fingerprint || askedDays.has(fingerprint)) {
      setAsking(false);
      return;
    }

    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    // **The wait opens with the request, not with the first answer.** The second a stop is added
    // the day holds nothing and has been told nothing, and that is the second the reader is
    // looking at it — see `DayTravel.warmingFor`.
    setAsking(true);
    // Whatever happens, the day stops claiming to be computing: answered, out of attempts, or
    // failed. `asking` outliving its request is the one way this signal could lie.
    const done = () => {
      if (live) setAsking(false);
    };

    const ask = (attempt: number): void => {
      const { stops: at, modes: want } = day.current;
      void fetchRoutes(tripId, { stops: [...at], modes: [...want] }, controller.signal)
        .then((batch) => {
          const found = estimatesOf(at, batch.legs);
          // First, and outside every React path: see `retain`. `askedDays.add` below is only
          // honest because this line has already run by the time it does. Both of these reach
          // every mounted day through the store — no mount has a copy to be updated separately.
          retain(found);
          // A refused mode is never coming, so it must stop reading as "computing" the moment the
          // server says so — otherwise the ⁦127 km⁩ walk would spin for six rounds and then blank.
          const turnedDown = refusedOf(at, batch.legs);
          retainRefusals(turnedDown);
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
          //
          // **And only if it taught us EVERYTHING** (ADR-0206 §AZ4). `found.size || refused.size`
          // is "something arrived", which is not the same claim: a batch that answers three legs
          // of five and offers no `Retry-After` marked the whole day answered in full, so the two
          // legs the provider had quietly dropped could not be asked about again for the rest of
          // the session. That is the 2026-08-28 defect reached one door along — and the honest
          // test is the one this set's name already makes, which is whether every key the day
          // asks about is now either known or refused.
          if (batch.retryAfterSeconds === undefined) {
            if (answeredInFull(at, want)) askedDays.add(fingerprint);
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
          // **A FAILURE IS RETRIED, NOT ACCEPTED** (ADR-0206 §AZ4). Every path here used to end
          // the ask: a 500, a dropped connection, a captive portal, a cold Railway container —
          // and the day then held nothing for the rest of the session, because the effect only
          // re-runs when the fingerprint, the trip or the online flag changes. On a phone moving
          // between cells that is the ordinary case rather than an edge, and it is the shape of
          // the report this whole layer keeps getting: _"it stays that way until I restart"_.
          //
          // The ladder is the warm's own, deliberately: same bound (`DAY_TRAVEL_WARM_ATTEMPTS`),
          // so a dead provider still terminates into §D4's silence rather than polling forever,
          // and the same cap (`WARM_RETRY_MAX_MS`), so nothing parks a timer for an hour. What
          // differs is that a failure carries no `Retry-After` to pace it, so it backs off on its
          // own — doubling from `FAILED_RETRY_BASE_MS`, which spends four requests over ~⁦30s⁩
          // rather than six over the length of one warm.
          //
          // Never recorded in `askedDays`, on any attempt: nothing was learned.
          if (!live || controller.signal.aborted) return;
          if (attempt >= DAY_TRAVEL_WARM_ATTEMPTS) {
            done();
            return;
          }
          retry = setTimeout(
            () => ask(attempt + 1),
            Math.min(FAILED_RETRY_BASE_MS * 2 ** (attempt - 1), WARM_RETRY_MAX_MS),
          );
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
        if (!asking) return false;
        const key = routeLegKey(from, to, mode);
        return !known.has(key) && !refused.has(key);
      },
      settled,
    }),
    [asking, known, refused, settled],
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
          // `merge` is pure now, so the shared session store is fed here — the map's answers have
          // always seeded the day list's first paint and must keep doing so.
          retain(found);
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
        retain(cached);
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
