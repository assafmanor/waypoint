// Active-trip context + optimistic local state. Verbs mutate immediately and
// return an inverse via one-slot undo (your last action only — ADR-0019).
// No API / Change-log / outbox here — those are T-014/T-013; dispatch is shaped
// so the reducer can be swapped for REST calls without touching the screens.
import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import {
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type MaybeItem,
  type TripEvent,
  type TripNote,
  type User,
} from '@waypoint/shared';
import { shiftIso } from '../lib/time';
import {
  ACTIVE_DATE,
  BOOKINGS,
  EVENTS,
  GLANCE,
  MAYBE_ITEMS,
  NOTES,
  TRIP,
  USERS,
  activeUserId,
} from '../fixtures';

export interface RippleSuggestion {
  movedTitle: string;
  candidates: { id: string; startsAt: string; endsAt?: string }[];
}

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
  | { type: 'UNDO' };

// Compare/sort by instant, never by string: a delayed event's startsAt is a
// Z-normalised ISO while fixtures carry an explicit offset — lexical compare
// across the two formats is wrong.
const ms = (iso?: string) => (iso ? Date.parse(iso) : 0);
const byStart = (a: TripEvent, b: TripEvent) =>
  ms(a.startsAt) - ms(b.startsAt) || a.sortOrder - b.sortOrder;

/** Following soft events on the same day that now overlap the moved event, up to
 *  the first hard anchor (hard events are never rippled — ADR-0011). */
function computeRipple(
  events: TripEvent[],
  moved: TripEvent,
  minutes: number,
): RippleSuggestion | null {
  if (moved.kind !== EVENT_KIND.SOFT || !moved.endsAt) return null;
  const following = events
    .filter(
      (e) =>
        e.date === moved.date &&
        e.status === EVENT_STATUS.PLANNED &&
        e.startsAt &&
        e.id !== moved.id,
    )
    .sort(byStart)
    .filter((e) => ms(e.startsAt) > ms(moved.startsAt));
  const candidates: RippleSuggestion['candidates'] = [];
  let prevEnd = ms(moved.endsAt);
  for (const e of following) {
    if (e.kind === EVENT_KIND.HARD) break;
    if (ms(e.startsAt) >= prevEnd) break;
    const startsAt = shiftIso(e.startsAt!, minutes);
    const endsAt = e.endsAt ? shiftIso(e.endsAt, minutes) : undefined;
    candidates.push({ id: e.id, startsAt, endsAt });
    prevEnd = ms(endsAt ?? startsAt);
  }
  return candidates.length ? { movedTitle: moved.title, candidates } : null;
}

function snapshot(s: State): Snapshot {
  return { events: s.events, maybeItems: s.maybeItems };
}

export function initialState(): State {
  return { events: EVENTS, maybeItems: MAYBE_ITEMS, ripple: null, undo: null };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STATUS': {
      const events = state.events.map((e) =>
        e.id === action.id ? { ...e, status: action.status } : e,
      );
      return { ...state, events, ripple: null, undo: snapshot(state) };
    }
    case 'DELAY': {
      let moved: TripEvent | undefined;
      const events = state.events.map((e) => {
        if (e.id !== action.id) return e;
        moved = {
          ...e,
          startsAt: e.startsAt ? shiftIso(e.startsAt, action.minutes) : e.startsAt,
          endsAt: e.endsAt ? shiftIso(e.endsAt, action.minutes) : e.endsAt,
        };
        return moved;
      });
      const ripple = moved ? computeRipple(events, moved, action.minutes) : null;
      return { ...state, events, ripple, undo: snapshot(state) };
    }
    case 'SCHEDULE': {
      const events = [...state.events, action.event];
      const maybeItems = state.maybeItems.map((m) =>
        m.id === action.maybeId ? { ...m, consumed: true } : m,
      );
      return { ...state, events, maybeItems, ripple: null, undo: snapshot(state) };
    }
    case 'RIPPLE_APPLY': {
      if (!state.ripple) return state;
      const moves = new Map(state.ripple.candidates.map((c) => [c.id, c]));
      const events = state.events.map((e) => {
        const m = moves.get(e.id);
        return m ? { ...e, startsAt: m.startsAt, endsAt: m.endsAt } : e;
      });
      return { ...state, events, ripple: null, undo: snapshot(state) };
    }
    case 'RIPPLE_DISMISS':
      return { ...state, ripple: null };
    case 'UNDO':
      return state.undo ? { ...state, ...state.undo, ripple: null, undo: null } : state;
    default:
      return state;
  }
}

interface TripContextValue {
  trip: typeof TRIP;
  users: User[];
  bookings: Booking[];
  notes: TripNote[];
  glance: typeof GLANCE;
  activeDate: string;
  activeUserId: string;
  events: TripEvent[];
  maybeItems: MaybeItem[];
  ripple: RippleSuggestion | null;
  dispatch: React.Dispatch<Action>;
}

const TripContext = createContext<TripContextValue | null>(null);

// ponytail: one seeded fixture trip; the tripId prop is the seam T-027 fills with
// a real switcher. Wrong id → still the demo trip, which is fine for now.
export function TripProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  void tripId;
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo<TripContextValue>(
    () => ({
      trip: TRIP,
      users: USERS,
      bookings: BOOKINGS,
      notes: NOTES,
      glance: GLANCE,
      activeDate: ACTIVE_DATE,
      activeUserId,
      events: state.events,
      maybeItems: state.maybeItems,
      ripple: state.ripple,
      dispatch,
    }),
    [state],
  );
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within <TripProvider>');
  return ctx;
}

export { byStart };
