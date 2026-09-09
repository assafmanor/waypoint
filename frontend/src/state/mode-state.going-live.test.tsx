// @vitest-environment jsdom
// **The first morning** (ADR-0221 §4): the going-live switch used to be armed only when the
// mode changed while the shell was mounted, and the automatic flip happens at midnight — so
// it never played. The provider now holds the CHROME at plan on the first open of a live
// trip and then flips it, remembering per trip what was seen so it plays once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ModeProvider, useMode, GOING_LIVE_STAGE } from './mode-state';
import { setSimulatedNow } from '../lib/useClock';
import { GOING_LIVE } from '../constants';

const TRIP = {
  id: 't1',
  startDate: '2026-09-11',
  endDate: '2026-09-22',
  timezone: 'Asia/Jerusalem',
};
vi.mock('./trip-state', () => ({ useTrip: () => ({ trip: TRIP, zoneEvidence: undefined }) }));

let reduced = false;
const CINEMATIC = 600;
vi.mock('../lib/motion', () => ({
  motionDurationMs: () => (reduced ? 0 : CINEMATIC),
  prefersReducedMotion: () => reduced,
}));

let seen: ReturnType<typeof useMode> | null = null;
function Probe() {
  seen = useMode();
  return null;
}
const show = () =>
  render(
    <ModeProvider>
      <Probe />
    </ModeProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  reduced = false;
  // 05:00 on day 1 at home: the trip is live from midnight, and this is the first open.
  setSimulatedNow(Date.parse('2026-09-11T02:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setSimulatedNow(null);
});

describe('the first open of a live trip', () => {
  it('holds the chrome at plan, then flips it, then finishes — and the mode is trip throughout', () => {
    show();
    expect(seen!.mode).toBe('trip');
    expect(seen!.chromeMode).toBe('plan');
    expect(seen!.goingLive).toEqual({ stage: GOING_LIVE_STAGE.HOLD, quiet: false });

    act(() => vi.advanceTimersByTime(GOING_LIVE.HOLD_MS));
    expect(seen!.chromeMode).toBe('trip');
    expect(seen!.goingLive?.stage).toBe(GOING_LIVE_STAGE.MORPH);

    act(() =>
      vi.advanceTimersByTime(2 * CINEMATIC + GOING_LIVE.BOARD_DELAY_MS + GOING_LIVE.TAIL_MS),
    );
    expect(seen!.goingLive?.stage).toBe(GOING_LIVE_STAGE.DONE);
    expect(seen!.goingLive?.quiet).toBe(false);
    expect(seen!.chromeMode).toBe('trip');
  });

  it('plays once: the second open of the same trip is simply live', () => {
    show();
    cleanup();
    show();
    expect(seen!.goingLive).toBeNull();
    expect(seen!.chromeMode).toBe('trip');
  });

  it('a tap ends it at once, quietly, so the Shell arms no switch', () => {
    show();
    act(() => seen!.skipGoingLive());
    expect(seen!.goingLive).toEqual({ stage: GOING_LIVE_STAGE.DONE, quiet: true });
    expect(seen!.chromeMode).toBe('trip');
  });

  // ADR-0140 §5: a state that exists only during an animation must resolve when there is none.
  it('never starts under reduced motion', () => {
    reduced = true;
    show();
    expect(seen!.goingLive).toBeNull();
    expect(seen!.chromeMode).toBe('trip');
  });

  // The clock's zero, live: the app is open at 23:59:59 on the eve and the day turns.
  it('plays from the zero when the day turns while the app is open, with the longer hold', () => {
    setSimulatedNow(Date.parse('2026-09-10T20:59:59Z'));
    show();
    expect(seen!.mode).toBe('plan');
    expect(seen!.goingLive).toBeNull();

    // Jerusalem midnight is 21:00Z: the derived mode turns under a mounted provider.
    act(() => setSimulatedNow(Date.parse('2026-09-10T21:00:00Z')));
    expect(seen!.mode).toBe('trip');
    expect(seen!.chromeMode).toBe('plan');
    expect(seen!.goingLive).toEqual({ stage: GOING_LIVE_STAGE.HOLD, quiet: false, zero: true });

    act(() => vi.advanceTimersByTime(GOING_LIVE.HOLD_MS));
    expect(seen!.goingLive?.stage, 'the zero breathes longer than a first-open hold').toBe(
      GOING_LIVE_STAGE.HOLD,
    );
    act(() => vi.advanceTimersByTime(GOING_LIVE.ZERO_HOLD_MS - GOING_LIVE.HOLD_MS));
    expect(seen!.chromeMode).toBe('trip');
    expect(seen!.goingLive?.stage).toBe(GOING_LIVE_STAGE.MORPH);
  });

  it('does not play before the trip is live', () => {
    setSimulatedNow(Date.parse('2026-09-10T12:00:00Z'));
    show();
    expect(seen!.mode).toBe('plan');
    expect(seen!.goingLive).toBeNull();
  });
});
