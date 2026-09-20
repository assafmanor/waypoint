// **Where a note's BODY lives** (ADR-0152 §6): a note is a mark on a row and a body in the
// detail surface, so this is a section of the surface the host already has — never a new
// screen and never a sixth surface.
//
// One of ADR-0153 §8's four entrances to the same destination, alongside the row menu, the
// `＋ פתק` control it carries, and the notes screen. The mark itself is not one: at ~16px
// against a 44px floor, widening its target would put it in competition with opening the
// row it sits in.
//
// **A line here did not clamp until 2026-09-20, and now the BODY takes a box** (ADR-0235).
// The rule above it is unchanged and is what the box is measured against: a note that fits
// its budget is whole on this surface, so opening it adds no words and the tap opens the FOOT
// and nothing else (ADR-0153 §4's amendment, round two). What changed is the other case — a
// note that does NOT fit used to be printed in full anyway, which took the reported booking
// sheet's section to 565px and is what the owner's screenshot was of.
//
// So there are two notes here, and they are told apart by a MEASUREMENT rather than by a
// character count (ADR-0235 §7, `lib/useIsClipped.ts`):
//
//   • it fits     → no clip, no control, tap opens the foot. Exactly as before.
//   • it is clipped → six lines and a fade, one `תצוגה מלאה` control under it, and the tap
//                     opens the full screen — which is where the app was already sending a
//                     long note's tap, so the control makes a shipped route visible rather
//                     than adding one.
//
// The measurement is what keeps those two from disagreeing. `noteReadsFullScreen` is a
// character estimate frozen at the 360px design width, so on a wider phone it can call a
// six-line note long; it stays in use on the notes SCREEN, where the clamp (two lines) and
// the threshold (eight) are genuinely two different numbers.
//
// **Shaping a note here is unchanged** (ADR-0202 §6, amended by ADR-0235 §6): at six lines a
// heading and a bullet are what make a preview legible, so the markers stay. §6's "a clamped
// surface gets its markers peeled" was reasoned from a TWO-line preview, where a marker costs
// a third of everything visible — the peel is a function of how small the budget is, not of
// whether there is one.
//
// One caveat worth stating rather than discovering: `.note-item-b` is a `<button>`, and
// `NoteProse` puts block elements inside it. React builds that with DOM calls rather than the
// HTML parser, so nothing is reparented (the failure ADR-0160 §4 measured needs a nested
// *interactive* element, which is exactly why the prose renders its links as plain text here).
// It is still phrasing-only by the content model, and the accessible name flattens — which it
// already did, since this button has always held the note's whole body as text. What the
// shaping must not do is add a tab stop inside a tap target, and `anchors={false}` is what
// guarantees it.
import { useRef, useState, type ReactNode } from 'react';
import type { Note, User } from '@waypoint/shared';
import { noteTitleText, noteWhen } from '../lib/notes';
import { NoteOpenFoot } from './NoteOpenFoot';
import { NoteProse } from './NoteProse';
import { useHoldToOpen } from '../lib/useHoldToOpen';
import { useIsClipped } from '../lib/useIsClipped';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './section-head.css';
import './domain/row-open.css';
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
  // **Which note the finger is on**, so one set of hold handlers can serve the whole list
  // rather than a hook per row. It stays shared even though ADR-0235 gave the row a
  // component of its own (`NoteItem` below): a hold means the same thing on every row, and
  // moving the hook inside would mount one timer per note to answer one question.
  const held = useRef<Note | null>(null);
  const hold = useHoldToOpen(
    onOpenFull ? () => held.current && onOpenFull(held.current) : undefined,
  );

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
            <NoteItem
              key={note.id}
              note={note}
              users={users}
              now={now}
              open={openId === note.id}
              inheritedFrom={inheritedFrom}
              onOpenFull={onOpenFull}
              onToggle={() => setOpenId((current) => (current === note.id ? null : note.id))}
              onEdit={() => onEdit(note)}
              hold={hold}
              onHeld={() => (held.current = note)}
            />
          ))
        )}
        {compose}
        {composeActive && composeHint && <p className="note-item-m">{composeHint}</p>}
      </div>
    </div>
  );
}

/** **One note's row, and the reason it is now a component** (ADR-0235). The section used to
 *  render this inline, and the file said a per-row component would be "a second component for
 *  one prop". The clip is what changed that arithmetic: measuring whether a box hid something
 *  needs a ref and a `useLayoutEffect` PER ROW, and a hook cannot be called inside `.map()`.
 *
 *  Presentational like its parent — every decision arrives as a prop, and the full screen it
 *  routes to is still `HostNotes`'s to mount. */
function NoteItem({
  note,
  users,
  now,
  open,
  inheritedFrom,
  onOpenFull,
  onToggle,
  onEdit,
  hold,
  onHeld,
}: {
  note: Note;
  users: User[];
  now: Date;
  open: boolean;
  inheritedFrom?: (note: Note) => string | undefined;
  onOpenFull?: (note: Note) => void;
  onToggle: () => void;
  onEdit: () => void;
  /** The section's shared hold handlers — see `held` above for why they are not per row. */
  hold: ReturnType<typeof useHoldToOpen>;
  onHeld: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  /** **Is the box hiding part of this note?** The one fact that decides both the control and
   *  where the tap goes, so the two cannot disagree (ADR-0235 §7). Measured, not estimated:
   *  `noteReadsFullScreen` counts characters at a frozen 360px, and on a wider phone that
   *  calls a six-line note long. jsdom has no layout and answers `false`, which is why the
   *  clipped behaviour is proven in the e2e suite rather than asserted here. */
  const clipped = useIsClipped(body, [note.body, note.title]);
  // A clipped note's tap goes where its words are; an unclipped one opens the foot, which is
  // ADR-0153 §4 unchanged — the only thing missing from a note you can already read is the
  // verb.
  const readsFull = clipped && !!onOpenFull;

  return (
    <div className={'note-item' + (open ? ' is-open' : '')}>
      {/* The shared leading cell (ADR-0191 §5, reversed). Empty here: a note's leading
          element is the rule `.note-item-lead::before` paints, where a task's is its tick.
          Both texts then start at `--sec-lead`. */}
      <span className="note-item-lead" aria-hidden="true" />
      <span className="note-item-main">
        <button
          type="button"
          className="note-item-b"
          // Same rule as the notes screen (ADR-0202 §9c), so one gesture does not mean two
          // different things on two surfaces.
          onClick={() => (readsFull ? onOpenFull?.(note) : onToggle())}
          {...hold}
          onPointerDown={(event) => {
            onHeld();
            hold.onPointerDown?.(event);
          }}
        >
          {/* **A titled note shows its title AND its body** (ADR-0152 §6's 2026-08-16
              amendment). `noteTitleText` is `title || body`, so until that change a note with
              both showed only its title here.

              **The title is outside the clip on purpose**: it is the one line that says what
              the note is, and a budget spent on it would buy nothing. `noteTitleText` still
              answers the untitled url-only case, which it is the only holder of. */}
          {note.title && <span className="note-item-t">{note.title}</span>}
          {note.body ? (
            // `anchors={false}` because this whole element is a `<button>` — an `<a>` cannot
            // nest inside one, and ADR-0153 §8 refused a second tap target inside a row's one
            // open target anyway.
            <NoteProse ref={body} className="note-clip" body={note.body} dense anchors={false} />
          ) : (
            // **Only when there is no title either.** The first draft of this fell through to
            // `noteTitleText` whenever the body was empty, and that function is
            // `title || body || prettyUrl(url)` — so a titled note with no body printed its
            // title twice, one line apart.
            !note.title && noteTitleText(note)
          )}
        </button>
        {/* **The way to the rest, and only where there IS a rest** (ADR-0235 §4). It is
            `.row-open-act` — the class the foot's own `תצוגה מלאה` wears — because it is the
            same verb going to the same screen, and `Icon name="frame"` is the glyph ADR-0202
            §1 already chose to mean "this opens as a full screen". */}
        {readsFull && (
          <button
            type="button"
            className="row-open-act note-more"
            onClick={() => onOpenFull?.(note)}
          >
            {t.notes.open.full}
            <Icon name="frame" />
          </button>
        )}
        <span className="note-item-m">
          {[
            users.find((u) => u.id === note.createdBy)?.displayName,
            noteWhen(note.createdAt, now.getTime()),
          ]
            .filter(Boolean)
            .join(' · ')}
          {inheritedFrom?.(note) && <span className="note-from">{inheritedFrom(note)}</span>}
        </span>
        {open && (
          <NoteOpenFoot
            url={note.url}
            urlIsTheTitle={!note.title && !note.body}
            // The surface IS the host, so the foot says nothing about where this belongs —
            // rather than saying `פתק כללי`, which is what it used to do here and was false
            // on every hosted note (ADR-0202 §7b).
            onHostSurface
            onView={onOpenFull ? () => onOpenFull(note) : undefined}
            onEdit={onEdit}
          />
        )}
      </span>
    </div>
  );
}
