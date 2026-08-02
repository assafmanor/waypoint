// **Where a note's BODY lives** (ADR-0152 §6): a note is a mark on a row and a body in the
// detail surface, so this is a section of the surface the host already has — never a new
// screen and never a sixth surface.
//
// One of ADR-0153 §8's four entrances to the same destination, alongside the row menu, the
// `＋ פתק` control it carries, and the notes screen. The mark itself is not one: at ~16px
// against a 44px floor, widening its target would put it in competition with opening the
// row it sits in.
import type { Note, User } from '@waypoint/shared';
import { noteWhen } from '../lib/notes';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export function NoteSection({
  notes,
  users,
  now,
  onAdd,
  onOpen,
}: {
  /** This host's notes, already filtered and in the order they should read. */
  notes: Note[];
  users: User[];
  now: Date;
  /** Absent when the surface has its own way in — the host FORM carries a composer that
   *  rides its save (ADR-0152 §6b), and two add paths on one screen is one too many. */
  onAdd?: () => void;
  /** Tapping a note opens it to READ — the line here clamps, so this is the way to the
   *  whole thing; the editor is a press inside that (ADR-0153 §4's amendment). */
  onOpen: (note: Note) => void;
}) {
  return (
    <div className="note-sec">
      <div className="note-sec-h">
        <span className="t">
          <Icon name="clipboard" /> {t.notes.section.title}
        </span>
        {onAdd && (
          <button type="button" className="add" onClick={onAdd}>
            <Icon name="plus" /> {t.notes.section.add}
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="note-item-m">{t.notes.section.empty}</p>
      ) : (
        notes.map((note) => (
          <div className="note-item" key={note.id}>
            <button type="button" className="note-item-b" onClick={() => onOpen(note)}>
              {note.title ? note.title : (note.body ?? note.url)}
            </button>
            <span className="note-item-m">
              {[
                users.find((u) => u.id === note.createdBy)?.displayName,
                noteWhen(note.createdAt, now.getTime()),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
