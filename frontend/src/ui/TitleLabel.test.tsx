// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TitleLabel } from './TitleLabel';
import { ROUTE_TITLE_ARROW, routeTitle } from '../lib/route-title';

describe('TitleLabel', () => {
  afterEach(() => cleanup());

  it('renders a stored route title as a shortened route with the SVG arrow', () => {
    const stored = routeTitle('נמל התעופה בן גוריון', 'נמל התעופה הבינלאומי קפלאוויק');
    const { container } = render(<TitleLabel title={stored} />);
    const row = container.querySelector('.route')!;
    expect([...row.querySelectorAll('bdi')].map((n) => n.textContent)).toEqual([
      'בן גוריון',
      'קפלאוויק',
    ]);
    // No full official name, and no text arrow — the same reading as every other
    // route surface (ADR-0059 §3 session-101 amendment).
    expect(row.querySelector('.arr svg')).not.toBeNull();
    expect(container.textContent).not.toContain('נמל התעופה');
    expect(container.textContent).not.toContain(ROUTE_TITLE_ARROW);
  });

  it('leaves a hand-typed title exactly as it is', () => {
    const { container } = render(<TitleLabel title="ארוחת ערב" />);
    expect(container.textContent).toBe('ארוחת ערב');
    expect(container.querySelector('.route')).toBeNull();
  });
});
