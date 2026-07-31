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
// The decision is a pure function so both guards can be tested without a scroll
// container (the pattern ADR-0121 §13 set: the decision lives in `lib/`, the
// component just renders it).
import { useEffect, useState } from 'react';
import {
  CHROME_CONDENSE_ENTER_PX,
  CHROME_CONDENSE_MIN_SLACK_PX,
  CHROME_CONDENSE_RELEASE_PX,
} from '../constants';

export interface ScrollExtent {
  scrollTop: number;
  /** How much there is to scroll: `scrollHeight - clientHeight`. */
  slack: number;
}

/** The next condensed state, given the current one — which is what makes the
 *  hysteresis expressible at all: entering and leaving read different thresholds. */
export function nextCondensed(condensed: boolean, { scrollTop, slack }: ScrollExtent): boolean {
  if (slack < CHROME_CONDENSE_MIN_SLACK_PX) return false;
  return scrollTop > (condensed ? CHROME_CONDENSE_RELEASE_PX : CHROME_CONDENSE_ENTER_PX);
}

/** Tracks `el`'s scroll and answers whether the chrome should be condensed.
 *
 *  Takes the element as STATE rather than a ref: the shell re-keys its body per
 *  tab, so the node this watches is replaced on every tab change — and the state
 *  has to reset with it, or a tab arrives already condensed at scroll 0. */
export function useCondenseOnScroll(el: HTMLElement | null): boolean {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    setCondensed(false);
    if (!el) return;
    const read = () =>
      setCondensed((was) =>
        nextCondensed(was, { scrollTop: el.scrollTop, slack: el.scrollHeight - el.clientHeight }),
      );
    read();
    el.addEventListener('scroll', read, { passive: true });
    return () => el.removeEventListener('scroll', read);
  }, [el]);

  return condensed;
}
