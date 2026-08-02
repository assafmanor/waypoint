// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, act } from '@testing-library/react';
import { useRef } from 'react';
import { useCenterSelected, type CenterAxis } from './useCenterSelected';
import { fakeScroller, type FakeScroller } from '../test/scroller-harness';

// Five 100px items in a 300px viewport, scrolled to 0: `a` spans 0–100, `b` 100–200, `c`
// 200–300, and two more past the edge so the row actually overflows. The viewport centre is
// 150, so centring `a` asks for −100, `b` for 0 (already centred) and `c` for +100 — which is
// what every assertion below reads.
const ITEMS = ['a', 'b', 'c', 'd', 'e'];

interface StripProps {
  selected: string | null;
  axis?: CenterAxis;
  active?: boolean;
  /** Omitted: no harness, so no ancestor scrolls (a row whose chips all fit). */
  onScroller?: (s: FakeScroller) => void;
}

function Strip({ selected, axis, active, onScroller }: StripProps) {
  const ref = useCenterSelected<HTMLButtonElement>(selected, { axis, active });
  // Once per element: re-running the harness on every render would hand the effect a fresh
  // `calls` array and hide the second scroll.
  const built = useRef(false);
  return (
    <div
      ref={(el) => {
        if (!el || !onScroller || built.current) return;
        built.current = true;
        onScroller(
          fakeScroller(el, Array.from(el.querySelectorAll<HTMLElement>('button')), { axis }),
        );
      }}
    >
      {ITEMS.map((v) => (
        <button key={v} ref={v === selected ? ref : undefined} type="button">
          {v}
        </button>
      ))}
    </div>
  );
}

function mount(props: StripProps) {
  let scroller!: FakeScroller;
  const onScroller = (s: FakeScroller) => (scroller = s);
  const view = render(<Strip {...props} onScroller={onScroller} />);
  return {
    scroller: () => scroller,
    update: (next: Partial<StripProps>) =>
      act(() => {
        view.rerender(<Strip {...props} {...next} onScroller={onScroller} />);
      }),
  };
}

afterEach(cleanup);

describe('useCenterSelected', () => {
  it('centres the selected item in its scroller on mount', () => {
    expect(mount({ selected: 'c' }).scroller().lastDelta()).toBe(100);
  });

  it('does not animate the arrival, but does animate a change', () => {
    const { scroller, update } = mount({ selected: 'c' });
    expect(scroller().calls).toEqual([{ left: 100, behavior: 'auto' }]);

    update({ selected: 'a' });
    expect(scroller().calls[1]).toEqual({ left: -100, behavior: 'smooth' });
  });

  it('skips a selection already centred rather than cancelling a live scroll', () => {
    expect(mount({ selected: 'b' }).scroller().calls).toHaveLength(0);
  });

  // The latch is on the first scroll it WOULD animate, not the first one it performs — else
  // a strip that opens already centred animates the arrival of its next change.
  it('counts an already-centred arrival as the arrival', () => {
    const { scroller, update } = mount({ selected: 'b' });
    update({ selected: 'c' });
    expect(scroller().calls[0].behavior).toBe('smooth');
  });

  it('does nothing while inactive, and re-arrives instantly when it comes back', () => {
    const { scroller, update } = mount({ selected: 'c', active: false });
    expect(scroller().calls).toHaveLength(0);

    // A reopened picker must not animate a scroll to where it was already looking.
    update({ active: true });
    expect(scroller().calls).toEqual([{ left: 100, behavior: 'auto' }]);
  });

  it('centres on the block axis for a vertical list', () => {
    const { scroller } = mount({ selected: 'c', axis: 'block' });
    expect(scroller().calls).toEqual([{ top: 100, behavior: 'auto' }]);
  });

  it('is silent with nothing selected, and with no scrolling ancestor', () => {
    expect(mount({ selected: null }).scroller().calls).toHaveLength(0);
    expect(() => render(<Strip selected="c" />)).not.toThrow();
  });

  it('walks past a non-scrolling group to the scroller that owns the scroll', () => {
    // The Map's shape: `.map-facetstrip` scrolls, and the `.choice-grid.pills` inside it is
    // `overflow: visible` on purpose (two nested scrollers fight).
    let outer!: FakeScroller;
    function Nested() {
      const ref = useCenterSelected<HTMLButtonElement>('c');
      const built = useRef(false);
      return (
        <div
          ref={(el) => {
            if (!el || built.current) return;
            built.current = true;
            outer = fakeScroller(el, Array.from(el.querySelectorAll<HTMLElement>('button')));
          }}
        >
          <div style={{ overflowX: 'visible' }}>
            {ITEMS.map((v) => (
              <button key={v} ref={v === 'c' ? ref : undefined} type="button">
                {v}
              </button>
            ))}
          </div>
        </div>
      );
    }
    render(<Nested />);
    expect(outer.lastDelta()).toBe(100);
  });
});
