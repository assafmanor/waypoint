// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SharePreview } from './SharePreview';

describe('SharePreview', () => {
  afterEach(cleanup);

  it('shows a link cover with its two lines and nothing to press', () => {
    const { container } = render(
      <SharePreview kind="link" src="/og/s/abc.png" title="כותרת" line="שורה" />,
    );
    expect(container.querySelector('.share-preview-thumb.is-link img')?.getAttribute('src')).toBe(
      '/og/s/abc.png',
    );
    expect(screen.getByText('כותרת')).toBeTruthy();
    expect(screen.getByText('שורה')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the card with its own send', () => {
    const { container } = render(
      <SharePreview
        kind="card"
        src="blob:card"
        title="כרטיס"
        line="שורה"
        action={<button type="button">שליחה</button>}
      />,
    );
    expect(container.querySelector('.share-preview')?.getAttribute('data-kind')).toBe('card');
    expect(container.querySelector('.share-preview-thumb.is-card')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'שליחה' })).toBeTruthy();
  });
});
