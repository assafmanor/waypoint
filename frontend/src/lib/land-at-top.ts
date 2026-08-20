// **BRING AN ELEMENT TO THE TOP OF ITS SCROLLER, AND KEEP IT THERE WHILE THE SURFACE
// SETTLES** (2026-08-20, owner: _"when the map is not loaded yet … it doesn't scroll
// correctly"_).
//
// `scrollIntoView` is a one-shot: it computes its destination once, **clamped to the scroll
// extent that exists at the call**, and never revisits it. That is fine on a settled screen
// and wrong on an arriving one — and an arrival is exactly when this is asked for. Measured
// on the Map tab, one arrival on a CPU-throttled cold load: the scroller's extent went
// 303 → 359 → 615 → 641 px over the first second (the selected row opening, the list widening
// to all-days) and then to **666 a further second later**, when the offline-map notice above
// the split appeared and took 25px off the scrollport. Every aim before that last step is
// short by whatever had not arrived yet, and nothing in the DOM reads as wrong: the row is
// selected, the rects are healthy, the scroller is simply somewhere else.
//
// ADR-0168 §3's first answer to this waited out the row's own reveal and aimed a second time.
// That covered one supplier of late extent and could not cover the others, which is the report
// above: when the map has not loaded yet, EVERYTHING is still arriving — tiles, the archive
// check's notice, the camera's first `moveend`, a permission answer — and enumerating them is
// the wrong shape of fix.
//
// So this watches instead. Per frame, for a bounded window:
//
//   • **no element yet** → keep looking (the row may be a frame behind a widening list, or a
//     snapshot behind a cold boot);
//   • **the scroller is moving** → leave it alone, that is our own eased scroll in flight;
//   • **it has stopped and the geometry changed** → aim again;
//   • **it has stopped and nothing changed** → aim once more, exactly once. This is the whole
//     trick: an aim that was clamped leaves no trace, so the only way to find out is to ask
//     again, and asking when the element is already where it belongs costs nothing (the
//     browser computes the same offset and does not scroll).
//
// **It never fights a finger.** A `pointerdown`, a touch, a wheel or a key ends the watch on
// the spot: past the first aim this is a correction, and a correction that overrules the
// person scrolling is worse than a landing that is 30px off.
//
// Deliberately a frame loop rather than a `ResizeObserver` pair on the scroller and its
// content: the cost is two rects a frame on a screen that already re-renders on the clock, and
// one mechanism that reads the same three numbers every frame is easier to reason about than
// two that fire at different times. What the window costs is bounded and what it buys is every
// cause at once.
import { prefersReducedMotion } from './motion';
import { scrollerFor } from './scrollable';
import { LANDING_WATCH_MS } from '../constants';

/** A person taking hold of the list. `pointerdown` rather than `click`, so the watch ends when
 *  the finger lands rather than when it lifts; captured, so a handler that stops propagation
 *  cannot hide it. */
const HANDS_ON = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;

/**
 * Aim `find()`'s element at the top of its scroller and keep the landing true for
 * `windowMs`. Returns the canceller — call it when the surface it was aiming at is gone, or
 * when a newer landing replaces this one.
 *
 * `find` is called every frame rather than taking an element, because the element may not
 * exist yet and may be replaced by a re-render while the watch is running (a keyed row is a
 * new node). The gap above the landing is the element's own `scroll-margin-top`, so a caller
 * passes no numbers and the offset stays in the stylesheet that owns the row.
 */
export function landAtTop(
  find: () => Element | null | undefined,
  windowMs: number = LANDING_WATCH_MS,
): () => void {
  let frame = 0;
  let watching = true;
  const stop = () => {
    watching = false;
    cancelAnimationFrame(frame);
    for (const type of HANDS_ON) window.removeEventListener(type, stop, true);
  };
  for (const type of HANDS_ON) {
    window.addEventListener(type, stop, { capture: true, passive: true });
  }

  const aim = (el: Element) =>
    el.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

  const deadline = performance.now() + windowMs;
  /** Have we aimed at all; and have we already asked again since the last movement. */
  let aimed = false;
  let asked = false;
  /** What the CONTENT looked like at the last aim — scroll-independent on purpose, so our own
   *  scrolling never reads as the surface changing. `null` until there is a scroller to read it
   *  from, which is a real state and not an edge case: a list that does not overflow yet has
   *  nothing to scroll, and one that overflows a moment later has to be aimed at again. */
  let geometry: string | null = null;
  let scrolled: number | undefined;

  const step = () => {
    if (!watching) return;
    const el = find();
    const scroller = el instanceof HTMLElement ? scrollerFor(el, 'block') : null;
    const reading =
      el && scroller
        ? `${scroller.scrollHeight}|${scroller.clientHeight}|${Math.round(
            el.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top +
              scroller.scrollTop,
          )}`
        : null;
    if (el && !aimed) {
      // The aim the moment there is something to aim at, scroller or not — a list that does not
      // overflow needs no scrolling, and this keeps the one-shot contract for the surfaces that
      // never do (the graceful-absence path's short list).
      aimed = true;
      geometry = reading;
      scrolled = scroller?.scrollTop;
      aim(el);
    } else if (el && scroller && reading) {
      if (geometry === null) {
        // It overflows NOW and did not when we aimed, so that aim moved nothing.
        geometry = reading;
        scrolled = scroller.scrollTop;
        asked = false;
        aim(el);
      } else if (scroller.scrollTop !== scrolled) {
        // Moving — ours, and it may still be heading somewhere that has since become
        // reachable, so the ask below is re-armed for when it stops.
        scrolled = scroller.scrollTop;
        asked = false;
      } else if (reading !== geometry) {
        geometry = reading;
        asked = false;
        aim(el);
      } else if (!asked) {
        asked = true;
        aim(el);
      }
    }
    if (performance.now() < deadline) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
  return stop;
}
