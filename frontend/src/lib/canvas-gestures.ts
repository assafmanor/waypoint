// The canvas's gesture recogniser, as pure arithmetic — the one-finger zoom (ADR-0145
// §1/§4) and the long press that drops a pin (ADR-0147 §1).
//
// **All of the gestures' decisions live here, with no renderer and no DOM**, which is what
// makes a gesture this repo has got wrong five times (sessions 115/116/119/122/125)
// testable as a table instead of by feel. `useCanvasGestures.ts` is the thin imperative half
// that feeds it pointer events and hands its actions to the camera.
//
// **Both gestures are in ONE machine, and that is the arbitration** (ADR-0147 §1). The zoom
// arms on a `DOWN` that PAIRS with a previous tap; a long press is a single `DOWN` that does
// not. So a tap-then-hold is a zoom and a hold is a drop, decided by two arms of one
// conditional rather than by two recognisers negotiating. A second capture-phase pipeline on
// this pane would not merely duplicate — it would race for one pointer id and one click
// swallow.
//
// Three phases, because the middle one is genuinely undecided (§1):
//
//   IDLE    → a tap passes straight through. The renderer gets it and a canvas tap still
//             clears the selection. Nothing is armed: arming on the FIRST tap would make
//             every tap on the canvas pay for a gesture almost nobody is making, and it is
//             the eager recognition that steals the pan.
//   ARMED   → a second press inside the double-tap window. The only moment anything is
//             taken from the renderer, and it is PROVISIONAL: released here this is an
//             ordinary double-tap and still owes a zoom.
//   ZOOMING → the finger passed the slop. Committed.
import { DRAG_HOLD_SLOP_PX, MAP_DRAG_ZOOM } from '../constants';
import { TUNE, tune } from './dev-tuning';

export const DRAG_ZOOM_PHASE = {
  IDLE: 'idle',
  ARMED: 'armed',
  ZOOMING: 'zooming',
} as const;
export type DragZoomPhase = (typeof DRAG_ZOOM_PHASE)[keyof typeof DRAG_ZOOM_PHASE];

/** What the caller should do about this event. Named rather than inferred from the phase,
 *  because two of them fire on the SAME transition out of `ARMED` and the difference is
 *  the whole of §2's repayment. */
export const DRAG_ZOOM_ACTION = {
  /** Not ours. Let it reach the renderer. */
  PASS: 'pass',
  /** Intercept from here on, but change nothing yet. */
  ARM: 'arm',
  /** Committed: apply `zoom`. */
  ZOOM: 'zoom',
  /** Released without ever moving — an ordinary double-tap. We suppressed the renderer's, so
   *  we owe it one eased step in (§2). */
  STEP: 'step',
  /** Released after zooming: the drag is over and the click it fires must be swallowed. */
  SETTLE: 'settle',
  /** A press was held still for `DRAG_HOLD_MS` without pairing into a zoom: drop a pin at
   *  the press point (ADR-0147 §1). Like `SETTLE` it owes a click swallow — the release
   *  that follows would otherwise reach `onCanvasTap` and clear the card just opened. */
  DROP: 'drop',
} as const;
export type DragZoomAction = (typeof DRAG_ZOOM_ACTION)[keyof typeof DRAG_ZOOM_ACTION];

export const DRAG_ZOOM_EVENT = {
  DOWN: 'down',
  MOVE: 'move',
  UP: 'up',
  CANCEL: 'cancel',
  /** **Synthetic** — the imperative half's hold timer, not a pointer event (ADR-0147 §1).
   *  A hold is the ABSENCE of anything for `DRAG_HOLD_MS`, and a reducer over
   *  `(type, x, y, t)` cannot observe absence; feeding it as an event is what keeps every
   *  branch here a table the suite can drive. */
  HOLD: 'hold',
} as const;
export type DragZoomEventType = (typeof DRAG_ZOOM_EVENT)[keyof typeof DRAG_ZOOM_EVENT];

export interface DragZoomEvent {
  type: DragZoomEventType;
  x: number;
  y: number;
  /** `event.timeStamp`, never `Date.now()` — the double-tap window is measured in the
   *  same clock the events are stamped in. */
  t: number;
}

export interface DragZoomState {
  phase: DragZoomPhase;
  /** When the last completed tap ended, and where. Together they are the double-tap
   *  window; `null` means there is no tap to pair with. */
  tapAt: number;
  tapX: number;
  tapY: number;
  hasTap: boolean;
  /** Is a finger down right now on an UNPAIRED press — i.e. is a long press still
   *  possible? (ADR-0147 §1.) It is not derivable from `phase`: an unpaired press leaves
   *  the machine in `IDLE`, deliberately, because arming on a first tap is what steals
   *  the renderer's pan. Cleared by a move past `DRAG_HOLD_SLOP_PX` (that is a pan), by the
   *  release, and by the hold it authorises — so one press can drop at most one pin. */
  pressing: boolean;
  /** Where the committed drag is measured from, and the last y it saw. The delta is taken
   *  per move rather than from the origin — see `levels`. */
  lastY: number;
  /** The zoom the gesture started at, and the CLAMPED level offset accumulated since.
   *
   *  **Accumulated incrementally and clamped every step, which is not the same as
   *  clamping the target** (§4). Drag ten levels past the ceiling and back by one: an
   *  accumulator that saturates responds to the reversal at once, where a target clamped
   *  from the total travel does nothing for nine levels. That dead travel is the bug this
   *  shape exists to avoid. */
  startZoom: number;
  levels: number;
}

export interface DragZoomLimits {
  /** Pane height × `SPAN_SHARE` — how far the finger travels for one zoom level. */
  perLevelPx: number;
  min: number;
  max: number;
}

export const IDLE_DRAG_ZOOM: DragZoomState = {
  phase: DRAG_ZOOM_PHASE.IDLE,
  tapAt: 0,
  tapX: 0,
  tapY: 0,
  hasTap: false,
  pressing: false,
  lastY: 0,
  startZoom: 0,
  levels: 0,
};

/** How far the finger travels for one zoom level: **a calibrated absolute distance,
 *  capped so a short canvas stays usable** (§4, corrected by the 2026-07-30 device pass).
 *
 *  It was a pure share of the pane's height, reasoned by analogy from ADR-0123, and the
 *  analogy is false: **a pin's size is a share of the canvas because a pin competes for
 *  canvas area, but a drag's sensitivity belongs to the finger, and a finger does not
 *  scale with the canvas.** The share therefore made the map extreme demand 250px per
 *  level against `half`'s 122px — the more map you gave it, the heavier it got, which is
 *  exactly backwards. Reported as _"the more space the map takes of the screen, the more
 *  the drag feels slow"_.
 *
 *  The cap binds only below ~240px, where a flat distance would ask for most of the
 *  canvas in one stroke. Floored as well, because a pane measured before layout would
 *  otherwise make the gesture infinitely sensitive rather than merely wrong. */
export function zoomPerLevelPx(paneHeightPx: number): number {
  return Math.max(
    Math.min(
      tune(TUNE.dragPxPerLevel, MAP_DRAG_ZOOM.PX_PER_LEVEL),
      paneHeightPx * MAP_DRAG_ZOOM.MAX_SHARE,
    ),
    MIN_PER_LEVEL_PX,
  );
}

/** **The double-tap's step: one level in from wherever you are, and nothing else** (§2).
 *
 *  It is deliberately NOT `zoomStepIn`, and reusing that was a real regression rather than
 *  an inelegance (device pass, 2026-07-30 — owner: _"a double zoom ... zooms in really a
 *  lot (~city size), even when you're zoomed out to the whole globe"_). That function is
 *  **locate's** ladder, whose `floor` exists so that "take me to me" lands at a readable
 *  zoom — so from a globe view it returns the floor outright (`current < floor`) instead of
 *  stepping. A double-tap makes no such promise: it means *a bit closer than this*, from
 *  wherever this is. Capped at the gesture's own ceiling rather than locate's
 *  `STEP_IN_MAX`, so a double-tap can reach as deep as a pinch can. */
export function doubleTapZoom(current: number): number {
  return Math.min(current + 1, MAP_DRAG_ZOOM.MAX);
}

/** A pane this short is not laid out; the value only has to be non-degenerate. */
const MIN_PER_LEVEL_PX = 24;

/** The map's own zoom bounds when it states them, our named range when it does not —
 *  which is the case here deliberately (see `MAP_DRAG_ZOOM.MIN`). Reading them rather
 *  than assuming keeps this gesture bounded exactly as the pinch is. */
export function dragZoomLimits(
  paneHeightPx: number,
  mapMin?: number | null,
  mapMax?: number | null,
): DragZoomLimits {
  return {
    perLevelPx: zoomPerLevelPx(paneHeightPx),
    min: mapMin ?? MAP_DRAG_ZOOM.MIN,
    max: mapMax ?? MAP_DRAG_ZOOM.MAX,
  };
}

/** Is this press the second half of a double-tap? Both tests matter: the time window
 *  alone would pair two taps at opposite corners, and the distance alone would pair a tap
 *  now with one from a minute ago. */
function isSecondTap(state: DragZoomState, event: DragZoomEvent): boolean {
  if (!state.hasTap) return false;
  const withinTime = event.t - state.tapAt < tune(TUNE.dragTapGapMs, MAP_DRAG_ZOOM.TAP_GAP_MS);
  const withinSlop =
    Math.hypot(event.x - state.tapX, event.y - state.tapY) < MAP_DRAG_ZOOM.TAP_SLOP_PX;
  return withinTime && withinSlop;
}

export interface DragZoomStep {
  state: DragZoomState;
  action: DragZoomAction;
  /** Only meaningful for `ZOOM`. */
  zoom: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * The whole state machine. `zoom` is the map's current zoom, needed only to seed a
 * gesture; `null` (a map with no camera yet) means there is nothing to zoom from, so
 * every press passes through rather than arming a gesture against an unknown origin.
 */
export function reduceDragZoom(
  state: DragZoomState,
  event: DragZoomEvent,
  zoom: number | null,
  limits: DragZoomLimits,
): DragZoomStep {
  const pass = (next: DragZoomState): DragZoomStep => ({
    state: next,
    action: DRAG_ZOOM_ACTION.PASS,
    zoom: 0,
  });

  if (event.type === DRAG_ZOOM_EVENT.DOWN) {
    if (zoom != null && isSecondTap(state, event)) {
      return {
        state: {
          ...state,
          phase: DRAG_ZOOM_PHASE.ARMED,
          // The pairing is spent: a THIRD tap must not re-arm off the same first one.
          hasTap: false,
          lastY: event.y,
          startZoom: zoom,
          levels: 0,
        },
        action: DRAG_ZOOM_ACTION.ARM,
        zoom: 0,
      };
    }
    // A first tap (or an unpairable one). Nothing is armed and nothing is taken; the press
    // is remembered only so the NEXT one can be tested against it.
    // `pressing` is what makes this press a long-press candidate (ADR-0147 §1). It is set
    // on the UNPAIRED branch only, so the press that arms a zoom above can never also drop
    // a pin — the two gestures are separated here, once, and nowhere else.
    return pass({
      ...IDLE_DRAG_ZOOM,
      tapAt: event.t,
      tapX: event.x,
      tapY: event.y,
      hasTap: false,
      pressing: true,
    });
  }

  // A hold completed. Only an unpaired press that has not wandered can own it; anything
  // else is a gesture already in progress and the timer is stale.
  if (event.type === DRAG_ZOOM_EVENT.HOLD) {
    if (state.phase !== DRAG_ZOOM_PHASE.IDLE || !state.pressing) return pass(state);
    // Spent: one press drops at most one pin, and `hasTap` stays false so the release that
    // follows a drop cannot pair into a zoom.
    return {
      state: { ...state, pressing: false },
      action: DRAG_ZOOM_ACTION.DROP,
      zoom: 0,
    };
  }

  if (event.type === DRAG_ZOOM_EVENT.MOVE) {
    if (state.phase === DRAG_ZOOM_PHASE.IDLE) {
      // Wandering past the hold slop means this is a pan, so the long press is off. The
      // event still passes through — the renderer owns the pan and always did.
      if (!state.pressing) return pass(state);
      const travelled = Math.hypot(event.x - state.tapX, event.y - state.tapY);
      return pass(travelled < DRAG_HOLD_SLOP_PX ? state : { ...state, pressing: false });
    }
    if (state.phase === DRAG_ZOOM_PHASE.ARMED) {
      // Below the slop this is still a double-tap in progress, so it stays provisional.
      if (Math.abs(event.y - state.lastY) < MAP_DRAG_ZOOM.DRAG_SLOP_PX) {
        return { state, action: DRAG_ZOOM_ACTION.ARM, zoom: 0 };
      }
      // Committing consumes the slop rather than jumping by it: the first zoom of a
      // gesture should be the smallest one, not `DRAG_SLOP_PX` worth.
      const committed = { ...state, phase: DRAG_ZOOM_PHASE.ZOOMING, lastY: event.y };
      return { state: committed, action: DRAG_ZOOM_ACTION.ZOOM, zoom: state.startZoom };
    }
    // **Down is in** (§4, owner's call on the mockup): pulling the map toward you brings it
    // closer, which is also what Google's own Android gesture does. An increasing y raises
    // the zoom.
    const delta = (event.y - state.lastY) / limits.perLevelPx;
    const levels = clamp(
      state.levels + delta,
      limits.min - state.startZoom,
      limits.max - state.startZoom,
    );
    return {
      state: { ...state, lastY: event.y, levels },
      action: DRAG_ZOOM_ACTION.ZOOM,
      zoom: state.startZoom + levels,
    };
  }

  // UP / CANCEL.
  const released = state.phase;
  // A gesture that ends can never pair with the next press: the finger that would have
  // been the "first tap" of a new double-tap was the second of this one.
  const next = { ...IDLE_DRAG_ZOOM, tapAt: event.t, tapX: event.x, tapY: event.y };
  if (released === DRAG_ZOOM_PHASE.ARMED) {
    // Cancelled rather than lifted is not a tap — no zoom is owed for a gesture the
    // platform took away.
    if (event.type === DRAG_ZOOM_EVENT.CANCEL) return pass(next);
    return { state: next, action: DRAG_ZOOM_ACTION.STEP, zoom: 0 };
  }
  if (released === DRAG_ZOOM_PHASE.ZOOMING) {
    return { state: next, action: DRAG_ZOOM_ACTION.SETTLE, zoom: 0 };
  }
  // An ordinary press ending. It can pair with the next one only if it was a TAP — a
  // press released near where it landed. Without that test a one-finger PAN would qualify,
  // so a tap landing near where a pan happened to end would arm the zoom (the pan's own
  // release is 24px-and-300ms away from plenty of real taps).
  const travelled = Math.hypot(event.x - state.tapX, event.y - state.tapY);
  return pass({
    ...next,
    hasTap: event.type === DRAG_ZOOM_EVENT.UP && travelled < MAP_DRAG_ZOOM.TAP_SLOP_PX,
  });
}

/** A point in the renderer's world-coordinate space — the Mercator square in px at zoom 0,
 *  which is what `CameraProjection.fromLatLngToPoint` speaks. Its edge length is the
 *  renderer's, not a constant of ours (`map-camera-adapter`'s `WORLD_TILE_SIZE`); everything
 *  below needs only that `screenPx = worldUnits × 2^zoom` holds in it. */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * **Keep a screen point fixed while the zoom changes** (ADR-0145 §3, point-anchoring).
 *
 * **There is no Mercator in here, and that is the design.** This works in the renderer's own
 * world-coordinate space, where the relationship between world units and screen px is a
 * pure power of two — so the only arithmetic is a scale change. Every nonlinear part of the
 * projection stays inside `CameraProjection`'s `fromLatLngToPoint`/`fromPointToLatLng`, which
 * is what keeps this clear of ADR-0129 §3's warning about re-deriving the renderer's
 * projection maths: we are asking it to project, not projecting ourselves.
 *
 * At zoom `z`, `screenPx = worldUnits × 2^z`. The tapped point's world position is
 * `centre + offset / 2^from`, and we want it to remain at the same `offset` afterwards,
 * i.e. `centre' = tap − offset / 2^to`. Subtracting gives the one line below.
 *
 * `offsetPx` is measured from the CANVAS CENTRE (+x inline-end, +y down). World-space `y`
 * grows southward exactly as screen `y` grows downward, so neither axis is flipped.
 */
export function zoomAboutPoint(
  centre: WorldPoint,
  offsetPx: WorldPoint,
  fromZoom: number,
  toZoom: number,
): WorldPoint {
  const shift = 2 ** -fromZoom - 2 ** -toZoom;
  return { x: centre.x + offsetPx.x * shift, y: centre.y + offsetPx.y * shift };
}

/**
 * **Where on the map a screen point IS** — `zoomAboutPoint`'s plainer sibling, and what a
 * long press needs to become a place (ADR-0147 §2).
 *
 * Same space, same one fact: at zoom `z`, `screenPx = worldUnits × 2^z`. So a point
 * `offsetPx` from the canvas centre sits at `centre + offsetPx / 2^z` in world units, and
 * `fromPointToLatLng` turns that back into a coordinate. **No Mercator here either**, which
 * is the whole reason this is safe to write (ADR-0129 §3): every nonlinear step stays inside
 * the renderer's projection.
 *
 * `offsetPx` is from the CANVAS CENTRE (+x inline-end, +y down), the same convention
 * `zoomAboutPoint` takes, so the two cannot disagree about which way is which.
 */
export function worldPointAtOffset(
  centre: WorldPoint,
  offsetPx: WorldPoint,
  zoom: number,
): WorldPoint {
  const scale = 2 ** -zoom;
  return { x: centre.x + offsetPx.x * scale, y: centre.y + offsetPx.y * scale };
}

/**
 * **The inverse: where a coordinate already IS on the canvas**, in px from its centre and in
 * the same convention (+x inline-end, +y down).
 *
 * `worldPointAtOffset` answers "what is at this pixel"; this answers "which pixel is this at",
 * which is what a camera has to know before it can decide whether something is under the card
 * (ADR-0122 §7's 2026-08-06 amendment). Written as the literal inverse of the line above —
 * `screenPx = worldUnits × 2^z` — so the two cannot drift, and for the same reason as its twin
 * there is no Mercator here: both projections stay the renderer's own (ADR-0129 §3).
 */
export function offsetPxOfWorldPoint(
  centre: WorldPoint,
  point: WorldPoint,
  zoom: number,
): WorldPoint {
  const scale = 2 ** zoom;
  return { x: (point.x - centre.x) * scale, y: (point.y - centre.y) * scale };
}
