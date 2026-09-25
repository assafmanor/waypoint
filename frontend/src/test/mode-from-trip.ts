// A `useMode` for specs that mock `useTrip` and mount a screen without `ModeProvider`: the
// phase comes from the same `tripPhase` the provider calls, over the mocked trip and the
// pinned clock, so a screen reading `useMode().phase` behaves as it would in the app.
//
//   vi.mock('../state/mode-state', () => import('../test/mode-from-trip'));
import { tripPhase } from '../lib/mode';
import { useClock } from '../lib/useClock';
import { useTrip } from '../state/trip-state';

export function useMode() {
  const { trip, zoneEvidence, events } = useTrip();
  const phase = tripPhase(trip, useClock(), zoneEvidence, events);
  const mode = phase === 'live' ? 'trip' : 'plan';
  return {
    mode,
    phase,
    isFinished: phase === 'past',
    override: null,
    setOverride: () => {},
    chromeMode: mode,
    goingLive: null,
    skipGoingLive: () => {},
  };
}
