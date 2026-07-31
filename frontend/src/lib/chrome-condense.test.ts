import { describe, expect, it } from 'vitest';
import {
  CHROME_CONDENSE_ENTER_PX,
  CHROME_CONDENSE_FREES_PX,
  CHROME_CONDENSE_MIN_SLACK_PX,
  CHROME_CONDENSE_RELEASE_PX,
} from '../constants';
import { nextCondensed } from './chrome-condense';

// Plenty to scroll, so these cases are about the thresholds alone.
const ROOMY = 800;

describe('nextCondensed', () => {
  it('condenses once the body is scrolled past the enter threshold', () => {
    expect(nextCondensed(false, { scrollTop: CHROME_CONDENSE_ENTER_PX, slack: ROOMY })).toBe(false);
    expect(nextCondensed(false, { scrollTop: CHROME_CONDENSE_ENTER_PX + 1, slack: ROOMY })).toBe(
      true,
    );
  });

  it('does NOT release at the same threshold it entered at', () => {
    // The whole point of the hysteresis: a finger resting between the two numbers
    // would otherwise strobe the chrome on every scroll event.
    const between = CHROME_CONDENSE_ENTER_PX - 1;
    expect(nextCondensed(true, { scrollTop: between, slack: ROOMY })).toBe(true);
    expect(nextCondensed(false, { scrollTop: between, slack: ROOMY })).toBe(false);
  });

  it('releases only back near the top', () => {
    expect(nextCondensed(true, { scrollTop: CHROME_CONDENSE_RELEASE_PX + 1, slack: ROOMY })).toBe(
      true,
    );
    expect(nextCondensed(true, { scrollTop: CHROME_CONDENSE_RELEASE_PX, slack: ROOMY })).toBe(
      false,
    );
  });

  it('refuses to condense a page that barely scrolls', () => {
    const barely = { scrollTop: 999, slack: CHROME_CONDENSE_MIN_SLACK_PX };
    expect(nextCondensed(false, barely)).toBe(false);
    // Strictly past it, not at it: AT the threshold the body is left with exactly
    // CHROME_CONDENSE_RELEASE_PX to scroll, scrollTop clamps to that, and the
    // release test (`> RELEASE`) is false on the very pixel it condensed at.
    expect(nextCondensed(false, { ...barely, slack: CHROME_CONDENSE_MIN_SLACK_PX + 1 })).toBe(true);
  });

  it('judges the slack by the EXPANDED height, in both states', () => {
    // The live slack is CHROME_CONDENSE_FREES_PX smaller while condensed, so asking
    // the raw number would make the decision change its own input. A body that
    // qualified when it condensed still qualifies afterwards.
    const expandedSlack = CHROME_CONDENSE_MIN_SLACK_PX + 1;
    expect(nextCondensed(false, { scrollTop: 999, slack: expandedSlack })).toBe(true);
    expect(
      nextCondensed(true, { scrollTop: 999, slack: expandedSlack - CHROME_CONDENSE_FREES_PX }),
    ).toBe(true);
  });

  // THE TEST THAT WAS MISSING, and the reason a 15px band of page heights strobed
  // on a real phone: the guards were each checked in isolation and the loop they
  // exist to prevent never was. Condensing changes how much there is to scroll, so
  // the only honest check is to run the decision against its own consequences until
  // it either settles or repeats a state.
  it('settles at every page height — no height oscillates', () => {
    const settles = (slackExpanded: number) => {
      let condensed = false;
      // Worst case for the loop: the user has scrolled to the very bottom.
      let scrollTop = slackExpanded;
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const slack = slackExpanded - (condensed ? CHROME_CONDENSE_FREES_PX : 0);
        // The browser clamps the scroll position when the scrollable area shrinks.
        scrollTop = Math.min(scrollTop, Math.max(slack, 0));
        const next = nextCondensed(condensed, { scrollTop, slack });
        if (next === condensed) return true;
        const key = `${condensed}:${scrollTop}`;
        if (seen.has(key)) return false;
        seen.add(key);
        condensed = next;
      }
      return false;
    };

    const oscillating: number[] = [];
    for (let slackExpanded = 0; slackExpanded <= 400; slackExpanded++) {
      if (!settles(slackExpanded)) oscillating.push(slackExpanded);
    }
    expect(oscillating).toEqual([]);
  });

  it('leaves enough slack after condensing for the state to survive itself', () => {
    // The derivation, asserted rather than trusted: at the minimum slack, the body
    // still has more to scroll than the release threshold once the chrome shrinks.
    expect(CHROME_CONDENSE_MIN_SLACK_PX - CHROME_CONDENSE_FREES_PX).toBeGreaterThanOrEqual(
      CHROME_CONDENSE_RELEASE_PX,
    );
  });
});
