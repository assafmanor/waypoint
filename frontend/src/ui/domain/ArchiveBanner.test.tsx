// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ArchiveBanner } from './ArchiveBanner';

describe('ArchiveBanner', () => {
  afterEach(() => cleanup());

  it('is the paper banner with its control, as a past day wears it', () => {
    const { container } = render(
      <ArchiveBanner label="קריאה" action={<button className="ab-back">חזרה</button>} />,
    );
    const banner = container.querySelector('.archive-banner')!;
    expect(banner.classList.contains('is-memory')).toBe(false);
    expect(banner.querySelector('.ab-main')!.textContent).toBe('קריאה');
    expect(banner.querySelector('.ab-back')).not.toBeNull();
  });

  it('wears the archive tone and no control on a finished trip', () => {
    const { container } = render(<ArchiveBanner label="קריאה" memory />);
    const banner = container.querySelector('.archive-banner')!;
    expect(banner.classList.contains('is-memory')).toBe(true);
    expect(banner.querySelector('button')).toBeNull();
  });
});
