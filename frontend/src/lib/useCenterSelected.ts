// **The selected thing centres itself in its scroller** — one mechanism, for every surface
// that puts a selection inside a strip or a list (root rule 8).
//
// `DayStrip` shipped this and nothing else had it, so a selected category chip sitting 12
// options along the Index filter, the Map's facet strip or the icon picker's tab row stayed
// clipped off the edge while the row it lived in claimed nothing was selected at all.
// `TimeField` had a second copy of the same job on the other axis, hand-rolling the
// `scrollTop` arithmetic. This is those two, generalized, and the axis is the only thing
// that differs between them.
//
// **It scrolls the one scroller, and it measures.** The obvious call —
// `el.scrollIntoView({ inline: 'center' })` — centres the element in EVERY scrollable
// ancestor, which is a different verb: a chip row inside a form sheet would drag the sheet
// to itself on mount, and centring a time row in `.tp-list` would also centre it in the
// sheet behind it. That ancestor reach is exactly why `TimeField` wrote its own arithmetic
// rather than reusing `DayStrip`'s call. So the scroller is found deliberately and scrolled
// by a measured delta, and nothing above it moves.
//
// **The arrival is not animated; the change is.** A strip you are seeing for the first time
// has no movement to communicate — it should simply already be positioned. The smooth scroll
// is for a selection *changing*, which is the only time there is something to show. Latched
// per `active`, so a surface that opens and closes (a picker panel) re-arrives instantly
// each time rather than animating a scroll the user never asked for.
//
// A scroller with **mandatory** scroll-snap needs `scroll-snap-align: center` on its
// selected child, or the browser re-snaps our centred offset back to the nearest
// start-aligned boundary and undoes all of this — see `choice-grid.css`.
import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from './motion';

/** `inline` — a horizontal strip (chip rows, the day strip). `block` — a vertical list. */
export type CenterAxis = 'inline' | 'block';

/** The nearest ancestor that actually scrolls on `axis`. Walked rather than taken from
 *  `parentElement`, because a group in between can be `overflow: visible` and wider than
 *  the scroller holding it: the Map's `.map-facetstrip` owns the scroll and the
 *  `.choice-grid.pills` inside it deliberately does not (two nested scrollers fight). */
function scrollerFor(el: HTMLElement, axis: CenterAxis): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflows =
      axis === 'inline' ? p.scrollWidth > p.clientWidth : p.scrollHeight > p.clientHeight;
    const style = getComputedStyle(p);
    const overflow = axis === 'inline' ? style.overflowX : style.overflowY;
    if (overflows && (overflow === 'auto' || overflow === 'scroll')) return p;
  }
  return null;
}

/** Attach the returned ref to whichever item is currently selected — conditionally, so it
 *  moves with the selection — and pass the selected value as `selected` so a change
 *  re-centres.
 *
 *  `active` gates the whole behaviour on the surface being open / having a visible
 *  selection at all (the Map's all-days scope singles out no day; a picker panel is shut).
 *  Going inactive also resets the arrival latch, so reopening centres instantly. */
export function useCenterSelected<T extends HTMLElement>(
  selected: string | number | null | undefined,
  { axis = 'inline', active = true }: { axis?: CenterAxis; active?: boolean } = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const arrived = useRef(false);

  useEffect(() => {
    if (!active) {
      arrived.current = false;
      return;
    }
    const smooth = arrived.current && !prefersReducedMotion();
    arrived.current = true;

    const el = ref.current;
    const scroller = el && scrollerFor(el, axis);
    if (!el || !scroller) return;

    // Physical coordinates throughout, which is what makes this RTL-safe without a branch:
    // `scrollBy`'s `left` moves the viewport over the content the same physical way in both
    // directions, so the delta between two `getBoundingClientRect()`s is already the answer.
    const item = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const delta =
      axis === 'inline'
        ? item.left + item.width / 2 - (view.left + view.width / 2)
        : item.top + item.height / 2 - (view.top + view.height / 2);
    // Sub-pixel deltas are already centred, and a smooth scroll of nothing still cancels
    // whatever scroll the user has in flight.
    if (Math.abs(delta) < 1) return;

    // jsdom has no layout engine and so no scroll methods on Element.
    scroller.scrollBy?.({
      [axis === 'inline' ? 'left' : 'top']: delta,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [selected, axis, active]);

  return ref;
}
