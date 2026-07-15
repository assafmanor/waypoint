// Plan/Trip mode context (T-019, ADR-0016): derives mode from the active trip
// + real clock, applies a manual override. The override is session-only,
// in-memory state — not persisted — so the app always comes back to
// auto-derived on a fresh load; you can only ever peek "for now." T-053's
// Tier-3 gate reuses `setOverride` for its "Switch to Plan" action (ADR-0025).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTrip } from './trip-state';
import { useClock } from '../lib/useClock';
import { tripPhase, type Mode, type TripPhase } from '../lib/mode';

interface ModeContextValue {
  mode: Mode;
  phase: TripPhase;
  override: Mode | null;
  setOverride: (mode: Mode | null) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const { trip } = useTrip();
  const now = useClock();
  const [override, setOverride] = useState<Mode | null>(null);
  // Switching trips (T-027) starts fresh — a peek on one trip shouldn't leak into another.
  useEffect(() => setOverride(null), [trip.id]);

  const phase = tripPhase(trip, now);
  // ADR-0040: Trip mode is a live-window-only state. While the trip is live the
  // override may peek *down* into Plan (edit the plan mid-trip); before it starts
  // and after it ends Plan is the only reachable mode, so a Trip-mode override is
  // never honored there — the board has no "now" to stand on.
  const mode: Mode = phase === 'live' ? (override ?? 'trip') : 'plan';

  return (
    <ModeContext.Provider value={{ mode, phase, override, setOverride }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within <ModeProvider>');
  return ctx;
}
