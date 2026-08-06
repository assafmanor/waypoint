// **"Does this actually scroll right now?"**, asked in the two ways the app needs it.
//
// Extracted from `useCenterSelected`, which owned the ancestor walk privately, when the
// sheet's drag became its second caller (root rule 8: generalize the one-off rather than
// writing a second copy beside it). Both callers need the same primitive and ask different
// questions of it: one wants the scroller so it can move it, the other wants to know whether
// a press belongs to a scroller at all.
//
// **"Scrollable" here means CONTENT OVERFLOWING, not `overflow: auto`.** That distinction is
// the whole value of this file: an `overflow-y: auto` box whose content fits is a scroll
// container the browser will never scroll, and treating it as scrollable is what would make a
// sheet whose list fits refuse the drag it is supposed to offer.

/** `inline` — a horizontal strip (chip rows, the day strip). `block` — a vertical list. */
export type ScrollAxis = 'inline' | 'block';

/** Does `el` scroll on `axis` **right now** — content genuinely overflowing, and an overflow
 *  value that scrolls rather than clips? */
export function scrollsOn(el: HTMLElement, axis: ScrollAxis): boolean {
  const overflows =
    axis === 'inline' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
  if (!overflows) return false;
  const style = getComputedStyle(el);
  const overflow = axis === 'inline' ? style.overflowX : style.overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/** The nearest ancestor that scrolls on `axis`. Walked rather than taken from
 *  `parentElement`, because a group in between can be `overflow: visible` and wider than
 *  the scroller holding it: the Map's `.map-facetstrip` owns the scroll and the
 *  `.choice-grid.pills` inside it deliberately does not (two nested scrollers fight). */
export function scrollerFor(el: HTMLElement, axis: ScrollAxis): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (scrollsOn(p, axis)) return p;
  }
  return null;
}

/**
 * **Is there a scroller on `axis` between `from` and `boundary`?** — the question a gesture
 * asks before claiming a press: if something inside the region already scrolls on this axis,
 * the press is that scroller's and not the gesture's.
 *
 * `boundary` is exclusive, and that is the point of taking it: the sheet's body is itself an
 * `overflow-y: auto` box, so a walk that did not stop below it would always find one and no
 * press would ever be claimable. `from` is included — a press can land directly on a nested
 * scroller rather than on something inside it.
 *
 * `false` when `from` is not inside `boundary` at all, which is the honest answer to a
 * malformed question rather than a walk off the top of the document.
 */
export function scrollerWithin(
  from: HTMLElement,
  boundary: HTMLElement,
  axis: ScrollAxis,
): boolean {
  if (!boundary.contains(from)) return false;
  for (let el: HTMLElement | null = from; el && el !== boundary; el = el.parentElement) {
    if (scrollsOn(el, axis)) return true;
  }
  return false;
}
