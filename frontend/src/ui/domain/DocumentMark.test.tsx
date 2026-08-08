// @vitest-environment jsdom
//
// The mark's contract is small and every part of it is a rule from ADR-0174 §1 rather than
// a rendering detail — which is why it is worth a file: an absent mark, a countless mark and
// a counted mark are three different claims, and the accessible name is the only thing that
// makes any of them legible to a screen reader.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DocumentMark } from './DocumentMark';
import { NoteMark } from './NoteMark';
import { t } from '../../i18n/he';

describe('DocumentMark', () => {
  afterEach(cleanup);

  it('renders nothing at all when the host carries no document', () => {
    const { container } = render(<DocumentMark count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the count is absent, not a zero', () => {
    // The row hosts pass a derived number, and `attachmentCountForContext` answers 0 rather
    // than undefined — but a surface that has not wired the count yet must stay silent.
    const { container } = render(<DocumentMark />);
    expect(container.innerHTML).toBe('');
  });

  it('shows no digit at one, because a 1 beside a glyph that means "a document" says nothing', () => {
    render(<DocumentMark count={1} />);
    const mark = screen.getByRole('img', { name: t.docs.mark(1) });
    expect(mark.textContent).toBe('');
  });

  it('shows the count past one', () => {
    render(<DocumentMark count={3} />);
    expect(screen.getByRole('img', { name: t.docs.mark(3) }).textContent).toBe('3');
  });

  it('is named for a screen reader, and the noun is said out loud', () => {
    render(<DocumentMark count={2} />);
    const mark = screen.getByRole('img', { name: t.docs.mark(2) });
    // `title` as well as `aria-label`, the same contract `NoteMark` and `SyncBadge` carry —
    // otherwise it is a mystery glyph to a pointer as well as to a reader.
    expect(mark.getAttribute('title')).toBe(t.docs.mark(2));
  });

  it('is a read-only indicator and NOT a tap target (ADR-0152 §8)', () => {
    // ~16px against a 44px floor, and widening it would compete with opening the row it sits
    // in. The reach is the row's own open — the expanded card, the detail sheet, the hero.
    render(<DocumentMark count={2} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: t.docs.mark(2) }).closest('a')).toBeNull();
  });

  it('is a SECOND mark beside the note one, never a combined "has content" glyph', () => {
    // The two make different promises — a note is something a person wrote, a document is a
    // file you may have to show at a border — so a row that carries both says both.
    render(
      <span>
        <NoteMark count={2} />
        <DocumentMark count={1} />
      </span>,
    );
    expect(screen.getByRole('img', { name: t.notes.mark(2) })).toBeTruthy();
    expect(screen.getByRole('img', { name: t.docs.mark(1) })).toBeTruthy();
  });
});
