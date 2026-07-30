// The one-finger zoom, applied (ADR-0145 §1/§2). The recogniser is pure and lives in
// `canvas-gestures.ts`; this is the imperative half that feeds it pointer events, takes the
// finger off Google, and hands the result to the camera.
//
// **Why a capture-phase guard and not "both listen and the loser bails"** (ADR-0145 §2).
// ADR-0122 §4 set that precedent one layer along and it does not transfer: the sheet's
// drag is safe to run and abandon, because below its slop it is tracking a number and
// rendering nothing, so a loser leaves no trace. **Google's pan writes the camera on the
// first move.** Letting it see the gesture and then taking over means the map has already
// panned — and ADR-0129 §4's `sameCamera` check would read that stray pan as "a finger did
// it", which is *correct* and therefore worse: it becomes the camera's truth. So the
// events must never reach Google at all. Google's listeners are on descendants of the
// canvas div; a capture-phase listener on the pane runs first, so `stopPropagation` there
// means they are never called.
//
// **Three event streams are suppressed, and only one of them drives the recogniser.**
// Pointer events are the single unified stream, so they are what the state machine reads.
// But `stopPropagation` on `pointerdown` does nothing to a `touchstart` listener — they are
// separate streams — and we do not get to know which one Google subscribes to. So touch
// and mouse are suppressed alongside, purely as suppressors.
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
import type { LatLng } from './map-camera';
import { DRAG_CLICK_SWALLOW_MS, DRAG_HOLD_MS } from '../constants';

/** The two camera verbs this gesture needs, named as a slice of `MapCamera` so the hook
 *  can be tested against a two-method object instead of a whole camera. */
export type CanvasGestureCamera = Pick<MapCamera, 'zoomTo' | 'stepZoomIn'>;

export function useCanvasGestures(
  map: google.maps.Map | null,
  camera: CanvasGestureCamera,
  paneRef: RefObject<HTMLElement | null>,
  /** A press held still on the canvas background: drop a pin here (ADR-0147 §1/§2). The
   *  point is already a coordinate — the pixel→`LatLng` conversion happens here, because
   *  it needs the live map and the screen's callers must not learn about projections. */
  onHold?: (at: LatLng) => void,
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
      disarmSwallow = armClickSwallow(() => {
        disarmSwallow = null;
      });
    };
    const clearHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    };
    /** Do we own the finger right now? The suppressors read this and nothing else, so they
     *  are cheap on every event that is not ours — which is almost all of them. */
    let owned = false;

    const feed = (type: DragZoomEventType, x: number, y: number, t: number): boolean => {
      const { map: live, camera: cam } = latest.current;
      // The pane's box is read where the gesture happens rather than kept in state, for the
      // same reason the fit's padding is (ADR-0128): this screen re-renders every second and
      // a layout read must not become a dependency.
      const box = pane.getBoundingClientRect();
      const limits = dragZoomLimits(
        box.height,
        live?.get('minZoom') as number | null | undefined,
        live?.get('maxZoom') as number | null | undefined,
      );
      const step = reduceDragZoom(state, { type, x, y, t }, live?.getZoom() ?? null, limits);
      state = step.state;
      switch (step.action) {
        case DRAG_ZOOM_ACTION.ARM:
          return true;
        case DRAG_ZOOM_ACTION.ZOOM:
          cam.zoomTo(step.zoom);
          return true;
        case DRAG_ZOOM_ACTION.STEP:
          // Anchored at the tapped point, which is what Google's own double-click zoom did
          // before this handler suppressed it (ADR-0145 §3's amendment). Offsets are from
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
          if (at) latest.current.onHold?.(at);
          // A drop is followed by a release, which fires a `click` — and that click reaches
          // `onCanvasTap`, which clears the selection, i.e. closes the card we just opened.
          armSwallow();
          // Not `true`: we never took the finger, so the suppressors must stay off. Google
          // has been panning within the slop all along and that is correct.
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
      // Only the primary finger: a second one landing mid-gesture is a pinch, which is
      // Google's and must not be re-read as a new drag origin.
      if (!e.isPrimary || e.button > 0) return;
      clearHold();
      const { clientX: x, clientY: y, timeStamp: t } = e;
      owned = feed(DRAG_ZOOM_EVENT.DOWN, x, y, t);
      if (!owned) {
        // An unpaired press: not ours, so Google keeps the pan — but it MIGHT become a long
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
      if (wasOurs) block(e);
    };

    /** The suppressors. They drive nothing — they exist because `stopPropagation` on one
     *  event stream says nothing to another, and Google's subscription is not ours to
     *  know. Mount-time and non-passive, per the note at the top of this file. */
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

/** Everything Google might be listening on for the gestures we are taking. `dblclick` and
 *  `touchend` are in it because the double-tap step-zoom is the one we replace: leaving
 *  either through would give a step from Google on top of ours. */
const SUPPRESSED = [
  'touchstart',
  'touchmove',
  'touchend',
  'mousedown',
  'mousemove',
  'mouseup',
  'dblclick',
] as const;

/** `stopPropagation` is what keeps Google out (its listeners are on descendants);
 *  `preventDefault` is what keeps the browser from claiming the gesture as a native pan or
 *  a synthesised double-tap zoom. Cancelable-checked, because a passive-by-default
 *  `touchmove` already on the compositor cannot be prevented and warns if you try. */
function block(e: Event): void {
  e.stopPropagation();
  if (e.cancelable) e.preventDefault();
}

const swallow = (e: Event) => e.stopPropagation();

/**
 * Eat the ONE `click` a completed gesture fires, then disarm — by the click itself, or by a
 * timeout if that click never comes.
 *
 * **The timeout is the half that was missing, and it is a real bug rather than belt-and-braces.**
 * `SETTLE` gets away without it because a real drag reliably ends in a click; a long-press
 * DROP does not, because this pipeline `preventDefault`s the touch stream that would have
 * synthesised one. A stranded `once` listener then swallows the user's **next genuine tap** —
 * which presents as "the thing I tapped didn't respond", e.g. a tap outside the `IconPicker`
 * failing to close it, since that panel's own dismissal is a bubble-phase `click` on
 * `document` and this guard stops propagation ahead of it.
 *
 * `useHoldToDrag` already carries exactly this fallback (`DRAG_CLICK_SWALLOW_MS`) with the
 * same note — "a drop that generates no click at all would otherwise leave the listener armed
 * for the user's next real tap". Copying the arm without the disarm is how the shelf's lesson
 * got lost on the way to the canvas.
 */
function armClickSwallow(onDisarm: () => void): () => void {
  const disarm = () => {
    clearTimeout(timer);
    document.removeEventListener('click', once, true);
    onDisarm();
  };
  const once = (e: Event) => {
    swallow(e);
    disarm();
  };
  const timer = setTimeout(disarm, DRAG_CLICK_SWALLOW_MS);
  document.addEventListener('click', once, true);
  return disarm;
}
