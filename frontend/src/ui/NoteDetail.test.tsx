// @vitest-environment jsdom
//
// The note preview (ADR-0153 §4's 2026-08-02 amendment). The screen's own test proves the
// tap reaches here and that the head names its host once; what this file holds is the
// surface's own rules — the ones a note has and a booking has no equivalent of.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Note, User } from '@waypoint/shared';
import { wrapNav } from '../test/nav-harness';
import { NoteDetail } from './NoteDetail';
import { t } from '../i18n/he';

const NOW = new Date('2026-07-20T09:00:00Z');

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  tripId: 't1',
  source: 'member',
  createdBy: 'u1',
  createdAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-20T08:00:00Z',
  updatedBy: 'u1',
  ...over,
});

const users: User[] = [{ id: 'u1', displayName: 'דנה' } as User];

const show = (over: Partial<Note> = {}, props: Partial<Parameters<typeof NoteDetail>[0]> = {}) =>
  render(
    wrapNav(
      <NoteDetail
        note={note(over)}
        glyph="🍜"
        users={users}
        now={NOW}
        onEdit={() => {}}
        onClose={() => {}}
        {...props}
      />,
    ),
  );

describe('NoteDetail', () => {
  afterEach(cleanup);

  // The reason the surface exists: the row clamps to two lines and this one does not.
  it('prints the body unclamped, keeping the line breaks it was written with', () => {
    show({ body: 'שורה ראשונה\nשורה שנייה' });
    const read = document.querySelector('.note-read') as HTMLElement;
    expect(read.textContent).toBe('שורה ראשונה\nשורה שנייה');
    expect(read.classList.contains('note-item-b')).toBe(false);
  });

  // A url-only note has no body at all — the link IS the content, so the surface must not
  // come up empty.
  it('shows a url-only note’s link as its content, opening safely in a new tab', () => {
    show({ url: 'https://tabelog.com/tokyo/A1303' });
    const link = document.querySelector('.note-read-url') as HTMLAnchorElement;
    expect(link.href).toContain('tabelog.com');
    expect(link.rel).toContain('noopener');
    expect(link.target).toBe('_blank');
  });

  // ADR-0118: an LTR island via `ltrIsolate`, never `dir="ltr"` on a non-input, which would
  // lay the whole Hebrew line out left-to-right.
  it('isolates the url without setting a direction on the element', () => {
    show({ url: 'https://tabelog.com/tokyo/A1303' });
    expect(document.querySelector('[dir="ltr"]')).toBeNull();
  });

  it('titles itself with the note’s own title when it has one', () => {
    show({ title: 'מזומן בלבד', body: 'אין כרטיסים' });
    expect(document.querySelector('.bk-title')?.textContent).toBe('מזומן בלבד');
    expect(document.querySelector('.note-read')?.textContent).toBe('אין כרטיסים');
  });

  it('credits the author and when, as one fact', () => {
    show({ body: 'הכניסה מאחור' });
    expect(document.querySelector('.bk-fact-k')?.textContent).toBe(t.notes.preview.written);
    expect(document.querySelector('.bk-fact-v')?.textContent).toContain('דנה');
  });

  // A note written by a member who has since left the trip still has to read.
  it('drops the author rather than the fact when the writer is unknown', () => {
    show({ body: 'הכניסה מאחור', createdBy: 'gone' });
    expect(document.querySelector('.bk-fact-v')?.textContent?.includes('·')).toBe(false);
  });

  it('reaches the editor through one deliberate press', () => {
    const onEdit = vi.fn();
    show({ body: 'הכניסה מאחור' }, { onEdit });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.notes.preview.edit) }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
