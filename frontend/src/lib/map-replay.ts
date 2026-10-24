// Replay's pacing (ADR-0241 §2), as pure functions so the timeline is testable without a map.
import { MAP_CAMERA_EASE, REPLAY } from '../constants';

/** One stop a replay lights: the place's pin, and the key of the journey leg arriving at it
 *  (`MapDayLeg.reach`), so the segment appears with the stop it reaches. */
export interface ReplayStop {
  placeId: string;
  reach: string;
  lat: number;
  lng: number;
}

/** One day with a record, in `buildDayStopSequence` order. */
export interface ReplayDay {
  caption: string;
  stops: readonly ReplayStop[];
}

/** The key a leg and a replay stop share: the day and the place it reaches. */
export const replayReach = (date: string, placeId: string): string => `${date}|${placeId}`;

/** The gap between two stops lighting: `STOP_STEP_MS`, shrunk so a crowded day's lighting stays
 *  within `STOPS_MAX_MS`. */
export function replayStepMs(stops: number): number {
  return Math.min(REPLAY.STOP_STEP_MS, REPLAY.STOPS_MAX_MS / Math.max(stops, 1));
}

/** One day's length: the ease in, its stops lighting, and the hold. */
export function replayDayMs(stops: number): number {
  return MAP_CAMERA_EASE.DURATION_MS + stops * replayStepMs(stops) + REPLAY.DAY_HOLD_MS;
}

/** The whole run, including the ease back to the journey at the end. */
export function replayTotalMs(days: readonly ReplayDay[]): number {
  return (
    days.reduce((sum, day) => sum + replayDayMs(day.stops.length), 0) + MAP_CAMERA_EASE.DURATION_MS
  );
}
