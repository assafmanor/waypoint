// **A horizontal swipe that steps a full surface one page along the inline axis**
// (ADR-0200), with the refusal at the ends carried by the gesture itself.
//
// **It reports `live` so the host can mount the neighbouring pages** (§7). That is the one
// piece of React state in the whole gesture — two renders, at the claim and at the settle —
// and everything between them is a CSS custom property, because a state update per
// `pointermove` would re-render the heaviest screen in the app sixty times a second.
//
// **Why this is a third pointer recogniser and not a reuse of either existing one.**
// `useHoldToDrag` is hold-gated and takes no capture, because a shelf card is a tap
// target inside a scrolling strip and its dragged element can unmount mid-gesture.
// `useSnapDrag` is the sheet's height model — its `onDrag`/`onRelease` speak px of
// sheet height and it reads one axis in one direction — and its own header records
// that it is "a PARTIAL convergence" with the hold, "and still not an extraction".
// Nothing in either answers "which way did the finger go, and is there a page that
// way": generalising the sheet's would mean rewriting the sheet's drag, which root
// rule 8 says to ask about rather than take on silently. So this is written as the
// SHARED one for its own question — axis-aware, direction-aware, page-shaped — and a
// second surface that pages is `useSwipePager({ canStep, onStep })` and a class.
//
// Three things it does inherit rather than invent (ADR-0182 §4 settled all three for
// this codebase's one other swipe):
//
//   1. **Capture on RECOGNITION, never on `pointerdown`.** Capture retargets the
//      following `click` to the capturing element, so capturing early would kill every
//      tap on the surface — and the surface is nothing but taps.
//   2. **`armClickSwallow` on the release.** A swipe that begins on an event card must
//      not also expand it. Armed by the release (the event before the click being
//      guarded), never by the decision.
//   3. **The listeners sit on the `window`.** A page step travels most of the screen's
//      width; two frames in, the pointer is over something else entirely.
//
// **And one it deliberately does not: there is no `touch-action` on the host.** `pan-y`
// would be the obvious way to keep the horizontal axis for ourselves, and it is the mistake
// ADR-0182's device pass found from the other side — `touch-action` INTERSECTS down the
// ancestor chain and no descendant can widen it back, so on a whole day surface it takes the
// horizontal scroll away from every strip inside it. Re-measured here rather than inherited
// as a rule: `pan-y` on the day root stopped the maybe shelf scrolling at all. The axis is
// claimed in JS instead, at the press (`scrollerWithin`) and at the first real move
// (`touchMove`), which is the one place that can tell a bare stretch of day from a strip that
// owns this axis.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { SWIPE_PAGER } from '../constants';
import { armClickSwallow } from './click-swallow';
import { motionDurationMs } from './motion';
import { scrollerWithin } from './scrollable';

/** `1` is the next page along the inline axis — the direction reading runs, so the
 *  page you reach by pushing the content back toward where a line starts. `-1` is the
 *  previous one. Expressed logically rather than as left/right because the app is RTL
 *  and mirrors (`[dir='ltr']`, tokens.css). */
export type SwipeStep = -1 | 1;

export interface SwipePagerOptions {
  /** Is there a page that way? Asked live during the gesture, because the answer is
   *  what decides between following the finger and refusing it. */
  canStep: (step: SwipeStep) => boolean;
  /** Committed. Called once, and **after the page has finished turning** rather than at the
   *  release: the exit animation carries the outgoing page fully off screen, which lands the
   *  neighbour's own pane exactly at rest — so the moment this fires, what replaces the pane
   *  is identical to what was already drawn there (§7). Calling it at the release instead put
   *  the new day under the finger mid-gesture, which is the opposite of continuous. */
  onStep: (step: SwipeStep) => void;
  /** Off while something else owns the pointer — a hold-drag in flight. Not a
   *  tidiness guard: the drag's ghost is `position: fixed` and this host would become
   *  its containing block the moment we set a transform on it. */
  enabled?: boolean;
}

/** The attribute the host's CSS keys the follow off (`screens.css`). Set only while a gesture
 *  is live.
 *
 *  **The transform it drives is on the host's inner PAGE, never on the host itself**, and that
 *  is what lets the peeks work: a transform makes its element the containing block for any
 *  `position: fixed` descendant, and the peeks are fixed panes that must stay pinned to the
 *  viewport however far the day is scrolled. Host holds the variable, page and panes both read
 *  it, nobody's positioning is captured. */
const SWIPING_ATTR = 'data-swiping';
/** Set for the settle only, and its VALUE says which settle it is: `turn` finishes the page
 *  turn (a full page of travel), `back` gives back the strain a refusal took. The CSS keys its
 *  duration off the same value the timer below reads, because one duration for both would
 *  remove the class mid-animation on the shorter one and the transform would snap. */
const SETTLING_ATTR = 'data-swipe-settling';
const OFFSET_PROP = '--swipe-dx';
/** The host's own width in px, published for the panes: they sit one page plus a gutter away on
 *  the inline axis, and a percentage cannot say that — a fixed pane's percentages resolve
 *  against the VIEWPORT, which is wider than the page on any tablet or desktop (`.app` is a
 *  centred 430px column). Measured at the claim, which is also when the panes mount. */
const WIDTH_PROP = '--swipe-page-w';
/** The gutter between two pages, **owned by the stylesheet and read back here** so the commit
 *  travels exactly as far as the panes are offset. A literal in this file would be a second
 *  opinion about a spacing value, and the two would drift the first time either moved — the
 *  page would then stop a gutter short of level and the arriving day would sit visibly off. */
const GAP_PROP = '--swipe-page-gap';

export interface SwipePager<T extends HTMLElement> {
  /** Attach to the host — the box that is measured and that holds the offset variable. */
  ref: RefObject<T | null>;
  /** A gesture is claimed and has not settled. The host mounts its neighbouring pages on
   *  this, and only on this: mounted always, they would triple the cost of the day surface
   *  for a gesture that has not happened. */
  live: boolean;
}

export function useSwipePager<T extends HTMLElement>({
  canStep,
  onStep,
  enabled = true,
}: SwipePagerOptions): SwipePager<T> {
  const host = useRef<T | null>(null);
  const [live, setLive] = useState(false);
  // Latest-ref: a day surface re-renders on the clock, and the listeners below are bound
  // once — closing over a stale `canStep` is how the last day of a trip would step.
  const latest = useRef({ canStep, onStep, enabled });
  latest.current = { canStep, onStep, enabled };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let settle = 0;
    // A gesture's `window` listeners outlive the element unless something takes them down:
    // this surface unmounts on a tab change, and a finger still on the glass would otherwise
    // keep driving a host that is no longer on screen.
    let abandon: (() => void) | null = null;

    const clear = () => {
      window.clearTimeout(settle);
      el.removeAttribute(SWIPING_ATTR);
      el.removeAttribute(SETTLING_ATTR);
      el.style.removeProperty(OFFSET_PROP);
      el.style.removeProperty(WIDTH_PROP);
      setLive(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!latest.current.enabled) return;
      // Primary finger / left button only: a second finger landing mid-gesture must not
      // restart it from a new origin, and a right-click is not a swipe.
      if (e.button !== 0 || !e.isPrimary) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      // A press inside a strip that scrolls horizontally is that strip's, not ours —
      // asked as "does it overflow right now", which is `scrollsOn`'s whole point: a
      // shelf of two ideas does not scroll, so a swipe across it is a page step.
      if (scrollerWithin(target, el, 'inline')) return;

      const startX = e.clientX;
      const startY = e.clientY;
      // `direction` off the host rather than `document.dir`: the mirror is a CSS variant,
      // so the element is the only thing that knows which way its own inline axis runs.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const width = el.getBoundingClientRect().width || window.innerWidth;
      const gap = parseFloat(getComputedStyle(el).getPropertyValue(GAP_PROP)) || 0;
      /** How far the page travels to finish a turn: a full page, plus the gutter, so the
       *  arriving pane lands exactly at level. */
      const turn = width + gap;
      const commitPx = width * SWIPE_PAGER.COMMIT_SHARE;
      /** Content dragged toward inline-START reveals the NEXT page: in RTL that is a
       *  finger moving right, in LTR one moving left. */
      const stepFor = (dx: number): SwipeStep => ((rtl ? dx > 0 : dx < 0) ? 1 : -1);

      let claimed = false;
      let done = false;
      // **The travel is the last position we SAW, never the release event's own.** A
      // `pointercancel` carries no meaningful coordinates at all, and a `pointerup` can
      // arrive at the origin when the platform has no point left to report it against —
      // measured here, where an e2e `touchEnd` that lifts every finger produced a
      // `pointerup` at x=0 and turned a rightward swipe into a large leftward one. Reading
      // the release for a distance the moves already told us is a coin flip on the platform.
      let lastX = startX;
      // Set once the axis has been decided in our favour (see `touchMove`). A mouse never
      // decides — there is no browser pan to lose — so the pointer path below stands alone.
      let ours = false;

      const offsetFor = (dx: number) => {
        if (latest.current.canStep(stepFor(dx))) return dx;
        // THE REBUFF. No page that way, so the surface strains a little and no further.
        const strained = Math.min(Math.abs(dx) * SWIPE_PAGER.EDGE_RESIST, SWIPE_PAGER.EDGE_MAX_PX);
        return Math.sign(dx) * strained;
      };

      const unbind = () => {
        abandon = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('touchmove', touchMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };

      /**
       * **The axis is decided HERE, at the browser's slop and not at ours** — and this
       * listener is the whole reason the gesture reaches the recogniser at all.
       *
       * Measured, not reasoned: a touch starting on a bare part of the surface got exactly
       * ONE `pointermove` (15px of it) and then a `pointercancel`. Chrome claims a touch for
       * scrolling at ~8px of travel, in whatever direction, wherever panning is allowed — so
       * a recogniser whose threshold is 24px never gets to 24px. (The day CARDS worked the
       * whole time, because they already declare a `touch-action` of their own for the
       * hold-drag; that is what made the failure look intermittent.)
       *
       * So the ONLY way to keep the horizontal axis is to say so before Chrome takes it:
       * either `touch-action: pan-y` in CSS or `preventDefault` here. It is here because
       * `touch-action` cannot ask the one question that matters. It INTERSECTS down the
       * ancestor chain and no descendant can widen it back (ADR-0182's device-pass scar,
       * re-measured on this surface: `pan-y` on the day root stopped the maybe shelf
       * scrolling at all), so as a declaration it cannot distinguish "a bare stretch of the
       * day" from "a strip that owns this axis". `scrollerWithin` distinguishes them exactly,
       * at the moment of the press — which is why the guard above is enough and there is no
       * `touch-action` on the host.
       *
       * `DECIDE_PX` is therefore under Chrome's slop on purpose: the first move that travels
       * far enough to mean anything is the only one we get to answer.
       */
      const touchMove = (ev: TouchEvent) => {
        if (done || ev.touches.length !== 1) return;
        const touch = ev.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (!ours) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PAGER.DECIDE_PX) return;
          // Vertical enough to be the body's scroll: never prevent, and never look again.
          if (Math.abs(dx) <= Math.abs(dy) * SWIPE_PAGER.AXIS_RATIO) {
            done = true;
            unbind();
            return;
          }
          ours = true;
        }
        // Cancelable is false once a scroll is already under way — preventing then is a
        // console warning and nothing else, so ask rather than assume.
        if (ev.cancelable) ev.preventDefault();
      };

      const move = (ev: PointerEvent) => {
        if (done) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        lastX = ev.clientX;
        if (!claimed) {
          // The browser's pan wins the moment the travel reads vertical — stop listening
          // rather than sitting armed, or a long scroll ending with a sideways flick pages
          // the day out from under it.
          if (Math.abs(dy) >= SWIPE_PAGER.SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
            done = true;
            unbind();
            return;
          }
          if (
            Math.abs(dx) < SWIPE_PAGER.SLOP_PX ||
            Math.abs(dx) <= Math.abs(dy) * SWIPE_PAGER.AXIS_RATIO
          ) {
            return;
          }
          claimed = true;
          el.setPointerCapture?.(ev.pointerId);
          window.clearTimeout(settle);
          el.removeAttribute(SETTLING_ATTR);
          el.setAttribute(SWIPING_ATTR, '');
          el.style.setProperty(WIDTH_PROP, `${Math.round(width)}px`);
          // The panes mount here, one render, while the finger is still accelerating.
          setLive(true);
        }
        el.style.setProperty(OFFSET_PROP, `${Math.round(offsetFor(dx))}px`);
      };

      const end = (ev: PointerEvent) => {
        unbind();
        if (!claimed || done) return;
        done = true;
        // **A `pointercancel` is the browser saying it took the gesture** — the pan won, or
        // the element went away under the finger. It is not a short release, so it commits
        // nothing; the surface just comes back to level. And it fires no `click`, so arming
        // the swallow for one would leave it to eat the user's next genuine tap (the scar
        // `armClickSwallow` itself documents).
        const released = ev.type === 'pointerup';
        if (released) armClickSwallow();
        const dx = lastX - startX;
        const step = stepFor(dx);
        const commit = released && Math.abs(dx) >= commitPx && latest.current.canStep(step);
        // **Two different endings, two different distances, two different tokens.** A commit
        // finishes the turn — the page carries on a full page plus the gutter, which puts the
        // arriving pane exactly at rest — so it travels furthest and takes `--t-base`, the app's token
        // for a surface moving. A refusal only has to give back the strain it took, so it is
        // `--t-quick`. Both read the same token the CSS transition does, and both answer 0
        // under reduced motion, so no attribute can outlive an animation that did not play
        // (ADR-0140 §5).
        el.setAttribute(SETTLING_ATTR, commit ? 'turn' : 'back');
        el.style.setProperty(OFFSET_PROP, commit ? `${Math.round(Math.sign(dx) * turn)}px` : '0px');
        settle = window.setTimeout(
          () => {
            // **The date changes only now, with the arriving pane covering the screen.** So the
            // swap is a pane leaving and the host arriving at the same offset with the same day
            // drawn by the same components — nothing moves, which is why there is no cross-fade
            // and no keyframe anywhere in this feature.
            if (commit) latest.current.onStep(step);
            clear();
          },
          motionDurationMs(commit ? '--t-base' : '--t-quick'),
        );
      };

      abandon = unbind;
      window.addEventListener('pointermove', move);
      // Non-passive, because its whole job is `preventDefault`.
      window.addEventListener('touchmove', touchMove, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };

    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      abandon?.();
      clear();
    };
  }, []);

  return { ref: host, live };
}
