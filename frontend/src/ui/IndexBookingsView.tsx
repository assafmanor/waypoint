// The Index's dedicated bookings screen (ADR-0098): local view state inside
// Index.tsx, not a route — mounted only while the landing's bookings tile is
// open. Registers as the topmost overlay (ADR-0098 §5) so one back/gesture/
// system-back returns to the landing before falling through to the normal
// tab → Home rule; a nested BookingDetail/BookingManageSheet/BookingSheet
// registers on top of that via its own Modal, so it closes first in turn.
import { useEffect, useMemo, useState } from 'react';
import { BOOKING_TYPE, type Booking, type Place } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { usePlaceErrandReturn, useShowPlaceOnMap } from '../state/map-scope-state';
import {
  bookingShowOnMap,
  eventDisplayZones,
  type ShowPlaceOnMap,
  type ZoneEvidence,
} from '../lib/places';
import { useMode } from '../state/mode-state';
import { useBackLayer, type BackResult } from '../state/nav-state';
import { useClock } from '../lib/useClock';
import {
  CATEGORY_ALL,
  countByCategory,
  scheduleParts,
  splitBookings,
  type BookingRow,
  type CategoryFilter,
  typeChipAddsMeaning,
  visibleRows,
} from '../lib/index-bookings';
import { countVisible } from '../lib/filter-reveal';
import { hostCountForContext, noteCountsByHost } from '../lib/notes';
import { openTaskCountsByHost } from '../lib/tasks';
import { useSettledHosts } from './HostTasks';
import { attachmentCountForContext, attachmentCountsByHost } from '../lib/attachments';
import { resolveHostContext } from '../lib/host-context';
import { bookingDurationUnit, formatBookingDuration } from '../lib/booking-timing';
import { badgeClassForBookingType } from '../lib/transitions';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { BOOKING_TYPE_ICON, chosenIcon } from '../constants';
import { BookingSheet, type BookingSheetDraft } from './BookingSheet';
import { BookingDetail } from './BookingDetail';
import { BookingManageSheet } from './BookingManageSheet';
import { BookingTitle } from './BookingTitle';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { HardLock } from './HardLock';
import { DocumentMark, ListRow, NoteMark, type BadgeTone, TaskMark } from './domain';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { Collapsible, CollapseToggle } from './primitives/Collapsible';
import { RevealList } from './primitives/RevealList';
import { SearchOverlay } from './primitives/SearchOverlay';
import { EmptyState } from './feedback';
import { t } from '../i18n/he';

export function IndexBookingsView({
  onClose,
  initialBookingId,
}: {
  onClose: () => void;
  /** From the Home quick-access deep-link (`?booking=<id>`, ADR-0050): opens
   *  that booking's detail on top of this screen once mounted. */
  initialBookingId?: string;
}) {
  const {
    trip,
    bookings,
    places,
    events,
    notes,
    documentAttachments,
    hostContexts,
    tasks,
    zoneEvidence,
  } = useTrip();
  const { mode } = useMode();
  // This screen is the Index's topmost overlay (ADR-0098 §5), so it closes before
  // the tab changes — the same ordering `BookingDetail` needs, one level out.
  const showPlaceOnMap = useShowPlaceOnMap();
  const now = useClock();
  // Built once per note-list change rather than filtered per row (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  // The third mark's tally (ADR-0191 §2) — OPEN tasks only, unlike the two beside it.
  const settledHosts = useSettledHosts();
  const taskCounts = useMemo(
    () => openTaskCountsByHost(tasks, settledHosts),
    [tasks, settledHosts],
  );
  // Its twin for attachments (ADR-0174 §1) — the count `lib/attachments.ts` shipped with
  // ADR-0173 and that nothing rendered.
  const docCounts = useMemo(
    () => attachmentCountsByHost(documentAttachments),
    [documentAttachments],
  );
  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());

  const [category, setCategory] = useState<CategoryFilter>(CATEGORY_ALL);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  // null = closed; 'create' = new booking; a Booking = editing that one.
  const [sheet, setSheet] = useState<Booking | 'create' | null>(null);
  // RE-OPENING AFTER A PLACE ERRAND (ADR-0134 §2), through the same shared hook every other
  // form host uses: without it the sheet returns closed and the rest of what was typed is
  // gone, which is the whole reason the errand carries a draft.
  const [bookingDraft, setBookingDraft] = useState<BookingSheetDraft | null>(null);
  usePlaceErrandReturn<BookingSheetDraft>('booking', 'index', (returned) => {
    if (!returned.draft) return;
    setSheet(bookings.find((b) => b.id === returned.target.id) ?? 'create');
    setBookingDraft(returned.draft);
  });

  const [detail, setDetail] = useState<Booking | null>(null);
  const [manage, setManage] = useState<Booking | null>(null);

  // Runs once against the id this screen was opened with — a fresh mount
  // handles the next deep-link (Index.tsx remounts this view per navigation).
  useEffect(() => {
    if (!initialBookingId) return;
    const target = bookings.find((b) => b.id === initialBookingId);
    if (target) setDetail(target);
  }, [initialBookingId]);

  const openDetail = (booking: Booking) => setDetail(booking);
  // `focus` rides along so the manage sheet's `שבץ במסלול` opens the form ON the
  // when-field (ADR-0138 §7); `ערוך` passes nothing and opens at the top.
  const [sheetFocus, setSheetFocus] = useState<'when' | undefined>(undefined);
  const editFrom = (booking: Booking, focus?: 'when') => {
    setDetail(null);
    setManage(null);
    setSheetFocus(focus);
    setSheet(booking);
  };

  const searching = query.trim().length > 0;
  const pastExpanded = showPast || searching;

  const categoryCounts = countByCategory(bookings);
  // A category chip whose booking got deleted/re-typed out from under a still-
  // selected filter falls back to "all" rather than filtering against a chip
  // that's no longer shown (ADR-0101) — derived, not a separate reset effect.
  const activeCategory: CategoryFilter =
    category !== CATEGORY_ALL && categoryCounts[category] === 0 ? CATEGORY_ALL : category;

  // Back peels the category filter first (ADR-0102) — a filtered screen isn't
  // ready to leave yet, it's ready to show everything again; only a clean "הכל"
  // state actually exits to the landing. As a repeatable back layer it returns
  // `remainsActive: true` on the reset, so the screen stays registered and the
  // NEXT system-back/Escape peels here again instead of leaking past the still-
  // mounted screen into the tab → Home rule (ADR-0103, the fix for the divergent
  // back). Wired to the visible arrow too, so tap and system-back behave alike.
  const backOrResetCategory = (): BackResult => {
    if (activeCategory !== CATEGORY_ALL) {
      setCategory(CATEGORY_ALL);
      return { remainsActive: true };
    }
    onClose();
    return { remainsActive: false };
  };
  useBackLayer(backOrResetCategory);

  const upcomingVisible = visibleRows(upcoming, activeCategory, query, places);
  const pastVisible = visibleRows(past, activeCategory, query, places, upcomingVisible.nextIndex);
  const upcomingMatchCount = countVisible(upcomingVisible.rows);
  const pastMatchCount = countVisible(pastVisible.rows);
  // "No active bookings right now" rather than "no matches" (ADR-0101) — fires
  // whenever there's nothing upcoming to show, whether from a filter/search or
  // simply because everything's already past; a `pastMatchHint` nudges toward
  // the (separately gated) past toggle when that's why the list looks empty.
  const noResults = upcomingMatchCount === 0;

  const openSearch = () => setSearchMode(true);
  const closeSearch = () => {
    setSearchMode(false);
    setQuery('');
  };

  // Search mode merges upcoming + past into one flat, live-filtered list (no
  // separate past collapse inside it — see `ui/primitives/SearchOverlay`), and
  // always searches every category regardless of whatever chip was selected
  // before opening it (ADR-0102) — search is a deliberate escape hatch from
  // the current filter, not a continuation of it.
  const searchRows = [...upcoming, ...past];
  const searchVisible = visibleRows(searchRows, CATEGORY_ALL, query, places);
  const searchMatchCount = countVisible(searchVisible.rows);

  // Zero-count booking types don't get a chip at all (ADR-0101) — "הכל" always
  // does. `countByCategory` still initializes every type to 0 so this filter
  // is the only place that decision is made.
  const categoryOptions: Choice<CategoryFilter>[] = [
    { value: CATEGORY_ALL, icon: '', label: t.index.filter.all, count: bookings.length },
    ...Object.values(BOOKING_TYPE)
      .filter((type) => categoryCounts[type] > 0)
      .map((type) => ({
        value: type,
        icon: BOOKING_TYPE_ICON[type],
        label: t.index.bookingType[type],
        count: categoryCounts[type],
      })),
  ];

  const createSeed = activeCategory !== CATEGORY_ALL ? { type: activeCategory } : undefined;

  // One row renderer for all three lists (upcoming, past, search) — they differ
  // only in which rows they hand the shared reveal (ADR-0120).
  const renderBooking = (row: BookingRow) => (
    <BookingLi
      row={row}
      places={places}
      zoneEvidence={zoneEvidence}
      now={now}
      onOpen={openDetail}
      onManage={setManage}
      notes={hostCountForContext(
        noteCounts,
        resolveHostContext(hostContexts, { kind: 'booking', id: row.booking.id }),
      )}
      documents={attachmentCountForContext(
        docCounts,
        resolveHostContext(hostContexts, { kind: 'booking', id: row.booking.id }),
      )}
      tasks={hostCountForContext(
        taskCounts,
        resolveHostContext(hostContexts, { kind: 'booking', id: row.booking.id }),
      )}
      showPlaceOnMap={showPlaceOnMap}
      onLeaveForMap={onClose}
    />
  );
  const bookingKey = (row: BookingRow) => row.booking.id;

  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.index.bookingsTitle}
        onBack={backOrResetCategory}
        end={
          <span className="idx-head-count" dir="auto">
            {t.index.head.count(bookings.length)}
          </span>
        }
      />

      {bookings.length === 0 ? (
        <div className="empty-card">
          <div className="ei">
            <Icon name="ticket" />
          </div>
          <div className="et">{t.index.emptyTitle}</div>
          <div className="es">{t.index.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setSheet('create')}>
            <Icon name="plus" /> {t.index.form.add}
          </button>
        </div>
      ) : (
        // Hidden (not just covered) while search mode is open — SearchOverlay
        // renders the same rows in its own merged list, and this content stays
        // mounted underneath the portal otherwise, duplicating every row for
        // assistive tech (and for any query that matches by accessible name).
        !searchMode && (
          <>
            <div className="filter-row">
              <ChoiceGrid
                options={categoryOptions}
                value={activeCategory}
                onChange={setCategory}
                layout="pills"
                ariaLabel={t.index.filter.categoryLabel}
              />
              <button
                type="button"
                className="search-icon-btn"
                aria-label={t.index.search.button}
                onClick={openSearch}
              >
                <Icon name="search" />
              </button>
            </div>

            <button type="button" className="addbtn" onClick={() => setSheet('create')}>
              <Icon name="plus" /> {t.index.form.add}
            </button>

            {upcomingMatchCount > 0 ? (
              <RevealList
                className="listcard"
                rows={upcomingVisible.rows}
                getKey={bookingKey}
                renderRow={renderBooking}
              />
            ) : (
              noResults && (
                <EmptyState
                  icon={<Icon name="search" />}
                  title={t.index.filter.noResultsTitle}
                  body={
                    pastMatchCount > 0 ? t.index.filter.pastMatchHint(pastMatchCount) : undefined
                  }
                />
              )
            )}

            {pastMatchCount > 0 && (
              <>
                <div className="sec-title idx-past-title">
                  <span className="sec-title-end">
                    <CollapseToggle
                      expanded={pastExpanded}
                      onToggle={() => setShowPast((v) => !v)}
                      expandLabel={t.index.pastToggle.show(pastMatchCount)}
                      collapseLabel={t.index.pastToggle.hide}
                      className="past-toggle"
                    />
                  </span>
                </div>
                <Collapsible expanded={pastExpanded}>
                  <RevealList
                    className="listcard past"
                    rows={pastVisible.rows}
                    getKey={bookingKey}
                    renderRow={renderBooking}
                  />
                </Collapsible>
              </>
            )}
          </>
        )
      )}

      {searchMode && (
        <SearchOverlay
          title={t.index.search.modeTitle}
          contextLabel={trip.name}
          mode={mode}
          query={query}
          onQueryChange={setQuery}
          placeholder={t.index.search.placeholder}
          clearLabel={t.index.search.clear}
          backAria={t.index.search.backAria}
          onClose={closeSearch}
        >
          {/* Re-establishes the `.index` ancestor the scoped row/card rules
              (screens.css) expect — SearchOverlay portals to document.body,
              outside the real `.index` DOM subtree. */}
          <div className="index">
            {searchMatchCount > 0 ? (
              <RevealList
                className="listcard"
                rows={searchVisible.rows}
                getKey={bookingKey}
                renderRow={renderBooking}
              />
            ) : (
              <EmptyState icon={<Icon name="search" />} title={t.index.filter.noResultsTitle} />
            )}
          </div>
        </SearchOverlay>
      )}

      {detail && (
        <BookingDetail
          booking={detail}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
          onEdit={editFrom}
        />
      )}
      {manage && (
        <BookingManageSheet booking={manage} onClose={() => setManage(null)} onEdit={editFrom} />
      )}
      {sheet && (
        <BookingSheet
          booking={sheet === 'create' ? null : sheet}
          seed={sheet === 'create' ? createSeed : undefined}
          draft={bookingDraft}
          focus={sheetFocus}
          onClose={() => {
            setSheet(null);
            setBookingDraft(null);
            setSheetFocus(undefined);
          }}
        />
      )}
    </div>
  );
}

function BookingLi({
  row,
  places,
  zoneEvidence,
  now,
  onOpen,
  onManage,
  notes,
  documents,
  tasks,
  showPlaceOnMap,
  onLeaveForMap,
}: {
  row: BookingRow;
  places: Place[];
  /** The row's clocks read in each event's OWN resolved zone (ADR-0107); this replaced the
   *  `Trip` prop, which the row only ever consulted for `timezone`. */
  zoneEvidence: ZoneEvidence;
  now: Date;
  onOpen: (booking: Booking) => void;
  onManage: (booking: Booking) => void;
  /** How many notes this booking carries (ADR-0152 §6): a mark on the row, never a body. */
  notes: number;
  /** …and how many documents (ADR-0174 §1). Two marks, not one combined "has content" glyph:
   *  a note is something someone wrote and a document is a file you may have to show at a
   *  border, and one silhouette cannot say which a tap will get you. */
  documents: number;
  /** OPEN tasks on this row's context — the third mark (ADR-0191). */
  tasks: number;
  showPlaceOnMap: ShowPlaceOnMap;
  /** Close this screen before the tab changes underneath it. */
  onLeaveForMap: () => void;
}) {
  const { booking, event } = row;
  const icon = chosenIcon(event?.icon) ?? BOOKING_TYPE_ICON[booking.type];
  // Shared booking grammar (ADR-0059 §3): the badge is tinted by category (teal
  // for a stay, amber for transport), and a hard booking wears the lock.
  const badgeClass = badgeClassForBookingType(booking.type);
  const badgeTone: BadgeTone | undefined =
    badgeClass === 'stay' || badgeClass === 'trans' ? badgeClass : undefined;
  const isHard = event?.kind === 'hard';
  // A queued (pending) write fades the row to read as provisional (ADR-0092).
  const unsynced = useUnsynced(booking.id);

  const schedule = event ? scheduleParts(event, booking, zoneEvidence, now) : undefined;
  // THE VERB IS DRAWN WHERE IT DISAMBIGUATES (ADR-0179 §2d): on a span's closing edge it
  // is the only thing that can say which end this time is, and on a start edge the badge
  // glyph already says it — the type→verb map is 1:1.
  const showVerb = !!schedule?.verb && schedule.edge === 'end';
  const duration = event
    ? // The booking's own zone, for the same reason `BookingDetail` reads it that way: this
      // only turns an instant into a calendar day for the nights count (ADR-0107).
      formatBookingDuration(
        event,
        eventDisplayZones(event, zoneEvidence).start,
        bookingDurationUnit(booking.type),
      )
    : null;

  return (
    <ListRow
      icon={icon}
      badgeTone={badgeTone}
      onOpen={() => onOpen(booking)}
      openLabel={booking.title}
      title={
        <>
          {/* THE TITLE GETS THE LINE (ADR-0179 §1). Clamped to two lines then `…`, the
              ladder ADR-0178 §5 settled — admissible only because the row's own tap is a
              read (ADR-0174 §4), so the full title is one tap away. Never mid-word. */}
          <span className="bk-title-txt">
            <BookingTitle booking={booking} places={places} />
          </span>
          {/* Now dropped when it repeats the BADGE as well as the title (ADR-0179 §2b), so
              it survives only where `chosenIcon` has overridden the category glyph. */}
          {typeChipAddsMeaning(booking, icon) && (
            <span className="tag-type">{t.index.bookingType[booking.type]}</span>
          )}
          {/* THE MARKS RIDE THE TITLE LINE (ADR-0179 §5) — a note is still a mark on a row
              and never a body in it (ADR-0152 §6), it has just moved lines. They are
              unshrinkable by nature, and on the when line they took ~21–42px from a
              sentence already over budget at 360px, which measured as four rows losing
              their DAY to the ellipsis. The title line has the slack. */}
          <NoteMark count={notes} />
          <DocumentMark count={documents} />
          <TaskMark count={tasks} />
        </>
      }
      meta={
        schedule ? (
          /* THE WHEN LINE (ADR-0179 §3) — a sentence whose subject is the clock, the same
             object `.wp-event-time` is one surface over at the day card's density. Its
             parts are ELEMENTS rather than a joined string because flex cannot style or
             protect half of a text node (ADR-0152 §6c). */
          <span className="bk-when">
            {/* ONE LOCK, BESIDE THE THING IT LOCKS (ADR-0179 §3, following ADR-0178 §4):
                ADR-0011's commitment is a commitment about a TIME. An unlinked booking has
                no event and so is never hard, which is why this needs no untimed fallback
                the way the day row did. */}
            {isHard && <HardLock />}
            {/* The `·` between these is drawn by CSS, not rendered here — the mechanism
                both day rows already use (`.bld-timemeta::before`). A separator is
                punctuation between facts, so putting it in the DOM would also put it in
                the accessibility tree, where a row would read "check-out dot tomorrow dot
                eleven o'clock". */}
            {showVerb && <span className="bk-verb">{schedule.verb}</span>}
            <span className="bk-day">{schedule.day}</span>
            {schedule.time && (
              /* THE ISOLATE IS THE INNER `<bdi>`, NOT THIS ELEMENT, and that is the rule
                 rather than a preference: `dir="auto"` sniffs the content, `12:30` opens
                 with digits, so the attribute here would resolve this box to LTR and its
                 `::before` separator would render at the box's LEFT — on the far side of
                 the fact it separates. Rendered, that put the dot after the clock and left
                 a trailing `·` at the end of every row. `frontend/CLAUDE.md` already says
                 it: the attribute goes on the element holding the value AND NOTHING ELSE,
                 and this one also holds a generated dot. `<bdi>` isolates the numeric run
                 without touching its parent's direction — the same thing `RouteLabel` does
                 for a place name. */
              <span className="bk-clock">
                <bdi>{schedule.time}</bdi>
              </span>
            )}
            {/* ONE ANNOTATION, NOT TWO (ADR-0179 §4). Beside the verb this is not merely
                expensive, it is misleading: the duration is the WHOLE stay's length, so
                `11:00 · 5 לילות` on a check-out row reads as five nights still to come. */}
            {duration && !showVerb && (
              <span className="when-dur bk-dur">
                <bdi>{duration}</bdi>
              </span>
            )}
          </span>
        ) : (
          <span className="unlinked">{t.index.unlinked}</span>
        )
      }
      sync={<EntitySyncBadge id={booking.id} />}
      unsynced={unsynced}
      onShowOnMap={bookingShowOnMap(
        booking,
        places,
        showPlaceOnMap &&
          ((placeId) => {
            onLeaveForMap();
            showPlaceOnMap(placeId);
          }),
      )}
      onManage={() => onManage(booking)}
      manageLabel={t.index.detail.actions}
    />
  );
}
