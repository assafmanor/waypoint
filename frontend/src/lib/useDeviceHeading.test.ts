import { describe, expect, it } from 'vitest';
import { headingFromEvent, smoothHeading } from './useDeviceHeading';
import { MAP_ORIENT } from '../constants';

// The two pure halves of the heading source (ADR-0234 §6). Both are here rather than in the
// hook's own render tests because both are places a SIGN error hides: a compass that turns
// the wrong way and a compass that swings the long way round are each one minus sign, and
// neither throws.
describe('headingFromEvent', () => {
  // iOS reports a true-north heading directly, and it is already clockwise.
  it('takes webkitCompassHeading as it stands', () => {
    expect(headingFromEvent({ alpha: 0, absolute: false, webkitCompassHeading: 90 })).toBe(90);
  });

  // **Everyone else reports `alpha`, which is COUNTER-clockwise from north** — so a heading
  // is `360 - alpha`. Reading alpha as a heading gives a compass that turns the wrong way,
  // which on screen reads as a sign error in the CSS rather than in the sensor.
  it('turns an absolute alpha the right way round', () => {
    expect(headingFromEvent({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromEvent({ alpha: 0, absolute: true })).toBe(0);
  });

  // A non-absolute event's alpha is relative to wherever the device happened to start, which
  // is not a heading at all. Refused rather than guessed — the same rule §3 applies to the
  // cone: a direction we cannot back is not drawn.
  it('refuses a reading that is not anchored to north', () => {
    expect(headingFromEvent({ alpha: 90, absolute: false })).toBeNull();
    expect(headingFromEvent({ alpha: null, absolute: true })).toBeNull();
  });
});

describe('smoothHeading', () => {
  it('takes the first sample whole, because there is nothing to smooth against', () => {
    expect(smoothHeading(undefined, 42)).toBe(42);
  });

  // **The trap this function exists for.** A plain weighted average of 350 and 10 is 180:
  // the compass would swing through SOUTH to cross north. Smoothed over the short arc it
  // moves the other way, by a fraction of 20°.
  it('crosses north the short way, never through south', () => {
    const next = smoothHeading(350, 10);
    expect(next).not.toBeNull();
    // 350 + 20 × 0.15 = 353, wrapped — not 296 (the long way) and nowhere near 180.
    expect(next).toBeCloseTo(353, 5);
  });

  it('wraps past 360 rather than reporting an angle no CSS would accept', () => {
    const next = smoothHeading(359, 20);
    expect(next).not.toBeNull();
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(360);
  });

  // A hand held still wanders a degree or two. Below the floor nothing is written at all,
  // so the camera is not asked to turn for noise.
  it('writes nothing for a step below the floor', () => {
    expect(smoothHeading(100, 100 + MAP_ORIENT.MIN_STEP_DEG / 2)).toBeNull();
  });

  it('moves a fraction of the way, so one noisy sample cannot snap the map', () => {
    const next = smoothHeading(0, 100);
    expect(next).toBeCloseTo(100 * MAP_ORIENT.SMOOTHING, 5);
  });
});
