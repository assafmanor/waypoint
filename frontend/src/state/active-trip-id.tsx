// Per-device override, not synced (ADR-0021), same class as the mode override
// (state/mode-state.tsx). `setTripId` is the seam T-027's switcher calls into.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { ACTIVE_TRIP_STORAGE_KEY } from '../constants';

interface ActiveTripIdContextValue {
  tripId: string | null;
  setTripId: (tripId: string) => void;
}

const ActiveTripIdContext = createContext<ActiveTripIdContextValue | null>(null);

export function ActiveTripIdProvider({ children }: { children: ReactNode }) {
  const [tripId, setTripIdState] = useState(() => localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY));

  const setTripId = (id: string) => {
    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, id);
    setTripIdState(id);
  };

  return (
    <ActiveTripIdContext.Provider value={{ tripId, setTripId }}>
      {children}
    </ActiveTripIdContext.Provider>
  );
}

export function useActiveTripId() {
  const ctx = useContext(ActiveTripIdContext);
  if (!ctx) throw new Error('useActiveTripId must be used within <ActiveTripIdProvider>');
  return ctx;
}
