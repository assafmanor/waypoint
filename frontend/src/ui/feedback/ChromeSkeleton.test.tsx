// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ChromeSkeleton } from './ChromeSkeleton';
import { DEFAULT_TRIP_ICON } from '../../constants';

describe('ChromeSkeleton', () => {
  afterEach(() => cleanup());

  it('is decorative and mode-themed via data-mode, mirroring the real Header', () => {
    const { container } = render(<ChromeSkeleton mode="plan" />);
    const header = container.querySelector('header.header.mode-chrome');
    expect(header?.getAttribute('data-mode')).toBe('plan');
    expect(header?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the real trip name + icon immediately when known, no shimmer needed for it', () => {
    const { container, getByText } = render(
      <ChromeSkeleton mode="trip" trip={{ name: 'יפן 26', icon: '🇯🇵' }} />,
    );
    expect(getByText('יפן 26')).toBeTruthy();
    expect(container.querySelector('.trip-name.fb-skel')).toBeNull();
  });

  it('falls back to a placeholder name + the default trip icon when the trip is not yet known', () => {
    const { container } = render(<ChromeSkeleton mode="trip" />);
    expect(container.querySelector('.trip-icon')?.textContent).toBe(DEFAULT_TRIP_ICON);
    expect(container.querySelector('.trip-name')).toBeNull();
    expect(container.querySelector('.fb-skel-line')).toBeTruthy();
  });
});
