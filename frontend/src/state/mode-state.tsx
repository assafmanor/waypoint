// Plan/Trip mode context (T-019, ADR-0016): derives mode from the active trip
// + real clock, applies a manual override. The override is session-only,
// in-memory state — not persisted — so the app always comes back to
// auto-derived on a fresh load; you can only ever peek "for now." T-053's
// Tier-3 gate reuses `setOverride` for its "Switch to Plan" action (ADR-0025).
//
// **And the first morning** (ADR-0221 §4). The going-live switch is armed only when the mode
// changes while the shell is mounted, and the automatic flip happens at trip-local midnight —
// so the product's one cinematic moment had never once been on screen for a real trip. This
// provider remembers the mode each trip was last SEEN in (`lib/mode-seen.ts`) and, on the
// first open of a live trip, holds the CHROME at plan for a beat before flipping it, so the
// shipped switch plays for real. `mode` is the truth (trip, from the first render, so Home is
// the board); `chromeMode` is what the chrome paints; `goingLive` is the stage Home's morph
// host reads. Nothing here animates — the Shell and the CSS do — it only keeps time.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTrip } from './trip-state';
import { useClock } from '../lib/useClock';
import { deriveMode, tripPhase, type Mode, type TripPhase } from '../lib/mode';
import { markModeSeen, shouldGoLive } from '../lib/mode-seen';
import { motionDurationMs, prefersReducedMotion } from '../lib/motion';
import { GOING_LIVE } from '../constants';

export const GOING_LIVE_STAGE = {
  /** The chrome is still plan; the plan face sits over a dormant board. */
  HOLD: 'hold',
  /** The chrome has flipped; the face fades and shrinks into the board, which then ignites. */
  MORPH: 'morph',
  /** Over. The host keeps its wrapper so the board is not remounted, and renders no face. */
  DONE: 'done',
} as const;
export type GoingLiveStage = (typeof GOING_LIVE_STAGE)[keyof typeof GOING_LIVE_STAGE];

export interface GoingLive {
  stage: GoingLiveStage;
  /** Ended by a tap: the chrome flips without arming the switch, so the skip is instant. */
  quiet: boolean;
}

interface ModeContextValue {
  mode: Mode;
  phase: TripPhase;
  override: Mode | null;
  setOverride: (mode: Mode | null) => void;
  /** What the chrome paints — `mode`, except during the first morning's hold. */
  chromeMode: Mode;
  goingLive: GoingLive | null;
  skipGoingLive: () => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const { trip, zoneEvidence } = useTrip();
  const now = useClock();
  const [override, setOverride] = useState<Mode | null>(null);
  // Switching trips (T-027) starts fresh — a peek on one trip shouldn't leak into another.
  useEffect(() => setOverride(null), [trip.id]);

  const phase = tripPhase(trip, now, zoneEvidence);
  // ADR-0040: Trip mode is a live-window-only state. While the trip is live the
  // override may peek *down* into Plan (edit the plan mid-trip); before it starts
  // and after it ends Plan is the only reachable mode, so a Trip-mode override is
  // never honored there — the board has no "now" to stand on.
  const mode: Mode = phase === 'live' ? (override ?? 'trip') : 'plan';

  // Decided at the FIRST render, synchronously, so the first paint is already plan chrome:
  // deciding in an effect would paint the trip chrome for a frame and then jump back.
  const [goingLive, setGoingLive] = useState<GoingLive | null>(() =>
    beginGoingLive(trip.id, deriveMode(trip, now, zoneEvidence)),
  );
  // A trip switch under a mounted provider re-asks the question for the new trip.
  const [seenTripId, setSeenTripId] = useState(trip.id);
  if (trip.id !== seenTripId) {
    setSeenTripId(trip.id);
    setGoingLive(beginGoingLive(trip.id, deriveMode(trip, now, zoneEvidence)));
  }
  // The sequence keeps time; a Plan peek mid-sequence ends it, since there is no board.
  useEffect(() => {
    if (!goingLive || goingLive.stage === GOING_LIVE_STAGE.DONE) return;
    if (mode !== 'trip') {
      setGoingLive({ stage: GOING_LIVE_STAGE.DONE, quiet: true });
      return;
    }
    const cinematic = motionDurationMs('--t-cinematic');
    const wait =
      goingLive.stage === GOING_LIVE_STAGE.HOLD
        ? GOING_LIVE.HOLD_MS
        : // The face fades over one cinematic; the board ignites after it and takes another.
          2 * cinematic + GOING_LIVE.BOARD_DELAY_MS + GOING_LIVE.TAIL_MS;
    const id = setTimeout(
      () =>
        setGoingLive((g) =>
          g && g.stage === GOING_LIVE_STAGE.HOLD
            ? { stage: GOING_LIVE_STAGE.MORPH, quiet: false }
            : g && g.stage === GOING_LIVE_STAGE.MORPH
              ? { stage: GOING_LIVE_STAGE.DONE, quiet: false }
              : g,
        ),
      wait,
    );
    return () => clearTimeout(id);
  }, [goingLive, mode]);
  // Remembered per trip: what was seen is what stops the first morning playing twice, and a
  // trip seen in plan again (a peek, or next year's trip) re-arms it for its own first day.
  useEffect(() => markModeSeen(trip.id, mode), [trip.id, mode]);

  const chromeMode: Mode =
    goingLive?.stage === GOING_LIVE_STAGE.HOLD && mode === 'trip' ? 'plan' : mode;
  const skipGoingLive = () =>
    setGoingLive((g) =>
      g && g.stage !== GOING_LIVE_STAGE.DONE ? { stage: GOING_LIVE_STAGE.DONE, quiet: true } : g,
    );

  return (
    <ModeContext.Provider
      value={{ mode, phase, override, setOverride, chromeMode, goingLive, skipGoingLive }}
    >
      {children}
    </ModeContext.Provider>
  );
}

/** The first open of a live trip on this install plays the sequence — unless motion is
 *  reduced, where the mode is simply trip from the first frame (ADR-0140 §5: a state that
 *  exists only during an animation must resolve when there is none). */
function beginGoingLive(tripId: string, mode: Mode): GoingLive | null {
  if (!shouldGoLive(tripId, mode) || prefersReducedMotion()) return null;
  return { stage: GOING_LIVE_STAGE.HOLD, quiet: false };
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within <ModeProvider>');
  return ctx;
}
