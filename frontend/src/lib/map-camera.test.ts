import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  focusBoundsFor,
  boundsContain,
  boundsOfPoints,
  cameraTargetFor,
  countPointsInBounds,
  fitPaddingFor,
  mapFitPadding,
  pointInBounds,
  searchCameraTarget,
  zoomStepIn,
} from './map-camera';
import { pinHeightFor } from './map-pins';
import {
  MAP_CARD_RESERVE_H,
  MAP_CONTROLS_H,
  MAP_FIT_INSET,
  MAP_FOCUS,
  MAP_PIN,
  MAP_SEARCH_CAMERA,
  MAP_ZOOM,
} from '../constants';

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

// ADR-0127 §2's step-in ladder, which ADR-0129 left standing. (Its sibling
// `zoomToAtLeast` is gone with the zoom-on-selection it existed for.)
describe('the zoom ladder (ADR-0127 §2)', () => {
  describe('zoomStepIn', () => {
    const step = (z: number | null) => zoomStepIn(z, MAP_ZOOM.PLACE, MAP_ZOOM.STEP_IN_MAX);

    it('lifts a far-out view straight to the readable zoom, not one step', () => {
      expect(step(6)).toBe(MAP_ZOOM.PLACE);
    });

    it('steps one level in from there, and stops at the ceiling', () => {
      expect(step(MAP_ZOOM.PLACE)).toBe(MAP_ZOOM.PLACE + 1);
      expect(step(MAP_ZOOM.STEP_IN_MAX - 1)).toBe(MAP_ZOOM.STEP_IN_MAX);
      expect(step(MAP_ZOOM.STEP_IN_MAX)).toBe(MAP_ZOOM.STEP_IN_MAX);
      expect(step(MAP_ZOOM.STEP_IN_MAX + 3)).toBe(MAP_ZOOM.STEP_IN_MAX);
    });

    // The property that makes it stateless: the answer depends only on where the map
    // IS, so nothing can drift out of sync with it — there is no counter to drift.
    it('is a pure function of the current zoom, so no tap count can desynchronise', () => {
      expect(step(MAP_ZOOM.PLACE)).toBe(step(MAP_ZOOM.PLACE));
      expect(step(null)).toBe(MAP_ZOOM.PLACE);
    });
  });
});

// ADR-0122 §7 asked for this and deferred it; ADR-0128 §2 builds it. The reserve is
// only ever asked for at the `map` stop, because that is the only stop the card exists
// at — which is what makes it affordable and is worth asserting rather than assuming.
describe('the place card’s bottom reserve (ADR-0128 §2)', () => {
  const AT_MAP = 517;

  it('reserves at the bottom and touches no other side', () => {
    const plain = mapFitPadding(AT_MAP);
    const withCard = mapFitPadding(AT_MAP, MAP_CARD_RESERVE_H);
    expect(withCard.bottom).toBeGreaterThan(plain.bottom);
    expect(withCard.top).toBe(plain.top);
    expect(withCard.left).toBe(plain.left);
    expect(withCard.right).toBe(plain.right);
  });

  // The finding that changed this from what ADR-0122 §7 specified: the card's full band
  // does not fit on ANY phone at ANY stop, and an unclamped reserve would make
  // `fitPaddingFor` drop the whole padding — trading a pin under the card for a pin
  // under the controls row, which is worse and silent.
  it('is CLAMPED so it can never cost the top inset', () => {
    for (const h of [312, 517, 545]) {
      const padding = mapFitPadding(h, MAP_CARD_RESERVE_H);
      expect(padding.top).toBe(mapFitPadding(h).top);
      expect(padding.bottom - mapFitPadding(h).bottom).toBeLessThan(MAP_CARD_RESERVE_H);
      expect(fitPaddingFor({ width: 390, height: h }, padding)).toEqual(padding);
    }
  });

  // Degrading rather than switching off: a taller canvas carries more of the card.
  it('a taller canvas carries more of the card than a short one', () => {
    const short = mapFitPadding(312, MAP_CARD_RESERVE_H).bottom - mapFitPadding(312).bottom;
    const tall = mapFitPadding(517, MAP_CARD_RESERVE_H).bottom - mapFitPadding(517).bottom;
    expect(tall).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(0);
  });

  it('defaults to reserving nothing, so no card means the shipped padding exactly', () => {
    expect(mapFitPadding(AT_MAP, 0)).toEqual(mapFitPadding(AT_MAP));
  });

  // The affordability question ADR-0122 §1 raised about the TOP inset, asked of both at
  // once: a fit that reserves the row and the card must still leave half the axis, or
  // `fitPaddingFor` drops the whole thing and the framing is worse than before.
  it('stays affordable on the narrowest phone too, so it is never dropped', () => {
    const padding = mapFitPadding(312, MAP_CARD_RESERVE_H);
    expect(fitPaddingFor({ width: 360, height: 312 }, padding)).toEqual(padding);
  });
});

// ADR-0129 §2. A fixed zoom cannot tell a dense district from an empty valley, and the
// report was exactly that: how close to go should depend on what is around the place.
describe('the focus frame is derived from what is nearby (ADR-0129 §2)', () => {
  const AT = { lat: 35.68, lng: 139.76 };
  const span = (b: ReturnType<typeof focusBoundsFor>) => b.north - b.south;
  const near = { lat: 35.683, lng: 139.763 };
  const far = { lat: 35.9, lng: 140.0 };

  it('frames tighter when the neighbours are close, wider when they are far', () => {
    const tight = span(focusBoundsFor(AT, [near]));
    const loose = span(focusBoundsFor(AT, [far]));
    expect(tight).toBeLessThan(loose);
  });

  it('is centred on the place, whatever the neighbours do', () => {
    const b = focusBoundsFor(AT, [near, far]);
    expect((b.north + b.south) / 2).toBeCloseTo(AT.lat, 9);
    expect((b.east + b.west) / 2).toBeCloseTo(AT.lng, 9);
  });

  // Both clamps earn their place. Without the ceiling one distant neighbour frames a
  // region and the place is a speck; without the floor coincident pins fit a zero-area
  // box and snap to building level (ADR-0121 §7's degenerate row).
  it('clamps both ways', () => {
    expect(span(focusBoundsFor(AT, [{ lat: 60, lng: 100 }]))).toBeCloseTo(
      MAP_FOCUS.MAX_SPAN_DEG * 2,
      9,
    );
    // A neighbour a few metres away: the floor is what stops this fitting a near-zero box
    // and snapping to building level.
    expect(span(focusBoundsFor(AT, [{ lat: AT.lat + 0.00002, lng: AT.lng }]))).toBeCloseTo(
      MAP_FOCUS.MIN_SPAN_DEG * 2,
      9,
    );
  });

  // NOTHING CLOSE IS NOT THE SAME AS NOTHING (owner, session 169). The cluster guard below
  // must not turn "every neighbour is far" into a tight frame on empty ground: when they
  // are all far they are all in the same (far) cluster, so the reach and the ceiling behave
  // exactly as they always did.
  it('keeps the wide frame when every neighbour is far, cluster guard or not', () => {
    const far = [
      { lat: AT.lat + 0.2, lng: AT.lng },
      { lat: AT.lat + 0.25, lng: AT.lng },
      { lat: AT.lat + 0.3, lng: AT.lng },
    ];
    expect(span(focusBoundsFor(AT, far))).toBeCloseTo(MAP_FOCUS.MAX_SPAN_DEG * 2, 9);
  });

  // A pin at the SAME coordinates is not a neighbour: it says nothing about what is
  // around the place, so it falls through to the standalone default rather than
  // collapsing the frame onto itself.
  it('treats a coincident pin as no neighbour at all', () => {
    expect(span(focusBoundsFor(AT, [{ ...AT }]))).toBeCloseTo(span(focusBoundsFor(AT, [])), 9);
  });

  it('falls back to the default span when the place stands alone', () => {
    expect(span(focusBoundsFor(AT, []))).toBeCloseTo(
      Math.min(MAP_FOCUS.DEFAULT_SPAN_DEG * MAP_FOCUS.NEIGHBOUR_HEADROOM, MAP_FOCUS.MAX_SPAN_DEG) *
        2,
      9,
    );
  });

  // A cluster is framed as a cluster: the furthest of the near ones sets the reach, so
  // pins down one street all land inside the frame rather than just the closest — **as long
  // as they really are one cluster.** The qualifier is session 169's: neighbours within
  // `CLUSTER_FACTOR` of the nearest are together, and one much further away is not.
  it('frames the whole near cluster, not just its closest member', () => {
    const cluster = [
      { lat: AT.lat + 0.003, lng: AT.lng },
      { lat: AT.lat + 0.005, lng: AT.lng },
      { lat: AT.lat + 0.008, lng: AT.lng },
    ];
    const b = focusBoundsFor(AT, cluster);
    for (const p of cluster) {
      expect(p.lat).toBeLessThanOrEqual(b.north);
      expect(p.lat).toBeGreaterThanOrEqual(b.south);
    }
  });

  // _"Zoom more when the selected is very close to other results"_ (owner, session 169).
  // The furthest of the nearest three used to set the reach unconditionally, so one distant
  // pin dragged the frame out even when another was right next door — and the close one you
  // wanted to see sat in the middle of a frame sized for the far one.
  it('a distant outlier does not widen a frame that has a close neighbour', () => {
    const close = { lat: AT.lat + 0.002, lng: AT.lng };
    const outlier = { lat: AT.lat + 0.02, lng: AT.lng };
    expect(span(focusBoundsFor(AT, [close, outlier]))).toBeCloseTo(
      span(focusBoundsFor(AT, [close])),
      9,
    );
    // …and it is genuinely tighter than the old behaviour, which framed for the outlier.
    expect(span(focusBoundsFor(AT, [close, outlier]))).toBeLessThan(
      span(focusBoundsFor(AT, [outlier])),
    );
  });

  // Longitude degrees shrink toward the poles, so the same ground needs a wider box.
  it('widens the longitude span with latitude, so the frame covers equal ground', () => {
    const equator = focusBoundsFor({ lat: 0, lng: 0 }, []);
    const north = focusBoundsFor({ lat: 60, lng: 0 }, []);
    expect(north.east - north.west).toBeGreaterThan(equator.east - equator.west);
  });
});

// The interpolation, as a pure function of progress (ADR-0129 §3).
describe('one frame of a camera move (ADR-0129 §3)', () => {
  const A = { center: { lat: 0, lng: 0 }, zoom: 4 };
  const B = { center: { lat: 10, lng: 20 }, zoom: 14 };

  it('starts at the start and ends exactly on the target', () => {
    expect(cameraFrame(A, B, 0)).toEqual(A);
    expect(cameraFrame(A, B, 1)).toEqual(B);
    expect(cameraFrame(A, B, 2)).toEqual(B);
  });

  it('moves monotonically, and is past nothing at the halfway point', () => {
    const half = cameraFrame(A, B, 0.5);
    expect(half.zoom).toBeGreaterThan(A.zoom);
    expect(half.zoom).toBeLessThan(B.zoom);
    expect(cameraFrame(A, B, 0.25).zoom).toBeLessThan(half.zoom);
    expect(cameraFrame(A, B, 0.75).zoom).toBeGreaterThan(half.zoom);
  });

  // The one place this cares about the antimeridian where `boundsOfPoints` deliberately
  // does not: a fit nobody notices until a trip spans ±180°, but a VISIBLE sweep the
  // long way round the world is exactly what this function exists to avoid.
  it('crosses the antimeridian the short way, not across the whole world', () => {
    const from = { center: { lat: 0, lng: 170 }, zoom: 6 };
    const to = { center: { lat: 0, lng: -170 }, zoom: 6 };
    const mid = cameraFrame(from, to, 0.5);
    expect(Math.abs(mid.center.lng)).toBeGreaterThan(175);
  });
});

// ADR-0168 §1. ADR-0131 §5 kept the query out of the camera because "a chip is one discrete
// act where a query is a stream", and the report is what that cost: at the map extreme a
// result outside the view produced no sign that anything had been found at all. The stream is
// keystrokes; a SETTLED response is discrete, so this is a narrow reversal of the rule and not
// a general one.
describe('the camera answers a settled result set (ADR-0168 §1)', () => {
  const MILAN = { lat: 45.464, lng: 9.19 };
  const FLORENCE = { lat: 43.773, lng: 11.256 };
  const around = (at: { lat: number; lng: number }, span: number) => ({
    north: at.lat + span,
    south: at.lat - span,
    east: at.lng + span,
    west: at.lng - span,
  });

  it('does nothing at all when there are no results', () => {
    expect(searchCameraTarget([], around(MILAN, 1))).toEqual({ kind: 'none' });
  });

  // THE ANTI-JITTER RULE, and the reason typing is not a headache: consecutive settled
  // queries in one neighbourhood are all already on screen, so none of them moves anything.
  it('does nothing when every result is already on the canvas', () => {
    expect(searchCameraTarget([MILAN], around(MILAN, 0.5))).toEqual({ kind: 'none' });
    expect(searchCameraTarget([MILAN, FLORENCE], around(MILAN, 5))).toEqual({ kind: 'none' });
  });

  // Deliberately NOT `boundsFillView`. A dwarfed set re-fits for a FILTER (ADR-0121 §7) —
  // a deliberate act on a set you are curating — where a query being small in the frame is
  // no reason to zoom in on it.
  it('does not zoom in on a set that is merely small in the view', () => {
    const view = around(MILAN, 5);
    expect(searchCameraTarget([MILAN, { lat: 45.47, lng: 9.2 }], view)).toEqual({ kind: 'none' });
  });

  // The owner's "pan to the results if they're in a relatively small zone".
  it('pans, keeping the zoom, when an off-screen set fits at the zoom you are on', () => {
    // The camera is on Milan; the answer is Florence, two hours away and off the canvas.
    const target = searchCameraTarget([FLORENCE], around(MILAN, 0.3));
    expect(target.kind).toBe('pan');
    if (target.kind !== 'pan') return;
    expect(target.at.lat).toBeCloseTo(FLORENCE.lat, 5);
    expect(target.at.lng).toBeCloseTo(FLORENCE.lng, 5);
  });

  it('centres a panned set between its members, not on the first one', () => {
    const target = searchCameraTarget([MILAN, { lat: 45.664, lng: 9.39 }], around(FLORENCE, 0.4));
    expect(target.kind).toBe('pan');
    if (target.kind !== 'pan') return;
    expect(target.at.lat).toBeCloseTo(45.564, 3);
  });

  // The owner's "when the results are too spread out maybe we should zoom out and pan".
  it('widens to the whole set when it is bigger than the view but still one area', () => {
    const target = searchCameraTarget([MILAN, { lat: 45.9, lng: 9.6 }], around(MILAN, 0.1));
    expect(target).toEqual({
      kind: 'fit',
      bounds: boundsOfPoints([MILAN, { lat: 45.9, lng: 9.6 }]),
    });
  });

  // …and the limit of that, which is what stops `דואומו` from answering with a country.
  // Milan · Florence · Siena · Pisa span most of Italy: fitting them all is four specks.
  it('frames the top-ranked result among its own cluster when the set is too scattered', () => {
    const scattered = [MILAN, FLORENCE, { lat: 43.318, lng: 11.331 }, { lat: 43.723, lng: 10.396 }];
    const target = searchCameraTarget(scattered, around(MILAN, 0.05));
    expect(target).toEqual({ kind: 'fit', bounds: focusBoundsFor(MILAN, scattered) });
    if (target.kind !== 'fit') return;
    // A frame around ONE place, not around Italy — which is the whole point of the branch.
    expect(target.bounds.north - target.bounds.south).toBeLessThan(
      MAP_SEARCH_CAMERA.SPREAD_CAP_DEG,
    );
  });

  it('frames the set outright when there is no view yet — nothing to preserve', () => {
    expect(searchCameraTarget([MILAN, FLORENCE], null)).toEqual({
      kind: 'fit',
      bounds: boundsOfPoints([MILAN, FLORENCE]),
    });
  });

  // A set straddling the antimeridian never reaches the PAN branch, and that is structural
  // rather than lucky: `boundsOfPoints` compares longitudes plainly (ADR-0121 §14), so its
  // extent spans ~358° and cannot be 0.8 of any view. The scatter cap then catches it, which
  // is a better answer than either a world-wide fit or a sweep the long way round — so this
  // asserts the fall-through rather than a guard that would be unreachable code.
  it('never pans the long way round: a set straddling ±180° falls to the scatter branch', () => {
    const straddling = [
      { lat: 0, lng: 179 },
      { lat: 0, lng: -179 },
    ];
    const target = searchCameraTarget(straddling, around({ lat: 0, lng: 100 }, 1));
    expect(target).toEqual({ kind: 'fit', bounds: focusBoundsFor(straddling[0], straddling) });
    if (target.kind !== 'fit') return;
    expect(target.bounds.east - target.bounds.west).toBeLessThan(1);
  });
});
