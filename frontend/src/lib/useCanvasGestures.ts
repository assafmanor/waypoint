// The one-finger zoom, applied (ADR-0145 §1/§2). The recogniser is pure and lives in
// `canvas-gestures.ts`; this is the imperative half that feeds it pointer events, takes the
// finger off the renderer, and hands the result to the camera.
//
// **Why a capture-phase guard and not "both listen and the loser bails"** (ADR-0145 §2).
// ADR-0122 §4 set that precedent one layer along and it does not transfer: the sheet's
// drag is safe to run and abandon, because below its slop it is tracking a number and
// rendering nothing, so a loser leaves no trace. **The renderer's pan writes the camera on
// the first move.** Letting it see the gesture and then taking over means the map has
// already panned — and ADR-0129 §4's `sameCamera` check would read that stray pan as "a
// finger did it", which is *correct* and therefore worse: it becomes the camera's truth. So
// the events must never reach it at all. MapLibre's handlers listen on
// `map.getCanvasContainer()`, a descendant of the pane; a capture-phase listener on the pane
// runs first, so `stopPropagation` there means they are never called.
//
// **Three event streams are suppressed, and only one of them drives the recogniser.**
// Pointer events are the single unified stream, so they are what the state machine reads.
// But `stopPropagation` on `pointerdown` does nothing to a `touchstart` listener — they are
// separate streams — and MapLibre's `HandlerManager` subscribes to the touch and mouse ones,
// not to pointer. So touch and mouse are suppressed alongside, purely as suppressors.
//
// **Every listener is attached at MOUNT, never at arm time**, and that is session 116's
// scar rather than a preference: `touchmove` has to be non-passive to be preventable, and
// a listener added once the gesture is already recognised is added after the browser has
// handed the gesture to the compositor. `tokens.css` records the two CSS guards that were
// tried instead and did nothing.
import { useEffect, useRef, type RefObject } from 'react';
import {
  DRAG_ZOOM_ACTION,
  DRAG_ZOOM_EVENT,
  DRAG_ZOOM_PHASE,
  IDLE_DRAG_ZOOM,
  dragZoomLimits,
  reduceDragZoom,
  type DragZoomEventType,
  type DragZoomState,
} from './canvas-gestures';
import { latLngAtOffset, type MapCamera } from './useMapCamera';
import type { CameraMap } from './map-camera-adapter';
import type { LatLng } from './map-camera';
import { armClickSwallow } from './click-swallow';
import { DRAG_HOLD_MS } from '../constants';

/** The two camera verbs this gesture needs, named as a slice of `MapCamera` so the hook
 *  can be tested against a two-method object instead of a whole camera. */
export type CanvasGestureCamera = Pick<MapCamera, 'zoomTo' | 'stepZoomIn'>;

export function useCanvasGestures(
  map: CameraMap | null,
  camera: CanvasGestureCamera,
  paneRef: RefObject<HTMLElement | null>,
  /** A press held still: drop a pin here (ADR-0147 §1/§2), or act on whatever was under the
   *  finger (ADR-0157 §2). The point is already a coordinate — the pixel→`LatLng` conversion
   *  happens here, because it needs the live map and the screen's callers must not learn
   *  about projections.
   *
   *  **`target` is the element the press LANDED on, and reporting it is what keeps the two
   *  long presses one gesture.** A marker is a DOM overlay inside this same pane, so a hold
   *  over a pin reaches this recogniser exactly as a hold over blank canvas does — and
   *  before this it dropped a second place on top of the one you were pressing. The
   *  recogniser does not know what a pin is (and must not: ADR-0147 §1 keeps every gesture
   *  decision in one machine, not in two that negotiate); it says where the finger was and
   *  what it was on, and the pane decides which of the two acts that is. */
  onHold?: (at: LatLng, target: EventTarget | null) => void,
  /** Set true for as long as a completed gesture's own `click` is still pending, so the pane
   *  can refuse to read that click as a canvas tap. It was the second of two channels: the DOM
   *  swallow covered the event stream, and this covered **Google's own tap callback**, which
   *  was not an event stream at all and so could not be stopped by anything. ADR-0186 §2 moved
   *  the pane's tap onto its own DOM click, so both channels are now the same one — see
   *  `MapPane`'s `handlePaneClick`. Kept because one arm and one disarm drive both, so it
   *  cannot drift; whether the swallow alone now suffices is a question for its own change,
   *  not for this comment. */
  gestureTapRef?: RefObject<boolean>,
): void {
  // Latest-ref, and this is the scar that matters most here: `screens/Map.tsx` re-renders
  // every second on the clock, and session 116 lost a gesture to exactly this — a teardown
  // closed over a fresh object identity, so the cleanup ran on every re-render and cleared
  // the hold. The listeners below are attached ONCE and read everything through this.
  const latest = useRef({ map, camera, onHold });
  latest.current = { map, camera, onHold };

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    let state: DragZoomState = IDLE_DRAG_ZOOM;
    /** The long press's timer (ADR-0147 §1). A hold is the ABSENCE of events, so it is the
     *  one input the recogniser cannot derive — this fires the synthetic `HOLD` that lets
     *  it stay a pure table. Cleared by every other outcome of the press. */
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    /** Disarms whatever click swallow is currently armed, so unmounting mid-gesture cannot
     *  leave one listening on the next screen. */
    let disarmSwallow: (() => void) | null = null;
    const armSwallow = () => {
      disarmSwallow?.();
      if (gestureTapRef) gestureTapRef.current = true;
      disarmSwallow = armClickSwallow(() => {
        disarmSwallow = null;
        if (gestureTapRef) gestureTapRef.current = false;
      });
    };
    /** A drop happened and the finger is STILL DOWN. The click to swallow is fired by the
     *  release, which is an unbounded wait away — so the window opens there and not here
     *  (ADR-0148's build-log amendment). */
    let dropAwaitingRelease = false;
    const clearHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    };
    /** Do we own the finger right now? The suppressors read this and nothing else, so they
     *  are cheap on every event that is not ours — which is almost all of them. */
    let owned = false;
    /** What the current press landed on, latched at `pointerdown`. Latched rather than read
     *  at the hold, because by then the only event we have is the synthetic one the timer
     *  fires and it has no target — and because a pointer that wanders inside the slop must
     *  still be answered for where it STARTED. */
    let pressTarget: EventTarget | null = null;

    const feed = (type: DragZoomEventType, x: number, y: number, t: number): boolean => {
      const { map: live, camera: cam } = latest.current;
      // The pane's box is read where the gesture happens rather than kept in state, for the
      // same reason the fit's padding is (ADR-0128): this screen re-renders every second and
      // a layout read must not become a dependency.
      const box = pane.getBoundingClientRect();
      // Named accessors since ADR-0186 §2: these were `live.get('minZoom')`, Google's
      // untyped `MVCObject` read, which is why they were missing from the adapter's own
      // count of what the camera asks for. `CameraMap` states them now.
      const limits = dragZoomLimits(box.height, live?.getMinZoom(), live?.getMaxZoom());
      const step = reduceDragZoom(state, { type, x, y, t }, live?.getZoom() ?? null, limits);
      state = step.state;
      switch (step.action) {
        case DRAG_ZOOM_ACTION.ARM:
          return true;
        case DRAG_ZOOM_ACTION.ZOOM:
          cam.zoomTo(step.zoom);
          return true;
        case DRAG_ZOOM_ACTION.STEP:
          // Anchored at the tapped point, which is what the vendor's own double-tap zoom did
          // before this handler replaced it (ADR-0145 §3's amendment). Offsets are from
          // the canvas CENTRE, which is the space `zoomAboutPoint` works in.
          cam.stepZoomIn({
            x: x - (box.left + box.width / 2),
            y: y - (box.top + box.height / 2),
          });
          return true;
        case DRAG_ZOOM_ACTION.DROP: {
          // The press point, as a coordinate. Offsets are from the canvas CENTRE, the space
          // the projection helper works in — the same convention `STEP` uses above, so the
          // two gestures cannot disagree about which way is which.
          const at =
            live &&
            latLngAtOffset(live, {
              x: x - (box.left + box.width / 2),
              y: y - (box.top + box.height / 2),
            });
          if (at) latest.current.onHold?.(at, pressTarget);
          // A drop is followed by a release, which fires a `click` — and that click reaches
          // `onCanvasTap`, which now dismisses the form as an outside tap (ADR-0148 §7). The
          // window is opened by the RELEASE, below: a hold is held for as long as the user
          // likes, so a swallow armed here has usually expired by the time the finger lifts.
          dropAwaitingRelease = true;
          // Not `true`: we never took the finger, so the suppressors must stay off. The
          // renderer has been panning within the slop all along and that is correct.
          return false;
        }
        case DRAG_ZOOM_ACTION.SETTLE:
          armSwallow();
          return true;
        default:
          return false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only the primary finger: a second one landing mid-gesture is a pinch, which is the
      // renderer's and must not be re-read as a new drag origin.
      if (!e.isPrimary || e.button > 0) return;
      clearHold();
      pressTarget = e.target;
      const { clientX: x, clientY: y, timeStamp: t } = e;
      owned = feed(DRAG_ZOOM_EVENT.DOWN, x, y, t);
      if (!owned) {
        // An unpaired press: not ours, so the renderer keeps the pan — but it MIGHT become a long
        // press, which is the one gesture decided by time rather than by movement (ADR-0147
        // §1). The timer's stamp is the press's own clock plus the hold, so the synthetic
        // event carries the time it represents rather than a wall-clock read.
        if (latest.current.onHold) {
          holdTimer = setTimeout(() => {
            holdTimer = null;
            feed(DRAG_ZOOM_EVENT.HOLD, x, y, t + DRAG_HOLD_MS);
          }, DRAG_HOLD_MS);
        }
        return;
      }
      // Capture, so the gesture survives the finger leaving the pane — which is also what
      // keeps the sheet's own drag region from picking it up on the way past. Both drags
      // take capture at drag start, which is the whole of the arbitration between them
      // (ADR-0145 §A2: they never share a pixel, only the finger after it leaves).
      pane.setPointerCapture?.(e.pointerId);
      block(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state.phase === DRAG_ZOOM_PHASE.IDLE) {
        // Only interesting while a hold is pending: the recogniser decides whether this
        // move is a wander inside the slop or the pan that cancels the long press.
        if (!holdTimer) return;
        feed(DRAG_ZOOM_EVENT.MOVE, e.clientX, e.clientY, e.timeStamp);
        if (!state.pressing) clearHold();
        return;
      }
      owned = feed(DRAG_ZOOM_EVENT.MOVE, e.clientX, e.clientY, e.timeStamp);
      if (owned) block(e);
    };

    const onPointerUp = (e: PointerEvent) => {
      clearHold();
      const type = e.type === 'pointercancel' ? DRAG_ZOOM_EVENT.CANCEL : DRAG_ZOOM_EVENT.UP;
      const wasOurs = state.phase !== DRAG_ZOOM_PHASE.IDLE;
      feed(type, e.clientX, e.clientY, e.timeStamp);
      owned = false;
      // The release of a press that dropped a pin: this is the event the `click` follows, so
      // it is where the swallow's own clock starts. A cancel gets it too — it also ends the
      // press, and whether a click follows is exactly what the timeout is for.
      if (dropAwaitingRelease) {
        dropAwaitingRelease = false;
        armSwallow();
      }
      if (wasOurs) block(e);
    };

    /** The suppressors. They drive nothing — they exist because `stopPropagation` on one
     *  event stream says nothing to another, and the renderer subscribes to the touch and
     *  mouse ones. Mount-time and non-passive, per the note at the top of this file. */
    const suppress = (e: Event) => {
      if (owned) block(e);
    };

    // A long press asks the platform for a context menu, and on the canvas there is nothing
    // for one to contain — so it is refused outright rather than while a gesture is live
    // (ADR-0147 §1; ADR-0131 §9 flagged this as the thing a real device decides). Ungated on
    // `owned` on purpose: the drop happens BEFORE the release, so a gated guard would come
    // too late for the very gesture it exists for.
    const denyContextMenu = (e: Event) => e.preventDefault();
    pane.addEventListener('contextmenu', denyContextMenu);

    pane.addEventListener('pointerdown', onPointerDown, true);
    pane.addEventListener('pointermove', onPointerMove, true);
    pane.addEventListener('pointerup', onPointerUp, true);
    pane.addEventListener('pointercancel', onPointerUp, true);
    for (const type of SUPPRESSED) {
      pane.addEventListener(type, suppress, { capture: true, passive: false });
    }

    return () => {
      pane.removeEventListener('contextmenu', denyContextMenu);
      pane.removeEventListener('pointerdown', onPointerDown, true);
      pane.removeEventListener('pointermove', onPointerMove, true);
      pane.removeEventListener('pointerup', onPointerUp, true);
      pane.removeEventListener('pointercancel', onPointerUp, true);
      for (const type of SUPPRESSED) {
        pane.removeEventListener(type, suppress, true);
      }
      disarmSwallow?.();
      clearHold();
    };
    // `map` and `camera` are read through the latest-ref on purpose — see it. Re-running
    // this effect is what session 116's bug WAS, so it must key on nothing that changes
    // per render.
  }, [paneRef]);
}

/** Everything the renderer listens on for the gestures we are taking. `dblclick` and
 *  `touchend` are in it because the double-tap is the one we replace: leaving either through
 *  would give a vendor step on top of ours. `MapCanvas` now also passes
 *  `doubleClickZoom: false`, which is the source-level half of the same guard — but only
 *  half, since MapLibre's `TapDragZoomHandler` reads the same taps and is enabled with the
 *  pinch rather than separately. This list is what keeps that one quiet. */
const SUPPRESSED = [
  'touchstart',
  'touchmove',
  'touchend',
  'mousedown',
  'mousemove',
  'mouseup',
  'dblclick',
] as const;

/** `stopPropagation` is what keeps the renderer out (its listeners are on descendants);
 *  `preventDefault` is what keeps the browser from claiming the gesture as a native pan or
 *  a synthesised double-tap zoom. Cancelable-checked, because a passive-by-default
 *  `touchmove` already on the compositor cannot be prevented and warns if you try. */
function block(e: Event): void {
  e.stopPropagation();
  if (e.cancelable) e.preventDefault();
}
