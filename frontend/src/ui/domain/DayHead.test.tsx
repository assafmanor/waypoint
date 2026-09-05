// @vitest-environment jsdom
//
// **The head of a day** (ADR-0219 §2/§3) — the reader's card head, lifted into a component
// three surfaces render. What is tested here is the SHAPE it guarantees each of them: which
// slots exist, which are absent when nothing is passed, and the two things that differ between
// its hosts and are props rather than facts (the card chrome, and whether the head toggles).
//
// The cascade rule its copy column depends on has its own guard beside this file
// (`day-head.contract.test.ts`) — jsdom does no layout, so that one reads the stylesheet.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DayHead } from './DayHead';
import { t } from '../../i18n/he';

const base = { dayNumbers: '13', weekday: 'ראשון', title: 'Háifoss' };

const head = (c: HTMLElement) => c.querySelector('.wp-dayhead')!;

describe('DayHead', () => {
  afterEach(() => cleanup());

  it('says the day of the month and the weekday, in the date column', () => {
    const { container } = render(<DayHead {...base} />);
    const date = container.querySelector('.wp-dayhead-date')!;
    expect(date.querySelector('strong')!.textContent).toContain('13');
    expect(date.querySelector('span')!.textContent).toBe('ראשון');
    expect(container.querySelector('.wp-dayhead-copy > strong')!.textContent).toBe('Háifoss');
  });

  // Amber marks the day the trip is ON — a span of time, which is the one thing amber is for.
  // In the column the hue is already in, never in the copy column, whose lines ellipsise.
  it('marks today, and only today', () => {
    const { container, rerender } = render(<DayHead {...base} />);
    expect(container.querySelector('.wp-dayhead-now')).toBeNull();
    expect(head(container).classList.contains('is-now')).toBe(false);

    rerender(<DayHead {...base} isNow />);
    expect(container.querySelector('.wp-dayhead-date .wp-dayhead-now')!.textContent).toBe(
      t.common.now,
    );
    expect(head(container).classList.contains('is-now')).toBe(true);
  });

  it('renders each line as a DIRECT child of the copy column', () => {
    // The rules that style these lines use the child combinator, so a line the component
    // nested one level deeper would silently lose them (`day-head.contract.test.ts`).
    const { container } = render(
      <DayHead
        {...base}
        lines={[<span key="a">לנים ברייקיאוויק</span>, <span key="b">11:00</span>]}
      />,
    );
    const spans = container.querySelectorAll('.wp-dayhead-copy > span');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('לנים ברייקיאוויק');
  });

  describe('the shot', () => {
    const shot = { url: '/enrichment/images/abc', of: 'Háifoss', credit: 'A. P · CC BY-SA 4.0' };

    it('is absent, with no placeholder band, when the day has no photo', () => {
      const { container } = render(<DayHead {...base} />);
      expect(container.querySelector('.wp-dayhead-shot')).toBeNull();
    });

    it('carries the picture, its subject and its credit', () => {
      const { container } = render(<DayHead {...base} shot={shot} />);
      const img = container.querySelector('.wp-dayhead-shot img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('/enrichment/images/abc');
      // `alt` takes the subject RAW — bidi controls in alt text are read aloud.
      expect(img.getAttribute('alt')).toBe('Háifoss');
      const caption = container.querySelector('.wp-dayhead-shot figcaption')!;
      expect(caption.textContent).toContain('Háifoss');
      expect(caption.textContent).toContain('CC BY-SA 4.0');
    });

    it('is inert without `onOpen` — the reader has no app to open into', () => {
      const { container } = render(<DayHead {...base} shot={shot} />);
      expect(container.querySelector('.wp-dayhead-shot button')).toBeNull();
      expect(container.querySelector('.wp-dayhead-shot img')!.getAttribute('loading')).toBe('lazy');
    });

    it('becomes a control that opens the full picture, and loads eagerly, in the app', () => {
      const onOpen = vi.fn();
      const { container } = render(
        <DayHead {...base} shot={{ ...shot, onOpen, eager: true }} card />,
      );
      // The BUTTON holds the image and the caption sits over it: a `<figcaption>` inside a
      // `<button>` is invalid HTML, and the caption is not the tap target anyway.
      const button = container.querySelector('.wp-dayhead-shot > button')!;
      expect(button.querySelector('img')!.getAttribute('loading')).toBe('eager');
      expect(container.querySelector('.wp-dayhead-shot > figcaption')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: t.map.know.fullPicture }));
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('the footer band', () => {
    it('is absent entirely when there are no facts and no action — a read-only day', () => {
      const { container } = render(<DayHead {...base} card />);
      expect(container.querySelector('.wp-dayhead-foot')).toBeNull();
    });

    it('carries the facts as full-width lines under the grid, not in the copy column', () => {
      const { container } = render(
        <DayHead {...base} card facts={[<span key="t">⁦12 ק״מ⁩</span>]} />,
      );
      expect(container.querySelectorAll('.wp-dayhead-foot .wp-dayhead-facts > span').length).toBe(
        1,
      );
      // The copy column keeps the name alone — round 2 drew the facts there and the render
      // clipped two of them at 360px.
      expect(container.querySelectorAll('.wp-dayhead-copy > span').length).toBe(0);
    });

    it('carries the day’s one action, with or without facts beside it', () => {
      const { container } = render(
        <DayHead {...base} card action={<button className="new-event-btn">חדש</button>} />,
      );
      expect(container.querySelector('.wp-dayhead-foot > .new-event-btn')).toBeTruthy();
    });
  });

  describe('the two hosts', () => {
    it('is a region with no chrome for the reader, inside a card that already has one', () => {
      const { container } = render(<DayHead {...base} />);
      expect(head(container).classList.contains('is-card')).toBe(false);
      expect(container.querySelector('.wp-dayhead-head')!.tagName).toBe('DIV');
    });

    it('toggles the day’s body as a button, and says whether it is open', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <DayHead {...base} as="button" expanded onToggle={onToggle} trailing={<i />} />,
      );
      const button = container.querySelector('.wp-dayhead-head') as HTMLButtonElement;
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.wp-dayhead-caret > i')).toBeTruthy();
    });

    it('pays nothing for the trailing cell when there is nothing in it', () => {
      const { container } = render(<DayHead {...base} card />);
      expect(container.querySelector('.wp-dayhead-caret')).toBeNull();
    });
  });
});
