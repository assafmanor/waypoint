// Shrinks an element's font-size in whole-px steps until its content fits on
// one line, down to a floor — used for the header's trip-name pill so a long
// name resizes instead of wrapping (ugly) or clipping (loses the name).
// Trip names are also capped at creation (MAX_TRIP_NAME_LENGTH), so this
// rarely needs to move far; `overflow`/`text-overflow` in CSS stay as the
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
// ponytail: no DOM-layout test harness in this repo (vitest runs in the
// `node` environment, no jsdom) — scrollWidth/clientWidth are always 0 there,
// so a "unit test" would pass without exercising the real shrink loop. Add
// one if/when component tests with real layout land.
import { useLayoutEffect, useRef, type RefObject } from 'react';

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
      while (el.scrollWidth > el.clientWidth && size > minPx) {
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
