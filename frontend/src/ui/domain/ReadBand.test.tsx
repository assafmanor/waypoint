// @vitest-environment jsdom
//
// **The way from an open day card into the read** (ADR-0229 §2).
//
// Two shapes, and which one you get is a fact about the place rather than a choice: a
// photograph becomes a band, no photograph becomes a line. What is tested is that rule, the
// label (which is the DESTINATION's name and so tells you whether the tap gets you the
// confirmation code), and the placeless case — where the address is absent rather than empty.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ReadBand } from './ReadBand';
import { t } from '../../i18n/he';
import { image } from '../../test/enrichment-image';

const base = { title: 'Jökulsárlón', address: 'Jökulsárlón, 781, איסלנד', onOpen: () => {} };

describe('ReadBand', () => {
  afterEach(() => cleanup());

  it('shows the photograph as a band, with the address and the credit on it', () => {
    const { container } = render(<ReadBand {...base} image={image} booked />);
    expect(container.querySelector('.rd-line')).toBeNull();
    const caption = container.querySelector('.rd-band .wp-photoband figcaption')!;
    // The ADDRESS is what the band is worth showing: the place's name is already the card's
    // title one element up, so repeating it there would spend the line twice.
    expect(caption.querySelector('strong')!.textContent).toContain(base.address);
    expect(caption.querySelector('span')!.textContent).toContain('Ulrich Latzenhofer');
  });

  it('falls back to a line when the place has no photograph, which is most of them', () => {
    const { container } = render(<ReadBand {...base} booked={false} />);
    expect(container.querySelector('.rd-band')).toBeNull();
    const line = container.querySelector('.rd-line')!;
    expect(line.querySelector('.rd-t')!.textContent).toBe(t.day.read.details);
    expect(line.querySelector('.rd-sub')!.textContent).toBe(base.address);
  });

  // The label names where the tap goes, so a booked row says the hero's own word for the same
  // journey — and that is what tells you the confirmation code is behind it.
  it('names its destination: the booking, or the event', () => {
    const { container, rerender } = render(<ReadBand {...base} image={image} booked />);
    expect(container.querySelector('.rd-go')!.textContent).toContain(t.hero.toBooking);
    rerender(<ReadBand {...base} image={image} booked={false} />);
    expect(container.querySelector('.rd-go')!.textContent).toContain(t.day.read.details);
  });

  it('drops the address line rather than rendering it empty, on a placeless event', () => {
    const { container } = render(<ReadBand title="ארוחת ערב" booked={false} onOpen={() => {}} />);
    expect(container.querySelector('.rd-sub')).toBeNull();
    expect(container.querySelector('.rd-t')!.textContent).toBe(t.day.read.details);
  });

  it('opens the read from the whole band, and from the whole line', () => {
    const onOpen = vi.fn();
    const { container, rerender } = render(
      <ReadBand {...base} image={image} booked onOpen={onOpen} />,
    );
    fireEvent.click(container.querySelector('.rd-band')!);
    rerender(<ReadBand {...base} booked onOpen={onOpen} />);
    fireEvent.click(container.querySelector('.rd-line')!);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  // A band inside a button may not carry one of its own: nested buttons are invalid HTML, and
  // the full picture stays reachable from the read's own hero one level further in.
  it('holds exactly one control', () => {
    const { container } = render(<ReadBand {...base} image={image} booked />);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });
});
