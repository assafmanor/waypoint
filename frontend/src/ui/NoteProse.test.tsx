// @vitest-environment jsdom
//
// What `NoteProse` decides is which ELEMENT carries a run — the parser owns what a marker
// means and is tested without a renderer (`lib/note-markdown.test.ts`). So this file asserts
// only the things that are true of the DOM and could not be asserted there: the element per
// block, the two densities, and the one rule that is a correctness requirement rather than a
// look — that a body rendered inside a `<button>` contains no tab stop.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoteProse } from './NoteProse';

describe('NoteProse', () => {
  // The suite runs without vitest globals, so RTL registers no auto-cleanup — and a `screen`
  // query then reads the previous test's DOM.
  afterEach(() => cleanup());
  it('gives each block its own element', () => {
    const { container } = render(
      <NoteProse body={'## מסעדות\n- ראשון\n- שני\n\n1. צעד\n> ציטוט\n---\nפסקה'} />,
    );
    expect(container.querySelector('h3')?.textContent).toBe('מסעדות');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('1');
    expect(container.querySelector('blockquote')?.textContent).toBe('ציטוט');
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('פסקה');
  });

  // ADR-0152 §6b, now carried by the DOM instead of by `white-space` (ADR-0202 §6). A blank
  // line is a different thing from a single newline and has to render as one.
  it('breaks where the author broke, and starts a paragraph where they left a blank line', () => {
    const { container } = render(<NoteProse body={'שורה\nשנייה\n\nפסקה שנייה'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('reads a detected link as a link, and keeps the whole url in the href', () => {
    render(<NoteProse body="באתר www.tabelog.com/tokyo/A1303?utm_source=x" />);
    const link = screen.getByRole('link');
    // `prettyUrl`'s label, `externalHref`'s target — deliberately different strings.
    expect(link.textContent).toBe('tabelog.com/tokyo/A1303');
    expect(link.getAttribute('href')).toBe('https://www.tabelog.com/tokyo/A1303?utm_source=x');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    // Stored content sniffs its own direction, and never `dir="ltr"` (ADR-0118).
    expect(link.getAttribute('dir')).toBe('auto');
  });

  // **The rule that is correctness and not taste** (ADR-0202 §6). Both row bodies are
  // `<button>`s, an `<a>` cannot nest inside one, and ADR-0153 §8 refused a second tap target
  // inside a row's single open target. So with `anchors={false}` there is no anchor at all —
  // not an anchor styled to look inert, which would be a control that is not one.
  it('renders no anchor at all when it cannot be tapped', () => {
    const { container } = render(
      <NoteProse body="באתר www.tabelog.com/tokyo/A1303" anchors={false} />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
    // The words survive, isolated, because there is no element here to carry a `dir`.
    expect(container.textContent).toContain('⁦tabelog.com/tokyo/A1303⁩');
  });

  // design-language.md reserves JetBrains Mono for Latin/numeric runs — the face has no
  // Hebrew glyphs at all, so a Hebrew "code" span keeps the chip and loses the family.
  it('marks a Hebrew code span so the CSS can drop the mono face', () => {
    const { container } = render(<NoteProse body={'`Sakura2026!` וגם `סיסמה`'} />);
    const [latin, hebrew] = [...container.querySelectorAll('code')];
    expect(latin.className).toBe('');
    expect(hebrew.className).toBe('note-prose-code-he');
  });

  it('takes the dense density for a host section', () => {
    const { container } = render(<NoteProse body="שורה" dense />);
    expect(container.querySelector('.note-prose')?.className).toContain('dense');
  });

  it('renders nothing rather than throwing on an empty body', () => {
    const { container } = render(<NoteProse body="" />);
    expect(container.querySelector('.note-prose')?.childElementCount).toBe(0);
  });
});
