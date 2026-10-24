// **A scrolling strip fades only the edge that is actually hiding something.**
//
// The fade itself is ADR-0100 §6 and is unchanged: a `mask-image` gradient, so the peek at a
// strip's edge reads as "scroll for more" rather than as a chopped chip. What was wrong is
// that it was UNCONDITIONAL (owner's report, 2026-08-21) — a row resting on its first chip
// faded that chip, the last chip stayed faded at the end of the travel, and a strip whose
// chips all fit faded both ends of a row with nothing beyond either. The affordance promised
// more where there was no more, which is the one thing it exists to say.
//
// **One mechanism, three strips** (root rule 8). `.choice-grid.pills`, the maybe `.shelf` and
// the Map's `.map-facetstrip` each wrote out the same four declarations, the second and third
// naming the first in a comment — a copy admitting that it is one. The gradient now lives once
// in `styles/edge-fade.css` and its two stop widths are custom properties, which is all this
// file drives: zero the side with nothing behind it, leave the other at the stylesheet's width.
//
// **A callback ref, not a hook**, for the same reason `observe-resize.ts` is a plain function:
// the shelf renders its strips inside a `.map()` in two screens, so a hook could not be called
// per strip. React 19 takes the returned disposer as the ref's cleanup.
import { scrollsOn } from './scrollable';
import { observeResize } from './observe-resize';

/** The gradient's two stop widths. **Physical**, because `mask-image`'s coordinate space is
 *  physical in both directions — the very reason ADR-0100 §6's gradient reads `to right`. */
const FADE_LEFT = '--edge-fade-l';
const FADE_RIGHT = '--edge-fade-r';

/** How much hidden content an edge may hold and still count as AT that edge.
 *
 *  Not 1px, and measured rather than guessed: the maybe shelf has `padding-inline: 2px` under
 *  `scroll-snap-type: x mandatory`, so its resting snap boundary is `scrollLeft: -2` and a
 *  1px tolerance faded the first card of a strip nobody had scrolled — the reported bug,
 *  surviving its own fix. Six is an order below the 14px ramp the mask draws, so nothing a
 *  fade could actually show is missed. */
const AT_EDGE_PX = 6;

/** Zero a side, or hand it back to the stylesheet's width. */
function fade(el: HTMLElement, side: string, on: boolean): void {
  if (on) el.style.removeProperty(side);
  else el.style.setProperty(side, '0px');
}

function paint(el: HTMLElement, rtl: boolean): void {
  // `Math.abs`, and so no direction branch: `scrollLeft` is measured from the LEADING edge and
  // runs negative in RTL, so its magnitude is "how far along" in both directions.
  const along = Math.abs(el.scrollLeft);
  const travel = el.scrollWidth - el.clientWidth;
  // `scrollsOn` rather than `travel > 0`: content can overflow a box that clips instead of
  // scrolling, and the Map's nested pills group is exactly that (`overflow: visible`, the outer
  // strip owns the scroll) — a mask there would fade a chip a second time.
  const scrolls = scrollsOn(el, 'inline');
  const hidesLead = scrolls && along > AT_EDGE_PX;
  const hidesTrail = scrolls && along < travel - AT_EDGE_PX;
  fade(el, FADE_LEFT, rtl ? hidesTrail : hidesLead);
  fade(el, FADE_RIGHT, rtl ? hidesLead : hidesTrail);
}

/**
 * Attach to the scrolling strip itself, beside the `edge-fade` class:
 *
 *   <div className="shelf edge-fade" ref={edgeFadeRef}>
 *
 * It measures once on attach and then keeps the two stops true — on scroll, on a resize of the
 * strip, and on chips or cards arriving and leaving.
 */
export function edgeFadeRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return;
  // Read once: a strip's writing direction is set by the document and does not change under it,
  // and this is a style recalc inside a scroll handler otherwise.
  const rtl = getComputedStyle(el).direction === 'rtl';
  const measure = () => paint(el, rtl);
  measure();

  el.addEventListener('scroll', measure, { passive: true });
  const unobserve = observeResize(el, measure);
  // A chip row's options come and go without the strip's own box changing — a category loses
  // its last note, a card is planned off the shelf — and there is no event for a scroll width.
  // `childList` only, so a count badge re-rendering its digits inside an existing chip (a
  // `characterData` mutation) doesn't buy a measurement it cannot change the answer to.
  const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
  mutations?.observe(el, { childList: true, subtree: true });

  return () => {
    el.removeEventListener('scroll', measure);
    unobserve();
    mutations?.disconnect();
  };
}
