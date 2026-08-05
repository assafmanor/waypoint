// @vitest-environment jsdom
//
// **One presentation, three densities** (ADR-0167 §11.1, ADR-0166 §17). Two rows render this now —
// a place the trip holds and a Google result nobody has added — so what it draws in each state is
// worth pinning here rather than only through its two hosts.
//
// The boxes themselves are `e2e/place-know.spec.ts`'s and `e2e/place-decide.spec.ts`'s: jsdom loads
// no CSS, so the clamp is asserted here as the class that carries it and there as the line count it
// produces.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DeliveredImageValue } from '@waypoint/shared';
import { KNOWLEDGE_DENSITY, PlaceKnowledge } from './PlaceKnowledge';
import { t } from '../../i18n/he';

const image: DeliveredImageValue = {
  url: '/enrichment/images/enr_1',
  mimeType: 'image/jpeg',
  width: 840,
  height: 600,
  sizeBytes: 120_000,
  source: 'commons',
  license: 'CC BY-SA 4.0',
  attribution: 'Kakidai',
  fetchedAt: '2026-08-05T09:00:00Z',
  confidence: 1,
  method: 'settled_id',
  ref: 'Nezu.jpg',
};

const summary = { text: 'A museum in Minato, Tokyo.', lang: 'en', marker: 'באנגלית' };

describe('PlaceKnowledge', () => {
  afterEach(() => cleanup());

  // The majority case (ADR-0166 §11.3): nothing is known, so nothing is drawn — never an empty
  // block apologising for it (ADR-0109 §7).
  it('draws nothing at all when nothing is known', () => {
    const { container } = render(<PlaceKnowledge density={KNOWLEDGE_DENSITY.DECIDING} />);
    expect(container.innerHTML).toBe('');
  });

  // **No hero on a committed place's collapsed row** (§9.4): the badge already carries the
  // photograph at zero cost, and 130px of picture is the least valuable block on a capped card.
  it('gives the collapsed row the summary and the way in, and no picture', () => {
    const { container } = render(
      <PlaceKnowledge
        density={KNOWLEDGE_DENSITY.COLLAPSED}
        image={image}
        summary={summary}
        onExpand={() => {}}
      />,
    );
    expect(container.querySelector('.map-hero')).toBeNull();
    expect(container.querySelector('.map-credit')).toBeNull();
    expect(container.querySelector('.map-sum')!.className).toBe('map-sum');
    expect(screen.getByRole('button', { name: t.map.know.more })).toBeTruthy();
  });

  // An image with no words still has a room to open, and without the block the picture would be
  // unreachable on that place.
  it('keeps the way in for an image with no summary', () => {
    render(
      <PlaceKnowledge density={KNOWLEDGE_DENSITY.COLLAPSED} image={image} onExpand={() => {}} />,
    );
    expect(screen.getByRole('button', { name: t.map.know.more })).toBeTruthy();
  });

  it('gives the expanded card the picture, the credit and the released summary', () => {
    const { container } = render(
      <PlaceKnowledge density={KNOWLEDGE_DENSITY.EXPANDED} image={image} summary={summary} />,
    );
    expect(container.querySelector('.map-hero img')!.getAttribute('src')).toBe(image.url);
    expect(container.querySelector('.map-credit')!.textContent).toContain('CC BY-SA 4.0');
    expect(container.querySelector('.map-sum')!.className).toContain('is-open');
    // No way in from the state you are already in.
    expect(screen.queryByRole('button', { name: t.map.know.more })).toBeNull();
  });

  // **The deciding card** (§9.1): the picture and three lines, and nothing to expand into — so no
  // `עוד ›`, even when a host hands one over.
  it('gives the deciding card the picture and a clamp of its own, with no way in', () => {
    const { container } = render(
      <PlaceKnowledge
        density={KNOWLEDGE_DENSITY.DECIDING}
        image={image}
        summary={summary}
        onExpand={() => {}}
      />,
    );
    expect(container.querySelector('.map-hero')).toBeTruthy();
    expect(container.querySelector('.map-sum')!.className).toContain('is-decide');
    expect(screen.queryByRole('button', { name: t.map.know.more })).toBeNull();
  });

  // **The whole block opens the card** (owner, 2026-08-05): the clamped text is what you are
  // trying to read, so tapping it is the natural way in — `עוד ›` stays as the named control.
  it('opens the card when the summary itself is tapped, not only the way in', () => {
    const onExpand = vi.fn();
    const onRow = vi.fn();
    const { container } = render(
      <div onClick={onRow}>
        <PlaceKnowledge
          density={KNOWLEDGE_DENSITY.COLLAPSED}
          summary={summary}
          onExpand={onExpand}
        />
      </div>,
    );
    fireEvent.click(container.querySelector('.map-sum-t')!);
    expect(onExpand).toHaveBeenCalledTimes(1);
    // Not the row's own tap: that would re-select the place, re-frame the camera and scroll the
    // list under you.
    expect(onRow).not.toHaveBeenCalled();
  });

  it('is inert where there is nothing to open into', () => {
    const onExpand = vi.fn();
    // The deciding card has nothing to swap off, and the expanded card is already there.
    for (const density of [KNOWLEDGE_DENSITY.DECIDING, KNOWLEDGE_DENSITY.EXPANDED] as const) {
      const { container, unmount } = render(
        <PlaceKnowledge density={density} summary={summary} onExpand={onExpand} />,
      );
      fireEvent.click(container.querySelector('.map-sum')!);
      unmount();
    }
    expect(onExpand).not.toHaveBeenCalled();
  });

  // A FRAGMENT, not a wrapper: each block is a child of the row's own layout — a wrapping flex
  // line in the list, a grid row in the bounded card — so a wrapper would take their place in it.
  it('renders its blocks as siblings of the row, not inside a box of its own', () => {
    const { container } = render(
      <PlaceKnowledge density={KNOWLEDGE_DENSITY.DECIDING} image={image} summary={summary} />,
    );
    expect([...container.children].map((el) => el.className)).toEqual([
      'map-hero',
      'map-credit',
      'map-sum is-decide',
    ]);
  });

  it('names the picture and stops the row it sits in from also opening', () => {
    const onFullPicture = vi.fn();
    const onRow = vi.fn();
    const { container } = render(
      <div onClick={onRow}>
        <PlaceKnowledge
          density={KNOWLEDGE_DENSITY.DECIDING}
          image={image}
          onFullPicture={onFullPicture}
        />
      </div>,
    );
    // Named by the word: the image itself says nothing, which is why the hero is a button.
    fireEvent.click(screen.getByRole('button', { name: t.map.know.fullPicture }));
    expect(onFullPicture).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
    expect(container.querySelector('.map-hero img')!.getAttribute('alt')).toBe('');
  });

  // The image is immutable, so a blob a refresh replaced 404s for good — and the credit goes with
  // it, because a credit for a picture nobody can see credits nothing.
  it('degrades to no picture, and no credit, when the bytes are gone', () => {
    const { container } = render(
      <PlaceKnowledge density={KNOWLEDGE_DENSITY.DECIDING} image={image} summary={summary} />,
    );
    fireEvent.error(container.querySelector('.map-hero img')!);
    expect(container.querySelector('.map-hero')).toBeNull();
    expect(container.querySelector('.map-credit')).toBeNull();
    // The words survive the picture.
    expect(container.querySelector('.map-sum-t')!.textContent).toBe(summary.text);
  });

  // §5's marker: a fact ABOUT the text, before it and a SIBLING of it — `dir="auto"` would sniff a
  // Hebrew chip inside the prose and lay an English extract out RTL.
  it('puts the language marker beside the prose, not inside it', () => {
    const { container } = render(
      <PlaceKnowledge density={KNOWLEDGE_DENSITY.COLLAPSED} summary={summary} />,
    );
    const block = container.querySelector('.map-sum')!;
    expect(block.children[0].className).toContain('map-sum-lang');
    expect(block.children[0].textContent).toBe('באנגלית');
    const prose = container.querySelector('.map-sum-t')!;
    expect(prose.getAttribute('lang')).toBe('en');
    expect(prose.getAttribute('dir')).toBe('auto');
    expect(prose.querySelector('.map-sum-lang')).toBeNull();
  });
});
