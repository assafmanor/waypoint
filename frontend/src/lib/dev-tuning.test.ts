// ADR-0146 §7: the numbers are preferences, the properties are the bugs.
//
// The lesson from the epic's five device corrections is that the tests asserted what the
// code did while the model was wrong. So these assert the cluster's INVARIANTS over every
// value the tuning panel can produce — not over today's constants. The owner cannot step
// into a state that violates one and mistake it for a design failure, and a future re-tune
// that lands outside them fails here rather than on someone's phone.
import { afterEach, describe, expect, it } from 'vitest';
import { MAP_DRAG_ZOOM, MAP_REFIT_FILL_SHARE, MAP_ZOOM } from '../constants';
import { MAP_TUNABLES, tunableRange, tuningWarnings } from '../dev/map-tunables';
import { boundsFillView } from './map-camera';
import {
  DRAG_ZOOM_ACTION,
  DRAG_ZOOM_EVENT,
  IDLE_DRAG_ZOOM,
  reduceDragZoom,
  zoomPerLevelPx,
  type DragZoomEventType,
  type DragZoomLimits,
} from './canvas-gestures';
import {
  clearTuning,
  setTuning,
  TUNE,
  tune,
  tuningOverrides,
  type DevTunableKey,
} from './dev-tuning';

afterEach(() => clearTuning());

const tunable = (key: DevTunableKey) => {
  const found = MAP_TUNABLES.find((t) => t.key === key);
  if (!found) throw new Error(`no tunable ${key}`);
  return found;
};

const baseValues = (): Record<DevTunableKey, number> => {
  const out = {} as Record<DevTunableKey, number>;
  for (const t of MAP_TUNABLES) out[t.key] = t.base;
  return out;
};

describe('the accessor', () => {
  it('returns the constant it is handed until the panel moves it', () => {
    expect(tune(TUNE.zoomPlace, MAP_ZOOM.PLACE)).toBe(MAP_ZOOM.PLACE);
    setTuning(TUNE.zoomPlace, 12);
    expect(tune(TUNE.zoomPlace, MAP_ZOOM.PLACE)).toBe(12);
  });

  it('holds no defaults of its own, so `constants.ts` stays the only source of truth', () => {
    expect(tuningOverrides()).toEqual({});
    setTuning(TUNE.zoomPlace, 12);
    expect(tuningOverrides()).toEqual({ zoomPlace: 12 });
    setTuning(TUNE.zoomPlace, undefined);
    expect(tuningOverrides()).toEqual({});
  });

  it('reaches the pure readers, which is the whole point of the seam', () => {
    // `zoomPerLevelPx` is a pure function that reads the constant in its body — no prop,
    // no state, no re-render, which is what keeps this clear of a billed map load.
    const tall = 500;
    expect(zoomPerLevelPx(tall)).toBe(MAP_DRAG_ZOOM.PX_PER_LEVEL);
    setTuning(TUNE.dragPxPerLevel, 200);
    expect(zoomPerLevelPx(tall)).toBe(200);
  });

  it('does not leak between tests, so a stray override cannot pass one for the wrong reason', () => {
    expect(tuningOverrides()).toEqual({});
  });
});

// Each property is named for the bug it prevents, and each is asserted across the panel's
// whole range rather than at the shipped value.
describe('the properties the calibrated values must satisfy', () => {
  it("today's constants satisfy every invariant the panel checks", () => {
    // The baseline. If this ever fails, `main` shipped a broken ladder.
    expect(tuningWarnings(baseValues())).toEqual([]);
    expect(MAP_ZOOM.DOT_BELOW).toBeLessThan(MAP_ZOOM.PLACE);
    expect(MAP_ZOOM.PLACE).toBeLessThanOrEqual(MAP_ZOOM.MAX_FIT);
    expect(MAP_ZOOM.MAX_FIT).toBeLessThanOrEqual(MAP_ZOOM.STEP_IN_MAX);
  });

  it('flags a focused place landing in the dot tier, at every rung both steppers offer', () => {
    // The camera would deliver you to precision it has just thrown away. The ranges overlap
    // on purpose (narrowing them would make the steppers lie about what the constants can
    // be), so the guarantee is that the panel SAYS so — over the whole cross-product.
    for (const dotBelow of tunableRange(tunable(TUNE.zoomDotBelow))) {
      for (const place of tunableRange(tunable(TUNE.zoomPlace))) {
        const warned = tuningWarnings({ ...baseValues(), zoomDotBelow: dotBelow, zoomPlace: place })
          .join(' ')
          .includes('dot tier');
        expect(warned).toBe(dotBelow >= place);
      }
    }
  });

  it('flags a guess tighter than a real fit, or a ladder that cannot reach its own fit', () => {
    // `constants.ts` records that when PLACE and MAX_FIT both moved a step out, "the
    // relationship between them was preserved rather than re-invented". Break the order and
    // a fit that has extent behind it is capped LOOSER than the no-extent fallback.
    for (const place of tunableRange(tunable(TUNE.zoomPlace))) {
      for (const maxFit of tunableRange(tunable(TUNE.zoomMaxFit))) {
        const warned = tuningWarnings({ ...baseValues(), zoomPlace: place, zoomMaxFit: maxFit })
          .join(' ')
          .includes('tighter than a real fit');
        expect(warned).toBe(place > maxFit);
      }
    }
    for (const stepIn of tunableRange(tunable(TUNE.zoomStepInMax))) {
      const warned = tuningWarnings({ ...baseValues(), zoomStepInMax: stepIn })
        .join(' ')
        .includes('cannot reach its own fit');
      expect(warned).toBe(MAP_ZOOM.MAX_FIT > stepIn);
    }
  });

  it('every re-fit share the panel offers can be both satisfied and violated', () => {
    // Above 1 no set could ever fill the view, so the camera would re-fit forever; at 0
    // the dwarfed guard is off and session 139's "the camera never zoomed back in" is back.
    const share = tunable(TUNE.refitFillShare);
    expect(share.min).toBeGreaterThan(0);
    expect(share.max).toBeLessThanOrEqual(1);

    const view = { north: 1, south: -1, east: 1, west: -1 };
    for (const value of tunableRange(share)) {
      setTuning(TUNE.refitFillShare, value);
      // A set filling the whole view is always framed; a point-sized one never is.
      expect(boundsFillView(view, view)).toBe(true);
      expect(boundsFillView(view, { north: 0.001, south: -0.001, east: 0.001, west: -0.001 })).toBe(
        false,
      );
    }
    expect(MAP_REFIT_FILL_SHARE).toBeGreaterThan(0);
    expect(MAP_REFIT_FILL_SHARE).toBeLessThanOrEqual(1);
  });

  it('no canvas at any size costs more finger travel per level than the calibrated stop', () => {
    // Session 194's property, re-asserted over the panel's whole range rather than at 120:
    // the inverted "more map, slower drag" model must stay unreachable by re-tuning.
    const perLevel = tunable(TUNE.dragPxPerLevel);
    for (const value of tunableRange(perLevel)) {
      setTuning(TUNE.dragPxPerLevel, value);
      for (const paneHeight of [120, 160, 243, 390, 501, 900, 1400]) {
        expect(zoomPerLevelPx(paneHeight)).toBeLessThanOrEqual(value);
      }
      // And it is monotone non-decreasing in canvas height — never the reverse.
      const heights = [160, 243, 390, 501, 900];
      const costs = heights.map(zoomPerLevelPx);
      expect([...costs].sort((a, b) => a - b)).toEqual(costs);
    }
  });

  it('the recogniser stays total at every tap gap the panel offers', () => {
    // A press either pairs into a double-tap or it does not; it must never do both, and it
    // must never arm off a gap the tuned window excludes. Asserted at the boundary of each
    // offered window rather than at 500, because an off-by-one in the comparison is exactly
    // the class of thing a value test agrees with.
    const limits: DragZoomLimits = { min: 2, max: 21, perLevelPx: 120 };
    const gaps = tunableRange(tunable(TUNE.dragTapGapMs));
    for (const gap of gaps) {
      setTuning(TUNE.dragTapGapMs, gap);
      for (const [offset, shouldArm] of [
        [-1, true],
        [0, false],
        [1, false],
      ] as const) {
        // A tap at t=0, released in place, then a second press at the window's edge.
        const afterDown = reduceDragZoom(
          IDLE_DRAG_ZOOM,
          { type: DRAG_ZOOM_EVENT.DOWN, x: 10, y: 10, t: 0 },
          12,
          limits,
        );
        // Released at the same instant: the window is measured from the RELEASE, so a tap
        // of zero duration puts the boundary exactly at `gap`.
        const afterUp = reduceDragZoom(
          afterDown.state,
          { type: DRAG_ZOOM_EVENT.UP, x: 10, y: 10, t: 0 },
          12,
          limits,
        );
        expect(afterUp.state.hasTap).toBe(true);
        const second = reduceDragZoom(
          afterUp.state,
          { type: DRAG_ZOOM_EVENT.DOWN as DragZoomEventType, x: 10, y: 10, t: gap + offset },
          12,
          limits,
        );
        // Exactly one of the two outcomes, never both, at every gap in the range.
        const armed = second.action === DRAG_ZOOM_ACTION.ARM;
        const passed = second.action === DRAG_ZOOM_ACTION.PASS;
        expect(armed !== passed).toBe(true);
        expect(armed).toBe(shouldArm);
      }
    }
  });

  it('every stepper range contains the constant it shadows, so reset is always reachable', () => {
    for (const t of MAP_TUNABLES) {
      expect(t.base).toBeGreaterThanOrEqual(t.min);
      expect(t.base).toBeLessThanOrEqual(t.max);
      expect(tunableRange(t).map((v) => Number(v.toFixed(t.decimals ?? 0)))).toContain(
        Number(t.base.toFixed(t.decimals ?? 0)),
      );
    }
  });

  it('names a distinct key per tunable, so no two steppers move the same number', () => {
    const keys = MAP_TUNABLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(Object.values(TUNE)).size).toBe(Object.values(TUNE).length);
    // Every key the accessor knows has a control; every control has a key.
    expect(keys.slice().sort()).toEqual(Object.values(TUNE).slice().sort());
  });
});
