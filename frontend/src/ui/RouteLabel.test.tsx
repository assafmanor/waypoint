// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RouteLabel } from './RouteLabel';

describe('RouteLabel', () => {
  afterEach(() => cleanup());

  it('renders origin → destination with the shared SVG arrow, never a text glyph', () => {
    const { container } = render(<RouteLabel from="בן גוריון" to="קפלאוויק" />);
    const row = container.querySelector('.route')!;
    // Each endpoint is bidi-isolated, so Hebrew/Latin/mixed names keep their own
    // direction inside the RTL row.
    expect([...row.querySelectorAll('bdi')].map((n) => n.textContent)).toEqual([
      'בן גוריון',
      'קפלאוויק',
    ]);
    // The arrow is an <svg> (NavArrow), and the row's text carries no arrow glyph.
    expect(row.querySelector('.arr svg')).not.toBeNull();
    expect(row.textContent).toBe('בן גוריוןקפלאוויק');
  });

  it('falls back to a plain dash for an endpoint that is not picked yet', () => {
    const { container } = render(<RouteLabel from="בן גוריון" />);
    expect(container.textContent).toContain('-');
  });
});
