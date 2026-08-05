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

// The badge as the thumbnail's frame (ADR-0167 §1). What is assertable here is the MARKUP —
// which elements exist, what the badge says about itself, and what happens when the bytes do
// not arrive. Whether the frame holds its box and keeps the hue is geometry, so it is measured
// in `e2e/place-photo-frame.spec.ts` against real stylesheets: jsdom loads no CSS and reports
// every rect as zero.
describe('PlaceBadge as the thumbnail frame (ADR-0167 §1)', () => {
  afterEach(() => cleanup());

  const PHOTO = '/enrichment/images/enr_1111';
  const img = (c: HTMLElement) => c.querySelector('.wp-placebadge-photo img') as HTMLImageElement;

  it('fills its interior with the photo and drops the glyph', () => {
    const { container } = render(
      <PlaceBadge className="map-badge" onShowOnMap={() => {}} photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    expect(img(container).getAttribute('src')).toBe(PHOTO);
    // Alternatives, never stacked: an emoji over a photograph is unreadable as either.
    expect(container.querySelector('.map-badge')!.textContent).toBe('');
    // The image is decoration — the row's name is the place, and the photo says nothing a
    // screen reader can use. `alt=""` plus `aria-hidden` on the wrapper, not a description.
    expect(img(container).getAttribute('alt')).toBe('');
    // Off the critical path: a list of thirty rows must not block on thirty fetches.
    expect(img(container).getAttribute('loading')).toBe('lazy');
  });

  // The hue moves from fill to ring, and the ring is a real element rather than a pseudo —
  // this badge's `::before` is already the order counter and its `::after` the hit area.
  it('draws the ring above the image, outside the clip', () => {
    const { container } = render(
      <PlaceBadge className="map-badge" onShowOnMap={() => {}} photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    const badge = container.querySelector('.map-badge')!;
    const ring = badge.querySelector('.wp-placebadge-ring');
    expect(ring).toBeTruthy();
    // Outside the clip — the CSS that clears the category fill and redraws the soft line both
    // select it as the badge's own child, and `overflow: hidden` would shave its corners.
    expect(ring!.parentElement).toBe(badge);
    // The hook every one of those rules keys on, so a stylesheet can tell the two states apart.
    expect(badge.hasAttribute('data-photo')).toBe(true);
  });

  it('stays the way in, and keeps the order counter, with a photo in it', () => {
    const onShowOnMap = vi.fn();
    const { container } = render(
      <PlaceBadge className="map-badge" onShowOnMap={onShowOnMap} order={2} photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    fireEvent.click(screen.getByRole('button', { name: t.actions.showOnMap }));
    expect(onShowOnMap).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.map-badge')!.getAttribute('data-order')).toBe('2');
    expect(container.querySelector('.wp-placebadge-mark')).toBeTruthy();
  });

  // A blob a refresh replaced is a 404 at an immutable URL, so it can never come back. What
  // that has to degrade to is the glyph — not the browser's broken-image mark in a 40px square.
  it('falls back to the glyph when the bytes do not arrive', () => {
    const { container } = render(
      <PlaceBadge className="map-badge" onShowOnMap={() => {}} photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    fireEvent.error(img(container));
    expect(container.querySelector('.wp-placebadge-photo')).toBeNull();
    expect(container.querySelector('.wp-placebadge-ring')).toBeNull();
    expect(container.querySelector('.map-badge')!.hasAttribute('data-photo')).toBe(false);
    expect(container.querySelector('.map-badge')!.textContent).toBe('🍜');
  });

  // …and the failure belongs to that URL alone. A refreshed enrichment arrives as a NEW
  // immutable URL, and it must get its own chance rather than inheriting the last one's 404.
  it('gives a replacement photo a fresh chance', () => {
    const { container, rerender } = render(
      <PlaceBadge className="map-badge" onShowOnMap={() => {}} photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    fireEvent.error(img(container));
    rerender(
      <PlaceBadge className="map-badge" onShowOnMap={() => {}} photoUrl="/enrichment/images/enr_2">
        🍜
      </PlaceBadge>,
    );
    expect(img(container).getAttribute('src')).toBe('/enrichment/images/enr_2');
  });

  // The inert badge frames a photo too: `MaybeCard`'s tile and a booking's row show the same
  // place, and "no way to the map here" is not a claim about what the place looks like.
  it('frames a photo on the inert badge as well', () => {
    const { container } = render(
      <PlaceBadge className="wp-event-badge" photoUrl={PHOTO}>
        🍜
      </PlaceBadge>,
    );
    expect(img(container).getAttribute('src')).toBe(PHOTO);
    expect(container.querySelector('.wp-placebadge-ring')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
