// Index tab — the trip's bookings reference (ADR-0047/0049): flights, hotels,
// restaurants and the like, with their confirmation codes and whether each is
// scheduled on the itinerary. Tap a row to edit/delete it (BookingSheet); the
// add-booking form is a later checkpoint. Content is identical in Plan/Trip mode
// (ADR-0049) — the mode only tints the chrome, so this reads mode-agnostically.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BOOKING_TYPE, type Booking, type Place, type Trip } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { splitBookings, scheduleLabel, type BookingRow } from '../lib/index-bookings';
import { placeName } from '../lib/places';
import { badgeClassForBookingType } from '../lib/transitions';
import { useSyncStatus } from '../lib/outbox';
import { BOOKING_TYPE_ICON, CODE_PREFIX, ICONS } from '../constants';
import { BookingSheet } from '../ui/BookingSheet';
import { BookingDetail } from '../ui/BookingDetail';
import { RouteLabel } from '../ui/RouteLabel';
import { BookingManageSheet } from '../ui/BookingManageSheet';
import { DocumentsSection } from '../ui/DocumentsSection';
import { ListRow, type BadgeTone } from '../ui/domain';
import { SyncBadge } from '../ui/feedback';
import { Icon } from '../ui/Icon';
import { t } from '../i18n/he';

const isTransport = (b: Booking): boolean =>
  b.type === BOOKING_TYPE.FLIGHT || b.type === BOOKING_TYPE.TRAIN;

export function Index() {
  const { trip, bookings, places, events } = useTrip();
  const now = useClock();
  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());
  // null = closed; 'create' = new booking; a Booking = editing that one.
  const [sheet, setSheet] = useState<Booking | 'create' | null>(null);
  // The read-only detail view (ADR-0053) — tapping a row opens this, not the edit
  // sheet; editing from here opens `sheet`.
  const [detail, setDetail] = useState<Booking | null>(null);
  // The row's "⋯" opens the manage sheet (edit / delete), like a document row.
  const [manage, setManage] = useState<Booking | null>(null);
  const openDetail = (booking: Booking) => setDetail(booking);
  const editFrom = (booking: Booking) => {
    setDetail(null);
    setManage(null);
    setSheet(booking);
  };

  const docsRef = useRef<HTMLDivElement>(null);

  // Deep-links from Home's quick-access (ADR-0050): ?booking=<id> opens that
  // booking's sheet; ?focus=docs scrolls to the documents section. The params are
  // cleared after so back/reload don't re-trigger.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('booking');
    const focus = params.get('focus');
    if (!id && !focus) return;
    if (id) {
      const target = bookings.find((b) => b.id === id);
      if (target) setDetail(target);
    }
    if (focus === 'docs') {
      docsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const next = new URLSearchParams(params);
    next.delete('booking');
    next.delete('focus');
    setParams(next, { replace: true });
  }, [params, bookings, setParams]);

  return (
    <div className="index">
      <div className="sec-title">
        {t.index.bookingsTitle}
        <span className="badge-offline">
          <Icon name="download" /> {t.index.offlineBadge}
        </span>
      </div>

      {bookings.length === 0 ? (
        <div className="empty-card">
          <div className="ei">📇</div>
          <div className="et">{t.index.emptyTitle}</div>
          <div className="es">{t.index.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setSheet('create')}>
            {t.index.form.add}
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="addbtn" onClick={() => setSheet('create')}>
            {t.index.form.add}
          </button>
          <div className="listcard">
            {upcoming.map((row) => (
              <BookingLi
                key={row.booking.id}
                row={row}
                places={places}
                trip={trip}
                now={now}
                onOpen={openDetail}
                onManage={setManage}
              />
            ))}
          </div>
          {past.length > 0 && (
            <>
              <div className="past-head">{t.index.pastHead}</div>
              <div className="listcard past">
                {past.map((row) => (
                  <BookingLi
                    key={row.booking.id}
                    row={row}
                    places={places}
                    trip={trip}
                    now={now}
                    onOpen={openDetail}
                    onManage={setManage}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div ref={docsRef}>
        <DocumentsSection />
      </div>

      {detail && (
        <BookingDetail booking={detail} onClose={() => setDetail(null)} onEdit={editFrom} />
      )}
      {manage && (
        <BookingManageSheet booking={manage} onClose={() => setManage(null)} onEdit={editFrom} />
      )}
      {sheet && (
        <BookingSheet booking={sheet === 'create' ? null : sheet} onClose={() => setSheet(null)} />
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
  // Per-row sync affordance (U-04, ADR-0080): "did this booking actually save?"
  const status = useSyncStatus(booking.id);

  // The shared list-row (U-03): the badge+title open the read-only detail view
  // (ADR-0053); the "⋯" opens the manage sheet (edit / delete). Code chip and the
  // sync badge ride the trailing slot.
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
          <span className="link-cue">🔗 {scheduleLabel(event, booking, trip, now)}</span>
        ) : (
          <span className="unlinked">{t.index.unlinked}</span>
        )
      }
      right={
        <>
          {booking.confirmationCode && (
            <span className="code" dir="ltr">
              {CODE_PREFIX}
              {booking.confirmationCode}
            </span>
          )}
          <SyncBadge state={status.state} reason={status.reason} />
        </>
      }
      onManage={() => onManage(booking)}
      manageLabel={t.index.detail.actions}
    />
  );
}

/** Transport shows its origin → destination Places (ADR-0048); everything else
 *  shows the booking title. Falls back to the title if a transport row has no
 *  endpoints yet. */
function BookingTitle({ booking, places }: { booking: Booking; places: Place[] }) {
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  if (isTransport(booking) && (from || to)) {
    return <RouteLabel from={from} to={to} />;
  }
  return <span>{booking.title}</span>;
}
