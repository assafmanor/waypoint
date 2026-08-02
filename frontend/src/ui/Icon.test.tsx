// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Icon } from './Icon';

describe('Icon', () => {
  afterEach(() => cleanup());

  it('renders the settings glyph as an svg with a path', () => {
    const { container } = render(<Icon name="settings" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')).not.toBeNull();
  });

  // ADR-0154 §4: the round-trip mark is SYMMETRIC on purpose, which is the whole reason
  // it is a registry icon rather than a second `NavArrow` variant — that component mirrors
  // per locale, and a shape that is its own mirror image cannot be flipped wrong. Asserted
  // as geometry rather than as a substring, so re-drawing the glyph asymmetrically fails.
  it('draws the round-trip mark symmetrically, so no locale can flip it', () => {
    const d = render(<Icon name="roundTrip" />)
      .container.querySelector('svg path')
      ?.getAttribute('d');
    expect(d).toBeTruthy();
    // All-absolute coordinate PAIRS, so every other number is an x. Guarded, because a
    // single-coordinate command (`H`/`V`) would break that parity and quietly compare the
    // wrong axis — which an earlier draft of this test did, passing on an asymmetric path.
    const nums = d!.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.length % 2).toBe(0);
    const xs = nums.filter((_, i) => i % 2 === 0).sort((a, b) => a - b);
    // Reflecting about the 24-wide viewBox's centre must give back the same x's.
    const mirrored = xs.map((x) => 24 - x).sort((a, b) => a - b);
    expect(mirrored).toEqual(xs);
  });

  // The question that produced this test: is the leave/remove mark inverted in Hebrew?
  // It is not — it is authored MIRRORED from the LTR log-out convention (Icon.tsx), door on
  // the trailing side and the arrow leading away leftward, which is forward in RTL. Pinned
  // as geometry so a later pass cannot "un-invert" it back into the LTR original.
  it('authors the exit mark for RTL — door trailing, arrow leading away', () => {
    const d = render(<Icon name="exit" />)
      .container.querySelector('svg path')!
      .getAttribute('d')!;
    const [door, arrowhead] = d.trim().split(/\s+(?=M)/);
    const [x1, , tipX, , x3] = arrowhead
      .replace('M', '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    expect(tipX).toBeLessThan(Math.min(x1, x3)); // a tip pointing left, not a tail
    expect(Number(door.match(/^M([\d.]+)/)![1])).toBeGreaterThan(tipX); // the door is behind it
  });

  // ADR-0138's fourth amendment: `exit` means "I leave" and cannot also mean "remove them".
  it('draws remove-a-member as its own mark, not the leave door', () => {
    const exit = render(<Icon name="exit" />).container.querySelector('svg path');
    cleanup();
    const remove = render(<Icon name="userMinus" />).container.querySelector('svg path');
    expect(remove?.getAttribute('d')).not.toBe(exit?.getAttribute('d'));
  });

  it('renders the search and close glyphs (Index search control, ADR-0098)', () => {
    const search = render(<Icon name="search" />).container.querySelector('svg path');
    cleanup();
    const close = render(<Icon name="close" />).container.querySelector('svg path');
    expect(search).not.toBeNull();
    expect(close).not.toBeNull();
    expect(search?.getAttribute('d')).not.toBe(close?.getAttribute('d'));
  });
});
