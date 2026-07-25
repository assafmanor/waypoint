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
import { useCallback, useEffect, useRef } from 'react';
import { DRAG_HOLD_MS, DRAG_HOLD_SLOP_PX } from '../constants';

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

  return { suppress, lock, release };
}

export interface HoldToDragHandlers {
  /** The hold completed: the drag is live from here. Receives the held element,
   *  which is what an edge-autoscroll needs to find its scroller. */
  onArm: (el: HTMLElement) => void;
  /** A move while armed (never fires before the hold completes). */
  onMove: (point: { clientX: number; clientY: number }) => void;
  /** Released while armed — commit the drop. */
  onDrop: () => void;
  /** Armed then cancelled (the browser took the gesture, or the pointer was lost). */
  onCancel: () => void;
}

export interface HoldToDragProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  /** Swallows the click a completed drag would otherwise fire: the card is a
   *  button, so a drop that ended over it would open the schedule sheet too. */
  onClickCapture: (e: React.MouseEvent) => void;
  /** A long press on a button otherwise starts a text selection / context menu. */
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useHoldToDrag(): (handlers: HoldToDragHandlers) => HoldToDragProps {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef<HTMLElement | null>(null);
  /** A drag just completed, so the click it generates isn't a tap. */
  const justDragged = useRef(false);

  // While armed, touch moves must not also scroll the strip or the page. Setting
  // `touch-action` at this point is too late — the browser decided at touch-start —
  // so the armed drag suppresses the scroll itself, through a non-passive listener
  // (React's own onTouchMove can't preventDefault reliably).
  const blockScroll = useRef<((e: TouchEvent) => void) | null>(null);
  const releaseScroll = useCallback(() => {
    if (held.current && blockScroll.current) {
      held.current.removeEventListener('touchmove', blockScroll.current);
    }
    blockScroll.current = null;
  }, []);

  const selection = useSelectionGuard();

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    armed.current = false;
    origin.current = null;
    releaseScroll();
    selection.release();
    held.current = null;
  }, [releaseScroll, selection]);

  useEffect(() => reset, [reset]);

  return useCallback(
    (handlers: HoldToDragHandlers): HoldToDragProps => ({
      onPointerDown: (e) => {
        reset();
        const el = e.currentTarget as HTMLElement;
        held.current = el;
        origin.current = { x: e.clientX, y: e.clientY };
        selection.suppress();
        const arm = () => {
          timer.current = null;
          armed.current = true;
          el.setPointerCapture(e.pointerId);
          const preventer = (te: TouchEvent) => te.preventDefault();
          blockScroll.current = preventer;
          el.addEventListener('touchmove', preventer, { passive: false });
          selection.lock();
          handlers.onArm(el);
        };
        // A mouse has no scroll/drag ambiguity to resolve (the wheel scrolls), so
        // a pointer device drags immediately — waiting would just feel broken.
        if (e.pointerType === 'mouse') arm();
        else timer.current = setTimeout(arm, DRAG_HOLD_MS);
      },
      onPointerMove: (e) => {
        if (!armed.current) {
          // Moved before the hold completed → this was a scroll. Drop the pending
          // drag so the browser keeps the gesture.
          const from = origin.current;
          if (!from) return;
          const far =
            Math.abs(e.clientX - from.x) > DRAG_HOLD_SLOP_PX ||
            Math.abs(e.clientY - from.y) > DRAG_HOLD_SLOP_PX;
          if (far) reset();
          return;
        }
        handlers.onMove(e);
      },
      onPointerUp: () => {
        const wasArmed = armed.current;
        reset();
        if (!wasArmed) return;
        justDragged.current = true;
        handlers.onDrop();
      },
      onPointerCancel: () => {
        const wasArmed = armed.current;
        reset();
        if (wasArmed) handlers.onCancel();
      },
      onClickCapture: (e) => {
        if (!justDragged.current) return;
        justDragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu: (e) => {
        // Only while the hold is live — a right-click on an idle card is nobody's
        // business of ours.
        if (armed.current || timer.current) e.preventDefault();
      },
    }),
    [reset, selection],
  );
}
