// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HomeSkeleton } from './HomeSkeleton';

describe('HomeSkeleton', () => {
  afterEach(() => cleanup());

  it('is fully decorative', () => {
    const { container } = render(<HomeSkeleton mode="trip" />);
    expect(container.querySelector('.fb-skel-home')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('pre-draws the real board hero + quick-access tiles + glance card for trip mode', () => {
    const { container } = render(<HomeSkeleton mode="trip" />);
    expect(container.querySelector('.wp-board')).toBeTruthy();
    expect(container.querySelectorAll('.quick .qa').length).toBe(3);
    expect(container.querySelector('.glance-day')).toBeTruthy();
    expect(container.querySelector('.prep')).toBeNull();
  });

  it('pre-draws the real prep hero + checklist rows for plan mode', () => {
    const { container } = render(<HomeSkeleton mode="plan" />);
    expect(container.querySelector('.prep')).toBeTruthy();
    expect(container.querySelectorAll('.checklist .chk-row').length).toBe(3);
    expect(container.querySelector('.wp-board')).toBeNull();
  });
});
