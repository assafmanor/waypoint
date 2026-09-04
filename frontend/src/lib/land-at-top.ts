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
// So this watches instead. Per frame, for a bounded window, and it is two rules:
//
//   • **while the scroller is moving, leave it alone** — that is our own eased scroll, and
//     re-aiming into a live one is how a correction becomes a crawl;
//   • **while it is at rest, keep asking.** At rest does not mean landed: a clamped aim leaves
//     no trace, and an aim can move nothing at all while a surface is still sizing itself. An
//     ask with nothing to do costs a layout read and no scroll; an ask that can finally act is
//     the whole point.
//
// The first version of this asked exactly ONCE and then waited for the geometry to change,
// which is a bet that something else will move — and on a slow machine nothing does. Plan
// mode's day surface is a lazy chunk that mounts ~5s in under 6× CPU throttling, and its
// arrival's first two asks left `scrollTop` at 0 while the scrollport was still growing. It
// passed on every machine fast enough not to notice, which is the same shape as the defect
// above.
//
// **It never fights a finger.** A `pointerdown`, a touch, a wheel or a key ends the watch on
// the spot: past the first aim this is a correction, and a correction that overrules the
// person scrolling is worse than a landing that is 30px off.
//
// Deliberately a frame loop rather than a `ResizeObserver` pair on the scroller and its
// content: what it reads per frame is one `scrollTop` and one ancestor walk, on screens that
// already re-render on the clock — and a loop that asks the same question every frame is easier
// to reason about than two observers firing at different times. What the window costs is
// bounded; what it buys is every cause of a short landing at once, including the ones nobody
// has hit yet.
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';
import { scrollerFor } from './scrollable';
import { LANDING_WAIT_MS, LANDING_WATCH_MS } from '../constants';

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

  /**
   * **Two budgets, because "not there yet" and "there but still settling" are different waits.**
   *
   * `windowMs` was measured against a surface that EXISTS — the extent growing under it, the
   * row opening, a notice arriving above it. It was also, until 2026-08-21, the budget for
   * waiting on the surface to appear at all, and that is a different order of magnitude: this
   * file's own header notes that Plan mode's day view is a **lazy chunk that mounts ~5s in
   * under 6× CPU throttling**. So on a loaded machine the whole 2.5s could be spent before
   * `find()` had anything to return, the watch closed, and the landing never happened —
   * `event-arrival-scroll.spec.ts` failing on CI's `preview` leg with the row's `top` at 883
   * in an 844-high viewport, unmoved for thirty seconds of retries, while it passed 16/16
   * locally where the chunk is warm.
   *
   * The fix is not a bigger number, it is starting the clock at the right moment: the settle
   * budget begins on the frame the element first appears. Until then only the wait budget
   * runs, and a frame of waiting costs one `find()` — a `querySelector` — which is why it can
   * afford to be generous. A hand on the list still ends either one instantly.
   */
  const waitDeadline = performance.now() + LANDING_WAIT_MS;
  /** Set on the frame `find()` first answers, which is when settling starts mattering. */
  let settleDeadline: number | undefined;
  /** Whether the one-shot aim has gone out — only meaningful while nothing scrolls yet. */
  let aimed = false;
  /** The offset the scroller was last seen resting at; `undefined` until we have seen it. */
  let resting: number | undefined;

  const step = () => {
    if (!watching) return;
    const el = find();
    if (!el) {
      // Nothing to aim at yet. Keep looking — this is the lazy-chunk case, and it is the
      // whole reason the two budgets are separate.
      if (performance.now() < waitDeadline) frame = requestAnimationFrame(step);
      else stop();
      return;
    }
    settleDeadline ??= performance.now() + windowMs;
    const scroller = el instanceof HTMLElement ? scrollerFor(el, 'block') : null;
    if (el && !scroller) {
      // **Nothing overflows yet**, which is a real state and not an edge case: a list that has
      // not filled its box has nothing to scroll, and one that fills it a moment later gets
      // aimed at by the branch below. One aim here keeps the one-shot contract for the surfaces
      // that never do overflow (the graceful-absence path's short list).
      if (!aimed) {
        aimed = true;
        aim(el);
      }
    } else if (el && scroller) {
      if (resting !== undefined && scroller.scrollTop !== resting) {
        // **Moving — and it is ours.** Leave it alone: re-aiming into a live scroll is how a
        // correction becomes a crawl, each call restarting an ease that never arrives.
        resting = scroller.scrollTop;
      } else {
        // **At rest, which does not mean landed.** An aim can move nothing at all — measured on
        // a 6×-throttled Plan day, the arrival's first two asks left `scrollTop` at 0 while the
        // surface was still sizing itself, and the scroll only took hold once the scrollport had
        // finished growing 300ms later. So the ask repeats for as long as the scroller is still:
        // one that has nothing to do costs a layout read and no scroll, and one that CAN act is
        // the whole of this fix. The moment it acts, the branch above takes over.
        resting = scroller.scrollTop;
        aimed = true;
        aim(el);
      }
    }
    if (performance.now() < settleDeadline) frame = requestAnimationFrame(step);
    else stop();
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/**
 * **AN ARRIVAL OUTLIVES THE PARAM THAT ANNOUNCED IT** (2026-09-04, from a red `e2e (dev)` on
 * `main` — `event-arrival-scroll.spec.ts`, the row sitting at ⁦1281px⁩ in an ⁦844px⁩ viewport with
 * `scrollTop` at ⁦0⁩ and staying there for the thirty seconds the assertion retried).
 *
 * Both day surfaces wrote the landing as three lines:
 *
 *     const arrivingEvent = useArrivalParam(EVENT_PARAM, …);
 *     useEffect(() => {
 *       if (!arrivingEvent) return;
 *       return landAtTop(() => document.querySelector(eventRowSelector(arrivingEvent)));
 *     }, [arrivingEvent]);
 *
 * and the dependency is the bug. `useArrivalParam` **spends** the id — it deletes the param in
 * its own effect so a back or a reload cannot re-open what you have since closed — so one
 * render later `arrivingEvent` is `null`, the dependency changes, and React runs the cleanup:
 * the canceller. **The watch built to survive ⁦10s⁩ of a lazy surface arriving actually lived
 * for one React commit**, and the whole two-budget design above it was unreachable.
 *
 * It passed everywhere fast, which is what kept it: `scrollIntoView` is not cancelled by the
 * watch stopping, so a machine that gets the row mounted and the first aim away before the
 * spend's re-render lands looks perfect. Instrumented under four parallel workers, the losing
 * run reads `start … stop` ⁦238ms⁩ apart with **no `found` between them** — the watch was torn
 * down before Plan's lazy day chunk had mounted a row to aim at, and nothing restarted it.
 *
 * So the arrival is latched here instead. A non-null id mints a fresh object, and only that
 * object is the effect's dependency: the spend that follows sets the id to `null`, which this
 * ignores, and the watch keeps its own budget. A LATER arrival — a note's way-in to another
 * event on the day you are already on — mints another object and replaces the watch, which is
 * why the latch is an object per arrival and not a "first id wins" ref.
 *
 * `find` is read through a ref so a caller can pass the inline arrow it wants to pass; the
 * hook's own dependency is the arrival, never the closure.
 */
export function useLandOnArrival(
  id: string | null | undefined,
  find: (id: string) => Element | null | undefined,
  windowMs?: number,
): void {
  const latest = useRef(find);
  latest.current = find;
  const [arrival, setArrival] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (id) setArrival({ id });
  }, [id]);
  useEffect(() => {
    if (!arrival) return;
    const { id: target } = arrival;
    return landAtTop(() => latest.current(target), windowMs);
  }, [arrival, windowMs]);
}
