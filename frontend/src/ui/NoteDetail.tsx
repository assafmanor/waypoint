// **The preview a note row's tap opens** (ADR-0153 §4's 2026-08-02 amendment).
//
// Until now that tap opened the EDITOR, which is the wrong answer to "what does this say":
// the row clamps to two lines, so a long note could not be read at all without entering a
// form — and entering a form to read is both a risk (an accidental edit) and the wrong
// posture. This is the same mistake the event's notes made in the `⋯` menu, one surface
// over: **a reader was being sent into an author's surface.**
//
// It is `BookingDetail`'s grammar rather than a new shape (ADR-0053): a read-only sheet, an
// edit as the one visible action, and the destructive verb left on the row's `⋯` — a delete
// does not belong on a surface an ordinary tap opens.
//
// **Both tap surfaces, not just the screen.** A host's own note section (`HostNotes`) clamps
// its lines exactly as the screen's rows do, so it opens this too. One rule — a note's tap
// reads it — rather than the screen reading and the five host surfaces editing.
//
// **What the head says is a rule, not a layout.** The note's words are the CONTENT, so they
// are never also its heading — printing both is the same sentence twice, the failure
// ADR-0153 §4 already names for the row. An untitled note's head is the noun `פתק`; its
// words read below it, in full and unclamped, which is the entire reason this surface exists.
import type { Note, User } from '@waypoint/shared';
import { noteWhen, type NoteHostRef } from '../lib/notes';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { ltrIsolate } from '../lib/bidi';
import { t } from '../i18n/he';
import './notes.css';

export function NoteDetail({
  note,
  host,
  glyph,
  users,
  now,
  onEdit,
  onClose,
}: {
  note: Note;
  /** Resolved, never copied (ADR-0152 §5) — absent for a general note. */
  host?: NoteHostRef;
  /** The resolved category glyph, the same one the row's badge showed, so the preview is
   *  visibly the row you tapped. */
  glyph: string;
  users: User[];
  now: Date;
  onEdit: () => void;
  onClose: () => void;
}) {
  const author = users.find((user) => user.id === note.createdBy)?.displayName;
  const title = note.title?.trim() || t.notes.one;

  return (
    <Sheet ariaLabel={title} onClose={onClose}>
      <div className="bk-detail">
        <div className="bk-actions">
          <button type="button" className="bk-edit" onClick={onEdit}>
            <Icon name="edit" /> {t.notes.preview.edit}
          </button>
        </div>

        <div className="bk-head">
          <div className="bk-badge">{glyph}</div>
          <div className="bk-headtext">
            <div className="bk-title">{title}</div>
            {/* The host appears exactly ONCE, here — the mockup's first draft also put it in
                a fact below and it stuttered on every untitled hosted note. */}
            <div className="bk-type">{host ? host.name : t.notes.preview.general}</div>
          </div>
        </div>

        {/* Unclamped, and `pre-wrap`, because this is the surface that exists to show the
            whole thing — the row above it is the one that summarises. */}
        {note.body && <p className="note-read">{note.body}</p>}

        {note.url && (
          <p className="note-read">
            {/* An LTR island inside an RTL sheet via `ltrIsolate`, never `dir="ltr"`, which
                would lay the whole line out left-to-right (ADR-0118). */}
            <a
              className="note-read-url"
              href={note.url}
              target="_blank"
              rel="noopener noreferrer"
              title={t.notes.preview.openLink}
            >
              <Icon name="link" /> {ltrIsolate(note.url)}
            </a>
          </p>
        )}

        <div className="bk-facts">
          <div className="bk-fact">
            <span className="bk-fact-k">{t.notes.preview.written}</span>
            <span className="bk-fact-v">
              {author
                ? t.notes.preview.by(author, noteWhen(note.createdAt, now.getTime()))
                : noteWhen(note.createdAt, now.getTime())}
            </span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
