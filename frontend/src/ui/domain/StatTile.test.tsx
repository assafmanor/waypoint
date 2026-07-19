// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  afterEach(() => cleanup());

  it('renders the value (mono, dir=ltr) and the label', () => {
    const { container } = render(<StatTile value={7} label="ימים" />);
    const v = container.querySelector('.wp-stattile-v');
    expect(v?.textContent).toBe('7');
    // Numeric value is an LTR island (design-language typography).
    expect(v?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('ימים')).toBeTruthy();
  });
});
