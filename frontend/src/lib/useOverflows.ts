// "Does this inline row still fit?" — the one shared overflow probe behind a
// layout that has a roomier form and a compact fallback. Used by
// `useRouteDisplay` so a transport row can drop from `origin → destination` to a
// destination-primary line when even the shortened names don't fit.
//
// Why measurement and not CSS: neither a media nor a container query can ask
// "does this text fit on one line" — only layout knows. So we measure once in the
// inline layout and remember the width it *wanted*:
//
//   fitting     → compare the row's natural (nowrap) `scrollWidth` against the
//                 space it actually has (`clientWidth`). Overflowing latches the
//                 natural width and flips `overflows`.
//   overflowing → the inline row is gone, so compare the latched natural width
//                 against the CONTAINER's width instead, and flip back once
//                 there's room again (rotation, tablet, a card opening).
//
// That keeps the switch bidirectional without mounting a hidden duplicate of the
// text as a ruler — the DOM carries each place name exactly once, which matters
// for screen readers and for tests.
//
// `containerRef` must be a stable ancestor whose width does NOT depend on this
// content (a `flex:1; min-width:0` cell, say) — the same requirement, and for the
// same feedback-loop reason, as `useShrinkToFit`, the sibling hook that
// measures-and-observes to shrink a font instead of switching a layout. If a
// third measure-and-observe case appears, generalize the pair rather than adding
// a fourth.
//
// `key` identifies the content: when it changes the latch resets, so new text is
// re-measured from the inline layout.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Sub-pixel slack: layout widths are fractional, so require a real overflow
 *  (more than a rounding wobble) before switching. */
const OVERFLOW_SLACK_PX = 1;

export function useOverflows<R extends HTMLElement, C extends HTMLElement = HTMLElement>(
  key: string,
): { rowRef: RefObject<R | null>; containerRef: RefObject<C | null>; overflows: boolean } {
  const rowRef = useRef<R>(null);
  const containerRef = useRef<C>(null);
  const [overflows, setOverflows] = useState(false);
  // The width the inline row wanted, latched when it first overflowed.
  const naturalWidth = useRef<number | null>(null);

  // New content re-measures from scratch (it may fit where the old text did not).
  useLayoutEffect(() => {
    naturalWidth.current = null;
    setOverflows(false);
  }, [key]);

  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      if (!overflows) {
        if (!row) return;
        // The row is `white-space: nowrap`, so scrollWidth is its natural width.
        if (row.scrollWidth > row.clientWidth + OVERFLOW_SLACK_PX) {
          naturalWidth.current = row.scrollWidth;
          setOverflows(true);
        }
        return;
      }
      const container = containerRef.current;
      if (!container || naturalWidth.current == null) return;
      if (container.clientWidth >= naturalWidth.current) setOverflows(false);
    };
    measure();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [key, overflows]);

  return { rowRef, containerRef, overflows };
}
