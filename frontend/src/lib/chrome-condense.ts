// **How the top chrome gives way to the body** (ADR-0149 §7).
//
// Row 1 rides out as the body scrolls and the trip glyph slots into the day row,
// so identity never leaves the chrome: 160px → 108px.
//
// **It is scroll-LINKED, not a state with an animation** (the 2026-08-04 device
// pass). The header is in flow, so collapsing it lifts the body's top edge — and
// on a timer that is 52px of movement the content makes ON ITS OWN, arriving on
// top of the movement the finger is already producing. That is what read as
// unsmooth, and only while scrolling: the Map's declared condense rides a tab
// change, where nothing is competing, and felt fine throughout.
//
// So the collapse is a continuous function of the scroll offset, written straight
// to a custom property with no transition behind it. Nothing moves that the finger
// is not moving, it reverses exactly when you scroll back, and it stops when you
// stop.
//
// **Two things fall out of going continuous, and both are why this is the model
// rather than a tuning of the old one:**
//
//  · **It cannot oscillate.** The discrete version condensed on one threshold and
//    released on another, and because collapsing changes how much there is to
//    scroll, a 15px band of page heights flipped forever (ADR-0149's amendment).
//    Hysteresis existed to patch that. A continuous mapping has a FIXED POINT
//    instead of two states to bounce between — `s ≤ slackExpanded − s` converges —
//    so the whole apparatus goes away rather than being re-tuned.
//  · **The slack gate stays**, because without it a page with barely more content
//    than a screen settles at a permanently half-collapsed header, which is worse
//    than not collapsing. It reads the EXPANDED height, which is the fix that made
//    it stable in the first place: the answer must not move the question.
//
// The drag hold stays too: a drag auto-scrolls the body at the edge bands
// (ADR-0116), and the chrome must not give way under a gesture that is already
// carrying something.
//
// The mapping is a pure function so it can be tested without a scroll container
// (the pattern ADR-0121 §13 set: the decision lives in `lib/`, the component just
// renders it).
import { useEffect, useRef, useState } from 'react';
import { CHROME_CONDENSE_FREES_PX, CHROME_CONDENSE_MIN_SLACK_PX } from '../constants';

export interface ScrollExtent {
  scrollTop: number;
  /** How much there is to scroll RIGHT NOW: `scrollHeight - clientHeight`. It
   *  shrinks as the chrome gives way, which is exactly what `chromeOpenness`
   *  corrects for before asking whether there is enough to scroll at all. */
  slack: number;
}

/** How much of row 1 is still open: **1** fully expanded, **0** fully condensed.
 *
 *  Linear in the scroll offset over the first `CHROME_CONDENSE_FREES_PX`, so the
 *  chrome gives back exactly what has been scrolled and hands the rest over at a
 *  rate the finger owns.
 *
 *  **It takes the CURRENT openness, and that is not incidental.** `slack` is smaller
 *  by exactly whatever has already been given back, so reconstructing the expanded
 *  height needs to know how much that was — and inferring it from `scrollTop`
 *  instead is wrong precisely where it matters: while the gate is holding the chrome
 *  open, `slack` is already the expanded number, so adding the scroll to it
 *  overstates it, which opens the gate, which closes it again. That is the same
 *  moving-input bug the discrete version had, one level down, and it strobes a 6px
 *  band of page heights (measured: 59–64) instead of a 15px one. */
export function chromeOpenness(open: number, { scrollTop, slack }: ScrollExtent): number {
  const slackExpanded = slack + (1 - open) * CHROME_CONDENSE_FREES_PX;
  if (slackExpanded <= CHROME_CONDENSE_MIN_SLACK_PX) return 1;
  return 1 - Math.min(Math.max(scrollTop, 0), CHROME_CONDENSE_FREES_PX) / CHROME_CONDENSE_FREES_PX;
}

/** Drives `--chrome-open` on `frame` from `body`'s scroll offset.
 *
 *  It writes the custom property **directly to the DOM** rather than through React
 *  state, and that is the point rather than an optimisation: this runs on every
 *  scroll event of a live gesture, and a re-render per event is precisely the cost
 *  that makes a scroll-linked effect stutter.
 *
 *  Returns only the two ENDPOINTS — fully open, fully closed — which is what
 *  `visibility` and the tab order need, and nothing in between. So a gesture costs
 *  two re-renders rather than one per scroll event, and a control is never both
 *  invisible and tabbable: row 1 leaves the tab order once it is 0px tall, and the
 *  condensed glyph joins it as soon as it starts fading in rather than popping in
 *  at the end.
 *
 *  `body` is STATE, not a ref: the shell re-keys its body per tab, so the node
 *  being watched is replaced on every tab change and the openness has to reset with
 *  it, or a tab arrives already condensed at scroll 0.
 *
 *  `hold` freezes it where it is, for a drag in flight. It rides a REF and is
 *  deliberately not an effect dependency: re-running the effect would reset the
 *  openness, so entering a drag would itself expand the chrome — the very thing the
 *  hold exists to prevent. */
export function useChromeOpenness(
  frame: HTMLElement | null,
  body: HTMLElement | null,
  hold = false,
): { closed: boolean; expanded: boolean } {
  const [ends, setEnds] = useState({ closed: false, expanded: true });
  const holdRef = useRef(hold);
  holdRef.current = hold;
  // The mapping needs its own previous answer to reconstruct the expanded height,
  // and it lives in a ref for the same reason the property write does: this runs
  // per scroll event, and routing it through state would re-render the shell on
  // every frame of a gesture.
  const openRef = useRef(1);

  useEffect(() => {
    if (!frame) return;
    const apply = (open: number) => {
      openRef.current = open;
      frame.style.setProperty('--chrome-open', `${open}`);
      setEnds((was) =>
        was.closed === (open === 0) && was.expanded === (open === 1)
          ? was
          : { closed: open === 0, expanded: open === 1 },
      );
    };
    apply(1);
    if (!body) return;
    const read = () => {
      if (holdRef.current) return;
      apply(
        chromeOpenness(openRef.current, {
          scrollTop: body.scrollTop,
          slack: body.scrollHeight - body.clientHeight,
        }),
      );
    };
    read();
    body.addEventListener('scroll', read, { passive: true });
    return () => {
      body.removeEventListener('scroll', read);
      frame.style.removeProperty('--chrome-open');
    };
  }, [frame, body]);

  return ends;
}
