// **When the top chrome condenses on scroll** (ADR-0149 §7).
//
// Row 1 rides out as the body scrolls and the trip glyph slots into the day row,
// so identity never leaves the chrome: 160px → 108px.
//
// Two guards are part of the DECISION, not implementation detail, because the
// first build of this oscillated visibly:
//
//  · **Hysteresis.** One threshold flips the state on the pixel it is read at,
//    and a finger resting near it strobes the chrome.
//  · **A slack test.** Condensing frees CHROME_CONDENSE_FREES_PX of body, which
//    removes the very overflow that triggered it — so on a page that barely
//    scrolls, condensing scrolls the body back under the release threshold and
//    the chrome expands, which re-creates the overflow. That is a loop, not a
//    flicker. It is also the honest reading: the room it buys is room the
//    content did not need.
//
// **And a third, which the build found:** the chrome must not change while a
// drag is in flight. A drag auto-scrolls the body when the finger reaches an
// edge band (ADR-0116), which would otherwise condense the chrome mid-gesture
// and move every row, pill and drop target 52px under the finger — the exact
// class of bug this file's own siblings keep being written for. So the state is
// HELD for the duration, in whichever position the drag found it.
//
// The decision is a pure function so the guards can be tested without a scroll
// container (the pattern ADR-0121 §13 set: the decision lives in `lib/`, the
// component just renders it).
import { useEffect, useRef, useState } from 'react';
import {
  CHROME_CONDENSE_ENTER_PX,
  CHROME_CONDENSE_FREES_PX,
  CHROME_CONDENSE_MIN_SLACK_PX,
  CHROME_CONDENSE_RELEASE_PX,
} from '../constants';

export interface ScrollExtent {
  scrollTop: number;
  /** How much there is to scroll RIGHT NOW: `scrollHeight - clientHeight`. Note
   *  that this shrinks by `CHROME_CONDENSE_FREES_PX` the moment the chrome
   *  condenses — which is exactly what `nextCondensed` has to correct for. */
  slack: number;
}

/** The next condensed state, given the current one — which is what makes the
 *  hysteresis expressible at all: entering and leaving read different thresholds.
 *
 *  **The slack test is asked of a state-INVARIANT quantity, and that is the whole
 *  trick.** Condensing frees `CHROME_CONDENSE_FREES_PX` of body, so the live
 *  `slack` is 52px smaller while condensed — put the raw number into the test and
 *  the decision changes its own input. That shipped, and it oscillates forever
 *  across a 15px-wide band of page heights (measured: 101–115): the chrome
 *  condenses on `slack ≥ 64`, immediately fails the same test at `slack − 52`,
 *  expands, re-qualifies, and repeats. "Is there enough here to scroll" is a fact
 *  about the CONTENT, not about what the chrome happens to be doing, so it is
 *  answered against the expanded height in both states.
 *
 *  The threshold is then strict, not `≥`: at exactly `FREES + RELEASE` the body
 *  ends up with precisely `RELEASE` left to scroll, `scrollTop` clamps to it, and
 *  `> RELEASE` is false — a release on the pixel it condensed at. */
export function nextCondensed(condensed: boolean, { scrollTop, slack }: ScrollExtent): boolean {
  const slackExpanded = slack + (condensed ? CHROME_CONDENSE_FREES_PX : 0);
  if (slackExpanded <= CHROME_CONDENSE_MIN_SLACK_PX) return false;
  return scrollTop > (condensed ? CHROME_CONDENSE_RELEASE_PX : CHROME_CONDENSE_ENTER_PX);
}

/** Tracks `el`'s scroll and answers whether the chrome should be condensed.
 *
 *  Takes the element as STATE rather than a ref: the shell re-keys its body per
 *  tab, so the node this watches is replaced on every tab change — and the state
 *  has to reset with it, or a tab arrives already condensed at scroll 0.
 *
 *  `hold` freezes the answer where it is. It rides a REF and is deliberately not
 *  an effect dependency: re-running the effect would reset the state to false,
 *  which is the opposite of holding — entering a drag would itself expand the
 *  chrome, doing the very thing the hold exists to prevent. */
export function useCondenseOnScroll(el: HTMLElement | null, hold = false): boolean {
  const [condensed, setCondensed] = useState(false);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useEffect(() => {
    setCondensed(false);
    if (!el) return;
    const read = () => {
      if (holdRef.current) return;
      setCondensed((was) =>
        nextCondensed(was, { scrollTop: el.scrollTop, slack: el.scrollHeight - el.clientHeight }),
      );
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [el]);

  return condensed;
}
