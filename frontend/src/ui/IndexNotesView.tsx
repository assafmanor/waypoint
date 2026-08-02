// The Index's dedicated notes screen (ADR-0153) — local view state inside Index.tsx like
// the bookings and documents screens, not a route (ADR-0098 §5), registering as the topmost
// overlay so one back returns to the landing before the tab → Home rule.
//
// **The screen is FLAT and ordered by recency, with no grouping at all** (§2). There are two
// jobs here: "what do we know?" (browsing) and "what did we say about the hotel?" (a targeted
// lookup) — and the second is not this screen's job, it is answered on the hotel's own row.
// Grouping here would rebuild, 28 times and worse, what every host surface already does.
// The **absence** of a host chip is the whole signal that a note is general, which is also
// why the chip row needs no second axis: `ChoiceGrid` is single-select, so a "general" chip
// beside the category chips would make "food AND general" unaskable.
//
// **No past-collapse** (§3), deliberately, unlike the bookings screen next door: a booking
// that has happened is finished, but a note on a past event has not passed. "There are no
// bins on the street" is written on day two and true on day ten.
import { useMemo, useState } from 'react';
import type { Note } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useClock } from '../lib/useClock';
import { useBackLayer, type BackResult } from '../state/nav-state';
import { countVisible } from '../lib/filter-reveal';
import {
  buildNoteHosts,
  countNotesByCategory,
  noteGlyph,
  noteHost,
  noteTitleText,
  noteWhen,
  NOTE_CATEGORY_ALL,
  sortNotes,
  visibleNotes,
  type NoteCategoryFilter,
  type NoteHostRef,
} from '../lib/notes';
import { ltrIsolate } from '../lib/bidi';
import { todayInTz } from '../lib/time';
import { useNoteHostWayIn, type NoteHostWayIn } from '../state/note-host-nav';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { NoteSheet, type NoteDraft } from './NoteSheet';
import { NoteManageSheet } from './NoteManageSheet';
import { NoteOpenFoot } from './NoteOpenFoot';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { ListRow } from './domain';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { RevealList } from './primitives/RevealList';
import { SearchOverlay } from './primitives/SearchOverlay';
import { EmptyState } from './feedback';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { NOTE_HOST_ICON } from '../constants';
import { t } from '../i18n/he';
import './notes.css';

export function IndexNotesView({ onClose }: { onClose: () => void }) {
  const { trip, notes, events, bookings, places, maybeItems, documents, noteVerbs } = useTrip();
  const { mode } = useMode();
  const now = useClock();

  const [category, setCategory] = useState<NoteCategoryFilter>(NOTE_CATEGORY_ALL);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  // null = closed; 'create' = a new note; a Note = editing that one.
  const [sheet, setSheet] = useState<Note | 'create' | null>(null);
  const [manage, setManage] = useState<Note | null>(null);
  // **A row's tap opens it WHERE IT IS** (ADR-0153 §4's amendment, round two): the row's
  // two-line clamp lifts and one foot line appears under it. No sheet, no scrim, and the
  // list you were reading stays exactly where it was.
  const [openId, setOpenId] = useState<string | null>(null);
  // The way in to a note's host, measured against the trip's own today (a day-scoped host
  // needs `?day=` unless it IS today).
  const wayIn = useNoteHostWayIn(todayInTz(trip.timezone, now));

  // The host lookup, built once per source change rather than per row: every note's badge,
  // chip, chip-count and filter position needs its host resolved (ADR-0152 §5's amendment).
  const hosts = useMemo(
    () => buildNoteHosts({ events, bookings, places, maybeItems, documents }),
    [events, bookings, places, maybeItems, documents],
  );

  const ordered = useMemo(() => sortNotes(notes), [notes]);
  const categoryCounts = useMemo(() => countNotesByCategory(ordered, hosts), [ordered, hosts]);

  // A chip whose last note was deleted (or recategorised out from under a still-selected
  // filter) falls back to "all" rather than filtering against a chip that is no longer
  // shown — derived, not a reset effect (ADR-0101).
  const activeCategory: NoteCategoryFilter =
    category !== NOTE_CATEGORY_ALL && categoryCounts[category] === 0 ? NOTE_CATEGORY_ALL : category;

  // Back peels the category filter first (ADR-0102): a filtered screen is not ready to
  // leave, it is ready to show everything again. `remainsActive` keeps the screen
  // registered so the NEXT back peels here again rather than leaking past it (ADR-0103).
  const backOrResetCategory = (): BackResult => {
    if (activeCategory !== NOTE_CATEGORY_ALL) {
      setCategory(NOTE_CATEGORY_ALL);
      return { remainsActive: true };
    }
    onClose();
    return { remainsActive: false };
  };
  useBackLayer(backOrResetCategory);

  const visible = visibleNotes(ordered, hosts, activeCategory, query);
  const matchCount = countVisible(visible.rows);

  // Search always spans every category regardless of the chip (ADR-0102) — it is a
  // deliberate escape hatch from the current filter, not a continuation of it.
  const searchVisible = visibleNotes(ordered, hosts, NOTE_CATEGORY_ALL, query);
  const searchMatchCount = countVisible(searchVisible.rows);

  const closeSearch = () => {
    setSearchMode(false);
    setQuery('');
  };

  // Only categories that have a note get a chip (ADR-0101); "all" always does.
  const categoryOptions: Choice<NoteCategoryFilter>[] = [
    { value: NOTE_CATEGORY_ALL, icon: '', label: t.notes.filter.all, count: ordered.length },
    ...EVENT_CATEGORY_OPTIONS.filter((option) => categoryCounts[option.value] > 0).map(
      (option) => ({ ...option, count: categoryCounts[option.value] }),
    ),
  ];

  const saveNote = (draft: NoteDraft) => {
    const editing = sheet !== 'create' && sheet !== null ? sheet : null;
    setSheet(null);
    if (editing) void noteVerbs.updateNote(editing.id, draft);
    // A note written HERE is always general — there is no host picker in v1 (ADR-0153 §5).
    else void noteVerbs.createNote(draft);
  };

  const renderNote = (note: Note) => (
    <NoteLi
      wayIn={wayIn}
      note={note}
      host={noteHost(note, hosts)}
      glyph={noteGlyph(note, hosts)}
      now={now}
      open={openId === note.id}
      onManage={setManage}
      onToggle={() => setOpenId((current) => (current === note.id ? null : note.id))}
      onEdit={setSheet}
    />
  );
  const noteKey = (note: Note) => note.id;

  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.notes.title}
        onBack={backOrResetCategory}
        end={
          <span className="idx-head-count" dir="auto">
            {t.notes.head.count(notes.length)}
          </span>
        }
      />

      {notes.length === 0 ? (
        // "Nothing yet" teaches what belongs here and offers the action; "nothing matches"
        // below offers none, because the right control is already on screen — the chip.
        <EmptyState
          icon={<Icon name="clipboard" />}
          title={t.notes.empty.title}
          body={t.notes.empty.body}
          action={{ label: t.notes.empty.action, onClick: () => setSheet('create') }}
        />
      ) : (
        // Hidden (not merely covered) while search is open: SearchOverlay renders the same
        // rows in its own list, and leaving this mounted underneath duplicates every row
        // for assistive tech.
        !searchMode && (
          <>
            <div className="filter-row">
              <ChoiceGrid
                options={categoryOptions}
                value={activeCategory}
                onChange={setCategory}
                layout="pills"
                compact
                ariaLabel={t.notes.filter.categoryLabel}
              />
              <button
                type="button"
                className="search-icon-btn"
                aria-label={t.notes.search.button}
                onClick={() => setSearchMode(true)}
              >
                <Icon name="search" />
              </button>
            </div>

            <button type="button" className="addbtn" onClick={() => setSheet('create')}>
              <Icon name="plus" /> {t.notes.add}
            </button>

            {matchCount > 0 ? (
              <RevealList
                className="listcard"
                rows={visible.rows}
                getKey={noteKey}
                renderRow={renderNote}
              />
            ) : (
              <EmptyState icon={<Icon name="search" />} title={t.notes.filter.noResults} />
            )}
          </>
        )
      )}

      {searchMode && (
        <SearchOverlay
          title={t.notes.search.modeTitle}
          contextLabel={trip.name}
          mode={mode}
          query={query}
          onQueryChange={setQuery}
          placeholder={t.notes.search.placeholder}
          clearLabel={t.notes.search.clear}
          backAria={t.notes.search.backAria}
          onClose={closeSearch}
        >
          {/* Re-establishes the `.index` ancestor the scoped row/card rules expect —
              SearchOverlay portals to document.body, outside the real subtree. */}
          <div className="index">
            {searchMatchCount > 0 ? (
              <RevealList
                className="listcard"
                rows={searchVisible.rows}
                getKey={noteKey}
                renderRow={renderNote}
              />
            ) : (
              <EmptyState icon={<Icon name="search" />} title={t.notes.search.noResults} />
            )}
          </div>
        </SearchOverlay>
      )}

      {sheet && (
        <NoteSheet
          note={sheet === 'create' ? undefined : sheet}
          host={sheet === 'create' ? undefined : noteHost(sheet, hosts)}
          onSave={saveNote}
          onClose={() => setSheet(null)}
        />
      )}

      {manage && (
        <NoteManageSheet
          note={manage}
          host={noteHost(manage, hosts)}
          onEdit={() => {
            const note = manage;
            setManage(null);
            setSheet(note);
          }}
          onDelete={() => {
            const note = manage;
            setManage(null);
            void noteVerbs.deleteNote(note.id);
          }}
          onClose={() => setManage(null)}
        />
      )}
    </div>
  );
}

/** One note row (ADR-0153 §4). Seven facts wanted a place and a phone row holds three:
 *  the badge is the resolved CATEGORY glyph, the title line is the note's own words, the
 *  meta is the host chip then author · when, and the trailing slot is a link mark when
 *  there is a url. Dropped on purpose: the category as a WORD (the glyph says it) and the
 *  author's avatar (a second identity system per row, serving no decision made here). */
function NoteLi({
  note,
  host,
  glyph,
  now,
  wayIn,
  open,
  onToggle,
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
  onEdit: (note: Note) => void;
  onManage: (note: Note) => void;
}) {
  const { users } = useTrip();
  const unsynced = useUnsynced(note.id);
  const author = users.find((u) => u.id === note.createdBy)?.displayName;

  // A note with a title AND a body shows the title and DEMOTES the body to the meta line.
  // Printing both is the same sentence twice — the failure ADR-0151's tile amendment paid
  // for once already.
  const titleLine = note.title ? (
    note.title
  ) : note.body ? (
    <span className="note-body-line">{note.body}</span>
  ) : (
    // A url-only note's title line IS the url, as an LTR island inside the RTL row —
    // `ltrIsolate`, never `dir="ltr"` on a non-input (ADR-0118).
    <span className="note-url-line">{ltrIsolate(note.url ?? '')}</span>
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
      {note.title && note.body ? `${note.body} · ` : ''}
      {author ? `${author} · ` : ''}
      {noteWhen(note.createdAt, now.getTime())}
    </>
  );

  const reachable = wayIn.canReach(host);

  return (
    <>
      <ListRow
        className={open ? 'is-open' : undefined}
        icon={glyph}
        onOpen={onToggle}
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
        onManage={() => onManage(note)}
        manageLabel={t.notes.manage.actions}
      />
      {/* The row's SIBLING, not a prop on it: `ListRow` is shared with bookings, documents
          and members, and none of them has anything to expand. The list card is what holds
          them together, so the open note joins it there. */}
      {open && (
        <NoteOpenFoot
          host={host}
          url={note.url}
          onGoToHost={reachable ? () => wayIn.goTo(host!) : undefined}
          onEdit={() => onEdit(note)}
        />
      )}
    </>
  );
}
