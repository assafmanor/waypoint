// **A note is written ON THE WAY** (ADR-0152 §6b, owner's call): adding one from a host's
// form never opens a second form. The host's form carries this; a blank one writes nothing;
// the host's own save commits both.
//
// What the user is spared, in full: the category (resolved from the host, §5's amendment),
// the glyph (same chain), the title (absent here — the body IS the note) and any second
// commit. What is left is one textarea.
//
// **ONE input, always, and it never moves.** A committed note collapses to a one-line chip
// above it — the same compact shape the detail surfaces use, so the form invents no fourth
// representation. A first attempt held a fresh ~62px textarea open per note and was rejected
// on two grounds that are one mistake: it optimised the RARE case (several notes at once) at
// the expense of the common one (nought or one), and a box that appears unasked is something
// the user must notice, understand and then ignore.
//
// **And the common case costs nothing.** `＋` (or Enter) commits and clears, but you never
// have to press it: whatever is still in the input when the host is saved becomes a note
// too. So one note is type-and-save. `＋` exists only to start a second one.
//
// Rejected: one box split on blank lines — a note is a row, a paragraph break is not a user
// saying "these are two things", and it would leave editing one of them ambiguous forever.
import { useCallback, useRef, useState } from 'react';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export interface NoteComposerState {
  /** Notes committed in this form session, in order, not yet written anywhere. */
  drafts: string[];
  input: string;
  setInput: (value: string) => void;
  commit: () => void;
  reopen: (index: number) => void;
  remove: (index: number) => void;
  /** Every note this form should write: the committed ones plus whatever is still in the
   *  box. The host's save calls this — which is what makes `＋` optional. */
  pending: () => string[];
  /** Discard everything (after a successful save). */
  reset: () => void;
}

export function useNoteComposer(): NoteComposerState {
  const [drafts, setDrafts] = useState<string[]>([]);
  const [input, setInput] = useState('');
  // `pending` is read inside a save handler, so it must see the CURRENT values rather than
  // the ones closed over when the handler was created.
  const live = useRef({ drafts, input });
  live.current = { drafts, input };

  const commit = useCallback(() => {
    setInput((current) => {
      const value = current.trim();
      if (!value) return current;
      setDrafts((list) => [...list, value]);
      return '';
    });
  }, []);

  /** Tapping a chip returns its text to the composer so a typo costs an edit rather than a
   *  delete and a retype. Anything half-typed is committed first, so reopening never eats
   *  what was already there. */
  const reopen = useCallback((index: number) => {
    setDrafts((list) => {
      const text = list[index];
      if (text === undefined) return list;
      setInput((current) => {
        const half = current.trim();
        // The half-typed note takes the reopened one's place in the order, which keeps the
        // list in the order the notes were actually written.
        if (half) setDrafts((inner) => [...inner.slice(0, index), half, ...inner.slice(index)]);
        return text;
      });
      return list.filter((_, i) => i !== index);
    });
  }, []);

  const remove = useCallback(
    (index: number) => setDrafts((list) => list.filter((_, i) => i !== index)),
    [],
  );

  const pending = useCallback(() => {
    const { drafts: committed, input: current } = live.current;
    const trailing = current.trim();
    return trailing ? [...committed, trailing] : committed;
  }, []);

  const reset = useCallback(() => {
    setDrafts([]);
    setInput('');
  }, []);

  return { drafts, input, setInput, commit, reopen, remove, pending, reset };
}

export function NoteComposer({ state, id }: { state: NoteComposerState; id: string }) {
  const { drafts, input, setInput, commit, reopen, remove } = state;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grows with what is typed rather than reserving rows nobody used.
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="note-compose">
      {drafts.map((text, index) => (
        <div className="note-chip" key={`${index}-${text}`}>
          <button
            type="button"
            className="note-chip-t"
            onClick={() => {
              reopen(index);
              inputRef.current?.focus();
            }}
          >
            {text}
          </button>
          <button
            type="button"
            className="note-chip-x"
            onClick={() => remove(index)}
            aria-label={t.notes.composer.remove}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
      <div className="note-compose-row">
        <textarea
          id={id}
          ref={inputRef}
          className="note-compose-in"
          rows={1}
          value={input}
          placeholder={drafts.length ? t.notes.composer.another : t.notes.composer.placeholder}
          onChange={(e) => {
            setInput(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            // Enter commits, because a note is a sentence and the return key is the obvious
            // gesture; Shift+Enter still breaks a line inside one.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
              grow(inputRef.current);
            }
          }}
        />
        {/* Disabled only because a press could not work — an empty note is not a note
            (ADR-0150 §8: never disabled as a stand-in for a refusal). */}
        <button
          type="button"
          className="note-compose-add"
          onClick={() => {
            commit();
            grow(inputRef.current);
            inputRef.current?.focus();
          }}
          disabled={!input.trim()}
          aria-label={t.notes.composer.add}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
