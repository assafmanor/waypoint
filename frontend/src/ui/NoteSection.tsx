// **Where a note's BODY lives** (ADR-0152 §6): a note is a mark on a row and a body in the
// detail surface, so this is a section of the surface the host already has — never a new
// screen and never a sixth surface.
//
// One of ADR-0153 §8's four entrances to the same destination, alongside the row menu, the
// `＋ פתק` control it carries, and the notes screen. The mark itself is not one: at ~16px
// against a 44px floor, widening its target would put it in competition with opening the
// row it sits in.
//
// **A line here does not clamp** — it never has — so a note is already whole on this surface,
// and opening one adds no words. That is exactly why the tap opens the FOOT and nothing else
// (ADR-0153 §4's amendment, round two): the only thing missing from a note you can already
// read is the verb. And the foot carries no way in to the host, because this surface IS the
// host. (The notes SCREEN is the other case: its rows clamp to two lines, so opening there
// lifts the clamp as well.)
import { useState } from 'react';
import type { Note, User } from '@waypoint/shared';
import { noteTitleText, noteWhen } from '../lib/notes';
import { NoteOpenFoot } from './NoteOpenFoot';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './notes.css';

export function NoteSection({
  notes,
  users,
  now,
  onAdd,
  onEdit,
  inheritedFrom,
}: {
  /** This host's notes, already filtered and in the order they should read. */
  notes: Note[];
  users: User[];
  now: Date;
  /** Absent when the surface has its own way in — the host FORM carries a composer that
   *  rides its save (ADR-0152 §6b), and two add paths on one screen is one too many. */
  onAdd?: () => void;
  /** **Where a note this surface did not author came from** (ADR-0172 §9's amendment) —
   *  answered per note, so only the INHERITED ones are marked and the surface's own stay
   *  plain. Absent everywhere but a place, which is the one host that displays a context it
   *  is not a member of. Costs 2px per note: it rides the meta line that already carries the
   *  author and the elapsed time, and opens no new line. */
  inheritedFrom?: (note: Note) => string | undefined;
  /** The one verb an open note offers here. Reached by tapping the note and then `עריכה`,
   *  so nobody lands in a form by reaching for a sentence. */
  onEdit: (note: Note) => void;
}) {
  // Which note is open, if any. Local: it is the state of this rendering, and no host has
  // any reason to know or to persist it.
  const [openId, setOpenId] = useState<string | null>(null);

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
      {/* The list is its own element so a host that must BOUND this section can make the
          list — and only the list — the scrolling part, with the header above it pinned
          (the Map's place card, ADR-0148 §1's grammar). Everywhere else it is a plain
          block and costs nothing. */}
      <div className="note-sec-list">
        {notes.length === 0 ? (
          <p className="note-item-m">{t.notes.section.empty}</p>
        ) : (
          notes.map((note) => (
            <div className={'note-item' + (openId === note.id ? ' is-open' : '')} key={note.id}>
              {/* The shared leading cell (ADR-0191 §5, reversed). Empty here: a note's leading
                  element is the rule `.note-item-lead::before` paints, where a task's is its
                  tick. Both texts then start at `--sec-lead`. */}
              <span className="note-item-lead" aria-hidden="true" />
              <span className="note-item-main">
                <button
                  type="button"
                  className="note-item-b"
                  onClick={() => setOpenId((current) => (current === note.id ? null : note.id))}
                >
                  {/* **A titled note shows its title AND its body** (ADR-0152 §6's 2026-08-16
                      amendment). `noteTitleText` is `title || body`, so until now a note with
                      both showed only its title HERE — and since the notes screen printed the
                      body into a meta line that collapses newlines, a long structured note had
                      no surface at all that rendered it as written. This one does: a line here
                      does not clamp, and `.note-item-b` already carries `white-space: pre-wrap`,
                      so the breaks the author typed to make it readable land whole.
                      `noteTitleText` still answers the untitled cases, including the url-only
                      fallback it is the only holder of. */}
                  {note.title && <span className="note-item-t">{note.title}</span>}
                  {note.title ? note.body : noteTitleText(note)}
                </button>
                <span className="note-item-m">
                  {[
                    users.find((u) => u.id === note.createdBy)?.displayName,
                    noteWhen(note.createdAt, now.getTime()),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {inheritedFrom?.(note) && (
                    <span className="note-from">{inheritedFrom(note)}</span>
                  )}
                </span>
                {openId === note.id && (
                  <NoteOpenFoot
                    url={note.url}
                    urlIsTheTitle={!note.title && !note.body}
                    onEdit={() => onEdit(note)}
                  />
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
