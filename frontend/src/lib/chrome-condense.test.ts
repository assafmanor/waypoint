import { describe, expect, it } from 'vitest';
import {
  CHROME_CONDENSE_FREES_PX,
  CHROME_CONDENSE_MIN_SLACK_PX,
  CHROME_EXPAND_ARM_PX,
} from '../constants';
import { chromeRow, CONDENSE_START, snapTarget, stepCondense } from './chrome-condense';
import type { CondenseState } from './chrome-condense';

// Plenty to scroll, so these cases are about the model alone.
const ROOMY = 800;
// Past the floor's reach (`floorAt`), so a case about the arm is about the arm.
const DEEP = CHROME_CONDENSE_FREES_PX * 3;

const at = (state: CondenseState, delta: number, scrollTop: number) =>
  stepCondense(state, { delta, scrollTop, slackExpanded: ROOMY });

describe('stepCondense', () => {
  it('collapses 1:1 with the scroll, from the first pixel', () => {
    const half = CHROME_CONDENSE_FREES_PX / 2;
    expect(at(CONDENSE_START, half, half).open).toBeCloseTo(0.5);
    // The whole point of the model: the chrome gives back exactly what the finger
    // took, so the content underneath does not move twice.
    expect(at(CONDENSE_START, 1, 1).open).toBeCloseTo(1 - 1 / CHROME_CONDENSE_FREES_PX);
  });

  it('bottoms out closed and does not go further', () => {
    expect(at(CONDENSE_START, 999, 999).open).toBe(0);
  });

  it('holds still until the upward scroll has armed the expansion', () => {
    const closed = { open: 0, upward: 0 };
    const nudge = at(closed, -(CHROME_EXPAND_ARM_PX - 1), DEEP);
    expect(nudge.open).toBe(0);
    // …and the arming is remembered, so it is the TRAVEL that arms it, not any one
    // event's size — a slow drag arrives as many small deltas.
    expect(at(nudge, -2, DEEP).open).toBeGreaterThan(0);
  });

  it('does not jump the header by the arming distance when it crosses', () => {
    // The first expanding step gives back what it travelled PAST the arm, not the
    // whole of it, or the chrome leaps 32px on the pixel that armed it.
    const crossed = at({ open: 0, upward: 0 }, -(CHROME_EXPAND_ARM_PX + 4), DEEP);
    expect(crossed.open).toBeCloseTo(4 / CHROME_CONDENSE_FREES_PX);
  });

  it('spends the upward credit as soon as the finger turns around', () => {
    const armed = at({ open: 0, upward: 0 }, -CHROME_EXPAND_ARM_PX, DEEP);
    expect(armed.upward).toBe(CHROME_EXPAND_ARM_PX);
    expect(at(armed, 1, DEEP).upward).toBe(0);
  });

  it('is never more collapsed than the offset it was scrolled by', () => {
    // `floorAt`: what stops the "whole header at the top" rule from arriving as a
    // step. Fully closed, then dragged up to 13px from the top without ever arming.
    const near = CHROME_CONDENSE_FREES_PX / 4;
    expect(at({ open: 0, upward: 0 }, -1, near).open).toBeCloseTo(
      1 - near / CHROME_CONDENSE_FREES_PX,
    );
  });

  it('is whole at the top, whatever happened on the way there', () => {
    expect(at({ open: 0, upward: 99 }, -5, 0)).toEqual(CONDENSE_START);
  });

  it('refuses to start on a page that barely scrolls', () => {
    const barely = { delta: 999, scrollTop: 999, slackExpanded: CHROME_CONDENSE_MIN_SLACK_PX };
    expect(stepCondense(CONDENSE_START, barely)).toEqual(CONDENSE_START);
    expect(stepCondense(CONDENSE_START, { ...barely, slackExpanded: ROOMY }).open).toBe(0);
  });
});

describe('snapTarget', () => {
  it('lands on an end, always — there is no resting half state', () => {
    for (let open = 0; open <= 1.0001; open += 0.05) {
      expect([0, 1]).toContain(snapTarget(open, ROOMY));
      expect(chromeRow(snapTarget(open, ROOMY))).not.toBe('mid');
    }
  });

  it('finishes the gesture you started rather than undoing it', () => {
    expect(snapTarget(0.49, ROOMY)).toBe(0);
    expect(snapTarget(0.51, ROOMY)).toBe(1);
  });

  it('always opens within the top stretch, where a closed chrome cannot survive', () => {
    expect(snapTarget(0.1, CHROME_CONDENSE_FREES_PX - 1)).toBe(1);
    expect(snapTarget(0.1, CHROME_CONDENSE_FREES_PX)).toBe(0);
  });
});

// THE TEST THAT WAS MISSING, and the reason a band of page heights strobed on a real
// phone twice: the rules were each checked in isolation and the loop they exist to
// prevent never was. Collapsing changes how much there is to scroll, the browser
// clamps the offset, and the clamp is another scroll event — so the only honest check
// is to run the model against its own consequences until it settles or repeats.
describe('the loop it has to survive', () => {
  /** A scroll container that resizes as the chrome does, the way the real one does:
   *  `scrollHeight` is fixed, `clientHeight` grows by what the condense frees, so the
   *  slack shrinks under it and the browser clamps `scrollTop` down to fit. */
  const settles = (slackExpanded: number, startAt: number) => {
    let state = CONDENSE_START;
    let scrollTop = Math.min(startAt, slackExpanded);
    let lastTop = scrollTop;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      state = stepCondense(state, { delta: scrollTop - lastTop, scrollTop, slackExpanded });
      // The hook re-reads AFTER its own write, so a clamp it caused is absorbed
      // rather than counted as a gesture — this line IS that guarantee.
      const maxScroll = Math.max(0, slackExpanded - (1 - state.open) * CHROME_CONDENSE_FREES_PX);
      scrollTop = Math.min(scrollTop, maxScroll);
      lastTop = scrollTop;
      const key = `${state.open.toFixed(6)}:${scrollTop.toFixed(6)}`;
      if (seen.has(key)) return true; // reached a fixed point
      seen.add(key);
    }
    return false;
  };

  it('settles at every page height, scrolled to the bottom', () => {
    const loops: number[] = [];
    for (let slack = 0; slack <= 400; slack++) if (!settles(slack, slack)) loops.push(slack);
    expect(loops).toEqual([]);
  });

  it('settles wherever in the page the finger stopped', () => {
    const loops: string[] = [];
    for (let slack = CHROME_CONDENSE_MIN_SLACK_PX; slack <= 300; slack += 7)
      for (let top = 0; top <= slack; top += 3)
        if (!settles(slack, top)) loops.push(`${slack}@${top}`);
    expect(loops).toEqual([]);
  });

  it('leaves a closed chrome with enough scroll underneath to stay closed', () => {
    // The derivation behind CHROME_CONDENSE_MIN_SLACK_PX, asserted rather than
    // trusted: past the gate, a fully condensed body still has the whole of what the
    // condense freed left to scroll — which is exactly what `floorAt` demands of it.
    expect(CHROME_CONDENSE_MIN_SLACK_PX - CHROME_CONDENSE_FREES_PX).toBeGreaterThanOrEqual(
      CHROME_CONDENSE_FREES_PX,
    );
  });

  // The snap is the one move the model makes with no finger behind it, so it is the
  // one that can land somewhere the next scroll event overrules — which reads as the
  // chrome jumping back the instant it settled.
  it('never snaps to a position the very next reading undoes', () => {
    const offenders: string[] = [];
    for (let slack = CHROME_CONDENSE_MIN_SLACK_PX + 1; slack <= 300; slack++) {
      for (let top = 1; top <= slack; top += 3) {
        for (let open = 0.05; open < 1; open += 0.05) {
          const target = snapTarget(open, top);
          const maxScroll = Math.max(0, slack - (1 - target) * CHROME_CONDENSE_FREES_PX);
          const landed = Math.min(top, maxScroll);
          const after = stepCondense(
            { open: target, upward: 0 },
            { delta: 0, scrollTop: landed, slackExpanded: slack },
          );
          if (after.open !== target) offenders.push(`${slack}@${top} ${open.toFixed(2)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
