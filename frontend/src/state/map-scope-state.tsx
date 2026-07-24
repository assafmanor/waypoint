// Map-local "all days" scope (ADR-0110 §4). The app tracks exactly ONE active
// date (the `?day=` param) — "all days" is view state the Map owns, not a second
// source of truth. It lives in a tiny context lifted just above the trip Shell
// so two consumers can share it: the Map screen (owns + toggles it) and the
// header `DayStrip` (suppresses its filled selection while all-days is on). It is
// deliberately NOT synced and NOT in the URL.
import { createContext, useContext, useState, type ReactNode } from 'react';

interface MapScope {
  allDays: boolean;
  setAllDays: (value: boolean) => void;
}

const MapScopeContext = createContext<MapScope | null>(null);

export function MapScopeProvider({ children }: { children: ReactNode }) {
  const [allDays, setAllDays] = useState(false);
  return (
    <MapScopeContext.Provider value={{ allDays, setAllDays }}>{children}</MapScopeContext.Provider>
  );
}

export function useMapScope(): MapScope {
  const ctx = useContext(MapScopeContext);
  if (!ctx) throw new Error('useMapScope must be used within a MapScopeProvider');
  return ctx;
}
