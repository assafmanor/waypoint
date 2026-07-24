// Booking detail view (ADR-0053) — tapping a booking opens this read-only sheet
// of facts with a single visible "✏️ עריכה" button. The read-only view is the
// guard for a hard commitment (ADR-0011); editing is a deliberate tap. Edit
// opens the merged BookingSheet. Delete lives on the row's "⋯" (BookingManageSheet),
// not here — the detail carries edit only (ADR-0053 revision, 2026-07-17).
import { BOOKING_TYPE, type Booking, type BookingType } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { Sheet } from './Sheet';
import { RouteLabel } from './RouteLabel';
import { bookingPlaceId, mapsDirectionsUrl, mapsPlaceUrl, placeName } from '../lib/places';
import { routeTitle } from '../lib/route-title';
import { formatTime } from '../lib/time';
import { bookingDurationUnit, formatBookingDuration, timingLabels } from '../lib/booking-timing';
import { badgeClassForBookingType } from '../lib/transitions';
import { BOOKING_TYPE_ICON, CODE_PREFIX } from '../constants';
import { t } from '../i18n/he';

interface Wifi {
  network?: string;
  password?: string;
}

const isTransport = (ty: BookingType) => ty === BOOKING_TYPE.FLIGHT || ty === BOOKING_TYPE.TRAIN;

// Displayed text is always the Hebrew UI locale, independent of the device
// locale (which drives native date inputs, not app-rendered text).
export function dayTime(iso: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat('he-IL', {
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
  // Shared booking grammar (ADR-0059 §3): badge tinted by category.
  const badgeTint = badgeClassForBookingType(booking.type);
  const wifi = booking.details?.wifi as Wifi | undefined;
  const room = booking.details?.room as string | undefined;
  const notes = booking.details?.notes as string | undefined;
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  const startsAt = linkedEvent?.startsAt;
  const endsAt = linkedEvent?.endsAt;
  const labels = timingLabels(booking.type);
  // Duration read-out, phrased per the booking type (hours / nights / days) — the
  // same shared formatter the Index row uses (ADR-0063 extension), keyed on the
  // type not the icon-overridable event category.
  const duration = linkedEvent
    ? formatBookingDuration(linkedEvent, tz, bookingDurationUnit(booking.type))
    : null;

  // Location detail (ADR-0109 amendment): the booking's resolved place (transport
  // → origin, else the single place) shown as a fact like the rest, with navigate
  // (directions) + מפה (view) links. Links are absent for a coordless Place-lite;
  // the whole row is skipped when there's neither a map link nor an address to add.
  const navPlace = places.find((p) => p.id === bookingPlaceId(booking));
  const dirUrl = mapsDirectionsUrl(navPlace);
  const viewUrl = mapsPlaceUrl(navPlace);
  const locationText = navPlace?.address ?? navPlace?.name;
  const showLocation = !!(locationText && (dirUrl || navPlace?.address));

  const isRoute = isTransport(booking.type) && !!(from || to);
  // Accessible name only — the visible heading is the RouteLabel below, whose arrow
  // is an SVG. A screen reader gets the textual separator, with the FULL names: the
  // detail is the record (ADR-0059 §3 session-95 amendment).
  const heading = isRoute ? routeTitle(from ?? '-', to ?? '-') : booking.title;

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
          <div className={'bk-badge' + (badgeTint ? ` ${badgeTint}` : '')}>{icon}</div>
          <div className="bk-headtext">
            <div className="bk-title">{isRoute ? <RouteLabel from={from} to={to} /> : heading}</div>
            <div className="bk-type">{t.index.bookingType[booking.type]}</div>
          </div>
        </div>

        {linkedEvent?.kind === 'hard' && (
          <div className="bs-hard-note">🔒 {t.index.detail.hardNote}</div>
        )}
        <div className="bk-facts">
          {showLocation && <LocationFact text={locationText!} dirUrl={dirUrl} viewUrl={viewUrl} />}
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
          {duration && <Fact k={t.index.detail.duration} v={duration} />}
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

// The location fact: the place name/address as the value, plus the two teal
// location links (navigate = directions, מפה = view). A link renders only when
// its URL exists — a coordless Place-lite shows the text with no links.
function LocationFact({
  text,
  dirUrl,
  viewUrl,
}: {
  text: string;
  dirUrl: string | null;
  viewUrl: string | null;
}) {
  return (
    <div className="bk-fact">
      <span className="bk-fact-k">{t.index.detail.location}</span>
      <span className="bk-fact-v bk-loc">
        <span>{text}</span>
        {(dirUrl || viewUrl) && (
          <span className="bk-loc-links">
            {dirUrl && (
              <a className="bk-loc-link" href={dirUrl} target="_blank" rel="noopener noreferrer">
                {t.actions.navigate}
              </a>
            )}
            {viewUrl && (
              <a className="bk-loc-link" href={viewUrl} target="_blank" rel="noopener noreferrer">
                {t.actions.showOnMap}
              </a>
            )}
          </span>
        )}
      </span>
    </div>
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
