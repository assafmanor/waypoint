// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RouteLabel } from './RouteLabel';

const TLV = 'נמל התעופה בן גוריון';
const KEF = 'נמל התעופה הבינלאומי קפלאוויק';

/** jsdom reports every layout width as 0, so the overflow switch never triggers
 *  on its own. Stub the two widths `useStackOnOverflow` measures: the row's
 *  natural (nowrap) width and the space it actually has. */
function stubWidths({ natural, available }: { natural: number; available: number }) {
  const scrollWidth = vi
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockReturnValue(natural);
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(available);
  return () => {
    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  };
}

describe('RouteLabel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the inline row by default — surfaces that already fit are untouched', () => {
    const { container } = render(<RouteLabel from="תל אביב" to="טוקיו" />);
    expect(container.querySelector('.route')).not.toBeNull();
    expect(container.querySelector('.route-fit')).toBeNull();
    expect(container.querySelector('.route-stack')).toBeNull();
  });

  it('stays inline with `stack` while the route fits', () => {
    const restore = stubWidths({ natural: 200, available: 200 });
    const { container } = render(<RouteLabel from="תל אביב" to="טוקיו" stack />);
    expect(container.querySelector('.route')).not.toBeNull();
    expect(container.querySelector('.route-stack')).toBeNull();
    restore();
  });

  it('switches to the stacked rail when the inline row overflows', () => {
    const restore = stubWidths({ natural: 600, available: 220 });
    const { container } = render(<RouteLabel from={TLV} to={KEF} stack />);

    const stack = container.querySelector('.route-stack');
    expect(stack).not.toBeNull();
    expect(container.querySelector('.route')).toBeNull();

    // Each endpoint is its own value (so each clamps independently and the origin
    // can never push the destination out), origin first.
    const values = [...stack!.querySelectorAll('.rs-val')].map((n) => n.textContent);
    expect(values).toEqual([TLV, KEF]);
    // Both names stay bidi-isolated for mixed Hebrew/Latin routes.
    expect(stack!.querySelectorAll('bdi').length).toBe(2);
    restore();
  });

  it('draws the rail from SVG markers — no text glyphs, emoji, or CSS shapes', () => {
    const restore = stubWidths({ natural: 600, available: 220 });
    const { container } = render(<RouteLabel from={TLV} to={KEF} stack />);

    // An origin dot, a connector, and a destination arrowhead, all <svg>.
    expect(container.querySelectorAll('.route-stack svg').length).toBe(3);
    // The rail carries no arrow/bullet characters of its own — only the names.
    const text = container.querySelector('.route-stack')!.textContent!;
    expect(text).toBe(`${TLV}${KEF}`);
    restore();
  });

  it('re-measures when the route changes, so a shorter one returns to inline', () => {
    const long = stubWidths({ natural: 600, available: 220 });
    const { container, rerender } = render(<RouteLabel from={TLV} to={KEF} stack />);
    expect(container.querySelector('.route-stack')).not.toBeNull();
    long();

    // A different, shorter route: the overflow latch resets with the content.
    const short = stubWidths({ natural: 180, available: 220 });
    rerender(<RouteLabel from="תל אביב" to="טוקיו" stack />);
    expect(container.querySelector('.route-stack')).toBeNull();
    expect(container.querySelector('.route')).not.toBeNull();
    short();
  });

  it('falls back to a plain dash for an endpoint that is not picked yet', () => {
    const { container } = render(<RouteLabel from="תל אביב" />);
    expect(container.textContent).toContain('-');
  });
});
