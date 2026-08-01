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

function Harness({ onState }: { onState: (state: NoteComposerState) => void }) {
  const state = useNoteComposer();
  onState(state);
  return <NoteComposer state={state} id="c" />;
}

/** Render the composer and keep a live handle on its state, the way a host form holds it. */
function show() {
  let state!: NoteComposerState;
  render(<Harness onState={(s) => (state = s)} />);
  return {
    input: () => screen.getByRole('textbox') as HTMLTextAreaElement,
    add: () => screen.getByLabelText(t.notes.composer.add),
    chips: () => [...document.querySelectorAll('.note-chip-t')].map((el) => el.textContent),
    pending: () => state.pending(),
    type: (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } }),
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

  it('Enter commits too, and Shift+Enter does not', () => {
    const c = show();
    c.type('שורה');
    fireEvent.keyDown(c.input(), { key: 'Enter', shiftKey: true });
    expect(c.chips()).toEqual([]);
    fireEvent.keyDown(c.input(), { key: 'Enter' });
    expect(c.chips()).toEqual(['שורה']);
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
});
