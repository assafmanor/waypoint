// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { usePublicReaderChrome } from './public-reader-chrome';

const APP_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, viewport-fit=cover';

function Reader() {
  usePublicReaderChrome();
  return null;
}

describe('usePublicReaderChrome', () => {
  afterEach(() => {
    cleanup();
    document.head.querySelector('meta[name="viewport"]')?.remove();
    document.documentElement.removeAttribute('data-public-reader');
  });

  const meta = () => {
    const el = document.createElement('meta');
    el.name = 'viewport';
    el.content = APP_VIEWPORT;
    document.head.appendChild(el);
    return el;
  };

  it('lets the reader zoom, and hands the app its posture back on the way out', () => {
    const viewport = meta();
    const view = render(<Reader />);

    // The three suppressions ADR-0062 applies app-wide are all keyed off one of these two.
    expect(document.documentElement.hasAttribute('data-public-reader')).toBe(true);
    expect(viewport.content).not.toContain('user-scalable=no');
    expect(viewport.content).not.toContain('maximum-scale');

    // **Restored, not cleared.** This screen is a route inside the same SPA, so leaving it
    // has to give the app back exactly the string it booted with — an app left zoomable is
    // the same class of bug in the other direction.
    view.unmount();
    expect(document.documentElement.hasAttribute('data-public-reader')).toBe(false);
    expect(viewport.content).toBe(APP_VIEWPORT);
  });

  it('does not throw where there is no viewport meta at all', () => {
    expect(() => render(<Reader />).unmount()).not.toThrow();
  });
});
