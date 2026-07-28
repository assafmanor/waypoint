// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlaceBadge } from './PlaceBadge';
import { t } from '../../i18n/he';

describe('PlaceBadge (ADR-0121 §8 amendment)', () => {
  afterEach(() => cleanup());

  it('keeps the host badge class so each surface keeps its own size and tint', () => {
    const { container } = render(
      <PlaceBadge className="wp-event-badge" onShowOnMap={() => {}}>
        🍜
      </PlaceBadge>,
    );
    const el = container.querySelector('.wp-event-badge');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('wp-placebadge');
  });

  it('is a named control, and focuses the place on click', () => {
    const onShowOnMap = vi.fn();
    render(
      <PlaceBadge className="tr-badge" onShowOnMap={onShowOnMap}>
        🏨
      </PlaceBadge>,
    );
    // Named by the word, never by the glyph — the marker is decorative.
    const btn = screen.getByRole('button', { name: t.actions.showOnMap });
    fireEvent.click(btn);
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
  });

  // Several hosts nest it inside a face that is itself a button/tappable, so a tap
  // must not also toggle or open the row.
  it('stops propagation, so the row it sits in does not also open', () => {
    const onShowOnMap = vi.fn();
    const onRowClick = vi.fn();
    render(
      <button type="button" onClick={onRowClick}>
        <PlaceBadge className="wp-event-badge" onShowOnMap={onShowOnMap}>
          🍜
        </PlaceBadge>
      </button>,
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  // It is a role=button span (nested <button> would be invalid HTML), so the
  // keyboard half is ours to provide — a real button would have given it free.
  it('activates on Enter and Space, and is tabbable', () => {
    const onShowOnMap = vi.fn();
    render(
      <PlaceBadge className="bld-bd" onShowOnMap={onShowOnMap}>
        🚆
      </PlaceBadge>,
    );
    const btn = screen.getByRole('button', { name: t.actions.showOnMap });
    expect(btn.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onShowOnMap).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(btn, { key: 'a' });
    expect(onShowOnMap).toHaveBeenCalledTimes(2);
  });

  // "Absent, not broken": with no place to focus the badge is exactly the inert
  // badge it always was — no role, no marker, nothing for a screen reader to find.
  it('renders a plain, inert badge with no handler', () => {
    const { container } = render(<PlaceBadge className="wp-event-badge">🍜</PlaceBadge>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('.wp-placebadge')).toBeNull();
    expect(container.querySelector('.wp-placebadge-mark')).toBeNull();
    expect(container.querySelector('.wp-event-badge')!.textContent).toBe('🍜');
  });
});
