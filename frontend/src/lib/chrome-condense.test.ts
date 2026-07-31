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

  it('refuses to condense a page that barely scrolls, in either direction', () => {
    // The oscillation this exists to prevent, stated as the numbers that produce it:
    // condensing frees CHROME_CONDENSE_FREES_PX, so a body with only that much slack
    // ends up back at the top, releases, re-overflows, and condenses again.
    const barely = { scrollTop: 999, slack: CHROME_CONDENSE_MIN_SLACK_PX - 1 };
    expect(nextCondensed(false, barely)).toBe(false);
    expect(nextCondensed(true, barely)).toBe(false);
    expect(nextCondensed(false, { ...barely, slack: CHROME_CONDENSE_MIN_SLACK_PX })).toBe(true);
  });

  it('leaves enough slack after condensing for the state to survive itself', () => {
    // The derivation, asserted rather than trusted: at the minimum slack, the body
    // still has more to scroll than the release threshold once the chrome shrinks.
    expect(CHROME_CONDENSE_MIN_SLACK_PX - CHROME_CONDENSE_FREES_PX).toBeGreaterThanOrEqual(
      CHROME_CONDENSE_RELEASE_PX,
    );
  });
});
