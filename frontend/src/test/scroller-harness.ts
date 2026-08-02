// A scroller jsdom can see, for the `useCenterSelected` surfaces.
//
// jsdom has no layout engine: every rect is zero, `scrollWidth`/`clientWidth` are zero, and
// `Element.prototype.scrollBy` doesn't exist — so the centring effect finds no scroller and
// no test can see whether it aimed correctly. This fakes exactly the four things it reads
// (the overflow, the two sizes, the two rects) and records the scroll it asks for.
//
// Not a general geometry harness: it fakes a ONE-DIMENSIONAL row/list of equal-sized items,
// which is what every caller of the hook actually is.

export interface FakeScroller {
  /** The `{ left | top, behavior }` arguments the effect passed, in order. */
  calls: { left?: number; top?: number; behavior?: string }[];
  /** The last delta asked for on the axis, or `undefined` if nothing scrolled. */
  lastDelta: () => number | undefined;
}

/** Make `scroller` a scrollable box of `viewport` px on `axis`, holding `items` laid out end
 *  to end at `itemSize` px each starting at the scroller's own leading edge. Pass enough
 *  items to overflow `viewport` — a box whose content fits has no scroller to find, which is
 *  a real state (a chip row of three) but not a centring one. */
export function fakeScroller(
  scroller: HTMLElement,
  items: HTMLElement[],
  {
    axis = 'inline',
    viewport = 300,
    itemSize = 100,
  }: {
    axis?: 'inline' | 'block';
    viewport?: number;
    itemSize?: number;
  } = {},
): FakeScroller {
  const horizontal = axis === 'inline';
  const content = items.length * itemSize;

  scroller.style.setProperty(horizontal ? 'overflow-x' : 'overflow-y', 'auto');
  define(scroller, horizontal ? 'scrollWidth' : 'scrollHeight', content);
  define(scroller, horizontal ? 'clientWidth' : 'clientHeight', viewport);
  scroller.getBoundingClientRect = () => rect(0, viewport, horizontal);

  // Scrolled to 0: item i starts at i * itemSize. The effect only ever reads the CURRENT
  // rects, so a fixed pre-scroll origin is the whole geometry it needs.
  items.forEach((el, i) => {
    el.getBoundingClientRect = () => rect(i * itemSize, itemSize, horizontal);
  });

  const calls: FakeScroller['calls'] = [];
  scroller.scrollBy = (opts?: ScrollToOptions | number) => {
    if (typeof opts === 'object' && opts) calls.push({ ...opts });
  };

  return {
    calls,
    lastDelta: () => {
      const last = calls[calls.length - 1];
      return last && (horizontal ? last.left : last.top);
    },
  };
}

function rect(start: number, size: number, horizontal: boolean): DOMRect {
  const [left, width, top, height] = horizontal ? [start, size, 0, 0] : [0, 0, start, size];
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function define(el: HTMLElement, prop: string, value: number) {
  Object.defineProperty(el, prop, { configurable: true, value });
}
