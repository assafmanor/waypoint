// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BootScreen } from './BootScreen';
import { t } from '../../i18n/he';

describe('BootScreen', () => {
  afterEach(() => cleanup());

  it('announces the boot label once via a live region', () => {
    render(<BootScreen />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe(t.shell.booting);
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the boot label visibly too, hidden from the a11y tree so it is not announced twice', () => {
    const { container } = render(<BootScreen />);
    const label = container.querySelector('.fb-boot-label');
    expect(label?.textContent).toBe(t.shell.booting);
    expect(label?.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides the decorative clock, dots, and departure-line from the a11y tree', () => {
    const { container } = render(<BootScreen />);
    expect(container.querySelector('.fb-boot-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.fb-boot-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a mono, LTR-wrapped clock reading the current time', () => {
    const { container } = render(<BootScreen />);
    const clock = container.querySelector('.fb-boot-clock');
    expect(clock?.getAttribute('dir')).toBe('ltr');
    expect(clock?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
  });
});
