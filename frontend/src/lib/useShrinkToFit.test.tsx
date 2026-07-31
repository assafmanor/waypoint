// @vitest-environment jsdom
//
// jsdom has no layout engine, so the hook's two measurements are faked: a text
// width proportional to the font-size the hook just set, and a fixed box. That is
// enough to drive the real loop, and it is the only way to pin the finding this
// hook was fixed for (ADR-0149 §9) — the overflow below is **1.8px**, which
// `scrollWidth`/`clientWidth` would round away into "fits" while the browser drew
// an ellipsis.
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useShrinkToFit } from './useShrinkToFit';

// jsdom ships no ResizeObserver, and the hook installs one to re-fit when the
// avatar cluster resizes. Nothing here resizes, so an inert stand-in is enough.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const BOX_WIDTH = 93;

/** Fakes layout: the box is `BOX_WIDTH` wide, and the text is `perPx` wide for
 *  every px of font-size. Returns a restore function. */
function fakeLayout(perPx: number) {
  const realRange = Range.prototype.getBoundingClientRect;
  const realElement = Element.prototype.getBoundingClientRect;
  const rect = (width: number) => ({ width, height: 0, top: 0, left: 0 }) as DOMRect;

  Element.prototype.getBoundingClientRect = function () {
    return rect(BOX_WIDTH);
  };
  Range.prototype.getBoundingClientRect = function () {
    const el = this.startContainer as HTMLElement;
    return rect(Number.parseFloat(el.style.fontSize || '0') * perPx);
  };
  return () => {
    Range.prototype.getBoundingClientRect = realRange;
    Element.prototype.getBoundingClientRect = realElement;
  };
}

function Probe({ maxPx, minPx }: { maxPx: number; minPx: number }) {
  const { targetRef, containerRef } = useShrinkToFit<HTMLSpanElement, HTMLDivElement>('שם הטיול', {
    maxPx,
    minPx,
  });
  return (
    <div ref={containerRef}>
      <span ref={targetRef} data-testid="name">
        שם הטיול
      </span>
    </div>
  );
}

describe('useShrinkToFit', () => {
  afterEach(() => cleanup());

  it('steps down on an overflow too small to survive rounding', () => {
    // 5.61px of text per px of font-size: at 17px that is 95.37 — 1.8px past the
    // 93.57 box, i.e. exactly the 94-vs-93 read that used to pass as "fits".
    const restore = fakeLayout(5.61);
    try {
      const { getByTestId } = render(<Probe maxPx={17} minPx={13} />);
      expect(getByTestId('name').style.fontSize).toBe('16px');
    } finally {
      restore();
    }
  });

  it('leaves text that fits at the starting size', () => {
    const restore = fakeLayout(5);
    try {
      const { getByTestId } = render(<Probe maxPx={17} minPx={13} />);
      expect(getByTestId('name').style.fontSize).toBe('17px');
    } finally {
      restore();
    }
  });

  it('does not shrink for slack under half a pixel', () => {
    // 93.3px against a 93px box: measured sub-pixel, so it IS wider — and stepping
    // down a whole size for 0.3px is the regression FIT_SLACK_PX exists to prevent.
    const restore = fakeLayout(93.3 / 17);
    try {
      const { getByTestId } = render(<Probe maxPx={17} minPx={13} />);
      expect(getByTestId('name').style.fontSize).toBe('17px');
    } finally {
      restore();
    }
  });

  it('stops at the floor rather than shrinking without end', () => {
    const restore = fakeLayout(20);
    try {
      const { getByTestId } = render(<Probe maxPx={17} minPx={13} />);
      expect(getByTestId('name').style.fontSize).toBe('13px');
    } finally {
      restore();
    }
  });
});
