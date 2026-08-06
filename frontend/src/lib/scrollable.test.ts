// @vitest-environment jsdom
//
// The shared answer to "does this actually scroll right now" (ADR-0122 §4's 2026-08-06
// amendment), extracted from `useCenterSelected` when the sheet's drag became its second caller.
//
// jsdom reports 0 for every scroll metric and no `overflow` at all, so both are stubbed — and
// that is the point rather than a limitation: the stubs ARE the scenarios, and each one is a
// state the callers genuinely have to tell apart.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollerFor, scrollerWithin, scrollsOn } from './scrollable';

/** Build `outer > middle > inner`, and say which of them overflow on which axis. */
function tree(overflowing: { el: 'outer' | 'middle' | 'inner'; axis: 'x' | 'y' }[]) {
  const outer = document.createElement('div');
  const middle = document.createElement('div');
  const inner = document.createElement('div');
  outer.className = 'outer';
  middle.className = 'middle';
  inner.className = 'inner';
  outer.append(middle);
  middle.append(inner);
  document.body.append(outer);

  const named = { outer, middle, inner };
  const overflows = (el: HTMLElement, axis: 'x' | 'y') =>
    overflowing.some((o) => named[o.el] === el && o.axis === axis);

  for (const [name, el] of Object.entries(named)) {
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => (overflows(el, 'y') ? 500 : 100),
    });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      get: () => (overflows(el, 'x') ? 500 : 100),
    });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
    void name;
  }
  return named;
}

/** Every element is `overflow: auto` on both axes unless told otherwise, so what the tests vary
 *  is whether the CONTENT overflows — which is the distinction this module exists for. */
const withOverflow = (clipped: HTMLElement[] = []) =>
  vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation(
      (el) =>
        (clipped.includes(el as HTMLElement)
          ? { overflowX: 'hidden', overflowY: 'hidden' }
          : { overflowX: 'auto', overflowY: 'auto' }) as CSSStyleDeclaration,
    );

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('scrollsOn', () => {
  // **THE WHOLE POINT OF THE MODULE.** An `overflow-y: auto` box whose content fits is a scroll
  // container the browser will never scroll — and the sheet's drag is offered on exactly that
  // state, so calling it "scrollable" would refuse the gesture it exists to enable.
  it('is false for an auto box whose content fits', () => {
    const { outer } = tree([]);
    withOverflow();
    expect(scrollsOn(outer, 'block')).toBe(false);
  });

  it('is true only when the content overflows AND the overflow value scrolls', () => {
    const { outer } = tree([{ el: 'outer', axis: 'y' }]);
    const style = withOverflow();
    expect(scrollsOn(outer, 'block')).toBe(true);
    style.mockRestore();
    withOverflow([outer]);
    // Same overflowing content, clipped instead of scrolled: nothing to pan.
    expect(scrollsOn(outer, 'block')).toBe(false);
  });

  it('reads the axis it was asked about, not the other one', () => {
    const { outer } = tree([{ el: 'outer', axis: 'x' }]);
    withOverflow();
    expect(scrollsOn(outer, 'inline')).toBe(true);
    expect(scrollsOn(outer, 'block')).toBe(false);
  });
});

describe('scrollerFor', () => {
  // Its original reason for existing: a group between the item and the scroller can be
  // `overflow: visible` and wider than it — the Map's `.map-facetstrip` owns the scroll and the
  // `.choice-grid.pills` inside it deliberately does not.
  it('walks past a non-scrolling ancestor to the one that scrolls', () => {
    const { outer, inner } = tree([{ el: 'outer', axis: 'x' }]);
    withOverflow();
    expect(scrollerFor(inner, 'inline')).toBe(outer);
  });

  it('is null when nothing above it scrolls on that axis', () => {
    const { inner } = tree([{ el: 'outer', axis: 'x' }]);
    withOverflow();
    expect(scrollerFor(inner, 'block')).toBeNull();
  });
});

describe('scrollerWithin', () => {
  // **THE BOUNDARY IS EXCLUSIVE, and that is why it is a parameter at all.** The sheet's body is
  // itself an `overflow-y: auto` box, so a walk that included it would find a scroller for every
  // press and no press would ever be claimable by the drag.
  it('ignores the boundary itself, however scrollable it is', () => {
    const { outer, inner } = tree([{ el: 'outer', axis: 'y' }]);
    withOverflow();
    expect(scrollerWithin(inner, outer, 'block')).toBe(false);
  });

  it('finds a scroller between the press and the boundary', () => {
    const { outer, inner, middle } = tree([{ el: 'middle', axis: 'y' }]);
    withOverflow();
    expect(scrollerWithin(inner, outer, 'block')).toBe(true);
    void middle;
  });

  // `from` is included: a press can land directly ON a nested scroller rather than inside one.
  it('counts the pressed element itself', () => {
    const { outer, inner } = tree([{ el: 'inner', axis: 'y' }]);
    withOverflow();
    expect(scrollerWithin(inner, outer, 'block')).toBe(true);
  });

  it('is false for an element outside the boundary rather than walking off the document', () => {
    const { outer } = tree([]);
    const stray = document.createElement('div');
    document.body.append(stray);
    withOverflow();
    expect(scrollerWithin(stray, outer, 'block')).toBe(false);
  });
});
