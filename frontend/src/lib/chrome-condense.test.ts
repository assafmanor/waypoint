import { describe, expect, it } from 'vitest';
import { CHROME_CONDENSE_FREES_PX, CHROME_CONDENSE_MIN_SLACK_PX } from '../constants';
import { chromeOpenness } from './chrome-condense';

// Plenty to scroll, so these cases are about the mapping alone.
const ROOMY = 800;

describe('chromeOpenness', () => {
  it('gives the chrome away in step with the scroll, 1:1', () => {
    expect(chromeOpenness(1, { scrollTop: 0, slack: ROOMY })).toBe(1);
    expect(chromeOpenness(1, { scrollTop: CHROME_CONDENSE_FREES_PX / 2, slack: ROOMY })).toBe(0.5);
    expect(chromeOpenness(1, { scrollTop: CHROME_CONDENSE_FREES_PX, slack: ROOMY })).toBe(0);
  });

  it('is monotone and clamped at both ends', () => {
    expect(chromeOpenness(1, { scrollTop: -40, slack: ROOMY })).toBe(1);
    expect(chromeOpenness(1, { scrollTop: 5000, slack: ROOMY })).toBe(0);
    let previous = 1;
    for (let top = 0; top <= CHROME_CONDENSE_FREES_PX + 20; top++) {
      const open = chromeOpenness(1, { scrollTop: top, slack: ROOMY });
      expect(open).toBeLessThanOrEqual(previous);
      previous = open;
    }
  });

  it('refuses to start on a page that barely scrolls', () => {
    // Without this a body with a screenful-and-a-bit settles at a permanently
    // half-collapsed header, which is worse than not collapsing at all.
    const barely = CHROME_CONDENSE_MIN_SLACK_PX - CHROME_CONDENSE_FREES_PX;
    expect(chromeOpenness(1, { scrollTop: 20, slack: barely })).toBe(1);
  });

  it('judges that gate on the EXPANDED height, not the live one', () => {
    // `slack` shrinks by whatever has already been given back, so the raw number
    // would make the answer move its own question — the bug that oscillated a
    // 15px band of page heights across the whole first build of this.
    const expandedSlack = CHROME_CONDENSE_MIN_SLACK_PX + 20;
    const halfGiven = CHROME_CONDENSE_FREES_PX / 2;
    expect(chromeOpenness(0.5, { scrollTop: halfGiven, slack: expandedSlack - halfGiven })).toBe(
      0.5,
    );
  });

  // The property the continuous model exists for. A discrete flip had two states to
  // bounce between; this has a fixed point, so running the mapping against its own
  // consequences has to converge from every page height rather than at most of them.
  it('settles at every page height — no height oscillates', () => {
    const settles = (slackExpanded: number) => {
      let scrollTop = slackExpanded; // worst case: scrolled to the very bottom
      let open = 1;
      for (let i = 0; i < 200; i++) {
        const slack = slackExpanded - (1 - open) * CHROME_CONDENSE_FREES_PX;
        // The browser clamps the scroll position when the scrollable area shrinks.
        scrollTop = Math.min(scrollTop, Math.max(slack, 0));
        const next = chromeOpenness(open, { scrollTop, slack });
        if (Math.abs(next - open) < 0.0001) return true;
        open = next;
      }
      return false;
    };

    const oscillating: number[] = [];
    for (let slackExpanded = 0; slackExpanded <= 400; slackExpanded++) {
      if (!settles(slackExpanded)) oscillating.push(slackExpanded);
    }
    expect(oscillating).toEqual([]);
  });
});
