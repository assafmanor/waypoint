// The thing you're dragging follows your finger (ADR-0116 §5, session-117 amendment).
//
// Until now the held card stayed in its slot and only changed style, so the drag
// said "picked up" but never said "…and it's over HERE" — the drop stayed guesswork.
// The card itself can't be the thing that moves: it lives inside `.shelf`, a
// horizontally scrolling strip, so translating it in place would clip it at the
// strip's edge the moment it left, and it would drag its own layout slot around
// with it. So a clone floats above the page and the source stays put as a
// placeholder (which is also why the source may dim again — see maybe-card.css).
//
// Position is written straight to the node's style rather than held in React state:
// this runs on every pointer move, and routing ~60 updates a second through a
// setState would re-render the whole builder for each one. The builder's re-render
// cost is not hypothetical — a churning render is what broke the hold in session 116.
import { useCallback, useMemo, useRef } from 'react';
import type { DragPoint } from './edge-autoscroll';

export interface DragGhost {
  /** Ref for the floating clone's wrapper. Positions it as soon as it mounts —
   *  which is a frame AFTER the lift, since the clone only renders once the drag
   *  is in state, and an unpositioned first paint would flash at the origin. */
  ref: (el: HTMLElement | null) => void;
  /** The drag armed on `from`, with the finger at `at`: remember where inside the
   *  card the finger landed, so the clone sits exactly where the card was instead
   *  of jumping its own corner under the finger. */
  lift: (from: HTMLElement, at: DragPoint) => void;
  /** Follow the finger. */
  track: (at: DragPoint) => void;
}

export function useDragGhost(): DragGhost {
  const node = useRef<HTMLElement | null>(null);
  const grab = useRef({ x: 0, y: 0 });
  const at = useRef<DragPoint>({ clientX: 0, clientY: 0 });

  const place = useCallback(() => {
    const el = node.current;
    if (!el) return;
    // translate3d, not top/left: this is a per-frame update and it belongs on the
    // compositor, not in layout.
    const x = at.current.clientX - grab.current.x;
    const y = at.current.clientY - grab.current.y;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const lift = useCallback((from: HTMLElement, point: DragPoint) => {
    const box = from.getBoundingClientRect();
    grab.current = { x: point.clientX - box.left, y: point.clientY - box.top };
    at.current = point;
  }, []);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      node.current = el;
      place();
    },
    [place],
  );

  const track = useCallback(
    (point: DragPoint) => {
      at.current = point;
      place();
    },
    [place],
  );

  // Memoised for the session-116 reason: a fresh object every render churns the
  // identity of everything that closes over it, and a consumer's cleanup effect
  // keyed on that identity would then tear down a live gesture.
  return useMemo(() => ({ ref, lift, track }), [ref, lift, track]);
}
