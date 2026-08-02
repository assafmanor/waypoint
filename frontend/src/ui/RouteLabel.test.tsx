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

  // ADR-0154 §4. The mark must not be a mirrored `NavArrow`: that one flips per locale
  // because it CLAIMS a direction, and a round trip claims none.
  it('marks a round trip with the symmetric glyph, not the directional arrow', () => {
    const { container } = render(<RouteLabel from="תל אביב" to="טוקיו" roundTrip />);
    const arr = container.querySelector('.arr')!;
    expect(arr.classList.contains('arr-both')).toBe(true);
    expect(arr.querySelector('.nav-arrow')).toBeNull();
    expect(arr.querySelector('svg.icon')).not.toBeNull();
    // Still one endpoint each side, still no text glyph between them.
    expect(container.textContent).toBe('תל אביבטוקיו');
  });

  it('keeps the directional arrow for a one-way route', () => {
    const { container } = render(<RouteLabel from="תל אביב" to="טוקיו" />);
    expect(container.querySelector('.arr-both')).toBeNull();
    expect(container.querySelector('.arr .nav-arrow')).not.toBeNull();
  });
});
