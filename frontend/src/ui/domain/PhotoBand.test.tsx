// @vitest-environment jsdom
//
// **A photograph as a band, with its credit on it** (ADR-0229 §2) — extracted from `DayHead`'s
// own `Shot` when the read band needed the same object at a different height.
//
// What is tested here is the shape both hosts depend on: the picture, the two caption lines,
// and the three things that differ between a head and a card and are therefore props — the
// density, whether the picture is its own control, and eager loading.
//
// The credit is asserted as PRESENT rather than styled: it is a licence obligation (ADR-0166
// §12.2), so a host silently dropping it is the failure worth a test. jsdom does no layout, so
// the clamps that keep an address on one line are proven by the mockup's render, not here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { BAND_DENSITY, PhotoBand } from './PhotoBand';
import { t } from '../../i18n/he';

const shot = {
  url: 'https://example.test/lagoon.jpg',
  of: 'Jökulsárlón',
  credit: 'CC BY-SA 2.0 · Ulrich Latzenhofer',
};

describe('PhotoBand', () => {
  afterEach(() => cleanup());

  it('renders the picture and both caption lines', () => {
    const { container } = render(<PhotoBand shot={shot} />);
    const img = container.querySelector('.wp-photoband img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(shot.url);
    // `alt` is the raw string — bidi control characters in alt text are read aloud.
    expect(img.getAttribute('alt')).toBe(shot.of);
    const caption = container.querySelector('.wp-photoband figcaption')!;
    expect(caption.querySelector('strong')!.textContent).toContain(shot.of);
    expect(caption.querySelector('span')!.textContent).toContain(shot.credit);
  });

  it('makes the picture a control when the host can open it, and names it', () => {
    const onOpen = vi.fn();
    const { container } = render(<PhotoBand shot={{ ...shot, onOpen }} />);
    const button = container.querySelector('.wp-photoband > button')!;
    expect(button.getAttribute('aria-label')).toBe(t.map.know.fullPicture);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // The caption is an overlay and never the target — see the component for why.
    expect(container.querySelector('.wp-photoband > figcaption')).toBeTruthy();
  });

  it('renders no control at all without one, which is the reader with no app to open into', () => {
    const { container } = render(<PhotoBand shot={shot} />);
    expect(container.querySelector('.wp-photoband button')).toBeNull();
  });

  // The read band IS the button, and a button inside a button is invalid HTML — so the picture
  // must decline its own control even when the host has an `onOpen` to give it.
  it('declines its own control when the host is itself the button', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <PhotoBand shot={{ ...shot, onOpen }} interactive={false} density={BAND_DENSITY.CARD} />,
    );
    expect(container.querySelector('.wp-photoband button')).toBeNull();
    expect(container.querySelector('.wp-photoband img')).toBeTruthy();
  });

  it('carries the card density as a class, and the day density as none', () => {
    const { container, rerender } = render(<PhotoBand shot={shot} />);
    expect(container.querySelector('.wp-photoband')!.classList.contains('is-card')).toBe(false);
    rerender(<PhotoBand shot={shot} density={BAND_DENSITY.CARD} />);
    expect(container.querySelector('.wp-photoband')!.classList.contains('is-card')).toBe(true);
  });

  // The day's shot is the first thing on the page; every other host's is below a fold or inside
  // a card nobody has opened (ADR-0219 §3).
  it('loads lazily unless the host says the picture is the first thing on the page', () => {
    const { container, rerender } = render(<PhotoBand shot={shot} />);
    expect(container.querySelector('img')!.getAttribute('loading')).toBe('lazy');
    rerender(<PhotoBand shot={{ ...shot, eager: true }} />);
    expect(container.querySelector('img')!.getAttribute('loading')).toBe('eager');
  });
});
