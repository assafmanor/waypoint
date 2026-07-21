// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Icon } from './Icon';

describe('Icon', () => {
  afterEach(() => cleanup());

  it('renders the settings glyph as an svg with a path', () => {
    const { container } = render(<Icon name="settings" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('path')).not.toBeNull();
  });

  it('renders the search and close glyphs (Index search control, ADR-0098)', () => {
    const search = render(<Icon name="search" />).container.querySelector('svg path');
    cleanup();
    const close = render(<Icon name="close" />).container.querySelector('svg path');
    expect(search).not.toBeNull();
    expect(close).not.toBeNull();
    expect(search?.getAttribute('d')).not.toBe(close?.getAttribute('d'));
  });
});
