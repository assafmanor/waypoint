// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  afterEach(() => cleanup());

  it('renders the value (mono, dir=auto) and the label', () => {
    const { container } = render(<StatTile value={7} label="ימים" />);
    const v = container.querySelector('.wp-stattile-v');
    expect(v?.textContent).toBe('7');
    // Numeric value is a direction-sniffing island: LTR for a number, and RTL if a
    // Hebrew value ever lands here (ADR-0118).
    expect(v?.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('ימים')).toBeTruthy();
  });
});
