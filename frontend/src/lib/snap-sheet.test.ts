import { describe, expect, it } from 'vitest';
import { clampToStops, nearestStop, stopHeightCss, stopHeightPx } from './snap-sheet';
import { MAP_SHEET_ORDER, MAP_SHEET_STOPS } from '../constants';

const CONTAINER = 600;

describe('snap heights (ADR-0121 §5)', () => {
  it('resolves a fixed peek and a fractional half', () => {
    expect(stopHeightPx(MAP_SHEET_STOPS.peek, CONTAINER)).toBe(116);
    expect(stopHeightPx(MAP_SHEET_STOPS.half, CONTAINER)).toBeCloseTo(336);
    expect(stopHeightPx(MAP_SHEET_STOPS.full, CONTAINER)).toBe(600);
  });

  // A peek should be the same size on every phone; a half should not.
  it('never lets a fixed stop exceed a short container', () => {
    expect(stopHeightPx(MAP_SHEET_STOPS.peek, 80)).toBe(80);
  });

  it('states the resting height as CSS, which is what lets the browser animate it', () => {
    expect(stopHeightCss(MAP_SHEET_STOPS.peek)).toBe('116px');
    expect(stopHeightCss(MAP_SHEET_STOPS.half)).toBe('56%');
    expect(stopHeightCss(MAP_SHEET_STOPS.full)).toBe('100%');
  });

  it('clamps a drag inside the outermost stops', () => {
    expect(clampToStops(-200, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(116);
    expect(clampToStops(9999, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(600);
    expect(clampToStops(300, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(300);
  });

  it('releases to the nearest stop, so a short flick stays where it was', () => {
    const at = (px: number) => nearestStop(px, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER);
    expect(at(120)).toBe('peek');
    expect(at(330)).toBe('half');
    expect(at(590)).toBe('full');
    // Just past half on the way up is still half, not a jump to full.
    expect(at(360)).toBe('half');
  });

  it('ties go to the lower stop, so a release is never ambiguous', () => {
    const midway =
      (stopHeightPx(MAP_SHEET_STOPS.peek, CONTAINER) +
        stopHeightPx(MAP_SHEET_STOPS.half, CONTAINER)) /
      2;
    expect(nearestStop(midway, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe('peek');
  });
});
