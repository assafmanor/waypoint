// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { FLIP_KEY_ATTR, useFlipRows } from './useFlipRows';
import { LIST_MOVE_MS } from '../constants';

// jsdom has no layout, so the rows' positions are supplied per key and the
// container sits at 0 — which is all the hook reads.
const tops = new Map<string, number>();
const animate = vi.fn();
const realRect = Element.prototype.getBoundingClientRect;

function List({ keys }: { keys: string[] }) {
  const container = useRef<HTMLDivElement>(null);
  useFlipRows(container, keys.join(','));
  return (
    <div ref={container}>
      {keys.map((key) => (
        <div key={key} {...{ [FLIP_KEY_ATTR]: key }} />
      ))}
    </div>
  );
}

const moves = () => animate.mock.calls.map((c) => (c[0] as Keyframe[])[0].transform);

describe('useFlipRows (ADR-0120 session-130 — a re-order is animated too)', () => {
  beforeEach(() => {
    tops.clear();
    animate.mockClear();
    Element.prototype.animate = animate as unknown as Element['animate'];
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const key = this.getAttribute(FLIP_KEY_ATTR);
      return { top: key ? (tops.get(key) ?? 0) : 0 } as DOMRect;
    };
  });
  afterEach(() => {
    cleanup();
    Element.prototype.getBoundingClientRect = realRect;
  });

  it('plays each moved row from where it was, and leaves the still ones alone', () => {
    tops.set('a', 0).set('b', 50).set('c', 100);
    const { rerender } = render(<List keys={['a', 'b', 'c']} />);
    expect(animate).not.toHaveBeenCalled(); // first render: nothing to move from

    // A re-sort: c to the top, a and b down one place. c's row is where a's was.
    tops.set('c', 0).set('a', 50).set('b', 100);
    rerender(<List keys={['c', 'a', 'b']} />);
    expect(moves()).toEqual(['translateY(100px)', 'translateY(-50px)', 'translateY(-50px)']);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: LIST_MOVE_MS });
  });

  it('does not animate a row that is arriving — the reveal owns that', () => {
    tops.set('a', 0);
    const { rerender } = render(<List keys={['a']} />);
    tops.set('a', 0).set('b', 50);
    rerender(<List keys={['a', 'b']} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('measures nothing when the list did not change', () => {
    tops.set('a', 0).set('b', 50);
    const { rerender } = render(<List keys={['a', 'b']} />);
    // Same signature — a clock-tick re-render must not cost a layout read.
    tops.set('a', 999).set('b', 999);
    rerender(<List keys={['a', 'b']} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('honours prefers-reduced-motion, and still tracks positions for the next change', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMedia);
    tops.set('a', 0).set('b', 50);
    const { rerender } = render(<List keys={['a', 'b']} />);
    tops.set('a', 50).set('b', 0);
    rerender(<List keys={['b', 'a']} />);
    expect(animate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
