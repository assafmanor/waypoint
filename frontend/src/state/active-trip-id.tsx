// Per-device override, not synced (ADR-0021), same class as the mode override
// (state/mode-state.tsx). `setTripId` is the seam T-027's switcher calls into.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';

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

export function ActiveTripIdProvider({ children }: { children: ReactNode }) {
  const [tripId, setTripIdState] = useState(() => localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY));
  const [pickedThisSession, setPickedThisSession] = useState(false);

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
