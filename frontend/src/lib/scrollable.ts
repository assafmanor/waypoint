// **"Does this actually scroll right now?"**, asked in the two ways the app needs it.
//
// Extracted from `useCenterSelected`, which owned the ancestor walk privately, when the
// sheet's drag became its second caller (root rule 8: generalize the one-off rather than
// writing a second copy beside it). Both callers need the same primitive and ask different
// questions of it: one wants the scroller so it can move it, the other wants to know whether
// a press belongs to a scroller at all.
//
// **The file answers two questions and they are not the same one.** "Does this box scroll
// RIGHT NOW" (`scrollsOn`, `scrollerFor`) means CONTENT OVERFLOWING: an `overflow-y: auto` box
// whose content fits is a scroll container the browser will never scroll, and treating it as
// scrollable is what would make a sheet whose list fits refuse the drag it is supposed to
// offer. "Which box is the scrolling REGION this surface lives in" (`isScrollContainer`,
// `scrollContainerFor`) is a question about layout, and that same box is the honest answer to
// it. Asking the first while meaning the second is a bug that hides on every long day and
// appears on every short one — see `isScrollContainer`.

/** `inline` — a horizontal strip (chip rows, the day strip). `block` — a vertical list. */
export type ScrollAxis = 'inline' | 'block';

/** Is `el` a scroll **container** on `axis` — an overflow value that scrolls rather than
 *  clips — whether or not its content overflows it right now?
 *
 *  The distinction from `scrollsOn` is the whole reason both exist. A gesture asks "will this
 *  box move if I drag it", which an `auto` box whose content fits answers **no** to. A layer
 *  measuring the scrolling region a surface lives in asks "which box is the viewport onto this
 *  screen", which that same box answers **yes** to — the region is there and has a size on a
 *  day with two events exactly as on a day with twenty. `DayPeek` asked the first question and
 *  meant the second, and so drew nothing at all on any day that fitted. */
export function isScrollContainer(el: HTMLElement, axis: ScrollAxis): boolean {
  const style = getComputedStyle(el);
  const overflow = axis === 'inline' ? style.overflowX : style.overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/** Does `el` scroll on `axis` **right now** — content genuinely overflowing, and an overflow
 *  value that scrolls rather than clips? */
export function scrollsOn(el: HTMLElement, axis: ScrollAxis): boolean {
  const overflows =
    axis === 'inline' ? el.scrollWidth > el.clientWidth : el.scrollHeight > el.clientHeight;
  return overflows && isScrollContainer(el, axis);
}

/** The nearest ancestor that scrolls on `axis`. Walked rather than taken from
 *  `parentElement`, because a group in between can be `overflow: visible` and wider than
 *  the scroller holding it: the Map's `.map-facetstrip` owns the scroll and the
 *  `.choice-grid.pills` inside it deliberately does not (two nested scrollers fight). */
export function scrollerFor(el: HTMLElement, axis: ScrollAxis): HTMLElement | null {
  return ancestorMatching(el, (p) => scrollsOn(p, axis));
}

/** The nearest ancestor that is a scroll **container** on `axis` — the region a surface
 *  scrolls within, found on a short day too (`isScrollContainer`). */
export function scrollContainerFor(el: HTMLElement, axis: ScrollAxis): HTMLElement | null {
  return ancestorMatching(el, (p) => isScrollContainer(p, axis));
}

function ancestorMatching(
  el: HTMLElement,
  test: (candidate: HTMLElement) => boolean,
): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (test(p)) return p;
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
