// **`בדרך`, which used to write nothing** (ADR-0206 §Z5 §M4) — the one thing on the hero that
// knows what a sensor would, because a person said it.
//
// `t.actions.onWay` has been on the day row since ADR-0161 and `verbs.ts` answered it with a
// toast claiming `שותף לקבוצה` — a share that never happened. §V1.4's late mark is its first
// consumer with a reason to be state: the mark says the leave-by has passed, and the only honest
// way to withdraw it is for somebody to say they are moving (§M4 — a settle mark is not a sensor,
// and own-device position wants its own ADR before this surface reads it).
//
// **This is a DEVICE mark, and the copy says so.** It is not on the `Event`: the group-visible
// version is a stored field plus a Prisma migration plus a `CACHE_CHANNELS` mirror, which is a
// milestone rather than a line, and it is on the backlog. What this buys today is the whole of
// what the mark needs — the person who pressed it stops being nudged — and it buys it without
// claiming a share the app does not make.
//
// The store is the module and the truth is `localStorage`, in `useSyncFailures`' shape: a
// synchronous snapshot for `useSyncExternalStore`, so the board, the horizon and the day row all
// read one answer without a provider between them.
import { useSyncExternalStore } from 'react';
import { getNow } from './useClock';

/** Per device, per trip, per event. `wp_`-prefixed like every other key this app owns — and it
 *  is a **cache of an answer**, so nothing outside this file may rename it (ADR-0186's warning,
 *  restated in root `CLAUDE.md`: the storage keys _are_ the local state). */
const ON_WAY_STORAGE_KEY = 'wp_on_way';

/** **`בדרך` does not survive the night.** A mark is about the leg you are on, and a stale one
 *  would withdraw tomorrow's mark for an event that happens to be next. A day is generous
 *  enough that a mark set before a long journey still holds, and short enough that the stored
 *  map cannot grow without bound. */
const ON_WAY_TTL_MS = 24 * 60 * 60 * 1000;

type Marks = Record<string, number>;

const listeners = new Set<() => void>();

const markKey = (tripId: string, eventId: string) => `${tripId}:${eventId}`;

/** Reads and PRUNES in one pass, which is why the expiry needs no sweep of its own. */
function read(): Marks {
  try {
    const raw = localStorage.getItem(ON_WAY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const cutoff = getNow() - ON_WAY_TTL_MS;
    const kept: Marks = {};
    for (const [key, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && at > cutoff) kept[key] = at;
    }
    return kept;
  } catch {
    // A quota-blocked or unparseable store leaves every mark absent, which is the state the app
    // shipped with — the nudge stands and nothing throws.
    return {};
  }
}

/** **Loaded on first ask, not at import.** Storage is not readable in every environment this
 *  module is imported into, and a lazy snapshot is also what lets a spec seed a stored mark and
 *  see the pruning rule applied to it. */
let marks: Marks | null = null;

function all(): Marks {
  return (marks ??= read());
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** **They said they are moving.** Idempotent — re-pressing rewrites the same mark, which is what
 *  keeps a double tap from meaning anything different. */
export function markOnWay(tripId: string, eventId: string): void {
  marks = { ...all(), [markKey(tripId, eventId)]: getNow() };
  try {
    localStorage.setItem(ON_WAY_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // The in-memory mark still stands for this session; persistence is the next reload's
    // convenience and not the point of pressing it.
  }
  emit();
}

/** **Take it back** (ADR-0207 §7). `markOnWay` only ever set, and the verb toasted without an undo
 *  callback while `done`, `skip` and `restore` all pass one — so the app's one device-local mark was
 *  also the one state-writing verb with no way out of it, reported by the owner in as many words.
 *  ADR-0019 makes the toast's undo button *the* way undo surfaces, and this is what it calls. */
export function clearOnWay(tripId: string, eventId: string): void {
  const key = markKey(tripId, eventId);
  if (all()[key] === undefined) return;
  const next = { ...all() };
  delete next[key];
  marks = next;
  try {
    localStorage.setItem(ON_WAY_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // The in-memory clear stands for this session, which is what the press asked for.
  }
  emit();
}

/** Synchronous, so the derivation that decides what the tile says can ask it inline. */
export function isOnWay(tripId: string, eventId: string): boolean {
  return all()[markKey(tripId, eventId)] !== undefined;
}

/** Test seam — the store outlives a render tree by design, so a spec that marks anything has to
 *  be able to put both halves back. Drops the snapshot as well as the stored map, which means
 *  the next read goes to storage: seed it after calling this to exercise `read`. */
export function resetOnWayForTests(): void {
  marks = null;
  try {
    localStorage.removeItem(ON_WAY_STORAGE_KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reactive read of one event's mark. A boolean snapshot, so the comparison is by value and a
 *  fresh object can never loop the store (`outbox.ts`'s own rule for the same hook). */
export function useOnWay(tripId: string, eventId: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (eventId ? isOnWay(tripId, eventId) : false));
}
