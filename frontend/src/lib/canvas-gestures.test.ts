// The one-finger zoom's recogniser (ADR-0145 §1/§4), as a table with no renderer and no DOM.
//
// This file is the reason the gesture is not a human-pass-only change. Five sessions
// (115/116/119/122/125) got a drag wrong in this repo, and the recurring shape was that
// every test agreed the broken version was fine — so what is asserted here is the phase
// LADDER and the arbitration outcome, not just the arithmetic.
import { describe, expect, it } from 'vitest';
import {
  DRAG_ZOOM_ACTION,
  DRAG_ZOOM_EVENT,
  DRAG_ZOOM_PHASE,
  IDLE_DRAG_ZOOM,
  dragZoomLimits,
  doubleTapZoom,
  zoomAboutPoint,
  reduceDragZoom,
  zoomPerLevelPx,
  type DragZoomEventType,
  type DragZoomState,
} from './canvas-gestures';
import { MAP_DRAG_ZOOM, MAP_ZOOM } from '../constants';

const LIMITS = { perLevelPx: 100, min: 2, max: 21 };
const AT = 14;

/** Drive a sequence of events through the machine, collecting what each one asked for. */
function run(
  events: readonly [DragZoomEventType, number, number, number][],
  opts: { zoom?: number | null; limits?: typeof LIMITS; from?: DragZoomState } = {},
) {
  let state = opts.from ?? IDLE_DRAG_ZOOM;
  const actions: string[] = [];
  const zooms: number[] = [];
  for (const [type, x, y, t] of events) {
    const step = reduceDragZoom(
      state,
      { type, x, y, t },
      opts.zoom === undefined ? AT : opts.zoom,
      opts.limits ?? LIMITS,
    );
    state = step.state;
    actions.push(step.action);
    if (step.action === DRAG_ZOOM_ACTION.ZOOM) zooms.push(step.zoom);
  }
  return { state, actions, zooms };
}

const D = DRAG_ZOOM_EVENT.DOWN;
const M = DRAG_ZOOM_EVENT.MOVE;
const U = DRAG_ZOOM_EVENT.UP;
const C = DRAG_ZOOM_EVENT.CANCEL;

describe('reduceDragZoom — what the renderer gets and what we take', () => {
  it('passes a single tap straight through, so a canvas tap is untouched', () => {
    // The whole of phase A: nothing is armed, nothing is intercepted. If this ever returns
    // anything but PASS, a plain tap on the canvas stops clearing the selection.
    const { actions } = run([
      [D, 50, 50, 0],
      [U, 50, 50, 80],
    ]);
    expect(actions).toEqual([DRAG_ZOOM_ACTION.PASS, DRAG_ZOOM_ACTION.PASS]);
  });

  it('arms on a second tap inside the window, and that press is the only thing taken', () => {
    const { actions, state } = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 52, 51, 160],
    ]);
    expect(actions).toEqual([DRAG_ZOOM_ACTION.PASS, DRAG_ZOOM_ACTION.PASS, DRAG_ZOOM_ACTION.ARM]);
    expect(state.phase).toBe(DRAG_ZOOM_PHASE.ARMED);
    expect(state.startZoom).toBe(AT);
  });

  it('does NOT arm when the second tap is too late, or too far away', () => {
    const late = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 60 + MAP_DRAG_ZOOM.TAP_GAP_MS + 1],
    ]);
    expect(late.actions.at(-1)).toBe(DRAG_ZOOM_ACTION.PASS);

    const far = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50 + MAP_DRAG_ZOOM.TAP_SLOP_PX + 1, 50, 120],
    ]);
    expect(far.actions.at(-1)).toBe(DRAG_ZOOM_ACTION.PASS);
  });

  it('stays provisional below the slop, and releasing there owes a step-zoom', () => {
    // Phase B is undecided on purpose: a double-tap must still zoom, because intercepting
    // the gesture suppressed the renderer's own (§2). This is that debt.
    const { actions } = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 120],
      [M, 50, 50 + MAP_DRAG_ZOOM.DRAG_SLOP_PX - 1, 130],
      [U, 50, 50, 140],
    ]);
    expect(actions.slice(2)).toEqual([
      DRAG_ZOOM_ACTION.ARM,
      DRAG_ZOOM_ACTION.ARM,
      DRAG_ZOOM_ACTION.STEP,
    ]);
  });

  it('a CANCELLED provisional gesture owes nothing — the platform took it, it was not a tap', () => {
    const { actions } = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 120],
      [C, 50, 50, 130],
    ]);
    expect(actions.at(-1)).toBe(DRAG_ZOOM_ACTION.PASS);
  });

  it('commits past the slop WITHOUT jumping by it — the first zoom of a gesture is the smallest', () => {
    const { zooms } = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 120],
      [M, 50, 50 + MAP_DRAG_ZOOM.DRAG_SLOP_PX + 1, 130],
    ]);
    // Committing consumes the slop rather than spending it as zoom.
    expect(zooms).toEqual([AT]);
  });

  it('DOWN zooms in and UP zooms out (owner’s call, 2026-07-30)', () => {
    const armed: DragZoomState = {
      ...IDLE_DRAG_ZOOM,
      phase: DRAG_ZOOM_PHASE.ZOOMING,
      lastY: 100,
      startZoom: AT,
      levels: 0,
    };
    // 100px down at 100px/level is one level IN.
    expect(run([[M, 50, 200, 10]], { from: armed }).zooms).toEqual([AT + 1]);
    // And the same travel up is one level OUT. If this pair ever swaps, the gesture is
    // inverted and no other test in this file would notice.
    expect(run([[M, 50, 0, 10]], { from: armed }).zooms).toEqual([AT - 1]);
  });

  it('accumulates INCREMENTALLY and clamps every step, so reversing at the ceiling responds at once', () => {
    // The bug this shape exists to avoid (§4): clamping the TARGET from total travel means
    // dragging ten levels past the ceiling and back one does nothing for nine levels.
    const armed: DragZoomState = {
      ...IDLE_DRAG_ZOOM,
      phase: DRAG_ZOOM_PHASE.ZOOMING,
      lastY: 0,
      startZoom: 20,
      levels: 0,
    };
    // Ten levels down (in) from 20, against a ceiling of 21: saturates at 21.
    const saturated = run([[M, 50, 1000, 10]], { from: armed });
    expect(saturated.zooms).toEqual([21]);
    // Now one level back up. A target-clamped implementation would still read 21.
    const back = run([[M, 50, 900, 20]], { from: saturated.state });
    expect(back.zooms).toEqual([20]);
  });

  it('clamps at the floor the same way', () => {
    const armed: DragZoomState = {
      ...IDLE_DRAG_ZOOM,
      phase: DRAG_ZOOM_PHASE.ZOOMING,
      lastY: 1000,
      startZoom: 3,
      levels: 0,
    };
    const saturated = run([[M, 50, 0, 10]], { from: armed });
    expect(saturated.zooms).toEqual([LIMITS.min]);
    expect(run([[M, 50, 100, 20]], { from: saturated.state }).zooms).toEqual([3]);
  });

  it('releasing a committed drag asks for the click to be swallowed', () => {
    const armed: DragZoomState = {
      ...IDLE_DRAG_ZOOM,
      phase: DRAG_ZOOM_PHASE.ZOOMING,
      lastY: 100,
      startZoom: AT,
      levels: 1,
    };
    expect(run([[U, 50, 200, 10]], { from: armed }).actions).toEqual([DRAG_ZOOM_ACTION.SETTLE]);
  });

  it('a PAN cannot become the first tap of a double-tap', () => {
    // Without the travel test on release, a tap landing near where a one-finger pan ended
    // would arm the zoom — 24px and 300ms is a lot of real taps.
    const { actions } = run([
      [D, 50, 50, 0],
      [M, 50, 300, 40],
      [U, 50, 300, 80],
      [D, 52, 302, 140],
    ]);
    expect(actions.at(-1)).toBe(DRAG_ZOOM_ACTION.PASS);
  });

  it('a THIRD tap does not re-arm off the same first one', () => {
    const armed = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 120],
    ]);
    expect(armed.actions.at(-1)).toBe(DRAG_ZOOM_ACTION.ARM);
    // Release (a step-zoom), then press again inside the window: the pairing is spent.
    const after = run(
      [
        [U, 50, 50, 160],
        [D, 50, 50, 200],
      ],
      { from: armed.state },
    );
    expect(after.actions).toEqual([DRAG_ZOOM_ACTION.STEP, DRAG_ZOOM_ACTION.PASS]);
  });

  it('a SECOND full gesture behaves exactly like the first (session 122’s class of miss)', () => {
    // Every e2e in `shelf-drag.spec.ts` booted cold and touched its target once, and a real
    // session never does — which is how a gesture that broke on attempt two passed
    // everything. So: drive a complete double-tap-drag, then do it again on the same state.
    const first = run([
      [D, 50, 50, 0],
      [U, 50, 50, 60],
      [D, 50, 50, 120],
      [M, 50, 150, 140],
      [U, 50, 150, 160],
    ]);
    expect(first.actions.at(-1)).toBe(DRAG_ZOOM_ACTION.SETTLE);

    const second = run(
      [
        [D, 50, 50, 400],
        [U, 50, 50, 460],
        [D, 50, 50, 520],
        [M, 50, 150, 540],
        [U, 50, 150, 560],
      ],
      { from: first.state },
    );
    expect(second.actions).toEqual([
      DRAG_ZOOM_ACTION.PASS,
      DRAG_ZOOM_ACTION.PASS,
      DRAG_ZOOM_ACTION.ARM,
      DRAG_ZOOM_ACTION.ZOOM,
      DRAG_ZOOM_ACTION.SETTLE,
    ]);
  });

  it('arms nothing when the map has no camera yet', () => {
    // A gesture against an unknown origin has nothing to zoom FROM, so it must pass rather
    // than seed itself from a guess.
    const { actions } = run(
      [
        [D, 50, 50, 0],
        [U, 50, 50, 60],
        [D, 50, 50, 120],
      ],
      { zoom: null },
    );
    expect(actions.at(-1)).toBe(DRAG_ZOOM_ACTION.PASS);
  });
});

describe('zoomPerLevelPx — the device pass corrected the MODEL, not the number', () => {
  // THE BUG (2026-07-30): sensitivity was a share of the pane's height, so a taller canvas
  // demanded MORE finger travel per level — 250px at the map extreme against 122px at
  // `half`. Reported as "the more space the map takes of the screen, the more the drag
  // feels slow". The three heights below are the ones this epic has actually measured.
  const MAP_EXTREME = 501; // owner's phone, session 143
  const HALF = 243; // 390x844 at the 0.56 sheet fraction
  const SHORT_HALF = 160; // 360x640 at `half`, ADR-0126's measurement

  it('NEVER gets heavier than the calibrated feel, however tall the canvas', () => {
    // The property that would have caught it: no canvas, at any size, may demand MORE
    // finger travel per level than the stop the owner calibrated on. A taller canvas
    // getting lighter is fine (that is the cap); getting heavier is the bug.
    for (let h = 100; h <= 1200; h += 50) {
      expect(zoomPerLevelPx(h)).toBeLessThanOrEqual(MAP_DRAG_ZOOM.PX_PER_LEVEL);
    }
    // And the reported case specifically: the map extreme is no heavier than `half`.
    expect(zoomPerLevelPx(MAP_EXTREME)).toBeLessThanOrEqual(zoomPerLevelPx(HALF));
  });

  it('holds `half`’s calibrated feel and applies it at the map extreme too', () => {
    // `half` is the stop the owner calibrated on, so it is the one that must not move —
    // and the map extreme now matches it instead of being 2x heavier.
    expect(zoomPerLevelPx(HALF)).toBe(MAP_DRAG_ZOOM.PX_PER_LEVEL);
    expect(zoomPerLevelPx(MAP_EXTREME)).toBe(MAP_DRAG_ZOOM.PX_PER_LEVEL);
  });

  it('caps on a SHORT canvas, so a flat distance cannot ask for most of it', () => {
    // The cap is the only place the canvas still enters the calculation. At 160px a flat
    // 120 would be 75% of the canvas per level — worse than before the fix, for the one
    // device that could least afford it.
    expect(zoomPerLevelPx(SHORT_HALF)).toBe(SHORT_HALF * MAP_DRAG_ZOOM.MAX_SHARE);
    expect(zoomPerLevelPx(SHORT_HALF)).toBeLessThan(MAP_DRAG_ZOOM.PX_PER_LEVEL);
  });

  it('floors an unlaid-out pane rather than becoming infinitely sensitive', () => {
    expect(zoomPerLevelPx(0)).toBeGreaterThan(0);
  });

  it('prefers the map’s own bounds and falls back to ours', () => {
    // The map states neither here on purpose (ADR-0128 §1 keeps the pinch unbounded), so
    // the fallback is the normal path — but if it ever states them, this gesture must be
    // bounded exactly as the pinch is.
    expect(dragZoomLimits(500, 5, 18)).toMatchObject({ min: 5, max: 18 });
    expect(dragZoomLimits(500, null, undefined)).toMatchObject({
      min: MAP_DRAG_ZOOM.MIN,
      max: MAP_DRAG_ZOOM.MAX,
    });
  });
});

describe('doubleTapZoom — one level from wherever you are', () => {
  // THE BUG (2026-07-30): this reused `zoomStepIn`, which is LOCATE's ladder. Its
  // `current < floor` branch returns the floor outright, so a double-tap on a globe view
  // jumped straight to city zoom (14) instead of stepping. Reported as "it really doesn't
  // matter how zoomed out you are, it zooms in really a lot".
  it('steps ONE level from a wide view instead of jumping to a readable zoom', () => {
    expect(doubleTapZoom(MAP_ZOOM.WORLD)).toBe(MAP_ZOOM.WORLD + 1);
    // The regression, named: locate's floor is PLACE, and a double-tap must not land there.
    expect(doubleTapZoom(MAP_ZOOM.WORLD)).toBeLessThan(MAP_ZOOM.PLACE);
  });

  it('steps one level from anywhere else, and stops at the gesture’s own ceiling', () => {
    expect(doubleTapZoom(14)).toBe(15);
    // Locate stops at STEP_IN_MAX; a double-tap goes as deep as a pinch can.
    expect(doubleTapZoom(MAP_ZOOM.STEP_IN_MAX)).toBe(MAP_ZOOM.STEP_IN_MAX + 1);
    expect(doubleTapZoom(MAP_DRAG_ZOOM.MAX)).toBe(MAP_DRAG_ZOOM.MAX);
    expect(doubleTapZoom(MAP_DRAG_ZOOM.MAX + 5)).toBe(MAP_DRAG_ZOOM.MAX);
  });
});

describe('zoomAboutPoint — the tapped point stays put', () => {
  // Pure scale arithmetic in the renderer's world space. The invariant is stated the way the
  // derivation states it: the tapped point's world position must be reachable from the NEW
  // centre at the NEW zoom using the SAME screen offset.
  const invariant = (offset: { x: number; y: number }, from: number, to: number) => {
    const centre = { x: 128, y: 128 };
    const next = zoomAboutPoint(centre, offset, from, to);
    const tapBefore = { x: centre.x + offset.x / 2 ** from, y: centre.y + offset.y / 2 ** from };
    const tapAfter = { x: next.x + offset.x / 2 ** to, y: next.y + offset.y / 2 ** to };
    expect(tapAfter.x).toBeCloseTo(tapBefore.x, 12);
    expect(tapAfter.y).toBeCloseTo(tapBefore.y, 12);
  };

  it('holds for a tap off-centre in every quadrant, zooming in', () => {
    for (const offset of [
      { x: 120, y: 80 },
      { x: -120, y: 80 },
      { x: 120, y: -80 },
      { x: -120, y: -80 },
    ]) {
      invariant(offset, 14, 15);
    }
  });

  it('holds at a globe zoom and at a deep one, and when zooming OUT', () => {
    invariant({ x: 100, y: -60 }, 2, 3);
    invariant({ x: 100, y: -60 }, 19, 20);
    invariant({ x: 100, y: -60 }, 15, 14);
  });

  it('moves the centre TOWARD the tap when zooming in', () => {
    // Sign check, which is the one thing an invariant that holds symmetrically cannot catch:
    // a flipped axis satisfies "stays put" against its own flipped derivation.
    const next = zoomAboutPoint({ x: 128, y: 128 }, { x: 256, y: 256 }, 14, 15);
    expect(next.x).toBeGreaterThan(128);
    expect(next.y).toBeGreaterThan(128);
  });

  it('is a no-op for a tap dead centre', () => {
    expect(zoomAboutPoint({ x: 128, y: 128 }, { x: 0, y: 0 }, 14, 15)).toEqual({ x: 128, y: 128 });
  });
});
