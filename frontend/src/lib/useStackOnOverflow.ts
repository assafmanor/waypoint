// "Lay this out inline while it fits; switch to the stacked layout when it
// doesn't." The one shared overflow-driven layout switch — used by RouteLabel so
// a long origin→destination route reads the same way on every surface that opts
// in (the Trip-mode day timeline and the Plan-mode builder today).
//
// Why measurement and not CSS: neither a media nor a container query can ask
// "does this text fit on one line" — only layout knows. So we measure once in
// the inline layout and remember the width it *wanted*:
//
//   inline  → compare the row's natural (nowrap) `scrollWidth` against the
//             space it actually has (`clientWidth`). Overflowing latches the
//             natural width and flips to stacked.
//   stacked → the inline row is gone, so compare the remembered natural width
//             against the CONTAINER's width instead, and flip back once there's
//             room again (rotation, tablet layout, a card opening).
//
// That keeps the switch bidirectional without mounting a hidden duplicate of
// the text as a ruler — the DOM carries each place name exactly once, which
// matters for screen readers and for tests.
//
// `containerRef` must be a stable ancestor whose width does NOT depend on this
// content (a `flex:1; min-width:0` cell, say) — the same requirement, and for
// the same feedback-loop reason, as `useShrinkToFit`, the sibling hook that
// measures-and-observes to shrink a font instead of switching a layout. If a
// third measure-and-observe case appears, generalize the pair rather than
// adding a fourth.
//
// `key` identifies the content: when it changes the latch resets, so new text
// is re-measured from the inline layout.
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Sub-pixel slack: layout widths are fractional, so require a real overflow
 *  (more than a rounding wobble) before switching. */
const OVERFLOW_SLACK_PX = 1;

export function useStackOnOverflow<R extends HTMLElement, C extends HTMLElement = HTMLElement>(
  key: string,
): { rowRef: RefObject<R | null>; containerRef: RefObject<C | null>; stacked: boolean } {
  const rowRef = useRef<R>(null);
  const containerRef = useRef<C>(null);
  const [stacked, setStacked] = useState(false);
  // The width the inline row wanted, latched when it first overflowed.
  const naturalWidth = useRef<number | null>(null);

  // New content re-measures from scratch (it may be shorter than what stacked).
  useLayoutEffect(() => {
    naturalWidth.current = null;
    setStacked(false);
  }, [key]);

  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      if (!stacked) {
        if (!row) return;
        // The row is `white-space: nowrap`, so scrollWidth is its natural width.
        if (row.scrollWidth > row.clientWidth + OVERFLOW_SLACK_PX) {
          naturalWidth.current = row.scrollWidth;
          setStacked(true);
        }
        return;
      }
      const container = containerRef.current;
      if (!container || naturalWidth.current == null) return;
      if (container.clientWidth >= naturalWidth.current) setStacked(false);
    };
    measure();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [key, stacked]);

  return { rowRef, containerRef, stacked };
}
