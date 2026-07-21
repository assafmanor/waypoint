// The Index's dedicated bookings screen (ADR-0098): local view state inside
// Index.tsx, not a route — mounted only while the landing's bookings tile is
// open. Registers as the topmost overlay (ADR-0098 §5) so one back/gesture/
// system-back returns to the landing before falling through to the normal
// tab → Home rule; a nested BookingDetail/BookingManageSheet/BookingSheet
// registers on top of that via its own Modal, so it closes first in turn.
import { useEffect, useState } from 'react';
import { BOOKING_TYPE, type Booking, type Place, type Trip } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useMode } from '../state/mode-state';
import { useOverlay } from '../state/nav-state';
import { useClock } from '../lib/useClock';
import {
  CATEGORY_ALL,
  countByCategory,
  scheduleLabel,
  splitBookings,
  visibleRows,
  type BookingRow,
  type CategoryFilter,
} from '../lib/index-bookings';
import { bookingDurationUnit, formatBookingDuration } from '../lib/booking-timing';
import { badgeClassForBookingType } from '../lib/transitions';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { BOOKING_TYPE_ICON, CODE_PREFIX, ICONS } from '../constants';
import { BookingSheet } from './BookingSheet';
import { BookingDetail } from './BookingDetail';
import { BookingManageSheet } from './BookingManageSheet';
import { BookingTitle } from './BookingTitle';
import { IndexBackRow } from './IndexBackRow';
import { Icon } from './Icon';
import { ListRow, type BadgeTone } from './domain';
import { ChoiceGrid, type Choice } from './primitives/ChoiceGrid';
import { Collapsible, CollapseToggle } from './primitives/Collapsible';
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
  useOverlay(onClose);
  const { trip, bookings, places, events } = useTrip();
  const { mode } = useMode();
  const now = useClock();
  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());

  const [category, setCategory] = useState<CategoryFilter>(CATEGORY_ALL);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  // null = closed; 'create' = new booking; a Booking = editing that one.
  const [sheet, setSheet] = useState<Booking | 'create' | null>(null);
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
  const editFrom = (booking: Booking) => {
    setDetail(null);
    setManage(null);
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

  const upcomingVisible = visibleRows(upcoming, activeCategory, query);
  const pastVisible = visibleRows(past, activeCategory, query, upcomingVisible.nextIndex);
  const upcomingMatchCount = upcomingVisible.rows.filter((r) => r.visible).length;
  const pastMatchCount = pastVisible.rows.filter((r) => r.visible).length;
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
  // separate past collapse inside it — see `ui/primitives/SearchOverlay`).
  const searchRows = [...upcoming, ...past];
  const searchVisible = visibleRows(searchRows, activeCategory, query);
  const searchMatchCount = searchVisible.rows.filter((r) => r.visible).length;

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

  return (
    <div className="idx-screen">
      <IndexBackRow
        title={t.index.bookingsTitle}
        onBack={onClose}
        end={
          <span className="idx-head-count" dir="ltr">
            {t.index.head.count(bookings.length)}
          </span>
        }
      />

      {bookings.length === 0 ? (
        <div className="empty-card">
          <div className="ei">{ICONS.ticket}</div>
          <div className="et">{t.index.emptyTitle}</div>
          <div className="es">{t.index.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setSheet('create')}>
            {t.index.form.add}
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
              {t.index.form.add}
            </button>

            {upcomingMatchCount > 0 ? (
              <div className="listcard">
                {upcomingVisible.rows.map(({ row, visible, delayMs }) => (
                  <div
                    key={row.booking.id}
                    className={'idx-row' + (visible ? '' : ' hidden')}
                    style={{ transitionDelay: `${delayMs}ms` }}
                  >
                    <BookingLi
                      row={row}
                      places={places}
                      trip={trip}
                      now={now}
                      onOpen={openDetail}
                      onManage={setManage}
                    />
                  </div>
                ))}
              </div>
            ) : (
              noResults && (
                <EmptyState
                  icon={ICONS.search}
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
                  <div className="listcard past">
                    {pastVisible.rows.map(({ row, visible, delayMs }) => (
                      <div
                        key={row.booking.id}
                        className={'idx-row' + (visible ? '' : ' hidden')}
                        style={{ transitionDelay: `${delayMs}ms` }}
                      >
                        <BookingLi
                          row={row}
                          places={places}
                          trip={trip}
                          now={now}
                          onOpen={openDetail}
                          onManage={setManage}
                        />
                      </div>
                    ))}
                  </div>
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
              <div className="listcard">
                {searchVisible.rows.map(({ row, visible, delayMs }) => (
                  <div
                    key={row.booking.id}
                    className={'idx-row' + (visible ? '' : ' hidden')}
                    style={{ transitionDelay: `${delayMs}ms` }}
                  >
                    <BookingLi
                      row={row}
                      places={places}
                      trip={trip}
                      now={now}
                      onOpen={openDetail}
                      onManage={setManage}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={ICONS.search} title={t.index.filter.noResultsTitle} />
            )}
          </div>
        </SearchOverlay>
      )}

      {detail && (
        <BookingDetail booking={detail} onClose={() => setDetail(null)} onEdit={editFrom} />
      )}
      {manage && (
        <BookingManageSheet booking={manage} onClose={() => setManage(null)} onEdit={editFrom} />
      )}
      {sheet && (
        <BookingSheet
          booking={sheet === 'create' ? null : sheet}
          seed={sheet === 'create' ? createSeed : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function BookingLi({
  row,
  places,
  trip,
  now,
  onOpen,
  onManage,
}: {
  row: BookingRow;
  places: Place[];
  trip: Trip;
  now: Date;
  onOpen: (booking: Booking) => void;
  onManage: (booking: Booking) => void;
}) {
  const { booking, event } = row;
  const icon = event?.icon ?? BOOKING_TYPE_ICON[booking.type];
  // Shared booking grammar (ADR-0059 §3): the badge is tinted by category (teal
  // for a stay, amber for transport), and a hard booking wears the lock.
  const badgeClass = badgeClassForBookingType(booking.type);
  const badgeTone: BadgeTone | undefined =
    badgeClass === 'stay' || badgeClass === 'trans' ? badgeClass : undefined;
  const isHard = event?.kind === 'hard';
  // A queued (pending) write fades the row to read as provisional (ADR-0092).
  const unsynced = useUnsynced(booking.id);

  return (
    <ListRow
      icon={icon}
      badgeTone={badgeTone}
      onOpen={() => onOpen(booking)}
      openLabel={booking.title}
      title={
        <>
          <BookingTitle booking={booking} places={places} />
          {isHard && (
            <span className="bk-lock" aria-hidden="true">
              {ICONS.lock}
            </span>
          )}
          <span className="tag-type">{t.index.bookingType[booking.type]}</span>
        </>
      }
      meta={
        event ? (
          <span className="link-cue">
            🔗 {scheduleLabel(event, booking, trip, now)}
            {(() => {
              const dur = formatBookingDuration(
                event,
                trip.timezone,
                bookingDurationUnit(booking.type),
              );
              return dur ? <span className="bk-dur"> · {dur}</span> : null;
            })()}
          </span>
        ) : (
          <span className="unlinked">{t.index.unlinked}</span>
        )
      }
      right={
        booking.confirmationCode && (
          <span className="code" dir="ltr">
            {CODE_PREFIX}
            {booking.confirmationCode}
          </span>
        )
      }
      sync={<EntitySyncBadge id={booking.id} />}
      unsynced={unsynced}
      onManage={() => onManage(booking)}
      manageLabel={t.index.detail.actions}
    />
  );
}
