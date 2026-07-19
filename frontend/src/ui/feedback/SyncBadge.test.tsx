// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SyncBadge } from './SyncBadge';
import { t } from '../../i18n/he';

const STATES = ['synced', 'pending', 'failed'] as const;

describe('SyncBadge', () => {
  afterEach(() => cleanup());

  it.each(STATES)('renders %s with an accessible name (legible without color)', (state) => {
    render(<SyncBadge state={state} />);
    const el = screen.getByRole('img');
    expect(el.getAttribute('aria-label')).toBe(t.sync.badge[state]);
    expect(el.getAttribute('title')).toBe(t.sync.badge[state]);
    // A non-color cue is present: a glyph, marked aria-hidden so SR reads only the label.
    const glyph = el.querySelector('.sync-badge-glyph');
    expect(glyph?.textContent).toBeTruthy();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives each state a distinct glyph so color is not the only signal', () => {
    const glyphs = STATES.map((state) => {
      const { container } = render(<SyncBadge state={state} />);
      const g = container.querySelector('.sync-badge-glyph')?.textContent ?? '';
      cleanup();
      return g;
    });
    expect(new Set(glyphs).size).toBe(STATES.length);
  });

  it('carries a state class so the sync tokens (not amber/teal/plan) drive color', () => {
    const { container } = render(<SyncBadge state="failed" reason="X" />);
    expect(container.querySelector('.sync-badge-failed')).toBeTruthy();
  });
});
