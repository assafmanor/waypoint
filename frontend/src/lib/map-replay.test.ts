import { describe, expect, it } from 'vitest';
import { replayDayMs, replayStepMs, replayTotalMs, type ReplayDay } from './map-replay';
import { MAP_CAMERA_EASE, REPLAY } from '../constants';

const day = (n: number): ReplayDay => ({
  caption: `day ${n}`,
  stops: Array.from({ length: n }, (_, i) => ({
    placeId: `p${i}`,
    reach: `r${i}`,
    lat: 0,
    lng: 0,
  })),
});

describe('replay pacing (ADR-0241 §2)', () => {
  it('steps at 220ms, and shrinks the step so a day never lights for longer than 1320ms', () => {
    expect(replayStepMs(3)).toBe(REPLAY.STOP_STEP_MS);
    expect(replayStepMs(12)).toBe(REPLAY.STOPS_MAX_MS / 12);
    expect(12 * replayStepMs(12)).toBeLessThanOrEqual(REPLAY.STOPS_MAX_MS);
  });

  it('a day is the ease, its lighting and the 1000ms hold; the run ends by easing back', () => {
    expect(replayDayMs(4)).toBe(MAP_CAMERA_EASE.DURATION_MS + 4 * 220 + REPLAY.DAY_HOLD_MS);
    expect(replayTotalMs([day(4), day(2)])).toBe(
      replayDayMs(4) + replayDayMs(2) + MAP_CAMERA_EASE.DURATION_MS,
    );
  });
});
