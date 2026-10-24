// @vitest-environment jsdom
// The composer (ADR-0152 §6b). The rule that matters most is the last one here: **the
// common case costs nothing** — you never have to press `＋`, because whatever is still in
// the box when the host is saved becomes a note too. That is the whole difference between
// an affordance and a chore, and it is the thing a "commit-only-on-＋" implementation would
// silently lose.
import { describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NoteComposer, useNoteComposer, type NoteComposerState } from './NoteComposer';
import { t } from '../i18n/he';

function Harness({
  onState,
  standalone = true,
}: {
  onState: (state: NoteComposerState) => void;
  standalone?: boolean;
}) {
  const state = useNoteComposer({ standalone });
  onState(state);
  return <NoteComposer state={state} id="c" />;
}

/** Render the composer and keep a live handle on its state, the way a host form holds it.
 *
 *  **`standalone` by default** (ADR-0192 §2's 2026-08-16 reversal): that is the mode with a
 *  box on screen and a `＋` of its own — `DocumentUploadSheet` and `MapPlaceForm` — and it is
 *  what every mechanical rule below is about. The host-form mode, where the section header
 *  owns both jobs and the box starts closed, gets its own block at the foot. */
function show(standalone = true) {
  let state!: NoteComposerState;
  render(<Harness onState={(s) => (state = s)} standalone={standalone} />);
  return {
    input: () => screen.getByRole('textbox') as HTMLTextAreaElement,
    add: () => screen.getByLabelText(t.notes.composer.add),
    chips: () => [...document.querySelectorAll('.note-chip-t')].map((el) => el.textContent),
    pending: () => state.pending(),
    type: (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } }),
    // The two verbs the SECTION drives on a host form, where the box has no controls of its
    // own — read off the live state so the handle cannot go stale between renders.
    openNew: () => state.openNew(),
    reopen: (index: number) => state.reopen(index),
  };
}

describe('useNoteComposer / NoteComposer (ADR-0152 §6b)', () => {
  it('writes nothing when the box is blank — a blank one is not a note', () => {
    const c = show();
    expect(c.pending()).toEqual([]);
    cleanup();
  });

  // THE COMMON CASE. One note is type-and-save, with no extra press at all.
  it('takes whatever is still in the box at save time, with no ＋ pressed', () => {
    const c = show();
    c.type('הכניסה מאחור');
    expect(c.chips()).toEqual([]);
    expect(c.pending()).toEqual(['הכניסה מאחור']);
    cleanup();
  });

  it('trims, and treats whitespace as nothing', () => {
    const c = show();
    c.type('   ');
    expect(c.pending()).toEqual([]);
    c.type('  מזומן בלבד  ');
    expect(c.pending()).toEqual(['מזומן בלבד']);
    cleanup();
  });

  it('＋ commits and clears, so the input never moves', () => {
    const c = show();
    c.type('הראשון');
    fireEvent.click(c.add());
    expect(c.chips()).toEqual(['הראשון']);
    expect(c.input().value).toBe('');
    cleanup();
  });

  // The owner's reversal (2026-08-07, ADR-0152 §6b amended): Enter used to commit and
  // Shift+Enter used to be the only way to break a line. Neither key commits now — the
  // textarea keeps its own newline, and `＋` is the only way to start a second note.
  it('Enter does not commit — it is the newline, with or without Shift', () => {
    const c = show();
    c.type('שורה');
    fireEvent.keyDown(c.input(), { key: 'Enter' });
    expect(c.chips()).toEqual([]);
    fireEvent.keyDown(c.input(), { key: 'Enter', shiftKey: true });
    expect(c.chips()).toEqual([]);
    // And what was typed is untouched: still one note, still pending for the host's save.
    expect(c.input().value).toBe('שורה');
    expect(c.pending()).toEqual(['שורה']);
    cleanup();
  });

  // A newline stays INSIDE one note — the "split on blank lines" alternative ADR-0152 §6b
  // rejected is not reopened by making Enter a newline.
  it('keeps a multi-line note as ONE note, blank line and all', () => {
    const c = show();
    c.type('קומה 3\n\nהכניסה מאחור');
    expect(c.pending()).toEqual(['קומה 3\n\nהכניסה מאחור']);
    fireEvent.click(c.add());
    expect(c.chips()).toEqual(['קומה 3\n\nהכניסה מאחור']);
    cleanup();
  });

  it('collects several notes in the order they were written', () => {
    const c = show();
    c.type('הראשון');
    fireEvent.click(c.add());
    c.type('השני');
    fireEvent.click(c.add());
    c.type('השלישי');
    expect(c.pending()).toEqual(['הראשון', 'השני', 'השלישי']);
    cleanup();
  });

  it('disables ＋ only because a press could not work, never as a refusal', () => {
    const c = show();
    expect((c.add() as HTMLButtonElement).disabled).toBe(true);
    c.type('משהו');
    expect((c.add() as HTMLButtonElement).disabled).toBe(false);
    cleanup();
  });

  // Without this a typo costs a delete and a retype, which is the opposite of sparing
  // anyone (ADR-0152 §6b).
  it('reopens a committed note into the box for editing', () => {
    const c = show();
    c.type('קוד הכספת 4417');
    fireEvent.click(c.add());
    fireEvent.click(screen.getByText('קוד הכספת 4417'));
    expect(c.input().value).toBe('קוד הכספת 4417');
    expect(c.chips()).toEqual([]);
    cleanup();
  });

  // "…anything half-typed is committed first, so nothing is clobbered."
  it('commits what is half-typed before reopening, and keeps the written order', () => {
    const c = show();
    c.type('הראשון');
    fireEvent.click(c.add());
    c.type('חצי מוקלד');
    fireEvent.click(screen.getByText('הראשון'));

    expect(c.input().value).toBe('הראשון');
    expect(c.chips()).toEqual(['חצי מוקלד']);
    expect(c.pending()).toEqual(['חצי מוקלד', 'הראשון']);
    cleanup();
  });

  it('removes a committed note without touching the others', () => {
    const c = show();
    c.type('הראשון');
    fireEvent.click(c.add());
    c.type('השני');
    fireEvent.click(c.add());
    fireEvent.click(screen.getAllByLabelText(t.notes.composer.remove)[0]);
    expect(c.chips()).toEqual(['השני']);
    cleanup();
  });

  it('resets after a save', () => {
    const { result } = renderHook(() => useNoteComposer());
    act(() => result.current.setInput('משהו'));
    act(() => result.current.commit());
    act(() => result.current.reset());
    expect(result.current.pending()).toEqual([]);
  });

  // ── The host-form mode (ADR-0192 §2's 2026-08-16 reversal) ─────────────────────────
  // Owner: _"notes looks really bad, they should look and behave the same as tasks (+ פתק)"_
  // and _"clicking the + פתק should open a new inline task, not the entire form"_. On a host
  // form the section header owns both jobs, so the box has neither a `＋` nor a reason to be
  // on screen before it is asked for.
  describe('on a host form (not standalone)', () => {
    it('shows no box until openNew is called, and never its own ＋', () => {
      const c = show(false);
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByLabelText(t.notes.composer.add)).toBeNull();

      act(() => c.openNew());
      expect(screen.getByRole('textbox')).toBeTruthy();
      // Still no button in the box — the header's `＋ פתק` is the only one.
      expect(screen.queryByLabelText(t.notes.composer.add)).toBeNull();
      cleanup();
    });

    it('openNew commits what is in the box and opens a fresh one', () => {
      const c = show(false);
      act(() => c.openNew());
      c.type('הראשון');
      act(() => c.openNew());
      expect(c.chips()).toEqual(['הראשון']);
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
      c.type('השני');
      // The common case still costs nothing: the trailing text needs no second press.
      expect(c.pending()).toEqual(['הראשון', 'השני']);
      cleanup();
    });

    // The box a chip reopens into has to be on screen, or the text goes somewhere invisible.
    it('reopening a chip reveals the box', () => {
      const c = show(false);
      act(() => c.openNew());
      c.type('נכתב');
      act(() => c.openNew());
      act(() => c.reopen(0));
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('נכתב');
      cleanup();
    });
  });
});
