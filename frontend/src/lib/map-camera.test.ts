import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  boundsOfPoints,
  cameraTargetFor,
  countPointsInBounds,
  fitPaddingFor,
  mapFitPadding,
  pointInBounds,
} from './map-camera';
import { pinHeightFor } from './map-pins';
import { MAP_CONTROLS_H, MAP_FIT_INSET, MAP_PIN } from '../constants';

const TOKYO = { lat: 35.68, lng: 139.76 };
const KYOTO = { lat: 35.01, lng: 135.77 };

describe('boundsOfPoints (ADR-0121 §7)', () => {
  it('is null for an empty set — no pins, so the camera is left alone', () => {
    expect(boundsOfPoints([])).toBeNull();
  });

  it('spans the extent, not the count: two pins bound both', () => {
    expect(boundsOfPoints([TOKYO, KYOTO])).toEqual({
      north: 35.68,
      south: 35.01,
      east: 139.76,
      west: 135.77,
    });
  });

  it('a single pin has a zero-area extent — which is why it is never fitted', () => {
    expect(boundsOfPoints([TOKYO])).toEqual({
      north: 35.68,
      south: 35.68,
      east: 139.76,
      west: 139.76,
    });
  });
});

describe('bounds containment', () => {
  const view = { north: 36, south: 35, east: 140, west: 135 };

  it('holds a point inside, edges included', () => {
    expect(pointInBounds(view, TOKYO)).toBe(true);
    expect(pointInBounds(view, { lat: 36, lng: 135 })).toBe(true);
    expect(pointInBounds(view, { lat: 37, lng: 139 })).toBe(false);
  });

  it('contains a wholly-inside extent, and not one that pokes out', () => {
    expect(boundsContain(view, { north: 35.9, south: 35.1, east: 139, west: 136 })).toBe(true);
    expect(boundsContain(view, { north: 36.5, south: 35.1, east: 139, west: 136 })).toBe(false);
  });

  // The `באזור` readout: how many of our places are on the canvas right now.
  it('counts the points on the canvas, and nothing before the first idle', () => {
    expect(countPointsInBounds([TOKYO, KYOTO], view)).toBe(2);
    expect(countPointsInBounds([TOKYO, { lat: 1, lng: 1 }], view)).toBe(1);
    expect(countPointsInBounds([TOKYO], null)).toBe(0);
  });
});

describe('cameraTargetFor — it moves only when it owes you something (§7)', () => {
  it('does nothing for an empty set: the empty state speaks', () => {
    expect(cameraTargetFor([], null)).toEqual({ kind: 'none' });
  });

  it('does nothing when the new set already fits the current view', () => {
    const view = { north: 36, south: 34, east: 141, west: 134 };
    // This is what removes the "tap אוכל, map lurches across the city" case while
    // keeping the promise that a chip never leaves results off-canvas.
    expect(cameraTargetFor([TOKYO, KYOTO], view)).toEqual({ kind: 'none' });
  });

  // The reported defect: zoom out for a day whose places are hours apart, then narrow
  // — by category, by `אולי`, by `מה נשאר`, by picking another day — and the new set
  // is wholly inside that wide view, so the camera declined to move. Three pins in
  // one corner of a country.
  it('re-fits a set the view CONTAINS but dwarfs — visible is not framed', () => {
    const wide = { north: 40, south: 30, east: 145, west: 130 };
    const oneNeighbourhood = [TOKYO, { lat: TOKYO.lat + 0.01, lng: TOKYO.lng + 0.01 }];
    expect(cameraTargetFor(oneNeighbourhood, wide).kind).toBe('fit');
  });

  it('narrowing to a single pin re-centres too — a zero-area extent fills nothing', () => {
    const wide = { north: 40, south: 30, east: 145, west: 130 };
    // The containment test used to run BEFORE the coincident branch, so filtering all
    // the way down to one place was the same defect, one pin narrower.
    expect(cameraTargetFor([TOKYO], wide)).toEqual({ kind: 'centre', at: TOKYO });
  });

  // The other half of the guard, and the reason it is `||` across the axes rather
  // than `&&`: dwarfed means small in BOTH directions.
  it('a set filling one axis is framed, not dwarfed — no lurch for a street of stops', () => {
    const view = { north: 36, south: 34, east: 141, west: 134 };
    const alongOneStreet = [
      { lat: 35, lng: 135 },
      { lat: 35.02, lng: 140 },
    ];
    expect(cameraTargetFor(alongOneStreet, view)).toEqual({ kind: 'none' });
  });

  // Falls out of the arithmetic, and it is the property that keeps §7's "a manual
  // zoom wins until the next scope change" alive: a tight view makes every ratio
  // bigger, so deliberate close-in inspection is the hardest thing to disturb.
  it('the tighter the view, the less likely a re-fit', () => {
    // Pins spanning 0.01° each way.
    const pins = [TOKYO, { lat: TOKYO.lat + 0.01, lng: TOKYO.lng + 0.01 }];
    const wide = { north: 40, south: 30, east: 145, west: 130 };
    // 0.02° each way, so the pins fill half of it — comfortably framed.
    const tight = {
      north: TOKYO.lat + 0.015,
      south: TOKYO.lat - 0.005,
      east: TOKYO.lng + 0.015,
      west: TOKYO.lng - 0.005,
    };
    expect(cameraTargetFor(pins, wide).kind).toBe('fit');
    expect(cameraTargetFor(pins, tight)).toEqual({ kind: 'none' });
  });

  it('centres a single pin rather than fitting it — a zero-area fit maxes the zoom', () => {
    expect(cameraTargetFor([TOKYO], null)).toEqual({ kind: 'centre', at: TOKYO });
  });

  it('centres several EXACTLY coincident pins for the same reason', () => {
    expect(cameraTargetFor([TOKYO, { ...TOKYO }], null)).toEqual({ kind: 'centre', at: TOKYO });
  });

  it('fits anything with real extent, including a multi-city trip', () => {
    expect(cameraTargetFor([TOKYO, KYOTO], null)).toEqual({
      kind: 'fit',
      bounds: { north: 35.68, south: 35.01, east: 139.76, west: 135.77 },
    });
  });

  it('re-fits when the set has grown past the current view', () => {
    const view = { north: 35.7, south: 35.6, east: 139.8, west: 139.7 };
    expect(cameraTargetFor([TOKYO, KYOTO], view).kind).toBe('fit');
  });

  // Near-coincident (but not identical) pins go through `fit`: the caller's shared
  // maxZoom cap covers them and the single-pin case both, rather than a second
  // special case here.
  it('leaves near-coincident pins to the fit + the shared zoom cap', () => {
    const nudged = { lat: TOKYO.lat + 0.0002, lng: TOKYO.lng + 0.0002 };
    expect(cameraTargetFor([TOKYO, nudged], null).kind).toBe('fit');
  });
});

// Session 134 diagnosed two compounding hazards behind "the map opens on the whole
// world and stays there", and fixed the second one WHERE IT SHOWED — the opening
// framing ignores containment. Session 139 fixed it at the root: containment alone no
// longer means "don't move", so a wide view is not a trap for any framing.
describe('a wide view is no longer a trap (the root of session 134’s hazard 2)', () => {
  const world = { north: 85, south: -85, east: 180, west: -180 };
  const day = [
    { lat: 35.68, lng: 139.76 },
    { lat: 35.71, lng: 139.78 },
  ];

  it('a set dwarfed by the view re-fits, even though the view contains it', () => {
    // This used to answer `none`, which is what made a wide view permanent: the pins
    // are on screen, so nothing was ever owed, so no chip / `אולי` / day change could
    // tighten it again. Being visible is not being framed.
    expect(cameraTargetFor(day, world).kind).toBe('fit');
  });

  it('the opening framing still passes `null`, and is no longer the only guard', () => {
    // Still correct — before the first framing there is no view worth preserving —
    // but it is now belt-and-braces rather than the one thing standing between a bad
    // first fit and a camera stuck at it forever.
    expect(cameraTargetFor(day, null).kind).toBe('fit');
  });
});

describe('fitPaddingFor — the other half of the zoom-out', () => {
  const PHONE = { width: 390, height: 320 };
  const forPhone = mapFitPadding(PHONE.height);

  it('passes the padding through when the viewport can hold it', () => {
    expect(fitPaddingFor(PHONE, forPhone)).toEqual(forPhone);
  });

  // `fitBounds` with padding eating most of the div resolves to a degenerate
  // viewport and zooms far OUT — losing a pin's tag beats losing the framing.
  it('drops the padding when it would claim half an axis', () => {
    expect(fitPaddingFor({ width: 390, height: 120 }, mapFitPadding(120))).toBeUndefined();
    expect(fitPaddingFor({ width: 100, height: 320 }, forPhone)).toBeUndefined();
  });

  // `null` is distinct from "no padding": an unsized div is measured BEFORE layout
  // settles, and there is no honest fit into nothing — the caller waits instead.
  it('refuses outright on an unsized div', () => {
    expect(fitPaddingFor({ width: 0, height: 0 }, mapFitPadding(0))).toBeNull();
    expect(fitPaddingFor({ width: 390, height: 0 }, mapFitPadding(0))).toBeNull();
  });
});

// The controls row floats OVER the canvas (ADR-0122 §1), and nothing about the layout
// keeps pins out from under it — the camera does, by insetting the fit. So the two are
// one number by construction rather than by discipline: `--map-controls-h` and this
// padding are derived from the same constant, and a test that reads both is what makes
// "they cannot drift apart" true rather than aspirational.
describe('the fit clears the floating controls row (ADR-0122 §1)', () => {
  const AT_MAP = { width: 390, height: 517 };
  const AT_HALF = { width: 390, height: 250 };

  it('insets the top by the row PLUS a pin’s own clearance, never just the pin', () => {
    // The teardrop's tip is the anchor, so its body extends above the coordinate; the row
    // is on top of that. A `top` that only covered the pin would put a fitted pin under
    // the chips, where it is drawn but not tappable.
    const padding = mapFitPadding(AT_MAP.height);
    expect(padding.top).toBeGreaterThan(MAP_CONTROLS_H);
    expect(padding.top - MAP_CONTROLS_H).toBeGreaterThanOrEqual(padding.bottom);
  });

  // ADR-0123's coupling, asserted rather than promised: the clearance is derived from the
  // size the pin will ACTUALLY be on that canvas, so a bigger canvas both grows the pin
  // and reserves more room for it. A flat constant could be right for one stop only.
  it('reserves more where the canvas grows the pin, and less where it does not', () => {
    const atMap = mapFitPadding(AT_MAP.height).top;
    const atHalf = mapFitPadding(AT_HALF.height).top;
    expect(pinHeightFor(AT_MAP.height)).toBeGreaterThan(pinHeightFor(AT_HALF.height));
    expect(atMap).toBeGreaterThan(atHalf);
    // And it always clears the pin itself plus its tag, never merely the pin.
    expect(atMap - MAP_CONTROLS_H).toBeGreaterThan(pinHeightFor(AT_MAP.height));
  });

  // ADR-0122 §1's second honest limit, asserted rather than promised: at `half` the pane
  // is ~250px on the baseline phone, and this inset claims more than half of that axis —
  // so `fitPaddingFor` drops it and a fitted pin CAN land under the row there. At the map
  // extreme the pane is ~517px and the inset is cheap, which is one more argument for the
  // height axis. Deriving the clearance (ADR-0123) makes `half` cheaper, not solved.
  it('is affordable at the map extreme and dropped at half — the axis pays for it', () => {
    const atMap = mapFitPadding(AT_MAP.height);
    const atHalf = mapFitPadding(AT_HALF.height);
    expect(fitPaddingFor(AT_MAP, atMap)).toEqual(atMap);
    expect(fitPaddingFor(AT_HALF, atHalf)).toBeUndefined();
  });

  // The clearance is stated in terms of the tag, so the two cannot drift: the tag's rise
  // is a fraction of the pin, and the band above the coordinate is the pin plus that.
  it('reserves the pin plus the amber tag’s rise, and nothing invented', () => {
    const height = pinHeightFor(AT_MAP.height);
    const reserved = mapFitPadding(AT_MAP.height).top - MAP_CONTROLS_H;
    expect(reserved).toBeGreaterThanOrEqual(height * (1 + MAP_PIN.TAG_RISE));
    expect(reserved).toBeLessThan(height * (1 + MAP_PIN.TAG_RISE) + MAP_CONTROLS_H);
  });

  // Session 144: only `top` was derived, so raising the pin size walked pins into the
  // left and right edges. The point of asserting it as an inequality against the pin's
  // measured reach is that a future size change cannot reintroduce it.
  it('clears the pin sideways at every canvas size, not just the tuned one', () => {
    for (const canvas of [0, 120, 243, 400, 501, 545, 900, 4000]) {
      const { left, right } = mapFitPadding(canvas);
      const reach = pinHeightFor(canvas) * MAP_PIN.SIDE_REACH;
      expect(left).toBeGreaterThan(reach);
      expect(right).toBe(left);
    }
  });

  // Nothing of the pin sits below its tip — the tip IS the anchor — so the bottom stays
  // breathing room. Reserving a pin's height there would be padding for no ink.
  it('does not reserve pin room below the anchor', () => {
    expect(mapFitPadding(AT_MAP.height).bottom).toBe(MAP_FIT_INSET);
  });

  // The whole horizontal inset has to stay affordable, or `fitPaddingFor` drops it and
  // the fit loses its framing — which is why the amber tag's 1.10x reach is deliberately
  // NOT reserved (see `MAP_PIN.SIDE_REACH`). 360px is the narrowest device target.
  it('stays affordable on the narrowest phone, so it is never dropped for width', () => {
    for (const width of [360, 390]) {
      const padding = mapFitPadding(545);
      expect(fitPaddingFor({ width, height: 545 }, padding)).toEqual(padding);
    }
  });
});
