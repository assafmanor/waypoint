import { describe, expect, it } from 'vitest';
import { clampToStops, nearestStop, stopHeightCss, stopHeightPx } from './snap-sheet';
import {
  MAP_CONTROLS_H,
  MAP_SHEET_ORDER,
  MAP_SHEET_STOPS,
  MAP_SHEET_STRIP_H,
  SNAP_FLICK_PX_PER_MS,
} from '../constants';

const CONTAINER = 600;

describe('snap heights (ADR-0121 §5, third variant ADR-0122 §3)', () => {
  it('resolves a fixed map stop, a fractional half, and a full INSET by the controls row', () => {
    expect(stopHeightPx(MAP_SHEET_STOPS.map, CONTAINER)).toBe(MAP_SHEET_STRIP_H);
    expect(stopHeightPx(MAP_SHEET_STOPS.half, CONTAINER)).toBeCloseTo(336);
    // The whole container minus the row floating over the canvas — which is what makes
    // "a sheet that must not cover the thing above it" expressible at all.
    expect(stopHeightPx(MAP_SHEET_STOPS.full, CONTAINER)).toBe(CONTAINER - MAP_CONTROLS_H);
  });

  // Fixed chrome is the same size on every screen; a proportion is not.
  it('never lets a fixed stop exceed a short container', () => {
    expect(stopHeightPx(MAP_SHEET_STOPS.map, 40)).toBe(40);
  });

  // A container shorter than the inset would otherwise resolve to a negative height, and
  // a negative height clamps the drag to nonsense.
  it('never lets an inset stop go negative on a container shorter than the inset', () => {
    expect(stopHeightPx(MAP_SHEET_STOPS.full, 20)).toBe(0);
  });

  it('states the resting height as CSS, which is what lets the browser animate it', () => {
    expect(stopHeightCss(MAP_SHEET_STOPS.map)).toBe('52px');
    expect(stopHeightCss(MAP_SHEET_STOPS.half)).toBe('56%');
    // A `calc`, not a resolved number: the screen must not measure its own layout
    // (ADR-0121 §5), so the container's height stays the browser's business.
    expect(stopHeightCss(MAP_SHEET_STOPS.full)).toBe('calc(100% - 46px)');
  });

  it('clamps a drag inside the outermost stops', () => {
    expect(clampToStops(-200, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(MAP_SHEET_STRIP_H);
    // The clamp is what keeps the gesture from pulling the sheet over the controls row.
    expect(clampToStops(9999, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(
      CONTAINER - MAP_CONTROLS_H,
    );
    expect(clampToStops(300, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe(300);
  });

  it('releases to the nearest stop, so a slow drag that barely moves stays where it was', () => {
    const at = (px: number) => nearestStop(px, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER);
    expect(at(60)).toBe('map');
    expect(at(330)).toBe('half');
    expect(at(590)).toBe('full');
    // Just past half on the way up is still half, not a jump to full.
    expect(at(360)).toBe('half');
  });

  it('ties go to the lower stop, so a release is never ambiguous', () => {
    const midway =
      (stopHeightPx(MAP_SHEET_STOPS.map, CONTAINER) +
        stopHeightPx(MAP_SHEET_STOPS.half, CONTAINER)) /
      2;
    expect(nearestStop(midway, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER)).toBe('map');
  });

  // A flick that travels little used to snap back to where it started, which is most of
  // what "moving between the sheet's heights is unpleasant" meant (ADR-0122 §4). The
  // table is release height × velocity → stop: the SAME height lands differently
  // depending on how the finger was moving when it let go.
  describe('a flick commits in its direction of travel (ADR-0122 §4)', () => {
    const MAP_PX = stopHeightPx(MAP_SHEET_STOPS.map, CONTAINER);
    const HALF_PX = stopHeightPx(MAP_SHEET_STOPS.half, CONTAINER);
    const FULL_PX = stopHeightPx(MAP_SHEET_STOPS.full, CONTAINER);
    const FAST = SNAP_FLICK_PX_PER_MS;
    const at = (px: number, velocity: number) =>
      nearestStop(px, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER, velocity);

    it.each([
      // Barely off `map`, released fast upward: the next stop up, not back to `map`.
      { from: MAP_PX + 10, velocity: FAST, stop: 'half' },
      // The same height, released slowly: nearest wins, and that is `map`.
      { from: MAP_PX + 10, velocity: 0.1, stop: 'map' },
      // Barely off `half` downward at speed: `map`, though `half` is nearer.
      { from: HALF_PX - 10, velocity: -FAST, stop: 'map' },
      { from: HALF_PX - 10, velocity: -0.1, stop: 'half' },
      // Barely off `half` upward at speed: `full`, though `half` is nearer.
      { from: HALF_PX + 10, velocity: FAST, stop: 'full' },
      { from: HALF_PX + 10, velocity: 0.1, stop: 'half' },
      // A fast flick past the last stop clamps rather than falling off the axis.
      { from: FULL_PX - 2, velocity: FAST * 4, stop: 'full' },
      { from: MAP_PX + 1, velocity: -FAST * 4, stop: 'map' },
      // A slow drag all the way across still lands where it was let go.
      { from: FULL_PX - 5, velocity: 0, stop: 'full' },
    ])('$from px at $velocity px/ms → $stop', ({ from, velocity, stop }) => {
      expect(at(from, velocity)).toBe(stop);
    });

    // The threshold is a floor, not a range: exactly at it, the flick commits.
    it('commits exactly AT the threshold, and not just below it', () => {
      expect(at(HALF_PX + 10, FAST)).toBe('full');
      expect(at(HALF_PX + 10, FAST - 0.01)).toBe('half');
    });

    // Released exactly on a stop, a flick must not count that stop as "beyond" itself —
    // otherwise a fast gesture that happens to land on a boundary is a no-op.
    it('a flick released exactly on a stop still moves off it', () => {
      expect(at(HALF_PX, FAST)).toBe('full');
      expect(at(HALF_PX, -FAST)).toBe('map');
    });

    it('zero velocity is exactly the old behaviour', () => {
      expect(at(HALF_PX + 10, 0)).toBe(
        nearestStop(HALF_PX + 10, CONTAINER, MAP_SHEET_STOPS, MAP_SHEET_ORDER),
      );
    });
  });
});
