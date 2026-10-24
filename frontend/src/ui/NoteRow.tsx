// **One note as a row, and the two ways it opens** (ADR-0153 §4, ADR-0202). Shared by the
// Index's notes screen and the memory Home's journal (ADR-0240 §4, epic 4.6): the journal is the
// same notes read in day order, so it reads them through the same row rather than a second one.
import { useState, type ReactNode } from 'react';
import type { Note, User } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import {
  noteReadsFullScreen,
  noteTitleText,
  noteWhen,
  noteHost,
  type NoteHostRef,
} from '../lib/notes';
import { ltrIsolate } from '../lib/bidi';
import { prettyUrl } from '../lib/external-url';
import { flattenNoteMarkdown } from '../lib/note-markdown';
import { useHoldToOpen } from '../lib/useHoldToOpen';
import type { NoteHostWayIn } from '../state/note-host-nav';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { NoteOpenFoot } from './NoteOpenFoot';
import { NoteFullScreen } from './NoteFullScreen';
import { Icon } from './Icon';
import { ListRow } from './domain';
import { NOTE_HOST_ICON } from '../constants';
import { t } from '../i18n/he';
import './notes.css';

/**
 * **A tap means "read this", and the app decides where** (ADR-0202 §9c): a short note lifts its
 * clamp where it sits, one too long for a list opens on its own screen. The decision lives here
 * because it is about the two containers, not about any one list, so every list of notes makes
 * it the same way.
 */
export function useNoteReader({
  hosts,
  users,
  now,
  wayIn,
  onEdit,
}: {
  hosts: Map<string, NoteHostRef>;
  users: User[];
  now: Date;
  wayIn: NoteHostWayIn;
  /** Absent on a finished trip (ADR-0239 §4). */
  onEdit?: (note: Note) => void;
}): {
  rowProps: (note: Note) => { open: boolean; onToggle: () => void; onView: () => void };
  fullScreen: ReactNode;
} {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reading, setReading] = useState<Note | null>(null);
  const readingHost = reading ? noteHost(reading, hosts) : undefined;
  return {
    rowProps: (note) => ({
      open: openId === note.id,
      onToggle: () =>
        noteReadsFullScreen(note)
          ? setReading(note)
          : setOpenId((current) => (current === note.id ? null : note.id)),
      onView: () => setReading(note),
    }),
    // `Modal variant="full"` registers as the topmost overlay, so one back returns to the list
    // with the row still open.
    fullScreen: reading && (
      <NoteFullScreen
        note={reading}
        host={readingHost}
        users={users}
        now={now}
        onGoToHost={wayIn.canReach(readingHost) ? () => wayIn.goTo(readingHost!) : undefined}
        onEdit={
          onEdit &&
          (() => {
            setReading(null);
            onEdit(reading);
          })
        }
        onClose={() => setReading(null)}
      />
    ),
  };
}

/** One note row (ADR-0153 §4). Seven facts wanted a place and a phone row holds three:
 *  the badge is the resolved CATEGORY glyph, the title line is the note's own words, the
 *  meta is the host chip then author · when, and the trailing slot is a link mark when
 *  there is a url. Dropped on purpose: the category as a WORD (the glyph says it) and the
 *  author's avatar (a second identity system per row, serving no decision made here). */
export function NoteRow({
  note,
  host,
  glyph,
  now,
  wayIn,
  open,
  onToggle,
  onView,
  onEdit,
  onManage,
}: {
  note: Note;
  host?: NoteHostRef;
  glyph: string;
  now: Date;
  /** Whether this note's host can be reached, and how (ADR-0153 §8's amendment). */
  wayIn: NoteHostWayIn;
  /** Expanded: the title line's two-line clamp is off and the foot is under it. */
  open: boolean;
  onToggle: () => void;
  /** Open this note on its own screen (ADR-0202 §1). */
  onView: () => void;
  /** Both absent on a finished trip (ADR-0239 §4). */
  onEdit?: (note: Note) => void;
  onManage?: (note: Note) => void;
}) {
  const { users } = useTrip();
  const unsynced = useUnsynced(note.id);
  // **A hold opens the full screen from the row as it stands** (ADR-0202's amendment) —
  // collapsed or open, so a long note no longer has to be expanded and scrolled past to reach
  // its own screen. The foot's control stays: this is the shortcut, that is the way in.
  const hold = useHoldToOpen(onView);
  const author = users.find((u) => u.id === note.createdBy)?.displayName;

  // **A note with a title AND a body shows both, and the body is a line of its OWN**
  // (ADR-0153 §4's 2026-08-16 amendment). It used to drop into the meta line, which is
  // where the owner's two reports came from and they were one defect: `.wp-listrow-meta`
  // is a shared `ListRow` class with neither a clamp nor a `white-space`, so a CLOSED row
  // printed the whole body at meta size, and the line breaks the author typed to make a
  // long note readable collapsed to spaces. §4's rule was never wrong — printing the body
  // twice is still refused — but "do not repeat it" never meant "put it in the meta line".
  //
  // `.note-body-line` is the element a body-only note already uses: it clamps to two, it
  // honours the composer's newlines, and it unclamps when the row opens. So both shapes of
  // note now read through one element, and the body's structure survives on every surface
  // that shows it.
  // **The markers come OFF on this surface** (ADR-0202 §6). The row clamps to two lines, and
  // `## מסעדות` inside a two-line preview is noise where the words under it are what the
  // reader is scanning for. It costs the row nothing — the clamp fixes the height either way,
  // measured at 99.4px flat against 99.4px raw — and it keeps the authored newlines, which is
  // the 2026-08-16 defect it must not undo.
  const preview = flattenNoteMarkdown(note.body ?? '');
  const titleLine = note.title ? (
    <>
      <span>{note.title}</span>
      {note.body && <span className="note-body-line">{preview}</span>}
    </>
  ) : note.body ? (
    <span className="note-body-line">{preview}</span>
  ) : (
    // A url-only note's title line IS the url, as an LTR island inside the RTL row —
    // `ltrIsolate`, never `dir="ltr"` on a non-input (ADR-0118). `prettyUrl`, not the raw
    // string: a share link is mostly a tracking token, and this is the row's whole title.
    <span className="note-url-line">{ltrIsolate(prettyUrl(note.url))}</span>
  );

  const meta = (
    <>
      {host && (
        <>
          <span className="note-host">
            <Icon name={NOTE_HOST_ICON[host.kind]} />
            <span className="note-host-n">{host.name}</span>
          </span>{' '}
        </>
      )}
      {author ? `${author} · ` : ''}
      {noteWhen(note.createdAt, now.getTime())}
    </>
  );

  const reachable = wayIn.canReach(host);

  return (
    <>
      <ListRow
        className={'note-row' + (open ? ' is-open' : '')}
        icon={glyph}
        onOpen={onToggle}
        hold={hold}
        openLabel={noteTitleText(note)}
        title={titleLine}
        meta={meta}
        right={
          note.url && (note.title || note.body) ? (
            <span className="note-link-mark">
              <Icon name="link" />
            </span>
          ) : undefined
        }
        sync={<EntitySyncBadge id={note.id} />}
        unsynced={unsynced}
        onManage={onManage && (() => onManage(note))}
        manageLabel={t.notes.manage.actions}
      />
      {/* The row's SIBLING, not a prop on it: `ListRow` is shared with bookings, documents
          and members, and none of them has anything to expand. The list card is what holds
          them together, so the open note joins it there. */}
      {open && (
        <NoteOpenFoot
          host={host}
          url={note.url}
          urlIsTheTitle={!note.title && !note.body}
          onGoToHost={reachable ? () => wayIn.goTo(host!) : undefined}
          onView={onView}
          onEdit={onEdit && (() => onEdit(note))}
        />
      )}
    </>
  );
}
