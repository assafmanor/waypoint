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
  countNotesByCategory,
  noteGlyph,
  noteHost,
  NOTE_CATEGORY_ALL,
  sortNotes,
  visibleNotes,
  type NoteCategoryFilter,
} from '../lib/notes';
import { todayInTz } from '../lib/time';
import { useNoteHostWayIn } from '../state/note-host-nav';
import { NoteSheet, type NoteDraft } from './NoteSheet';
import { NoteManageSheet } from './NoteManageSheet';
import { NoteRow, useNoteReader } from './NoteRow';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { RevealList } from './primitives/RevealList';
import { SearchOverlay } from './primitives/SearchOverlay';
import { EmptyState } from './feedback';
import { EVENT_CATEGORY_OPTIONS } from '../lib/category-options';
import { t } from '../i18n/he';
import './notes.css';

export function IndexNotesView({ onClose }: { onClose: () => void }) {
  const { trip, notes, users, noteHosts, noteVerbs } = useTrip();
  // A finished trip's notes read and nothing writes one (ADR-0239 §4, owner: no post-trip
  // notes).
  const { mode, isFinished: finished } = useMode();
  const now = useClock();

  const [category, setCategory] = useState<NoteCategoryFilter>(NOTE_CATEGORY_ALL);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  // null = closed; 'create' = a new note; a Note = editing that one.
  const [sheet, setSheet] = useState<Note | 'create' | null>(null);
  const [manage, setManage] = useState<Note | null>(null);
  // The way in to a note's host, measured against the trip's own today (a day-scoped host
  // needs `?day=` unless it IS today).
  const wayIn = useNoteHostWayIn(todayInTz(trip.timezone, now));

  // The host lookup from trip-state's one index, not a second `buildNoteHosts` call: this
  // screen built it locally while it was the only reader, and that is exactly how the editor
  // ended up unable to state a category the row beside it already showed (ADR-0152 §5).
  const hosts = noteHosts;
  // **A row's tap opens it WHERE IT IS** (ADR-0153 §4's amendment, round two), or on its own
  // screen when it is too long for the list (ADR-0202 §2): `useNoteReader` holds both.
  const reader = useNoteReader({
    hosts,
    users,
    now,
    wayIn,
    onEdit: finished ? undefined : setSheet,
  });

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
    <NoteRow
      wayIn={wayIn}
      note={note}
      host={noteHost(note, hosts)}
      glyph={noteGlyph(note, hosts)}
      now={now}
      {...reader.rowProps(note)}
      onManage={finished ? undefined : setManage}
      onEdit={finished ? undefined : setSheet}
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
          action={
            finished
              ? undefined
              : { label: t.notes.empty.action, onClick: () => setSheet('create') }
          }
        />
      ) : (
        // Hidden (not merely covered) while search is open: SearchOverlay renders the same
        // rows in its own list, and leaving this mounted underneath duplicates every row
        // for assistive tech.
        !searchMode && (
          <>
            <div className="filter-row">
              {/* Worded, not `compact`: ADR-0153 §3 took this row from the
                  bookings screen with "no change", and `compact` is ADR-0122 §2's density
                  for a strip over the MAP, where the pin and the row badge already carry
                  the same glyph. Here the glyph stands alone, so a chip row of six emoji
                  is the one place in the app a category is unnamed (owner, 2026-08-21). */}
              <ChoiceGrid
                options={categoryOptions}
                value={activeCategory}
                onChange={setCategory}
                layout="pills"
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

            {!finished && (
              <button type="button" className="addbtn" onClick={() => setSheet('create')}>
                <Icon name="plus" /> {t.notes.add}
              </button>
            )}

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
          finished={finished}
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

      {reader.fullScreen}

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
