// The other half of "a list change is animated" (ADR-0120 session-130): the
// reveal covers rows entering and leaving, this covers rows that *move*. A
// re-order (the Map's near-me, a day scope that re-sorts) changes only
// positions, so there is nothing to collapse or expand — without this the rows
// teleport to their new places while the rest of the app animates.
//
// FLIP: measure each row before the change (the previous render's rect), let
// React lay the new order out, then play each moved row from its old offset to
// zero. The animation runs through the Web Animations API rather than a CSS
// transition, so it never fights the reveal's own `transform`/`transition-delay`
// on the same element, and it leaves no inline styles behind for React to
// diff against.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from './motion';
import { LIST_MOVE_EASING, LIST_MOVE_MS } from '../constants';

/** Rows opt in by carrying this attribute — `ui/primitives/RevealList` puts it
 *  on every visible row, keyed the same way React keys them. */
export const FLIP_KEY_ATTR = 'data-flip-key';

/** Animate rows inside `container` from where they were to where they now are.
 *  `signature` is what "the list changed" means for the caller (row order +
 *  visibility): the measurement only runs when it changes, so an unrelated
 *  re-render — the Map re-renders on every clock tick — costs no layout read. */
export function useFlipRows(container: RefObject<HTMLElement | null>, signature: string) {
  const previous = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top;
    const next = new Map<string, number>();
    // A first render has nothing to move from, and reduced motion still needs
    // the map filled in so the NEXT change measures against real positions.
    const play = !prefersReducedMotion() && previous.current.size > 0;

    for (const row of el.querySelectorAll<HTMLElement>(`[${FLIP_KEY_ATTR}]`)) {
      const key = row.getAttribute(FLIP_KEY_ATTR);
      if (!key) continue;
      const top = row.getBoundingClientRect().top - base;
      next.set(key, top);
      const before = previous.current.get(key);
      // Sub-pixel drift isn't a move, and a row without a previous position is
      // arriving — the reveal already animates that.
      if (!play || before === undefined || Math.abs(before - top) < 1) continue;
      row.animate?.([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
        duration: LIST_MOVE_MS,
        easing: LIST_MOVE_EASING,
      });
    }
    previous.current = next;
  }, [container, signature]);
}
