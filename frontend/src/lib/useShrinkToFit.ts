// Shrinks an element's font-size in whole-px steps until its content fits on
// one line, down to a floor — used for the header's trip-name pill so a long
// name resizes instead of wrapping (ugly) or clipping (loses the name).
// Trip names are also capped at creation (MAX_TRIP_NAME_LENGTH), but that cap
// is a length bound, not a fit guarantee (see its comment) — this hook is what
// keeps the name on one line, with `overflow`/`text-overflow` in CSS as the
// fallback for the rare case it still doesn't fit at the floor size.
//
// Re-fits on any resize of `containerRef`'s element, not just on `text`
// changes — e.g. the header's avatar cluster growing/shrinking (a member
// joins, the overflow bubble appears) changes how much room the pill has,
// with no change to the trip name itself. `containerRef` must be a stable
// ancestor whose size doesn't depend on the target's own font-size (here:
// the flex wrapper around the pill, which gets its width from flex-grow
// against its sibling, not from its content) — observing the target itself
// would feed back into its own resize and jitter.
//
// **The fit test is measured in sub-pixels, and it has to be** (ADR-0149 §9).
// `scrollWidth`/`clientWidth` are ROUNDED, so text overflowing its box by 1.8px
// reports 94 against 93 and the loop stops a step early while the browser draws
// an ellipsis. A `Range` over the element's contents reports the width the
// renderer actually laid the text out at, which is the only number the two can
// agree on.
import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Sub-pixel slack before text counts as overflowing. Sub-pixel measurement cuts
 *  both ways: text that fits exactly can report a hair wider than its box, and
 *  shrinking a step for 0.02px would be a visible regression bought by noise. */
const FIT_SLACK_PX = 0.5;

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** The laid-out width of everything inside `el` — children included, since a
 *  Range over the contents spans them all. */
function textWidth(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

/** The room the text has, in the same sub-pixel units. The rect is the border
 *  box, so the target's own padding and border come off it — a target with
 *  neither (today's `.trip-name`) subtracts zero and pays nothing. */
function contentWidth(el: HTMLElement): number {
  const paint = getComputedStyle(el);
  return (
    el.getBoundingClientRect().width -
    px(paint.paddingInlineStart) -
    px(paint.paddingInlineEnd) -
    px(paint.borderInlineStartWidth) -
    px(paint.borderInlineEndWidth)
  );
}

export function useShrinkToFit<T extends HTMLElement, C extends HTMLElement = HTMLElement>(
  text: string,
  { maxPx = 26, minPx = 15 }: { maxPx?: number; minPx?: number } = {},
): { targetRef: RefObject<T | null>; containerRef: RefObject<C | null> } {
  const targetRef = useRef<T>(null);
  const containerRef = useRef<C>(null);

  useLayoutEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const fit = () => {
      let size = maxPx;
      el.style.fontSize = `${size}px`;
      while (textWidth(el) > contentWidth(el) + FIT_SLACK_PX && size > minPx) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();

    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text, maxPx, minPx]);

  return { targetRef, containerRef };
}
