// Press-and-hold to start a drag (ADR-0116 §5, session-114 amendment).
//
// The shelf card is three things at once: a tap target, a piece of a horizontally
// scrolling strip, and a draggable. The first attempt split the gesture by
// DIRECTION (`touch-action: pan-x` — sideways scrolls, vertical drags), which
// fixed the strip but broke the page: a vertical swipe starting on a card dragged
// it instead of scrolling the day underneath. Direction can't arbitrate, because
// "swipe up to scroll" and "drag up onto a gap" are the same movement.
//
// TIME arbitrates. A drag begins only after the finger has been still on the card
// for a short hold; any movement before that is a scroll and the drag never arms.
// So scrolling stays the default in both axes, and dragging is a deliberate act —
// the same bargain the platform's own reorder gestures make.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DRAG_CLICK_SWALLOW_MS, DRAG_HOLD_MS, DRAG_HOLD_SLOP_PX } from '../constants';
import type { DragSourceBox } from './useDragGhost';

/** Parked on `<body>` for the length of an armed drag: turns selection off
 *  page-wide, since the finger travels over everything but the card it started on
 *  (styles/tokens.css). A structural class name, not UI copy. */
const DRAGGING_BODY_CLASS = 'wp-dragging';

export interface SelectionGuard {
  /** Cancel `selectstart` while a gesture is pending — the long press itself is
   *  what asks the platform to start selecting, and `user-select: none` on the
   *  pressed element doesn't stop that. */
  suppress: () => void;
  /** …and once a drag is really live, turn selection off page-wide: the finger
   *  travels over rows and headers, any of which would start selecting under it. */
  lock: () => void;
  /** Hand selection back (drop, cancel, or "that was a scroll after all"). */
  release: () => void;
}

/** Shared by both of the builder's drags — the hold-gated shelf card below and the
 *  reorder grip, which arms immediately but drags over the same text. */
export function useSelectionGuard(): SelectionGuard {
  const preventer = useRef<((e: Event) => void) | null>(null);

  const suppress = useCallback(() => {
    if (preventer.current) return;
    const prevent = (e: Event) => e.preventDefault();
    preventer.current = prevent;
    document.addEventListener('selectstart', prevent);
  }, []);

  const lock = useCallback(() => {
    document.body.classList.add(DRAGGING_BODY_CLASS);
  }, []);

  const release = useCallback(() => {
    if (preventer.current) document.removeEventListener('selectstart', preventer.current);
    preventer.current = null;
    document.body.classList.remove(DRAGGING_BODY_CLASS);
    // A selection that slipped through before the listener attached would otherwise
    // stay highlighted under the card after the drop.
    document.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => release, [release]);

  // Memoised, and that is load-bearing rather than an optimisation: a fresh object
  // every render would churn the identity of anything that closes over the guard,
  // and a consumer's `useEffect(() => cleanup, [cleanup])` would then tear the
  // gesture down on every unrelated re-render (see `useHoldToDrag`'s reset effect).
  return useMemo(() => ({ suppress, lock, release }), [suppress, lock, release]);
}

export interface HoldToDragHandlers {
  /** The hold completed: the drag is live from here. Receives the held element (what
   *  an edge auto-scroll needs to find its scroller) and where the finger is (what a
   *  drag ghost needs to sit under it rather than jump). `pressBox` is captured at
   *  pointer-down so scroll anchoring during the hold cannot change the grab offset. */
  onArm: (
    el: HTMLElement,
    at: { clientX: number; clientY: number },
    pressBox: DragSourceBox,
  ) => void;
  /** A move while armed (never fires before the hold completes). */
  onMove: (point: { clientX: number; clientY: number }) => void;
  /** Released while armed — commit the drop. */
  onDrop: () => void;
  /** Armed then cancelled (the browser took the gesture, or the pointer was lost). */
  onCancel: () => void;
}

export interface HoldToDragProps {
  /** Attaches the non-passive `touchmove` guard at mount — the timing that makes an
   *  armed drag able to suppress native scrolling at all. The host must spread these
   *  props onto the element the finger actually touches. */
  ref: (el: HTMLElement | null) => (() => void) | void;
  onPointerDown: (e: React.PointerEvent) => void;
  /** A long press on a button otherwise starts a text selection / context menu. */
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useHoldToDrag(): (handlers: HoldToDragHandlers) => HoldToDragProps {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef<HTMLElement | null>(null);

  // A completed drag still fires a click, and it must not read as a tap. The card's
  // own capture handler can't do it: a dragged card is `pointer-events: none` (so the
  // drop hit-test sees what's UNDER the finger), which means the click RETARGETS to
  // whatever that is — a gap chip, a row — and never passes through the card at all.
  // It cost a round of "releasing the drag opened the new-event sheet". So the swallow
  // is one document-level capture listener, armed for exactly one click.
  const swallowNextClick = useCallback(() => {
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      done();
    };
    // A drop that generates no click at all (a mouse release outside any target)
    // would otherwise leave the listener armed for the user's next real tap.
    const fallback = setTimeout(() => done(), DRAG_CLICK_SWALLOW_MS);
    function done() {
      clearTimeout(fallback);
      document.removeEventListener('click', swallow, true);
    }
    document.addEventListener('click', swallow, true);
  }, []);

  // An armed drag must own the finger outright, and WHEN and WHERE this listener is
  // attached decide whether it can.
  //
  // WHEN: at MOUNT, before any touch exists. Attaching it on arm — DRAG_HOLD_MS after
  // `touchstart` — is too late twice over: the browser has already routed the gesture
  // to the compositor (so `touchmove` arrives `cancelable: false` and
  // `preventDefault()` is a silent no-op), and its scroll recognition fires
  // `pointercancel`, which kills the drag mid-gesture (session 116).
  //
  // WHERE: on the ELEMENT, and it stays there for the whole gesture even if the
  // element unmounts (see `attach`). A touch's target is fixed at `touchstart` and
  // touch events keep being dispatched to it even once it is detached — where they
  // have no path to `document` or `window`, so a listener anywhere else simply never
  // runs. That is not theory: with the guard only at document level, the first move
  // after a day switch produced `lostpointercapture` → a retargeted `pointermove` →
  // `pointercancel`, with no `touchmove` reaching the window at all (session 120).
  //
  // It preventDefaults only while a drag is actually armed, so ordinary scrolling from
  // a card is untouched.
  const suppressTouchScroll = useRef((e: TouchEvent) => {
    // `cancelable` is false once the browser has committed to scrolling; calling
    // preventDefault then only logs a warning.
    if (armed.current && e.cancelable) e.preventDefault();
  }).current;

  const selection = useSelectionGuard();

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    armed.current = false;
    origin.current = null;
    selection.release();
    held.current = null;
  }, [selection]);

  // Unmount only — deliberately NOT `useEffect(() => reset, [reset])`. That form
  // re-runs its cleanup whenever `reset`'s identity changes, and a re-render during
  // the hold window (this screen re-renders every second, on the clock) would then
  // clear the pending timer and the drag would silently never arm. That was the
  // "the drag activates only sometimes, only on some parts of the card" report: the
  // card was never the variable, the timing of the next re-render was.
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => () => resetRef.current(), []);

  // Stable, so a re-render mid-gesture doesn't detach and re-attach the listener
  // that is holding the browser's pan off.
  const attach = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      el.addEventListener('touchmove', suppressTouchScroll, { passive: false });
      return () => {
        // Deliberately NOT removed if this element is the one being dragged: it has
        // unmounted mid-gesture (dwelling on the day strip switches the day, which
        // unmounts the very row in flight), and since touch events keep going to the
        // original target even detached, this listener is the only thing left that can
        // preventDefault them. Without it the browser starts panning and cancels the
        // pointer, which is exactly the "drag back down from the strip and it dies"
        // report. The drag's own teardown removes it.
        if (held.current === el) return;
        el.removeEventListener('touchmove', suppressTouchScroll);
      };
    },
    [suppressTouchScroll],
  );

  return useCallback(
    (handlers: HoldToDragHandlers): HoldToDragProps => ({
      ref: attach,
      onPointerDown: (e) => {
        reset();
        const el = e.currentTarget as HTMLElement;
        const pressBox = el.getBoundingClientRect();
        held.current = el;
        origin.current = { x: e.clientX, y: e.clientY };
        selection.suppress();

        // Move/up/cancel are listened for on the WINDOW rather than on the element,
        // and pointer capture is deliberately not used — because the dragged element
        // may legitimately disappear mid-drag. Dwelling on the day strip switches the
        // day under you (ADR-0116 session-119), which unmounts the very row you are
        // dragging: with capture, the browser releases it and the gesture silently
        // freezes; with element handlers, they unmount with it. The window outlives
        // both, so the drag is independent of its source's lifetime.
        const move = (ev: PointerEvent) => {
          if (!armed.current) {
            // Moved before the hold completed → this was a scroll. Drop the pending
            // drag so the browser keeps the gesture.
            const from = origin.current;
            if (!from) return;
            const far =
              Math.abs(ev.clientX - from.x) > DRAG_HOLD_SLOP_PX ||
              Math.abs(ev.clientY - from.y) > DRAG_HOLD_SLOP_PX;
            if (far) end();
            return;
          }
          handlers.onMove({ clientX: ev.clientX, clientY: ev.clientY });
        };
        const up = () => {
          const wasArmed = armed.current;
          end();
          if (!wasArmed) return;
          swallowNextClick();
          handlers.onDrop();
        };
        const cancel = () => {
          const wasArmed = armed.current;
          end();
          if (wasArmed) handlers.onCancel();
        };
        function end() {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', cancel);
          // ONLY for an element that unmounted mid-gesture: the ref cleanup
          // deliberately left its guard attached (see `attach`), and this is the only
          // other chance to take it off. A still-connected element KEEPS its
          // mount-time guard — that listener is the thing that makes the NEXT gesture
          // suppressible at all (see WHEN above; the ref callback is stable, so
          // nothing would ever re-attach it). Removing it unconditionally is what made
          // a second drag on the same card pan the page and die mid-move.
          if (!el.isConnected) el.removeEventListener('touchmove', suppressTouchScroll);
          reset();
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);

        const arm = () => {
          timer.current = null;
          armed.current = true;
          selection.lock();
          handlers.onArm(el, { clientX: e.clientX, clientY: e.clientY }, pressBox);
        };
        // A mouse has no scroll/drag ambiguity to resolve (the wheel scrolls), so
        // a pointer device drags immediately — waiting would just feel broken.
        if (e.pointerType === 'mouse') arm();
        else timer.current = setTimeout(arm, DRAG_HOLD_MS);
      },
      onContextMenu: (e) => {
        // Only while the hold is live — a right-click on an idle card is nobody's
        // business of ours.
        if (armed.current || timer.current) e.preventDefault();
      },
    }),
    [attach, reset, selection, swallowNextClick],
  );
}
