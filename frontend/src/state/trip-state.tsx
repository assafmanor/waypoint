// Active-trip context + optimistic local state. Verbs mutate immediately and
// return an inverse via one-slot undo (your last action only — ADR-0019).
// No API / Change-log / outbox here — those are T-014/T-013; dispatch is shaped
// so the reducer can be swapped for REST calls without touching the screens.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  EVENT_STATUS,
  type Booking,
  type Change,
  type MaybeItem,
  type Trip,
  type TripEvent,
  type TripNote,
  type TripSnapshot,
  type User,
} from '@waypoint/shared';
import { fetchChanges, fetchSnapshot, type RippleSuggestion } from '../lib/api';
import { applyChangeToCache, cacheSnapshot, readCachedSnapshot } from '../lib/cache';
import { flushOutbox, isOffline } from '../lib/outbox';
import { openTripStream } from '../lib/ws';
import { getNow } from '../lib/useClock';
import { clampDate, shiftIso, todayInTz } from '../lib/time';
import { EVENTS, GLANCE, MAYBE_ITEMS, activeUserId } from '../fixtures';
import { t } from '../i18n/he';

export type { RippleSuggestion };

// Warm-resume refresh threshold: only re-sync on return if the app was hidden
// at least this long, so a quick app-switch doesn't churn the socket. Elapsed
// is measured off getNow() (both reads share the clock, so the delta holds).
const RESYNC_AFTER_HIDDEN_MS = 30_000;

interface Snapshot {
  events: TripEvent[];
  maybeItems: MaybeItem[];
}

interface State extends Snapshot {
  ripple: RippleSuggestion | null;
  undo: Snapshot | null; // state to restore for the last undoable action
}

export type Action =
  | { type: 'SET_STATUS'; id: string; status: TripEvent['status'] }
  | { type: 'DELAY'; id: string; minutes: number }
  | { type: 'SCHEDULE'; event: TripEvent; maybeId: string }
  | { type: 'RIPPLE_APPLY' }
  | { type: 'RIPPLE_DISMISS' }
  | { type: 'UNDO' }
  // T-047: create/edit/delete UI verbs.
  | { type: 'CREATE_EVENT'; event: TripEvent }
  | { type: 'UPDATE_EVENT'; id: string; patch: Partial<TripEvent> }
  | { type: 'DELETE_EVENT'; id: string }
  // Plan-mode builder reorder: swap two adjacent events' slots atomically so
  // undo captures one pre-swap snapshot (a two-UPDATE_EVENT sequence would
  // overwrite the undo snapshot on the second dispatch).
  // Plan-mode builder reorder: reassign soft events' time slots atomically so
  // undo captures one pre-reorder snapshot (a sequence of UPDATE_EVENTs would
  // overwrite the undo snapshot on each dispatch).
  | { type: 'REORDER'; patches: { id: string; patch: Partial<TripEvent> }[] }
  // Maybe-shelf add/remove (Plan-mode Tier 3 build-the-shelf).
  | { type: 'ADD_MAYBE'; item: MaybeItem }
  | { type: 'REMOVE_MAYBE'; id: string }
  // Park an event onto the shelf: it leaves the day and becomes a maybe idea,
  // atomically (one undo snapshot).
  | { type: 'PARK_EVENT'; eventId: string; item: MaybeItem }
  // T-014: the REST write layer (verbs.ts) reconciles/broadcasts through these.
  | { type: 'RECONCILE_EVENT'; event: TripEvent }
  | { type: 'SET_RIPPLE'; ripple: RippleSuggestion | null }
  | { type: 'REMOTE_EVENT_CHANGE'; change: Change }
  | { type: 'RESYNC'; events: TripEvent[]; maybeItems: MaybeItem[] };

// Compare/sort by instant, never by string: a delayed event's startsAt is a
// Z-normalised ISO while fixtures carry an explicit offset — lexical compare
// across the two formats is wrong.
const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);
const byStart = (a: TripEvent, b: TripEvent) =>
  ms(a.startsAt) - ms(b.startsAt) || a.sortOrder - b.sortOrder;

function snapshotOf(s: State): Snapshot {
  return { events: s.events, maybeItems: s.maybeItems };
}

export function initialState(seed: Snapshot = { events: EVENTS, maybeItems: MAYBE_ITEMS }): State {
  return { events: seed.events, maybeItems: seed.maybeItems, ripple: null, undo: null };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STATUS': {
      const events = state.events.map((e) =>
        e.id === action.id ? { ...e, status: action.status } : e,
      );
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'DELAY': {
      // Ripple is server-authoritative now (T-014) — verbs.ts's move() response
      // sets it via SET_RIPPLE once the REST call resolves.
      const events = state.events.map((e) =>
        e.id === action.id
          ? {
              ...e,
              startsAt: e.startsAt ? shiftIso(e.startsAt, action.minutes) : e.startsAt,
              endsAt: e.endsAt ? shiftIso(e.endsAt, action.minutes) : e.endsAt,
            }
          : e,
      );
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'SCHEDULE': {
      const events = [...state.events, action.event];
      const maybeItems = state.maybeItems.map((m) =>
        m.id === action.maybeId ? { ...m, consumed: true } : m,
      );
      return { ...state, events, maybeItems, ripple: null, undo: snapshotOf(state) };
    }
    case 'RIPPLE_APPLY': {
      if (!state.ripple) return state;
      const moves = new Map(state.ripple.candidates.map((c) => [c.id, c]));
      const events = state.events.map((e) => {
        const m = moves.get(e.id);
        return m ? { ...e, startsAt: m.startsAt, endsAt: m.endsAt } : e;
      });
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'RIPPLE_DISMISS':
      return { ...state, ripple: null };
    case 'UNDO':
      return state.undo ? { ...state, ...state.undo, ripple: null, undo: null } : state;
    case 'CREATE_EVENT': {
      const events = [...state.events, action.event];
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'UPDATE_EVENT': {
      const events = state.events.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e));
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'DELETE_EVENT': {
      const events = state.events.filter((e) => e.id !== action.id);
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'REORDER': {
      const patches = new Map(action.patches.map((p) => [p.id, p.patch]));
      const events = state.events.map((e) => {
        const patch = patches.get(e.id);
        return patch ? { ...e, ...patch } : e;
      });
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case 'ADD_MAYBE':
      return {
        ...state,
        maybeItems: [...state.maybeItems, action.item],
        ripple: null,
        undo: snapshotOf(state),
      };
    case 'REMOVE_MAYBE':
      return {
        ...state,
        maybeItems: state.maybeItems.filter((m) => m.id !== action.id),
        ripple: null,
        undo: snapshotOf(state),
      };
    case 'PARK_EVENT':
      return {
        ...state,
        events: state.events.filter((e) => e.id !== action.eventId),
        maybeItems: [...state.maybeItems, action.item],
        ripple: null,
        undo: snapshotOf(state),
      };
    case 'RECONCILE_EVENT': {
      const exists = state.events.some((e) => e.id === action.event.id);
      const events = exists
        ? state.events.map((e) => (e.id === action.event.id ? action.event : e))
        : [...state.events, action.event];
      return { ...state, events };
    }
    case 'SET_RIPPLE':
      return { ...state, ripple: action.ripple };
    case 'REMOTE_EVENT_CHANGE':
      return { ...state, events: applyRemoteEventChange(state.events, action.change) };
    case 'RESYNC':
      return { ...state, events: action.events, maybeItems: action.maybeItems, ripple: null };
    default:
      return state;
  }
}

/** `change.after` is the wire input the actor sent (partial), not the full
 *  persisted entity — the backend Change log doesn't carry server-computed
 *  fields (e.g. a ripple-shifted `endsAt`). Good enough at this trip's scale;
 *  a richer Change payload is a backend change, out of T-014's scope. */
function applyRemoteEventChange(events: TripEvent[], change: Change): TripEvent[] {
  // Only the `event` UI state lives in this reducer — bookings/notes/maybe-items
  // have no consuming UI yet (T-048 etc.), so this stays event-only. The Dexie
  // cache still stays coherent for all entity types via lib/cache.ts (T-058),
  // independent of what this reducer renders.
  if (change.entityType !== 'event') return events;
  if (change.action === 'delete') return events.filter((e) => e.id !== change.entityId);
  const partial = change.after as Partial<TripEvent> | undefined;
  if (!partial) return events;
  const existing = events.find((e) => e.id === change.entityId);
  if (existing) {
    return events.map((e) => (e.id === change.entityId ? { ...e, ...partial } : e));
  }
  const created = {
    status: EVENT_STATUS.PLANNED,
    ...partial,
    id: change.entityId,
    tripId: change.tripId,
  } as TripEvent;
  return [...events, created];
}

interface TripContextValue {
  trip: Trip;
  users: User[];
  bookings: Booking[];
  notes: TripNote[];
  glance: typeof GLANCE;
  activeDate: string;
  setActiveDate: (date: string) => void;
  activeUserId: string;
  events: TripEvent[];
  maybeItems: MaybeItem[];
  ripple: RippleSuggestion | null;
  dispatch: React.Dispatch<Action>;
  // T-058: true when the boot snapshot came from the Dexie cache because the
  // live fetch failed — a stronger, earlier offline signal than `navigator.onLine`
  // (whose 'offline' event some environments never fire even with no connectivity).
  usingCachedSnapshot: boolean;
}

const TripContext = createContext<TripContextValue | null>(null);

// Bootstraps from GET /trips/:tripId/snapshot (T-034); the tripId prop is the
// seam T-027 fills with a real switcher. Verbs still mutate local state only —
// writing back to the API is T-014.
export function TripProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    fetchSnapshot(tripId).then(
      (s) => {
        void cacheSnapshot(tripId, s);
        if (!cancelled) {
          setSnapshot(s);
          setUsingCachedSnapshot(false);
        }
      },
      (e: unknown) => {
        // Offline read (sync-and-offline.md "Read"): fall back to the last-cached
        // snapshot rather than showing the boot-error screen. The error screen is
        // the true last resort — nothing was ever cached for this trip.
        readCachedSnapshot(tripId).then(
          (cached) => {
            if (cancelled) return;
            if (cached) {
              setSnapshot(cached);
              setUsingCachedSnapshot(true);
            } else {
              setError(e instanceof Error ? e.message : String(e));
            }
          },
          () => {
            if (!cancelled) setError(e instanceof Error ? e.message : String(e));
          },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (error) {
    return (
      <div className="boot-screen">
        <h1>{t.snapshot.errorTitle}</h1>
        <p>{error}</p>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="boot-screen">
        <h1>{t.snapshot.loading}</h1>
      </div>
    );
  }
  return (
    <TripReady
      snapshot={snapshot}
      usingCachedSnapshot={usingCachedSnapshot}
      onReconnected={() => setUsingCachedSnapshot(false)}
    >
      {children}
    </TripReady>
  );
}

function TripReady({
  snapshot,
  usingCachedSnapshot,
  onReconnected,
  children,
}: {
  snapshot: TripSnapshot;
  usingCachedSnapshot: boolean;
  onReconnected: () => void;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, snapshot, initialState);
  const tripId = snapshot.trip.id;
  const { startDate, endDate } = snapshot.trip;

  // Clamped to the trip's own date range: "today" is only the *initial* default,
  // then the day-strip/DayView navigate it via setActiveDate — without clamping,
  // a session left open across a trip-timezone midnight (or one that outlives
  // the trip) drifts `activeDate` past the last real day and the day view
  // silently goes empty.
  const [activeDate, setActiveDateRaw] = useState(() =>
    clampDate(todayInTz(snapshot.trip.timezone, new Date(getNow())), startDate, endDate),
  );
  const setActiveDate = (date: string) => setActiveDateRaw(clampDate(date, startDate, endDate));

  const lastSeqRef = useRef(snapshot.latestSeq);

  useEffect(() => {
    lastSeqRef.current = snapshot.latestSeq;
    let closeSocket: (() => void) | null = null;

    function connect(sinceSeq: string) {
      closeSocket = openTripStream(tripId, sinceSeq, {
        onChange: (change) => {
          lastSeqRef.current = change.seq;
          void applyChangeToCache(tripId, change);
          dispatch({ type: 'REMOTE_EVENT_CHANGE', change });
        },
        onResync: () => {
          fetchSnapshot(tripId).then(
            (s) => {
              lastSeqRef.current = s.latestSeq;
              void cacheSnapshot(tripId, s);
              dispatch({ type: 'RESYNC', events: s.events, maybeItems: s.maybeItems });
              onReconnected();
            },
            () => {}, // ponytail: transient refetch failure — next change/hello retries the resync.
          );
        },
      });
    }
    connect(snapshot.latestSeq);

    // Reconnect catch-up (T-013, sync-and-offline.md "Bootstrap & catch-up"):
    // the socket just dies while offline with no signal, so on `online` we
    // flush the write outbox first (our own queued writes replay before we ask
    // what we missed), then replay `changes?sinceSeq=` and reopen the socket
    // rather than waiting for it to notice the drop on its own.
    function handleOnline() {
      flushOutbox(tripId)
        .then(() => fetchChanges(tripId, lastSeqRef.current))
        .then((changes) => {
          for (const change of changes) {
            lastSeqRef.current = change.seq;
            void applyChangeToCache(tripId, change);
            dispatch({ type: 'REMOTE_EVENT_CHANGE', change });
          }
          closeSocket?.();
          connect(lastSeqRef.current);
          onReconnected();
        })
        .catch(() => {}); // ponytail: next 'online' event (or a WS gap) retries.
    }
    window.addEventListener('online', handleOnline);
    // Also try on mount: a reload while already online (with a queue left
    // over from a previous offline session) is not an 'online' *transition*,
    // so it would never fire the listener above and the queue would sit
    // forever. flushOutbox() is a no-op when the outbox is empty.
    if (!isOffline()) handleOnline();

    // Warm-resume refresh: a backgrounded PWA gets its JS suspended and its
    // socket silently killed by the OS, but returning fires no 'online' event
    // (we never went offline), so the catch-up above never runs and the board
    // goes stale. Re-run the same catch-up when the tab becomes visible again
    // after being hidden past the threshold. A true app close → reopen already
    // cold-loads fresh via the boot fetch; this covers the warm resume.
    let hiddenAt = 0;
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = getNow();
        return;
      }
      const awayMs = hiddenAt === 0 ? 0 : getNow() - hiddenAt;
      hiddenAt = 0;
      if (awayMs >= RESYNC_AFTER_HIDDEN_MS && !isOffline()) handleOnline();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      closeSocket?.();
    };
    // Reconnect only on trip switch — `snapshot.latestSeq` is just this effect's initial cursor.
  }, [tripId]);

  const value = useMemo<TripContextValue>(
    () => ({
      trip: snapshot.trip,
      users: snapshot.users,
      bookings: snapshot.bookings,
      notes: snapshot.notes,
      glance: GLANCE,
      activeDate,
      setActiveDate,
      activeUserId,
      events: state.events,
      maybeItems: state.maybeItems,
      ripple: state.ripple,
      dispatch,
      usingCachedSnapshot,
    }),
    [state, snapshot, usingCachedSnapshot, activeDate],
  );
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within <TripProvider>');
  return ctx;
}

export { byStart };
