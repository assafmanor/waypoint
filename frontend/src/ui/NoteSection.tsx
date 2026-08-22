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
//
// **Not clamping is also what makes this one of the two surfaces that can SHAPE a note**
// (ADR-0202 §6) — a pasted heading and list read as a heading and a list here, at the dense
// density, because there is no two-line budget to spend on markers.
//
// One caveat worth stating rather than discovering: `.note-item-b` is a `<button>`, and
// `NoteProse` puts block elements inside it. React builds that with DOM calls rather than the
// HTML parser, so nothing is reparented (the failure ADR-0160 §4 measured needs a nested
// *interactive* element, which is exactly why the prose renders its links as plain text here).
// It is still phrasing-only by the content model, and the accessible name flattens — which it
// already did, since this button has always held the note's whole body as text. What the
// shaping must not do is add a tab stop inside a tap target, and `anchors={false}` is what
// guarantees it.
import { useState, type ReactNode } from 'react';
import type { Note, User } from '@waypoint/shared';
import { noteTitleText, noteWhen } from '../lib/notes';
import { NoteOpenFoot } from './NoteOpenFoot';
import { NoteProse } from './NoteProse';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './section-head.css';
import './notes.css';

export function NoteSection({
  notes,
  users,
  now,
  onAdd,
  onEdit,
  onOpenFull,
  inheritedFrom,
  compose,
  composeActive,
  composeHint,
}: {
  /** This host's notes, already filtered and in the order they should read. */
  notes: Note[];
  users: User[];
  now: Date;
  /** The section's one way in. On a read surface it opens `NoteSheet`; on a host FORM it
   *  reveals the inline box below (`compose`) — same control, same words, and in both cases
   *  the ONLY add path on the surface (ADR-0192 §2's 2026-08-16 reversal). It used to be
   *  absent on a form, which is what left the box permanently open and the header without the
   *  `＋ פתק` the tasks section beside it has. */
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
  /** **Read this note on its own screen** (ADR-0202 §1). The section is one of the two
   *  surfaces a note opens on, and the foot is the only half of either that can hold a tap
   *  target — so the way in is the same control here as on the notes screen, which is the
   *  whole reason that candidate won.
   *
   *  A callback rather than this component owning the overlay, because it stays
   *  presentational: the screen needs the resolved host and the trip's users, and `HostNotes`
   *  is the connected half that already has both. */
  onOpenFull?: (note: Note) => void;
  /** **The composer, as this section's LAST ROW** (ADR-0192 §2) — on a host's own form, where
   *  a note is written on the way (ADR-0152 §6b) rather than through `NoteSheet`. `onAdd` is
   *  what reveals it there, so the two props are partners on a form rather than alternatives.
   *
   *  It is a slot rather than a second component because the alternative is what shipped: the
   *  form rendered this section for the existing notes and then a separate `Field` around the
   *  composer, so on an EDIT the word `פתקים` appeared twice in a row — which is the only
   *  reason `t.notes.composer.labelMore` ever existed, and it retires with this.
   *
   *  It also answers the empty state. A section with a composer is never empty in the sense
   *  `אין פתקים על זה` means: the box below IS the invitation, so saying "there are none"
   *  above it states the obvious and costs a line. Same argument `DocumentAttachField` already
   *  makes for its single control (ADR-0174 §5). */
  compose?: ReactNode;
  /** **Whether that box is actually showing anything right now** — open, or holding notes
   *  typed but not yet saved. It decides the empty line rather than `compose` doing it,
   *  because `compose` is a node that is truthy even on the render where it draws nothing.
   *
   *  With the box closed the section reads exactly like the tasks section beside it: a header,
   *  `＋ פתק`, and `אין פתקים על זה`. With it open that line would sit above the box inviting
   *  you to write the note it says you do not have. */
  composeActive?: boolean;
  /** What the composer inherits, said once under it. A plain caption, not a `Field` hint —
   *  the `Field` is gone. */
  composeHint?: string;
}) {
  // Which note is open, if any. Local: it is the state of this rendering, and no host has
  // any reason to know or to persist it.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="note-sec">
      <div className="sec-h">
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
          // The open box is the empty state where there is one — see `composeActive`.
          composeActive ? null : (
            <p className="note-item-m">{t.notes.section.empty}</p>
          )
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
                      no surface at all that rendered it as written.

                      **And the body is now SHAPED** (ADR-0202 §6): this surface never clamped,
                      so it is one of the two where a pasted heading and list can read as a
                      heading and a list. `anchors={false}` because this whole element is a
                      `<button>` — an `<a>` cannot nest inside one, and ADR-0153 §8 refused a
                      second tap target inside a row's one open target anyway. It is also why
                      `pre-wrap` is no longer what carries the newlines here: the parser keeps
                      them and `NoteProse` renders them as breaks.

                      `noteTitleText` still answers the untitled url-only case, which it is the
                      only holder of. */}
                  {note.title && <span className="note-item-t">{note.title}</span>}
                  {note.body ? (
                    <NoteProse body={note.body} dense anchors={false} />
                  ) : (
                    // **Only when there is no title either.** The first draft of this fell
                    // through to `noteTitleText` whenever the body was empty, and that
                    // function is `title || body || prettyUrl(url)` — so a titled note with
                    // no body printed its title twice, one line apart. Caught by
                    // `HostNotes.test.tsx`, which is what that spec is for.
                    !note.title && noteTitleText(note)
                  )}
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
                    // The surface IS the host, so the foot says nothing about where this
                    // belongs — rather than saying `פתק כללי`, which is what it used to do
                    // here and was false on every hosted note (ADR-0202's build).
                    onHostSurface
                    onView={onOpenFull ? () => onOpenFull(note) : undefined}
                    onEdit={() => onEdit(note)}
                  />
                )}
              </span>
            </div>
          ))
        )}
        {compose}
        {composeActive && composeHint && <p className="note-item-m">{composeHint}</p>}
      </div>
    </div>
  );
}
