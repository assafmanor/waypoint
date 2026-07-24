// Active-trip context + optimistic local state. Verbs mutate immediately and
// return an inverse via one-slot undo (your last action only — ADR-0019).
// No API / Change-log / outbox here — those are T-014/T-013; dispatch is shaped
// so the reducer can be swapped for REST calls without touching the screens.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BOOKING_SOURCE,
  CHANGE_ACTION,
  CHANGES_PAGE_LIMIT,
  ENTITY_TYPE,
  EVENT_STATUS,
  type Booking,
  type Change,
  type EntityType,
  type CreateBookingInput,
  type CreatePlaceInput,
  type DocumentSummary,
  type MaybeItem,
  type Membership,
  type MembershipRole,
  type Trip,
  type TripEvent,
  type Place,
  type ResolvePlaceInput,
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
  evictDocumentBlob,
  fetchChanges,
  fetchSnapshot,
  isHardEventConfirmError,
  removeMember as apiRemoveMember,
  resolvePlace as apiResolvePlace,
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
  coerceTripPatch,
  readCachedSnapshot,
} from '../lib/cache';
import {
  flushOutbox,
  getSyncFailures,
  isOffline,
  OUTBOX_VERB,
  restOrQueue,
  subscribeSyncFailures,
} from '../lib/outbox';
import { openTripStream } from '../lib/ws';
import {
  CHANGE_FEED_LIMIT,
  appendChangeEntry,
  describeChange,
  dismissChangeEntry,
  type ChangeEntry,
} from './change-feed';
import { getNow } from '../lib/useClock';
import { clampDate, shiftIso, todayInTz } from '../lib/time';
import { bookingLinkedEventChange } from '../lib/outbox-effects';
import { useToast } from '../ui/Toast';
import { ICONS, type TabId } from '../constants';
import { EVENTS, MAYBE_ITEMS } from '../fixtures';
import { useAuth } from './auth-state';
import { DAY_PARAM, HOME_TAB, TAB_PARAM, daySelectTarget, resolveActiveDate } from './nav-state';
import { AppShell } from '../ui/layout';
import { ChromeSkeleton, ErrorState, HomeSkeleton, LoadingState } from '../ui/feedback';
import { deriveMode } from '../lib/mode';
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

/** Reducer action discriminants. Named so the reducer `switch`, every
 *  `dispatch`, and the `Action` union all reference one source instead of
 *  spelling the string (the same treatment as the outbox `OUTBOX_VERB`). */
export const TRIP_ACTION = {
  SET_STATUS: 'SET_STATUS',
  DELAY: 'DELAY',
  SCHEDULE: 'SCHEDULE',
  RIPPLE_APPLY: 'RIPPLE_APPLY',
  RIPPLE_DISMISS: 'RIPPLE_DISMISS',
  UNDO: 'UNDO',
  CREATE_EVENT: 'CREATE_EVENT',
  UPDATE_EVENT: 'UPDATE_EVENT',
  DELETE_EVENT: 'DELETE_EVENT',
  REORDER: 'REORDER',
  ADD_MAYBE: 'ADD_MAYBE',
  REMOVE_MAYBE: 'REMOVE_MAYBE',
  PARK_EVENT: 'PARK_EVENT',
  RECONCILE_EVENT: 'RECONCILE_EVENT',
  SET_RIPPLE: 'SET_RIPPLE',
  REMOTE_EVENT_CHANGE: 'REMOTE_EVENT_CHANGE',
  RESYNC: 'RESYNC',
} as const;

export type TripActionType = (typeof TRIP_ACTION)[keyof typeof TRIP_ACTION];

export type Action =
  | { type: typeof TRIP_ACTION.SET_STATUS; id: string; status: TripEvent['status'] }
  | { type: typeof TRIP_ACTION.DELAY; id: string; minutes: number }
  | { type: typeof TRIP_ACTION.SCHEDULE; event: TripEvent; maybeId: string }
  | { type: typeof TRIP_ACTION.RIPPLE_APPLY }
  | { type: typeof TRIP_ACTION.RIPPLE_DISMISS }
  | { type: typeof TRIP_ACTION.UNDO }
  // T-047: create/edit/delete UI verbs.
  | { type: typeof TRIP_ACTION.CREATE_EVENT; event: TripEvent }
  | { type: typeof TRIP_ACTION.UPDATE_EVENT; id: string; patch: Partial<TripEvent> }
  | { type: typeof TRIP_ACTION.DELETE_EVENT; id: string }
  // Plan-mode builder reorder: swap two adjacent events' slots atomically so
  // undo captures one pre-swap snapshot (a two-UPDATE_EVENT sequence would
  // overwrite the undo snapshot on the second dispatch).
  // Plan-mode builder reorder: reassign soft events' time slots atomically so
  // undo captures one pre-reorder snapshot (a sequence of UPDATE_EVENTs would
  // overwrite the undo snapshot on each dispatch).
  | { type: typeof TRIP_ACTION.REORDER; patches: { id: string; patch: Partial<TripEvent> }[] }
  // Maybe-shelf add/remove (Plan-mode Tier 3 build-the-shelf).
  | { type: typeof TRIP_ACTION.ADD_MAYBE; item: MaybeItem }
  | { type: typeof TRIP_ACTION.REMOVE_MAYBE; id: string }
  // Park an event onto the shelf: it leaves the day and becomes a maybe idea,
  // atomically (one undo snapshot).
  | { type: typeof TRIP_ACTION.PARK_EVENT; eventId: string; item: MaybeItem }
  // T-014: the REST write layer (verbs.ts) reconciles/broadcasts through these.
  | { type: typeof TRIP_ACTION.RECONCILE_EVENT; event: TripEvent }
  | { type: typeof TRIP_ACTION.SET_RIPPLE; ripple: RippleSuggestion | null }
  | { type: typeof TRIP_ACTION.REMOTE_EVENT_CHANGE; change: Change }
  | { type: typeof TRIP_ACTION.RESYNC; events: TripEvent[]; maybeItems: MaybeItem[] };

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
    case TRIP_ACTION.SET_STATUS: {
      const events = state.events.map((e) =>
        e.id === action.id ? { ...e, status: action.status } : e,
      );
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.DELAY: {
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
    case TRIP_ACTION.SCHEDULE: {
      const events = [...state.events, action.event];
      const maybeItems = state.maybeItems.map((m) =>
        m.id === action.maybeId ? { ...m, consumed: true } : m,
      );
      return { ...state, events, maybeItems, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.RIPPLE_APPLY: {
      if (!state.ripple) return state;
      const moves = new Map(state.ripple.candidates.map((c) => [c.id, c]));
      const events = state.events.map((e) => {
        const m = moves.get(e.id);
        return m ? { ...e, startsAt: m.startsAt, endsAt: m.endsAt } : e;
      });
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.RIPPLE_DISMISS:
      return { ...state, ripple: null };
    case TRIP_ACTION.UNDO:
      return state.undo ? { ...state, ...state.undo, ripple: null, undo: null } : state;
    case TRIP_ACTION.CREATE_EVENT: {
      const events = [...state.events, action.event];
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.UPDATE_EVENT: {
      const events = state.events.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e));
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.DELETE_EVENT: {
      const events = state.events.filter((e) => e.id !== action.id);
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.REORDER: {
      const patches = new Map(action.patches.map((p) => [p.id, p.patch]));
      const events = state.events.map((e) => {
        const patch = patches.get(e.id);
        return patch ? { ...e, ...patch } : e;
      });
      return { ...state, events, ripple: null, undo: snapshotOf(state) };
    }
    case TRIP_ACTION.ADD_MAYBE:
      return {
        ...state,
        maybeItems: [...state.maybeItems, action.item],
        ripple: null,
        undo: snapshotOf(state),
      };
    case TRIP_ACTION.REMOVE_MAYBE:
      return {
        ...state,
        maybeItems: state.maybeItems.filter((m) => m.id !== action.id),
        ripple: null,
        undo: snapshotOf(state),
      };
    case TRIP_ACTION.PARK_EVENT:
      return {
        ...state,
        events: state.events.filter((e) => e.id !== action.eventId),
        maybeItems: [...state.maybeItems, action.item],
        ripple: null,
        undo: snapshotOf(state),
      };
    case TRIP_ACTION.RECONCILE_EVENT: {
      const exists = state.events.some((e) => e.id === action.event.id);
      const events = exists
        ? state.events.map((e) => (e.id === action.event.id ? action.event : e))
        : [...state.events, action.event];
      return { ...state, events };
    }
    case TRIP_ACTION.SET_RIPPLE:
      return { ...state, ripple: action.ripple };
    case TRIP_ACTION.REMOTE_EVENT_CHANGE:
      return { ...state, events: applyRemoteEventChange(state.events, action.change) };
    case TRIP_ACTION.RESYNC:
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
  if (change.entityType !== ENTITY_TYPE.EVENT) return events;
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
  if (change.entityType !== ENTITY_TYPE.TRIP || change.action === CHANGE_ACTION.DELETE) return trip;
  const partial = coerceTripPatch(change.after);
  return partial ? { ...trip, ...partial } : trip;
}

/** Merge a remote `membership` change (role change / removal / join) into the
 *  local roster, keyed by membership id (ADR-0039). */
export function applyControlChangeToMembers(members: Membership[], change: Change): Membership[] {
  if (change.entityType !== ENTITY_TYPE.MEMBERSHIP) return members;
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
  // Resolves to the client-generated id so a booking can reference a just-authored
  // name-only Place. Awaitable so the caller can persist the Place before the
  // booking that FK-references it (online: awaited; offline: the outbox is FIFO,
  // so the queued place op still runs before the booking op).
  createPlace: (input: CreatePlaceInput) => Promise<string>;
  updatePlace: (placeId: string, input: UpdatePlaceInput) => Promise<void>;
  // The Places picker's terminating enrich-on-pick (ADR-0108 §3 / ADR-0110 §1).
  // Online-only (needs Google, so never queued); the returned canonical row is
  // adopted into `places` immediately for the form's use, and the WS `place` echo
  // reconciles it through the existing registry (server-minted id → no duplicate).
  resolvePlace: (input: ResolvePlaceInput) => Promise<Place>;
}

interface TripContextValue {
  trip: Trip;
  users: User[];
  members: Membership[];
  bookings: Booking[];
  places: Place[];
  documents: DocumentSummary[];
  activeDate: string;
  setActiveDate: (date: string) => void;
  events: TripEvent[];
  maybeItems: MaybeItem[];
  ripple: RippleSuggestion | null;
  dispatch: React.Dispatch<Action>;
  settings: SettingsVerbs;
  indexVerbs: IndexVerbs;
  // Group change-feed (ADR-0081, U-09): a bounded, newest-first list of recent
  // SHARED peer edits, narrated (not re-applied) off the same WS `change` stream.
  // Own edits are filtered out; resets on trip switch (TripReady remounts).
  changeFeed: ChangeEntry[];
  dismissChange: (id: string) => void;
  clearChangeFeed: () => void;
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
export function TripProvider({
  tripId,
  knownTrip,
  children,
}: {
  tripId: string;
  // Best-effort trip fields the caller already has in hand (e.g. RootSurface's
  // resolved trips list) — used only to pick the snapshot skeleton's mode
  // shape and pre-fill its header bar (ADR-0105) before the snapshot itself
  // has loaded. `useMode`/`useTrip` aren't reachable this early: ModeProvider
  // and the real Header both read `useTrip`, which only exists once TripReady
  // mounts below. Omitted, the skeleton defaults to the Trip shape with a
  // placeholder name.
  knownTrip?: Pick<Trip, 'startDate' | 'endDate' | 'timezone' | 'name' | 'icon'> | null;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedSnapshot, setUsingCachedSnapshot] = useState(false);
  // Bumped by the error state's retry (U-10): re-runs the boot fetch below,
  // which first clears the snapshot back to the loading state, then refetches.
  const [reloadNonce, setReloadNonce] = useState(0);

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
  }, [tripId, reloadNonce]);

  // Loading + error render INSIDE the AppShell frame (U-10) rather than as a
  // full-screen centred <h1>: a trip-switch keeps the shell chrome instead of
  // flashing a layout jump, and the error is recoverable (retry re-runs the
  // fetch) instead of a dead-end. The real Header needs the not-yet-loaded trip,
  // so the frame carries a body-only skeleton / error until the snapshot lands.
  if (error) {
    return (
      <AppShell>
        <ErrorState
          title={t.snapshot.errorTitle}
          body={t.snapshot.errorBody}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      </AppShell>
    );
  }
  if (!snapshot) {
    // The one tier that needs a mode variant (ADR-0105): the chrome is already
    // mode-themed by the time this shows, so the skeleton shape-matches what
    // Home resolves into rather than popping from a mismatched shape.
    const mode = knownTrip ? deriveMode(knownTrip, new Date(getNow())) : 'trip';
    return (
      <AppShell mode={mode} header={<ChromeSkeleton mode={mode} trip={knownTrip} />}>
        <LoadingState label={t.snapshot.loading} skeleton={<HomeSkeleton mode={mode} />} />
      </AppShell>
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
  const { me } = useAuth();
  const tripId = snapshot.trip.id;
  // Attribution for our own optimistic writes: the signed-in user, not a fixture
  // (the server stamps the canonical `updatedBy` on reconcile; this is what a
  // non-reconciled entity — an offline booking/place — shows until then).
  const authorId = me?.user.id ?? snapshot.trip.updatedBy;

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
  // Documents ride the snapshot too (ADR-0058) — a reactive list like bookings, so
  // a peer's upload/rename/delete and our own writes (via the WS self-echo) both
  // reflect live. The bytes still load lazily via /content + the ADR-0055 cache.
  const [documents, setDocuments] = useState<DocumentSummary[]>(snapshot.documents);

  // Group change-feed buffer (ADR-0081, U-09). Narrated from the same WS change
  // stream in applyRemoteChange below — never a second socket, never re-applied.
  // Re-inits to empty on trip switch (TripReady remounts). The describe context
  // (roster / me / tz) is held in a ref so the [tripId]-scoped effect narrates
  // with fresh values without re-subscribing the socket on every render.
  const [changeFeed, setChangeFeed] = useState<ChangeEntry[]>([]);
  const feedCtxRef = useRef({
    users: snapshot.users,
    meId: me?.user.id,
    tz: snapshot.trip.timezone,
  });
  feedCtxRef.current = { users: snapshot.users, meId: me?.user.id, tz: trip.timezone };
  const dismissChange = useCallback(
    (id: string) => setChangeFeed((prev) => dismissChangeEntry(prev, id)),
    [],
  );
  const clearChangeFeed = useCallback(() => setChangeFeed([]), []);

  // The selected day has ONE source of truth: the `?day=` URL param (ADR-0035 §4,
  // single-source day). `activeDate` derives from it every render — there is no
  // second copy of the day in React state to reset or keep in sync, which is what
  // used to fight itself (a reset effect vs. a URL-mirror effect racing to a
  // ping-pong that needed a second tap to settle). Home is only ever reached
  // without a `?day=` (day-selection always targets the `days` tab, `daySelectTarget`),
  // so Home ALWAYS derives to today, in every mode, with no reset effect at all.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // "Today", clamped to the (reactive) trip range — the Trip-mode amber anchor and
  // the value the URL param is omitted for (a clean `/`). Recomputed per render so
  // a midnight/idle rollover lands on the new today.
  const defaultDay = clampDate(
    todayInTz(trip.timezone, new Date(getNow())),
    trip.startDate,
    trip.endDate,
  );
  // Derived, tab-aware: the Home tab is today-anchored (both modes), so it ALWAYS
  // resolves to today regardless of any `?day=` — even a stray or hand-crafted one
  // can't make Home show a past/future day. Off Home, the day comes from `?day=`,
  // resolved against the *reactive* trip range (not the boot snapshot) so a live
  // admin date-edit (ADR-0039) re-clamps it; a missing/invalid/out-of-range param
  // falls back to today, so a stale deep link lands gracefully.
  const currentTab = (searchParams.get(TAB_PARAM) as TabId | null) ?? HOME_TAB;
  const activeDate =
    currentTab === HOME_TAB
      ? defaultDay
      : resolveActiveDate(searchParams.get(DAY_PARAM), trip.startDate, trip.endDate, defaultDay);
  // Selecting a day = focusing it on a day-scoped surface. Writes the single
  // source (`?day=`, cleared when it's today); from the Day view or Map it stays
  // in place, otherwise it routes to the Day view (ADR-0110 §4). Always `replace`
  // (a lateral view change, ADR-0090): back from a day resolves to Home from
  // state, not by walking the days you tapped. Clamped to the reactive trip range.
  const setActiveDate = useCallback(
    (date: string) => {
      const clamped = clampDate(date, trip.startDate, trip.endDate);
      const { to, replace } = daySelectTarget(clamped, defaultDay, currentTab);
      navigate(to, { replace });
    },
    [navigate, trip.startDate, trip.endDate, defaultDay, currentTab],
  );

  const lastSeqRef = useRef(snapshot.latestSeq);

  // Per-entity memory channels (ADR-0094): each entity type declares how a Change
  // applies to its in-memory store — the reactive lists, or the event reducer. No
  // per-type branching in the apply path, so adding an entity type (or moving one
  // between stores) is a single entry here; the cache half is the mirror registry
  // in lib/cache.ts. Setters + dispatch are stable, so this only rebinds per trip.
  const memoryChannels = useMemo<Partial<Record<EntityType, (change: Change) => void>>>(
    () => ({
      [ENTITY_TYPE.EVENT]: (change) => dispatch({ type: TRIP_ACTION.REMOTE_EVENT_CHANGE, change }),
      [ENTITY_TYPE.TRIP]: (change) =>
        change.action === CHANGE_ACTION.DELETE
          ? setTripDeleted(true)
          : setTrip((prev) => applyControlChangeToTrip(prev, change)),
      [ENTITY_TYPE.MEMBERSHIP]: (change) =>
        setMembers((prev) => applyControlChangeToMembers(prev, change)),
      [ENTITY_TYPE.BOOKING]: (change) =>
        setBookings((prev) => applyControlChangeToList(prev, change)),
      [ENTITY_TYPE.PLACE]: (change) => setPlaces((prev) => applyControlChangeToList(prev, change)),
      [ENTITY_TYPE.DOCUMENT]: (change) => {
        // A replace/delete invalidates the client blob cache: the /content URL is
        // reused across a replace with no fresh updatedAt to re-key it (ADR-0055/0058).
        if (change.action === CHANGE_ACTION.UPDATE || change.action === CHANGE_ACTION.DELETE) {
          void evictDocumentBlob(tripId, change.entityId);
        }
        setDocuments((prev) => applyControlChangeToList(prev, change));
      },
    }),
    [tripId],
  );

  // The ONE applier for a single entity change (ADR-0093/0094): mirror to the Dexie
  // cache, then route to the entity's memory channel. A live WS echo runs this after
  // its seq + change-feed bookkeeping (applyRemoteChange, below); an offline
  // optimistic write reuses it verbatim, so there is no separate offline handler.
  const applyEntityChange = useCallback(
    (change: Change) => {
      void applyChangeToCache(tripId, change);
      memoryChannels[change.entityType]?.(change);
    },
    [tripId, memoryChannels],
  );

  useEffect(() => {
    lastSeqRef.current = snapshot.latestSeq;
    let closeSocket: (() => void) | null = null;

    // Fan a remote change into every consumer: the event reducer, the Dexie
    // cache, and the reactive trip/roster state (ADR-0039). Setters are stable,
    // so this closes over them safely without effect-dep churn.
    function applyRemoteChange(change: Change) {
      lastSeqRef.current = change.seq;
      // Narrate (don't re-apply) into the change-feed: a peer edit becomes a
      // visible, attributed line (ADR-0081). Our own edits return null (already
      // optimistic on our screen). Covers WS-live + reconnect catch-up (both
      // funnel here); a full RESYNC replaces state wholesale and isn't narrated.
      const { users, meId, tz } = feedCtxRef.current;
      const entry = describeChange(change, users, meId, tz);
      if (entry) setChangeFeed((prev) => appendChangeEntry(prev, entry, CHANGE_FEED_LIMIT));
      // The actual fan-out (cache + every store) is the shared applier — the same
      // one an offline optimistic write uses (ADR-0093).
      applyEntityChange(change);
    }

    // Full-snapshot resync: a gap/hello-ahead (onResync), or a phantom optimistic
    // entity the server rejected on flush (F-03) — the RESYNC drops it from the
    // reactive lists so the UI stops showing a change that was never saved.
    function resyncSnapshot() {
      fetchSnapshot(tripId).then(
        (s) => {
          lastSeqRef.current = s.latestSeq;
          void cacheSnapshot(tripId, s);
          dispatch({ type: TRIP_ACTION.RESYNC, events: s.events, maybeItems: s.maybeItems });
          setTrip(s.trip);
          setMembers(s.members);
          setBookings(s.bookings);
          setPlaces(s.places);
          setDocuments(s.documents);
          onReconnected();
        },
        () => {}, // ponytail: transient refetch failure — next change/hello retries the resync.
      );
    }

    // Incremental catch-up: flush our own queued writes first, then replay what we
    // missed. Used both on an `online`/visibility transition and on a WS-driven
    // reconnect (F-04) — the difference is only whether the socket is reopened
    // (handleOnline does; the WS reconnect already reopened it before calling back).
    async function catchUp(): Promise<void> {
      await flushOutbox(tripId);
      // `/changes` is paged (CHANGES_PAGE_LIMIT, ADR-0068/B-09): keep fetching from
      // the last applied seq while a page comes back full, so a long or reset cursor
      // catches up across pages instead of stopping after the first.
      for (;;) {
        const changes = await fetchChanges(tripId, lastSeqRef.current);
        for (const change of changes) applyRemoteChange(change);
        if (changes.length < CHANGES_PAGE_LIMIT) break;
      }
      onReconnected();
    }

    function connect(sinceSeq: string) {
      closeSocket = openTripStream(tripId, sinceSeq, {
        onChange: applyRemoteChange,
        onResync: resyncSnapshot,
        // The socket reopened itself after a silent foreground drop (F-04); run
        // the same catch-up handleOnline does, but don't reopen — ws.ts owns it.
        onReconnect: () => void catchUp().catch(() => {}),
      });
    }
    connect(snapshot.latestSeq);

    // Reconnect catch-up (T-013, sync-and-offline.md "Bootstrap & catch-up"):
    // the socket just dies while offline with no signal, so on `online` we
    // flush the write outbox first (our own queued writes replay before we ask
    // what we missed), then replay `changes?sinceSeq=` and reopen the socket
    // rather than waiting for it to notice the drop on its own.
    function handleOnline() {
      catchUp()
        .then(() => {
          closeSocket?.();
          connect(lastSeqRef.current);
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

    // F-03: a queued write dropped on flush leaves a phantom optimistic entity in
    // the reactive lists (the outbox already wrote it through to the cache). On a
    // genuinely new failure for *this* trip, resync so the rejected entity drops.
    // Count-gated (not fired on clear/dismiss) so it can't loop.
    const failuresForTrip = () => getSyncFailures().filter((f) => f.tripId === tripId).length;
    let seenFailures = failuresForTrip();
    const unsubscribeFailures = subscribeSyncFailures(() => {
      const next = failuresForTrip();
      if (next > seenFailures) resyncSnapshot();
      seenFailures = next;
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeFailures();
      closeSocket?.();
    };
    // Reconnect only on trip switch — `snapshot.latestSeq` is just this effect's initial cursor.
    // `applyEntityChange` is stable per trip, so it doesn't retrigger the socket.
  }, [tripId, applyEntityChange]);

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
        // A cleared destination field arrives as `null`; coerce to the local
        // `undefined` shape (present keys only, so untouched fields aren't wiped).
        const patch = coerceTripPatch(input) ?? {};
        setTrip((prev) => ({ ...prev, ...patch })); // optimistic
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE_TRIP, input },
            () => apiUpdateTrip(tripId, input),
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
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.SET_MEMBER_ROLE, userId, role },
            () => apiSetMemberRole(tripId, userId, role),
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
          await restOrQueue(tripId, { verb: OUTBOX_VERB.REMOVE_MEMBER, userId }, () =>
            apiRemoveMember(tripId, userId),
          );
        } catch (err) {
          setMembers(previous);
          fail(err);
        }
      },
      deleteTrip: async () => {
        try {
          await restOrQueue(tripId, { verb: OUTBOX_VERB.DELETE_TRIP }, () => apiDeleteTrip(tripId));
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
        const { event: seed, ...fields } = withId;
        const optimistic = {
          source: BOOKING_SOURCE.MANUAL,
          ...fields,
          tripId,
          createdAt: stamp(),
          updatedAt: stamp(),
          updatedBy: authorId,
        } as Booking;
        const previous = bookings;
        setBookings((prev) => [...prev, optimistic]);
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.CREATE_BOOKING, input: withId },
            () => apiCreateBooking(tripId, withId),
          );
          if (canonical) setBookings((prev) => prev.map((b) => (b.id === id ? canonical : b)));
          // Queued offline: the server hasn't derived the linked event yet, so
          // mirror it optimistically (ADR-0093) through the SAME applier a WS
          // echo uses — the timed booking shows its schedule + lands on the
          // timeline now, not only on reconnect. Same seed id → the echo reconciles
          // it in place on flush. Online the echo delivers it, so only queued needs it.
          if (!canonical && seed?.id) {
            applyEntityChange(
              bookingLinkedEventChange(
                optimistic,
                { ...seed, id: seed.id },
                { actorUserId: authorId, nowIso: stamp() },
                'create',
              ),
            );
          }
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
        const { event: seed, ...fields } = input;
        const merged = bookings.find((b) => b.id === bookingId);
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, ...fields } : b)));
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE_BOOKING, bookingId, input },
            () => apiUpdateBooking(tripId, bookingId, input),
          );
          if (canonical)
            setBookings((prev) => prev.map((b) => (b.id === bookingId ? canonical : b)));
          // Queued offline: mirror the linked event the update seeds (ADR-0093)
          // through the shared applier. The 'update' change carries only the seed's
          // schedule fields, so an existing linked event updates in place with its
          // status preserved, and a newly-timed booking gains one; the WS echo
          // reconciles on flush. Online the echo handles it.
          if (!canonical && seed?.id && merged) {
            applyEntityChange(
              bookingLinkedEventChange(
                { ...merged, ...fields },
                { ...seed, id: seed.id },
                { actorUserId: authorId, nowIso: stamp() },
                'update',
              ),
            );
          }
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
              verb: OUTBOX_VERB.DELETE_BOOKING,
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
      createPlace: async (input) => {
        const id = input.id ?? crypto.randomUUID();
        const withId = { ...input, id };
        const optimistic = {
          ...withId,
          tripId,
          createdAt: stamp(),
          updatedAt: stamp(),
          updatedBy: authorId,
        } as Place;
        const previous = places;
        setPlaces((prev) => [...prev, optimistic]);
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.CREATE_PLACE, input: withId },
            () => apiCreatePlace(tripId, withId),
          );
          if (canonical) setPlaces((prev) => prev.map((p) => (p.id === id ? canonical : p)));
        } catch (err) {
          setPlaces(previous);
          toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
        return id;
      },
      updatePlace: async (placeId, input) => {
        const previous = places;
        setPlaces((prev) => prev.map((p) => (p.id === placeId ? { ...p, ...input } : p)));
        try {
          const canonical = await restOrQueue(
            tripId,
            { verb: OUTBOX_VERB.UPDATE_PLACE, placeId, input },
            () => apiUpdatePlace(tripId, placeId, input),
          );
          if (canonical) setPlaces((prev) => prev.map((p) => (p.id === placeId ? canonical : p)));
        } catch (err) {
          setPlaces(previous);
          toast(ICONS.warn, t.toast.writeFailed);
          throw err;
        }
      },
      resolvePlace: async (input) => {
        // Online-only: no optimistic row (the FE can't produce coords/zone) and no
        // outbox (needs Google). Errors — offline, 429, a bad id — propagate to the
        // picker, which degrades softly (name-only fallback / retry cue, ADR-0110 §1).
        const place = await apiResolvePlace(tripId, input);
        // Adopt the canonical row now: replace it if present (dedup hit, or an
        // enriched Place-lite keeps its id) or append (a freshly minted place).
        setPlaces((prev) =>
          prev.some((p) => p.id === place.id)
            ? prev.map((p) => (p.id === place.id ? place : p))
            : [...prev, place],
        );
        return place;
      },
    };
  }, [tripId, bookings, places, toast, authorId, applyEntityChange]);

  const value = useMemo<TripContextValue>(
    () => ({
      trip,
      users: snapshot.users,
      members,
      bookings,
      places,
      documents,
      activeDate,
      setActiveDate,
      events: state.events,
      maybeItems: state.maybeItems,
      ripple: state.ripple,
      dispatch,
      settings,
      indexVerbs,
      changeFeed,
      dismissChange,
      clearChangeFeed,
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
      documents,
      settings,
      indexVerbs,
      changeFeed,
      dismissChange,
      clearChangeFeed,
      tripDeleted,
      usingCachedSnapshot,
      activeDate,
      setActiveDate,
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
