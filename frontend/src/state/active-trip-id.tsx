// Per-device override, not synced (ADR-0021), same class as the mode override
// (state/mode-state.tsx). `setTripId` is the seam T-027's switcher calls into.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';
import { TRIP_PARAM } from './nav-state';

interface ActiveTripIdContextValue {
  tripId: string | null;
  // Whether `tripId` was chosen by an explicit pick *this session* (tapping a
  // trip on /trips, creating, or joining) vs. restored from a prior session.
  // A manual pick is honored on landing regardless of whether the trip is live;
  // a restored value defers to the ADR-0033 live-trip landing rule (App.tsx).
  // In-memory (not persisted), so a fresh app launch always starts unpicked —
  // that's exactly what makes a reopen a "cold load" for the landing rule.
  pickedThisSession: boolean;
  setTripId: (tripId: string) => void;
}

const ActiveTripIdContext = createContext<ActiveTripIdContextValue | null>(null);

/**
 * **`?trip=<id>` — the one thing that can name a trip from OUTSIDE the app** (notifications,
 * ADR-0197 §6).
 *
 * Every other deep-link param says what to open *within* the active trip; none of them could
 * say *which* trip, because this value has only ever come from `localStorage`. That was
 * invisible while every way in was a tap inside the app, and it is a wrong-answer bug the
 * moment a notification arrives: a reminder about the Japan trip, tapped while Iceland is
 * active, opened Iceland's day.
 *
 * Read from `window.location` rather than through the router, because this provider sits
 * above it — and read ONCE, in the initializer, so it behaves exactly like the stored value
 * it stands in for. It also counts as a **pick**: somebody chose this trip by tapping a
 * notification about it, which is as explicit as tapping it on `/trips`, so ADR-0033's
 * live-trip landing rule must not override it.
 */
function tripFromUrl(): string | null {
  try {
    // `|| null`, not the raw value: a bare `?trip=` parses to the empty STRING, which is not
    // null and would therefore win over the stored value and blank the active trip. Absent
    // and empty mean the same thing here.
    return new URLSearchParams(window.location.search).get(TRIP_PARAM) || null;
  } catch {
    return null;
  }
}

export function ActiveTripIdProvider({ children }: { children: ReactNode }) {
  const fromUrl = tripFromUrl();
  const [tripId, setTripIdState] = useState(
    () => fromUrl ?? localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY),
  );
  // A trip named in the URL is a pick, so a notification about a not-yet-live trip still
  // lands on it rather than being redirected by the landing rule.
  const [pickedThisSession, setPickedThisSession] = useState(fromUrl !== null);

  // Persist it like any other pick, so the next cold launch reopens where the notification
  // took them. In an effect rather than the initializer: a `useState` initializer must stay
  // free of side effects, and Strict Mode runs it twice.
  useEffect(() => {
    if (fromUrl) localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, fromUrl);
  }, [fromUrl]);

  const setTripId = (id: string) => {
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, id);
    setTripIdState(id);
    setPickedThisSession(true);
  };

  return (
    <ActiveTripIdContext.Provider value={{ tripId, pickedThisSession, setTripId }}>
      {children}
    </ActiveTripIdContext.Provider>
  );
}

export function useActiveTripId() {
  const ctx = useContext(ActiveTripIdContext);
  if (!ctx) throw new Error('useActiveTripId must be used within <ActiveTripIdProvider>');
  return ctx;
}
