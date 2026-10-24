// @vitest-environment jsdom
//
// What is only true of THIS surface (ADR-0202 §2/§3), and would otherwise be re-argued per
// entrance: the bar names the KIND and never the note, the author and the elapsed time appear
// here and nowhere else in the note's chrome, the host is named exactly once, and the links in
// the body are finally live — which is half the reason the screen exists.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The bar wears the mode tint, so this component reads `useMode`. Mocked rather than provided:
// `ModeProvider` reads trip state, and this spec has no reason to stand up a trip to assert a
// heading. The suite states what it depends on (frontend/CLAUDE.md).
vi.mock('../state/mode-state', () => ({ useMode: () => ({ mode: 'trip' }) }));
import type { Note } from '@waypoint/shared';
import { NoteFullScreen } from './NoteFullScreen';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

const USERS = [{ id: 'u1', displayName: 'יובל' }] as never;
const NOW = new Date('2026-08-22T12:00:00Z');

const note = (over: Partial<Note> = {}): Note =>
  ({
    id: 'n1',
    tripId: 'tr1',
    body: 'הכניסה מהחניון',
    createdBy: 'u1',
    createdAt: '2026-08-22T10:00:00Z',
    updatedAt: '2026-08-22T10:00:00Z',
    ...over,
  }) as Note;

const HOST = { kind: 'booking', id: 'b1', name: 'שינג׳וקו גרנביי' } as const;

const open = (props: Partial<Parameters<typeof NoteFullScreen>[0]> = {}) =>
  render(
    wrapNav(
      <NoteFullScreen
        note={note()}
        users={USERS}
        now={NOW}
        onEdit={() => {}}
        onClose={() => {}}
        {...props}
      />,
    ),
  );

describe('NoteFullScreen', () => {
  // Explicit, as everywhere else in this directory: the suite runs without vitest globals, so
  // RTL never registers its own auto-cleanup. Without this each render stacks a second full
  // screen in the document and every `querySelector` reads the FIRST one — which reports the
  // previous test's answer and looks like a bug in the component.
  afterEach(() => cleanup());
  // ADR-0153 §4's rule for the row, one surface up: the head never repeats the note's words.
  // The sheet this replaces printed the host in its head AND in a fact below it, which
  // stuttered on every untitled hosted note.
  it('names the KIND in the bar, not the note', () => {
    open({ note: note({ title: 'טוקיו' }) });
    expect(document.querySelector('.note-full-t')?.textContent).toBe(t.notes.one);
    expect(document.querySelector('.note-full-title')?.textContent).toBe('טוקיו');
  });

  // `RowOpenFoot` refuses these two because on a row they sit two lines above it. Here there
  // is no row, so the same rule produces the opposite answer.
  it('carries the author and the elapsed time, which the row’s foot does not', () => {
    open();
    expect(document.querySelector('.note-full-meta')?.textContent).toContain('יובל');
  });

  // With no chip in the bar, the foot is the only place the host appears — so it has to be
  // there whether or not it can be reached, which is the opposite call from the row's foot.
  it('names the host once, as the way to it when there is one', () => {
    const onGoToHost = vi.fn();
    open({ host: HOST, onGoToHost });
    const lead = screen.getByRole('button', { name: t.notes.open.toHost(HOST.name) });
    expect(lead.textContent).toContain(HOST.name);
    expect(document.querySelectorAll('.chrome-chip')).toHaveLength(0);
    lead.click();
    expect(onGoToHost).toHaveBeenCalled();
  });

  it('still names an unreachable host, rather than dropping it', () => {
    open({ host: HOST });
    expect(document.querySelector('.row-open-lead')?.textContent).toContain(HOST.name);
    expect(screen.queryByRole('button', { name: t.notes.open.toHost(HOST.name) })).toBeNull();
  });

  it('says a general note is general', () => {
    open();
    expect(document.querySelector('.row-open-lead')?.textContent).toBe(t.notes.open.general);
  });

  // **Half the reason this surface exists** (ADR-0202 §6): on both row bodies the same url is
  // plain text, because those bodies are `<button>`s.
  it('makes a url in the body a real link', () => {
    open({ note: note({ body: 'האתר www.tabelog.com/tokyo/A1303' }) });
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://www.tabelog.com/tokyo/A1303',
    );
  });

  it('offers the note’s own url as its one link line when the note is only a url', () => {
    open({ note: note({ body: '', url: 'instagram.com/reel/DbTc' }) });
    const link = screen.getByRole('link', { name: t.notes.open.openLink });
    expect(link.getAttribute('href')).toBe('https://instagram.com/reel/DbTc');
    // No prose block at all — there are no words to shape.
    expect(document.querySelector('.note-prose')).toBeNull();
  });

  // One dismissal, one path (ADR-0103 §2): the visible arrow runs the overlay's own close,
  // which is what the backdrop, Escape and a system back all reach.
  it('closes from the bar', () => {
    const onClose = vi.fn();
    open({ onClose });
    screen.getByRole('button', { name: t.notes.full.backAria }).click();
    expect(onClose).toHaveBeenCalled();
  });

  // No `⋯` here: `BookingDetail`'s grammar is one visible edit, with the delete on the row's
  // kebab (ADR-0053). The mockup drew a menu and the build removed it.
  it('offers exactly one verb, and no menu', () => {
    const onEdit = vi.fn();
    open({ onEdit });
    expect(screen.queryByRole('button', { name: t.notes.manage.actions })).toBeNull();
    screen.getByRole('button', { name: /עריכה/ }).click();
    expect(onEdit).toHaveBeenCalled();
  });
});
