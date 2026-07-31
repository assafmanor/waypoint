// **How the top chrome gives way to the body** (ADR-0149 §7).
//
// Row 1 rides out as the body scrolls and the trip glyph slots into the day row,
// so identity never leaves the chrome: 160px → 108px.
//
// **Scroll-linked while the finger is down, snapped once it stops.** Three device
// passes got here, and the rule that survives all of them is short: an animation is
// only a problem while something else is moving. So —
//
//  · **During the gesture the chrome tracks the scroll 1:1**, with no transition.
//    The header is IN FLOW, so collapsing it lifts the body's top edge and moves the
//    content; on a timer that movement is 52px the content makes ON ITS OWN, landing
//    on top of the movement the finger is already producing. That is what read as
//    jumpy, at every duration tried.
//  · **When the scrolling stops, a part-collapsed chrome snaps** to whichever end it
//    is nearer, and THAT animates — by then no finger is competing with it. So the
//    chrome is never left resting half way.
//  · **Collapsing follows the finger immediately; expanding does not.** Coming back
//    needs `CHROME_EXPAND_ARM_PX` of deliberate upward scroll first, or every small
//    correction mid-read drags the header back over what you are reading. The one
//    place that gives way is the top `CHROME_CONDENSE_FREES_PX` — see `floorAt`.
//
// **It is driven by DELTAS, not by the absolute offset, and that is what makes it
// stable.** Openness derived from `scrollTop` feeds back: collapsing changes how much
// there is to scroll, the browser clamps the offset, and the clamp changes the
// openness that caused it — which oscillated a 15px band of page heights on one build
// and a 6px band on the next. Against deltas there is no such loop, and the handler
// re-reads the offset AFTER its own write so a self-induced clamp is absorbed rather
// than counted as a gesture.
//
// A surface that DECLARES the condense (the Map, whose `is-fullbleed` body never
// scrolls) is untouched by all of this — see `useChromeOpenness`. That path keeps the
// plain timed transition in both directions, because a tab change has no finger in it.
//
// The model is pure functions so all of it is testable without a scroll container
// (the pattern ADR-0121 §13 set: the decision lives in `lib/`, the component renders).
import { useEffect, useRef, useState } from 'react';
import {
  CHROME_CONDENSE_FREES_PX,
  CHROME_CONDENSE_MIN_SLACK_PX,
  CHROME_EXPAND_ARM_PX,
  CHROME_SNAP_IDLE_MS,
} from '../constants';

export interface CondenseState {
  /** How much of row 1 is still open: 1 fully expanded, 0 fully condensed. */
  open: number;
  /** Upward travel accumulated since the last downward move, which is what arms the
   *  expansion. Reset whenever the direction flips. */
  upward: number;
}

export const CONDENSE_START: CondenseState = { open: 1, upward: 0 };

export interface ScrollStep {
  /** Signed scroll movement since the previous reading: + is further into content. */
  delta: number;
  scrollTop: number;
  /** How much there would be to scroll with the chrome fully open — invariant under
   *  the collapse, which is exactly why it is the gate's input rather than the live
   *  slack. */
  slackExpanded: number;
}

/** The most collapsed the chrome may be at a given offset: it can never have taken
 *  more room than the body has actually been scrolled by. Without it, coming back up
 *  the last stretch the chrome would still be part-closed when `scrollTop` hits 0 and
 *  the "whole header at the top" rule would slam the rest of it open in one frame —
 *  a 20-odd pixel step on the pixel that reaches the top.
 *
 *  It also can only ever OPEN the chrome, and opening gives the body MORE to scroll,
 *  so it cannot provoke the clamp that would re-trigger it. That one-sidedness is
 *  what keeps it out of the feedback loop that the absolute-offset model died of. */
function floorAt(scrollTop: number): number {
  return 1 - scrollTop / CHROME_CONDENSE_FREES_PX;
}

/** One scroll reading → the next state. */
export function stepCondense(
  { open, upward }: CondenseState,
  { delta, scrollTop, slackExpanded }: ScrollStep,
): CondenseState {
  // At the top the header is whole, whatever happened on the way there — anything
  // else leaves a page unable to show its own identity row.
  if (scrollTop <= 0) return CONDENSE_START;
  // A page with barely more content than a screen would spend its whole scroll on
  // the header, so it never starts.
  if (slackExpanded <= CHROME_CONDENSE_MIN_SLACK_PX) return CONDENSE_START;

  const moved = advance({ open, upward }, delta);
  return { open: Math.min(1, Math.max(moved.open, floorAt(scrollTop))), upward: moved.upward };
}

function advance({ open, upward }: CondenseState, delta: number): CondenseState {
  // Down: 1:1 from the first pixel, and any upward credit is spent.
  if (delta > 0) return { open: Math.max(0, open - delta / CHROME_CONDENSE_FREES_PX), upward: 0 };
  if (delta < 0) {
    const travelled = upward - delta;
    const armed = travelled - CHROME_EXPAND_ARM_PX;
    // Still arming: the chrome holds where it is rather than following the finger.
    if (armed <= 0) return { open, upward: travelled };
    // Past the arm, it tracks 1:1 again — `armed` caps the first step so the
    // crossing itself doesn't jump the header by the whole arming distance.
    const gave = Math.min(armed, -delta);
    return { open: Math.min(1, open + gave / CHROME_CONDENSE_FREES_PX), upward: travelled };
  }
  return { open, upward };
}

/** Where a part-collapsed chrome lands once the scrolling stops: the nearer end, so a
 *  gesture that clearly committed is not undone by letting go of it.
 *
 *  Except in the top `CHROME_CONDENSE_FREES_PX`, where it always opens — `floorAt`
 *  forbids a closed chrome there, and snapping to a position the next scroll event
 *  would immediately overrule is how you get a jump instead of a settle. */
export function snapTarget(open: number, scrollTop: number): number {
  return open >= 0.5 || scrollTop < CHROME_CONDENSE_FREES_PX ? 1 : 0;
}

/** The three positions the rest of the app cares about — the ENDS drive `visibility`
 *  and the tab order, and `mid` exists so the condensed glyph can be focusable-safe
 *  at both ends while still fading through the middle. */
export type ChromeRow = 'open' | 'mid' | 'closed';

export function chromeRow(open: number): ChromeRow {
  return open === 1 ? 'open' : open === 0 ? 'closed' : 'mid';
}

/** Drives `--chrome-open` on `frame` from `body`'s scroll.
 *
 *  **It writes the properties straight to the DOM**, and that is the point rather
 *  than an optimisation: this runs on every scroll event of a live gesture, and a
 *  re-render per event is exactly the cost that makes a scroll-linked effect stutter.
 *  `--chrome-t` is the other half of it — the header's transitions read their
 *  duration from it, so setting it to 0 while scrolling strips the animation for the
 *  gesture alone and removing it hands the timing straight back for the snap.
 *
 *  **`declared` disables the path entirely.** A surface that states its own chrome
 *  (the Map) must not have an inline property written under it: an inline value beats
 *  the selector carrying the declaration, so this effect's own opening write silently
 *  outranked it and the Map stopped collapsing at all. Nothing is written here when a
 *  declaration is in force, which leaves that path exactly the timed transition it
 *  had before any of this existed.
 *
 *  Returns the row position only, not the openness — so a gesture costs at most two
 *  re-renders rather than one per event.
 *
 *  `hold` freezes it for a drag in flight (ADR-0116's edge auto-scroll would
 *  otherwise collapse the chrome under a finger already carrying something). It rides
 *  a ref and is deliberately not an effect dependency: re-running the effect resets
 *  the openness, so entering a drag would itself expand the chrome. */
export function useChromeOpenness(
  frame: HTMLElement | null,
  body: HTMLElement | null,
  { declared = false, hold = false }: { declared?: boolean; hold?: boolean } = {},
): ChromeRow {
  const [row, setRow] = useState<ChromeRow>('open');
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useEffect(() => {
    if (!frame || !body || declared) return;
    let state = CONDENSE_START;
    let lastTop = body.scrollTop;
    let idle: number | undefined;

    const paint = (open: number) => {
      frame.style.setProperty('--chrome-open', `${open}`);
      setRow(chromeRow(open));
    };

    const snap = () => {
      // Hand the timing back BEFORE the value changes: the transition that plays is
      // the one in the after-change style, so this is what makes the snap animate
      // where every step before it was bare.
      frame.style.removeProperty('--chrome-t');
      if (state.open === 0 || state.open === 1) return;
      state = { ...state, open: snapTarget(state.open, body.scrollTop) };
      paint(state.open);
      // Same re-read as below, and for the same reason: closing shrinks the
      // scrollport, and the clamp that follows is ours, not a gesture.
      lastTop = body.scrollTop;
    };

    const read = () => {
      if (holdRef.current) return;
      window.clearTimeout(idle);
      frame.style.setProperty('--chrome-t', '0s');
      const top = body.scrollTop;
      state = stepCondense(state, {
        delta: top - lastTop,
        scrollTop: top,
        slackExpanded:
          body.scrollHeight - body.clientHeight + (1 - state.open) * CHROME_CONDENSE_FREES_PX,
      });
      paint(state.open);
      // Re-read AFTER the write: collapsing resizes the scrollport, and the clamp
      // that follows is our own doing rather than a gesture. Counting it is the
      // feedback loop that oscillated both builds before this one.
      lastTop = body.scrollTop;
      idle = window.setTimeout(snap, CHROME_SNAP_IDLE_MS);
    };

    paint(1);
    body.addEventListener('scroll', read, { passive: true });
    return () => {
      window.clearTimeout(idle);
      body.removeEventListener('scroll', read);
      frame.style.removeProperty('--chrome-open');
      frame.style.removeProperty('--chrome-t');
    };
  }, [frame, body, declared]);

  return row;
}
