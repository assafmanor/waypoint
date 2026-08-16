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
// **And the common case costs nothing.** `＋` commits and clears, but you never have to
// press it: whatever is still in the input when the host is saved becomes a note too. So one
// note is type-and-save. `＋` exists only to start a second one.
//
// **Enter writes a NEWLINE; only `＋` commits** (owner's reversal 2026-08-07, ADR-0152 §6b
// amended in place — it used to read "`＋` (or Enter) commits"). A note is prose, so the key
// that ends a line inside one cannot also be the key that ends the note. This does not
// reopen the rejection below: the newline stays INSIDE one note and nothing splits on it.
//
// Rejected: one box split on blank lines — a note is a row, a paragraph break is not a user
// saying "these are two things", and it would leave editing one of them ambiguous forever.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export interface NoteComposerState {
  /** Notes committed in this form session, in order, not yet written anywhere. */
  drafts: string[];
  /** **Whether the box is on screen at all** (ADR-0192 §2's 2026-08-16 reversal). It starts
   *  CLOSED: the section's `＋ פתק` is what reveals it, so the notes section reads exactly like
   *  the tasks section beside it — a header with one way in — instead of a permanently open
   *  textarea that made the form look unfinished before anyone had typed. */
  open: boolean;
  input: string;
  setInput: (value: string) => void;
  commit: () => void;
  reopen: (index: number) => void;
  remove: (index: number) => void;
  /** Every note this form should write: the committed ones plus whatever is still in the
   *  box. The host's save calls this — which is what makes `＋` optional. */
  pending: () => string[];
  /** **The section's `＋ פתק`.** Commits whatever is in the box and opens a fresh one, so the
   *  one control both starts the first note and starts the next — which is why the box needs
   *  no `＋` of its own any more. */
  openNew: () => void;
  /** Whether this box owns its own `＋` — see `useNoteComposer`'s `standalone`. */
  standalone: boolean;
  /** Discard everything (after a successful save). */
  reset: () => void;
}

/** **`standalone` names the one condition both its effects follow from: nothing else on this
 *  surface offers a way in.** `DocumentUploadSheet` and `MapPlaceForm` caption the box with
 *  their own `Field` and have no notes SECTION, so there is no `＋ פתק` to reveal it and none
 *  to start a second note — the box therefore shows from the start and keeps its own `＋`.
 *  The host forms are the other case: their section header owns both jobs (ADR-0192 §2's
 *  2026-08-16 reversal), so the box starts closed and carries no button.
 *
 *  One flag rather than two, because the two behaviours are not independent — a surface that
 *  needs the box revealed for it also needs the way to start the next one. */
export function useNoteComposer(opts?: { standalone?: boolean }): NoteComposerState {
  const [drafts, setDrafts] = useState<string[]>([]);
  const standalone = opts?.standalone ?? false;
  const [open, setOpen] = useState(standalone);
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
    setOpen(true);
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

  const openNew = useCallback(() => {
    commit();
    setOpen(true);
  }, [commit]);

  const reset = useCallback(() => {
    setDrafts([]);
    setInput('');
    setOpen(standalone);
  }, [standalone]);

  return {
    drafts,
    open,
    standalone,
    input,
    setInput,
    commit,
    reopen,
    remove,
    pending,
    openNew,
    reset,
  };
}

export function NoteComposer({ state, id }: { state: NoteComposerState; id: string }) {
  const { drafts, open, standalone, input, setInput, commit, reopen, remove } = state;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // **Focus when the box is REVEALED, never when it is merely present** — and `autoFocus`
  // cannot tell those apart, which is why it is not used here. `MapPlaceForm` and
  // `DocumentUploadSheet` open with the box already showing (`startOpen`), and a card that
  // raises the keyboard on arrival is the exact wrong default `frontend/CLAUDE.md` records
  // for that surface; a spec pins it. Keying the effect on a false→true transition gives the
  // press its focus and gives the always-open surfaces none.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) inputRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

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
      {/* **THE BOX IS REVEALED, NOT PERMANENT** (ADR-0192 §2's 2026-08-16 reversal, owner:
          _"notes looks really bad, they should look and behave the same as tasks (+ פתק)"_ and
          _"clicking the + פתק should open a new inline task, not the entire form"_). The
          section's `＋ פתק` is the one way in, exactly as `＋ משימה` is next door — and it
          opens THIS box rather than `NoteSheet`, which is the half that keeps ADR-0152 §6b's
          promise that a note is written on the way.

          It also retires the box's own `＋`. One control cannot sit in the header and again
          six pixels below it: `openNew` commits what is here and opens a fresh one, so the
          same press starts the first note and the next.

          **The `Field` shell is HERE, not at the host.** `.field textarea` owns this box's
          border, padding and `min-height: 56px`, and the first build of §2 dropped the wrapper
          at the call site — the textarea rendered as a bare line and the owner's report was
          that it "looks really bad". A shell a host has to remember is a shell a host forgets;
          it lives inside the component that needs it now. */}
      {open && (
        <div className="field">
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
              // No key commits: Enter is the textarea's own newline (see the header), and the
              // box grows through `onChange` like any other keystroke.
            />
            {/* **Only where nothing else can start the next note** (see `standalone`). Disabled
              solely because a press could not work — an empty note is not a note (ADR-0150 §8:
              never disabled as a stand-in for a refusal). */}
            {standalone && (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
