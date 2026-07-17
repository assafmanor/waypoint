// Booking detail view (ADR-0053) — tapping a booking opens this read-only sheet
// of facts with a single visible "✏️ עריכה" button. The read-only view is the
// guard for a hard commitment (ADR-0011); editing is a deliberate tap. Edit
// opens the merged BookingSheet. Delete lives on the row's "⋯" (BookingManageSheet),
// not here — the detail carries edit only (ADR-0053 revision, 2026-07-17).
import { BOOKING_TYPE, type Booking, type BookingType } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { NavArrow } from './NavArrow';
import { placeName } from '../lib/places';
import { formatTime } from '../lib/time';
import { timingLabels } from '../lib/booking-timing';
import { BOOKING_TYPE_ICON, CODE_PREFIX, DEVICE_LOCALE } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const isTransport = (ty: BookingType) => ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;

function dayTime(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat(DEVICE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(iso));
  return `${day} · ${formatTime(iso, timeZone)}`;
}

export function BookingDetail({
  booking,
  onClose,
  onEdit,
}: {
  booking: Booking;
  onClose: () => void;
  onEdit: (booking: Booking) => void;
}) {
  const { trip, events, places } = useTrip();
  const linkedEvent = events.find((e) => e.bookingId === booking.id);

  const tz = trip.timezone;
  const icon = linkedEvent?.icon ?? BOOKING_TYPE_ICON[booking.type];
  const wifi = booking.details?.wifi as Wifi | undefined;
  const room = booking.details?.room as string | undefined;
  const notes = booking.details?.notes as string | undefined;
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  const startsAt = linkedEvent?.startsAt;
  const endsAt = linkedEvent?.endsAt;
  const labels = timingLabels(booking.type);

  const isRoute = isTransport(booking.type) && !!(from || to);
  // The route reads in the RTL flow (origin on the start/right, arrow pointing to
  // the destination) — the trip's UI is Hebrew-first, so the arrow follows it.
  const heading = isRoute ? `${from ?? '-'} ${t.arrows.route} ${to ?? '-'}` : booking.title;

  const edit = () => {
    onEdit(booking);
  };

  return (
    <Sheet ariaLabel={heading} onClose={onClose}>
      <div className="bk-detail">
        <div className="bk-actions">
          <button type="button" className="bk-edit" onClick={edit}>
            <span aria-hidden="true">✏️</span> {t.index.detail.edit}
          </button>
        </div>

        <div className="bk-head">
          <div className="bk-badge">{icon}</div>
          <div className="bk-headtext">
            <div className="bk-title">{isRoute ? <RouteLabel from={from} to={to} /> : heading}</div>
            <div className="bk-type">{t.index.bookingType[booking.type]}</div>
          </div>
        </div>

        {linkedEvent?.kind === 'hard' && (
          <div className="bs-hard-note">🔒 {t.index.detail.hardNote}</div>
        )}
        <div className="bk-facts">
          {!linkedEvent ? (
            <Fact k={t.index.detail.timing} v={t.index.detail.unscheduled} />
          ) : endsAt ? (
            <>
              <Fact k={labels.start} v={startsAt ? dayTime(startsAt, tz) : '-'} />
              <Fact k={labels.end} v={dayTime(endsAt, tz)} />
            </>
          ) : (
            <Fact
              k={startsAt ? labels.start : t.index.detail.timing}
              v={startsAt ? dayTime(startsAt, tz) : linkedEvent.date}
            />
          )}
          {booking.confirmationCode && (
            <Fact k={t.index.detail.code} v={`${CODE_PREFIX}${booking.confirmationCode}`} mono />
          )}
          {booking.provider && <Fact k={t.index.detail.provider} v={booking.provider} />}
          {room && <Fact k={t.index.detail.room} v={room} />}
          {(wifi?.network || wifi?.password) && (
            <Fact
              k={t.index.detail.wifi}
              v={[wifi.network, wifi.password].filter(Boolean).join(' · ')}
              mono
            />
          )}
          {notes && <Fact k={t.index.detail.notes} v={notes} />}
        </div>
      </div>
    </Sheet>
  );
}

/** Origin → destination for a transport booking. Laid out RTL (flex, not text
 *  bidi) so the origin sits at the start/right and the arrow points at the
 *  destination regardless of whether the place names are Hebrew or Latin. */
export function RouteLabel({ from, to }: { from?: string; to?: string }) {
  return (
    <span className="route">
      <bdi>{from ?? '-'}</bdi>
      <span className="arr" aria-hidden="true">
        <NavArrow variant="forward" />
      </span>
      <bdi>{to ?? '-'}</bdi>
    </span>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="bk-fact">
      <span className="bk-fact-k">{k}</span>
      <span className={'bk-fact-v' + (mono ? ' mono' : '')} dir={mono ? 'ltr' : undefined}>
        {v}
      </span>
    </div>
  );
}
