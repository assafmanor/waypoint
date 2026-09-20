// @vitest-environment jsdom
// The probe itself. Small, and worth having because both of its answers are load-bearing:
// a `true` puts a control on screen and reroutes a tap, and a `false` must be the answer a
// surface with no layout gets — every caller renders inside jsdom somewhere.
import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { useIsClipped } from './useIsClipped';

function Probe({ h }: { h?: { scroll: number; client: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const clipped = useIsClipped(ref, []);
  return (
    <div
      ref={(el) => {
        if (el && h) {
          Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => h.scroll });
          Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h.client });
        }
        ref.current = el;
      }}
      data-testid="box"
      data-clipped={clipped}
    />
  );
}

describe('useIsClipped', () => {
  afterEach(cleanup);
  const clipped = () => screen.getByTestId('box').dataset.clipped;

  it('says yes when the box hides some of its content', () => {
    render(<Probe h={{ scroll: 400, client: 120 }} />);
    expect(clipped()).toBe('true');
  });

  it('says no when everything fits', () => {
    render(<Probe h={{ scroll: 120, client: 120 }} />);
    expect(clipped()).toBe('false');
  });

  // **The `+ 1` is not superstition.** A fractional line height makes `scrollHeight` exceed
  // `clientHeight` by a sub-pixel on a box that clips nothing; without the slack every note
  // in the app would carry a control that reveals one rounding error.
  it('ignores a sub-pixel overhang', () => {
    render(<Probe h={{ scroll: 120.4, client: 120 }} />);
    expect(clipped()).toBe('false');
  });

  // The honest answer where there is no layout at all, which is what every component test in
  // this repo sees — and therefore why the clipped BEHAVIOUR is proven by stubbing the box
  // rather than by seeding long text.
  it('answers no in a document with no layout', () => {
    render(<Probe />);
    expect(clipped()).toBe('false');
  });
});
