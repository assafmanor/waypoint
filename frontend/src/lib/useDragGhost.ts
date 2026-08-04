// The thing you're dragging follows your finger (ADR-0116 §5, sessions 117-118).
//
// Before this the held thing stayed in its slot and only changed style, so the drag
// said "picked up" but never "…and it's over HERE" — the drop stayed guesswork. The
// original can't be what moves: a shelf card lives inside `.shelf`, a horizontally
// scrolling strip, so translating it in place would clip it at the strip's edge the
// moment it left, and it would drag its own layout slot around with it.
//
// The clone is a **DOM clone of the source**, not a re-render. That is what keeps it
// from ever drifting from what it clones, and it is why one mechanism serves both of
// the builder's drags — a shelf card and a builder row are completely different
// markup, and neither needs a bespoke "how do I draw myself while dragging" renderer
// (CLAUDE.md rule 8).
//
// Position is written straight to the node rather than held in React state: this runs
// on every pointer move, and routing ~60 updates a second through a setState would
// re-render the whole builder for each one. That cost is not hypothetical — a churning
// render is what broke the hold in session 116.
import { useCallback, useMemo, useRef } from 'react';
import { DRAG_GHOST_LIFT_PX } from '../constants';
import type { DragPoint } from './edge-autoscroll';

export interface DragGhost {
  /** Mount point for the clone: spread onto an otherwise EMPTY element. The clone is
   *  appended imperatively, so this element must never be given React children.
   *  Positions itself as soon as it mounts — which is a frame after the lift, since
   *  it only renders once the drag is in state, and an unpositioned first paint would
   *  flash at the origin. */
  ref: (el: HTMLElement | null) => void;
  /** The drag armed on `from`, with the finger at `at`. Clones `from` and remembers
   *  where inside it the finger landed, so the clone sits exactly where the original
   *  was instead of jumping its own corner under the finger. */
  lift: (from: HTMLElement, at: DragPoint) => void;
  /** Follow the finger. */
  track: (at: DragPoint) => void;
}

/** Attributes stripped from the clone. Hit-test targets (`data-bld-id`,
 *  `data-shelf-drop`, `data-gap-key`) and ids must not exist twice in the document:
 *  `pointer-events: none` already keeps the clone out of `elementFromPoint`, but a
 *  `querySelector` — in app code or in a test — would still find the copy. */
function sanitize(el: HTMLElement): void {
  el.removeAttribute('id');
  for (const name of el.getAttributeNames()) {
    if (name.startsWith('data-')) el.removeAttribute(name);
  }
  for (const child of el.children) sanitize(child as HTMLElement);
}

export function useDragGhost(): DragGhost {
  const host = useRef<HTMLElement | null>(null);
  const clone = useRef<HTMLElement | null>(null);
  /** The source's size, so the clone keeps it: lifted out of its parent, a row that
   *  was full-width or a card sized by a flex strip would otherwise shrink to fit. */
  const size = useRef({ width: 0, height: 0 });
  const grab = useRef({ x: 0, y: 0 });
  const at = useRef<DragPoint>({ clientX: 0, clientY: 0 });

  /** Put the clone in the host, size it, and move it to the finger. Called from BOTH
   *  `lift` and the ref, because either can happen first: the host normally mounts a
   *  frame after the lift (it only renders once the drag is in state), but a consumer
   *  that keeps it mounted is just as valid, and an order-dependent ghost would fail
   *  silently in exactly one of the two. */
  const paint = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const copy = clone.current;
    if (copy && copy.parentElement !== el) {
      el.replaceChildren(copy);
      el.style.width = `${size.current.width}px`;
      el.style.height = `${size.current.height}px`;
    }
    // translate3d, not top/left: a per-frame update belongs on the compositor rather
    // than in layout.
    //
    // **Lifted clear of the finger** (ADR-0161 §8): the pointer is ON the clone, so the
    // drop target directly under it is hidden by construction — and that is the one you
    // are aiming at. Subtracting the lift puts the finger just below the clone's edge.
    // Physical `clientY` arithmetic, so this is a plain minus in both directions; the
    // hit-tests read the untouched `point`, so what a drop CHOOSES is unaffected.
    const x = at.current.clientX - grab.current.x;
    const y = at.current.clientY - grab.current.y - DRAG_GHOST_LIFT_PX;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const lift = useCallback(
    (from: HTMLElement, point: DragPoint) => {
      const box = from.getBoundingClientRect();
      grab.current = { x: point.clientX - box.left, y: point.clientY - box.top };
      size.current = { width: box.width, height: box.height };
      at.current = point;
      const copy = from.cloneNode(true) as HTMLElement;
      sanitize(copy);
      clone.current = copy;
      paint();
    },
    [paint],
  );

  const ref = useCallback(
    (el: HTMLElement | null) => {
      host.current = el;
      if (!el) {
        clone.current = null;
        return;
      }
      paint();
    },
    [paint],
  );

  const track = useCallback(
    (point: DragPoint) => {
      at.current = point;
      paint();
    },
    [paint],
  );

  // Memoised for the session-116 reason: a fresh object every render churns the
  // identity of everything that closes over it, and a consumer's cleanup effect keyed
  // on that identity would tear down a live gesture.
  return useMemo(() => ({ ref, lift, track }), [ref, lift, track]);
}
