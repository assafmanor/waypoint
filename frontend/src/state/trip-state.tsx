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
  BOOKING_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Change,
  type CreateBookingInput,
  type CreatePlaceInput,
  type MaybeItem,
  type Membership,
  type MembershipRole,
  type Trip,
  type TripEvent,
  type Place,
  type TripSnapshot,
  type UpdateBookingInput,
  type UpdatePlaceInput,
  type UpdateTripInput,
  type User,
} from '@waypoint/shared';
import {
  createBooking as apiCreateBooking,
  createPlace as apiCreatePlace,
  deleteBooking as apiDeleteBooking,
  deleteTrip as apiDeleteTrip,
  fetchChanges,
  fetchSnapshot,
  isHardEventConfirmError,
  removeMember as apiRemoveMember,
  setMemberRole as apiSetMemberRole,
  updateBooking as apiUpdateBooking,
  updatePlace as apiUpdatePlace,
  updateTrip as apiUpdateTrip,
  type RippleSuggestion,
} from '../lib/api';
import {
  applyChangeToCache,
  cacheSnapshot,
  clearTripCache,
  readCachedSnapshot,
} from '../lib/cache';
import { flushOutbox, isOffline, restOrQueue } from '../lib/outbox';
import { openTripStream } from '../lib/ws';
import { getNow } from '../lib/useClock';
import { clampDate, shiftIso, todayInTz } from '../lib/time';
import { useToast } from '../ui/Toast';
import { ICONS } from '../constants';
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

/** Merge a remote `trip` change onto the local trip (ADR-0039). `after` carries
 *  only the edited fields (the wire input the admin sent). Trip deletion is
 *  handled separately (it tears the whole trip down), so this only applies an
 *  `update`'s partial and otherwise returns the trip unchanged. */
export function applyControlChangeToTrip(trip: Trip, change: Change): Trip {
  if (change.entityType !== 'trip' || change.action === 'delete') return trip;
  const partial = change.after as Partial<Trip> | undefined;
  return partial ? { ...trip, ...partial } : trip;
}

/** Merge a remote `membership` change (role change / removal / join) into the
 *  local roster, keyed by membership id (ADR-0039). */
export function applyControlChangeToMembers(members: Membership[], change: Change): Membership[] {
  if (change.entityType !== 'membership') return members;
  if (change.action === 'delete') return members.filter((m) => m.id !== change.entityId);
  const next = change.after as Membership | undefined;
  if (!next) return members;
  return members.some((m) => m.id === next.id)
    ? members.map((m) => (m.id === next.id ? next : m))
    : [...members, next];
}

/** Upsert/delete a remote change into a by-id list (bookings, places — the Index
 *  data plane, ADR-0047/0048). Mirrors cache.ts `applyToRow`: `after` is merged
 *  over the existing row (a partial input) or appended as a new row (a peer's
 *  create). A peer's plain create arrives without server-only fields until the
 *  next resync — the Index reads only type/title/code/place, so it renders fine. */
export function applyControlChangeToList<T extends { id: string }>(list: T[], change: Change): T[] {
  if (change.action === 'delete') return list.filter((x) => x.id !== change.entityId);
  const partial = change.after as Partial<T> | undefined;
  if (!partial) return list;
  const existing = list.find((x) => x.id === change.entityId);
  const next = { ...(existing as T), ...partial, id: change.entityId } as T;
  return existing ? list.map((x) => (x.id === change.entityId ? next : x)) : [...list, next];
}

/** Admin-governed trip-settings writes (ADR-0039): optimistic, data-plane
 *  (broadcast + offline outbox), reconciled/rolled-back like the event verbs. */
export interface SettingsVerbs {
  updateTrip: (input: UpdateTripInput) => Promise<void>;
  setMemberRole: (userId: string, role: MembershipRole) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  deleteTrip: () => Promise<void>;
}

/** Index write verbs (ADR-0047/0048): optimistic + reconcile/rollback, queued
 *  offline via the outbox — the same shape as the settings verbs, over the
 *  reactive bookings/places state. The edit sheet (checkpoint 3) and booking
 *  form (checkpoint 4) call these. A booking `event` seed is forwarded to the
 *  server (which creates the linked event atomically); the optimistic *event*
 *  side is the form's job — for now a seeded event arrives via the WS echo. */
export interface IndexVerbs {
  createBooking: (input: CreateBookingInput) => Promise<Booking | undefined>;
  updateBooking: (bookingId: string, input: UpdateBookingInput) => Promise<void>;
  deleteBooking: (
    bookingId: string,
    opts?: { confirm?: boolean; deleteEvents?: boolean },
  ) => Promise<void>;
  // Returns the client-generated id synchronously so a booking can reference a
  // just-authored name-only Place; the write settles in the background.
  createPlace: (input: CreatePlaceInput) => string;
  updatePlace: (placeId: string, input: UpdatePlaceInput) => Promise<void>;
}

interface TripContextValue {
  trip: Trip;
  users: User[];
  members: Membership[];
  bookings: Booking[];
  places: Place[];
  glance: typeof GLANCE;
  activeDate: string;
  setActiveDate: (date: string) => void;
  activeUserId: string;
  events: TripEvent[];
  maybeItems: MaybeItem[];
  ripple: RippleSuggestion | null;
  dispatch: React.Dispatch<Action>;
  settings: SettingsVerbs;
  indexVerbs: IndexVerbs;
  // Set once the active trip is deleted (locally or by a remote admin, ADR-0039);
  // the shell/settings screen navigate out to /trips when this flips.
  tripDeleted: boolean;
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
  const toast = useToast();
  const tripId = snapshot.trip.id;
  const { startDate, endDate } = snapshot.trip;

  // Trip details + roster are data-plane now (ADR-0039): held in reactive state
  // (not the immutable snapshot) so admin edits, promotions and removals appear
  // live — via WS remote changes below and the optimistic settings verbs. They
  // re-seed on a trip switch because TripProvider unmounts TripReady while the
  // new snapshot loads. (The one-slot event undo deliberately doesn't cover
  // these — settings isn't the timeline.)
  const [trip, setTrip] = useState<Trip>(snapshot.trip);
  const [members, setMembers] = useState<Membership[]>(snapshot.members);
  const [tripDeleted, setTripDeleted] = useState(false);
  // Index data plane (ADR-0047/0048): reactive like trip/roster (not the events
  // reducer) so a peer's booking/place edit and our own optimistic writes both
  // reflect live. Re-seed on a trip switch (TripReady remounts) and on resync.
  const [bookings, setBookings] = useState<Booking[]>(snapshot.bookings);
  const [places, setPlaces] = useState<Place[]>(snapshot.places);

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

    // Fan a remote change into every consumer: the event reducer, the Dexie
    // cache, and the reactive trip/roster state (ADR-0039). Setters are stable,
    // so this closes over them safely without effect-dep churn.
    function applyRemoteChange(change: Change) {
      lastSeqRef.current = change.seq;
      void applyChangeToCache(tripId, change);
      dispatch({ type: 'REMOTE_EVENT_CHANGE', change });
      if (change.entityType === 'trip') {
        if (change.action === 'delete') setTripDeleted(true);
        else setTrip((prev) => applyControlChangeToTrip(prev, change));
      } else if (change.entityType === 'membership') {
        setMembers((prev) => applyControlChangeToMembers(prev, change));
      } else if (change.entityType === 'booking') {
        setBookings((prev) => applyControlChangeToList(prev, change));
      } else if (change.entityType === 'place') {
        setPlaces((prev) => applyControlChangeToList(prev, change));
      }
    }

    function connect(sinceSeq: string) {
      closeSocket = openTripStream(tripId, sinceSeq, {
        onChange: applyRemoteChange,
        onResync: () => {
          fetchSnapshot(tripId).then(
            (s) => {
              lastSeqRef.current = s.latestSeq;
              void cacheSnapshot(tripId, s);
              dispatch({ type: 'RESYNC', events: s.events, maybeItems: s.maybeItems });
              setTrip(s.trip);
              setMembers(s.members);
              setBookings(s.bookings);
              setPlaces(s.places);
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
          for (const change of changes) applyRemoteChange(change);
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

  // --- Trip-settings verbs (ADR-0039): optimistic + reconcile/rollback, queued
  // offline via the outbox — the same shape as the event verbs, but over the
  // reactive trip/roster state instead of the reducer. ---
  const settings = useMemo<SettingsVerbs>(() => {
    const fail = (err: unknown) => {
      toast(ICONS.warn, t.toast.writeFailed);
      throw err;
    };
    return {
      updateTrip: async (input) => {
        const previous = trip;
        setTrip((prev) => ({ ...prev, ...input })); // optimistic
        try {
          const canonical = await restOrQueue(tripId, { verb: 'updateTrip', input }, () =>
            apiUpdateTrip(tripId, input),
          );
          if (canonical) setTrip(canonical); // reconcile with server truth
          // Honest toast: `undefined` means the write was queued offline, not saved
          // to the server yet (ADR-0042) — the pending badge tracks it from here.
          toast(
            canonical ? ICONS.done : ICONS.sync,
            canonical ? t.settings.toast.saved : t.settings.toast.savedQueued,
          );
        } catch (err) {
          setTrip(previous); // rollback
          fail(err);
        }
      },
      setMemberRole: async (userId, role) => {
        const previous = members;
        setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
        try {
          const canonical = await restOrQueue(tripId, { verb: 'setMemberRole', userId, role }, () =>
            apiSetMemberRole(tripId, userId, role),
          );
          if (canonical)
            setMembers((prev) => prev.map((m) => (m.id === canonical.id ? canonical : m)));
          toast(
            canonical ? ICONS.done : ICONS.sync,
            canonical ? t.settings.toast.promoted : t.settings.toast.promotedQueued,
          );
        } catch (err) {
          setMembers(previous);
          fail(err);
        }
      },
      removeMember: async (userId) => {
        const previous = members;
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        try {
          await restOrQueue(tripId, { verb: 'removeMember', userId }, () =>
            apiRemoveMember(tripId, userId),
          );
        } catch (err) {
          setMembers(previous);
          fail(err);
        }
      },
      deleteTrip: async () => {
        try {
          await restOrQueue(tripId, { verb: 'deleteTrip' }, () => apiDeleteTrip(tripId));
          void clearTripCache(tripId);
          setTripDeleted(true);
        } catch (err) {
          fail(err);
        }
      },
    };
  }, [tripId, trip, members, toast]);

  // --- Index write verbs (ADR-0047/0048): optimistic + reconcile/rollback,
  // queued offline via the outbox — same shape as the settings verbs, over the
  // reactive bookings/places state. ---
  const indexVerbs = useMemo<IndexVerbs>(() => {
    const stamp = () => new Date(getNow()).toISOString();
    return {
      createBooking: async (input) => {
        const id = input.id ?? crypto.randomUUID();
        const withId = { ...input, id };
        const { event: _seed, ...fields } = withId;
        const optimistic = {
          source: BOOKING_SOURCE.MANUAL,
          ...fields,
          tripId,
          createdAt: stamp(),
          updatedAt: stamp(),
          updatedBy: activeUserId,
        } as Booking;
        const previous = bookings;
        setBookings((prev) => [...prev, optimistic]);
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: 'createBooking', input: withId },
            () => apiCreateBooking(tripId, withId),
          );
          if (canonical) setBookings((prev) => prev.map((b) => (b.id === id ? canonical : b)));
          toast(
            canonical ? ICONS.done : ICONS.sync,
            canonical ? t.index.toast.saved : t.index.toast.savedQueued,
          );
          return canonical ?? optimistic;
        } catch (err) {
          setBookings(previous);
          toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
      },
      updateBooking: async (bookingId, input) => {
        const previous = bookings;
        const { event: _seed, ...fields } = input;
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, ...fields } : b)));
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: 'updateBooking', bookingId, input },
            () => apiUpdateBooking(tripId, bookingId, input),
          );
          if (canonical)
            setBookings((prev) => prev.map((b) => (b.id === bookingId ? canonical : b)));
          toast(
            canonical ? ICONS.done : ICONS.sync,
            canonical ? t.index.toast.saved : t.index.toast.savedQueued,
          );
        } catch (err) {
          setBookings(previous);
          toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
      },
      deleteBooking: async (bookingId, opts = {}) => {
        const previous = bookings;
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
        try {
          await restOrQueue(
            tripId,
            {
              verb: 'deleteBooking',
              bookingId,
              confirm: !!opts.confirm,
              deleteEvents: !!opts.deleteEvents,
            },
            () => apiDeleteBooking(tripId, bookingId, opts),
          );
          toast(ICONS.trash, t.index.toast.deleted);
        } catch (err) {
          setBookings(previous);
          // A hard linked-event 409 isn't a failure — the caller (edit sheet)
          // re-prompts for confirm/unlink, so it rethrows without a generic toast.
          if (!isHardEventConfirmError(err)) toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
      },
      createPlace: (input) => {
        const id = input.id ?? crypto.randomUUID();
        const withId = { ...input, id };
        const optimistic = {
          ...withId,
          tripId,
          createdAt: stamp(),
          updatedAt: stamp(),
          updatedBy: activeUserId,
        } as Place;
        const previous = places;
        setPlaces((prev) => [...prev, optimistic]);
        void restOrQueue(tripId, { verb: 'createPlace', input: withId }, () =>
          apiCreatePlace(tripId, withId),
        )
          .then((canonical) => {
            if (canonical) setPlaces((prev) => prev.map((p) => (p.id === id ? canonical : p)));
          })
          .catch(() => {
            setPlaces(previous);
            toast(ICONS.warn, t.toast.writeFailed);
          });
        return id;
      },
      updatePlace: async (placeId, input) => {
        const previous = places;
        setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, ...input } : p)));
        try {
          const canonical = await restOrQueue(tripId, { verb: 'updatePlace', placeId, input }, () =>
            apiUpdatePlace(tripId, placeId, input),
          );
          if (canonical) setPlaces((prev) => prev.map((p) => (p.id === placeId ? canonical : p)));
        } catch (err) {
          setPlaces(previous);
          toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
      },
    };
  }, [tripId, bookings, places, toast]);

  const value = useMemo<TripContextValue>(
    () => ({
      trip,
      users: snapshot.users,
      members,
      bookings,
      places,
      glance: GLANCE,
      activeDate,
      setActiveDate,
      activeUserId,
      events: state.events,
      maybeItems: state.maybeItems,
      ripple: state.ripple,
      dispatch,
      settings,
      indexVerbs,
      tripDeleted,
      usingCachedSnapshot,
    }),
    [
      state,
      snapshot,
      trip,
      members,
      bookings,
      places,
      settings,
      indexVerbs,
      tripDeleted,
      usingCachedSnapshot,
      activeDate,
    ],
  );
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within <TripProvider>');
  return ctx;
}

export { byStart };
