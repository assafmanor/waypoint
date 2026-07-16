// Index tab — the trip's bookings reference (ADR-0047/0049): flights, hotels,
// restaurants and the like, with their confirmation codes and whether each is
// scheduled on the itinerary. Read-only for now; the edit sheet + booking form
// are later checkpoints. Content is identical in Plan/Trip mode (ADR-0049) — the
// mode only tints the chrome, so this screen reads mode-agnostically.
import {
  BOOKING_TYPE,
  type Booking,
  type Place,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { useClock } from '../lib/useClock';
import { splitBookings, type BookingRow } from '../lib/index-bookings';
import { placeName } from '../lib/places';
import { formatTime, todayInTz } from '../lib/time';
import { BOOKING_TYPE_ICON, CODE_PREFIX, MS_PER_DAY } from '../constants';
import { t } from '../i18n/he';

const isTransport = (b: Booking): boolean =>
  b.type === BOOKING_TYPE.FLIGHT || b.type === BOOKING_TYPE.TRAIN;

export function Index() {
  const { trip, bookings, places, events } = useTrip();
  const now = useClock();
  const { upcoming, past } = splitBookings(bookings, events, trip.timezone, now.getTime());

  return (
    <div className="index">
      <div className="sec-title">
        {t.index.bookingsTitle}
        <span className="badge-offline">{t.index.offlineBadge}</span>
      </div>

      {bookings.length === 0 ? (
        <div className="empty-card">
          <div className="ei">📇</div>
          <div className="et">{t.index.emptyTitle}</div>
          <div className="es">{t.index.emptyBody}</div>
        </div>
      ) : (
        <>
          <div className="listcard">
            {upcoming.map((row) => (
              <BookingLi key={row.booking.id} row={row} places={places} trip={trip} now={now} />
            ))}
          </div>
          {past.length > 0 && (
            <>
              <div className="past-head">{t.index.pastHead}</div>
              <div className="listcard past">
                {past.map((row) => (
                  <BookingLi key={row.booking.id} row={row} places={places} trip={trip} now={now} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function BookingLi({
  row,
  places,
  trip,
  now,
}: {
  row: BookingRow;
  places: Place[];
  trip: Trip;
  now: Date;
}) {
  const { booking, event } = row;
  const icon = event?.icon ?? BOOKING_TYPE_ICON[booking.type];

  return (
    <div className="li">
      <div className="badge2">{icon}</div>
      <div className="main">
        <div className="t">
          <BookingTitle booking={booking} places={places} />
          <span className="tag-type">{t.index.bookingType[booking.type]}</span>
        </div>
        <div className="m">
          {event ? (
            <span className="link-cue">🔗 {scheduleLabel(event, trip, now)}</span>
          ) : (
            <span className="unlinked">{t.index.unlinked}</span>
          )}
        </div>
      </div>
      <div className="right">
        {booking.confirmationCode && (
          <div className="code" dir="ltr">
            {CODE_PREFIX}
            {booking.confirmationCode}
          </div>
        )}
      </div>
    </div>
  );
}

/** Transport shows its origin → destination Places (ADR-0048); everything else
 *  shows the booking title. Falls back to the title if a transport row has no
 *  endpoints yet. */
function BookingTitle({ booking, places }: { booking: Booking; places: Place[] }) {
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  if (isTransport(booking) && (from || to)) {
    return (
      <span className="route" dir="ltr">
        {from ?? '-'}
        <span className="arr">→</span>
        {to ?? '-'}
      </span>
    );
  }
  return <span>{booking.title}</span>;
}

/** "היום · 09:00" / "יום 3 · 09:00" — the linked event's place on the itinerary. */
function scheduleLabel(event: TripEvent, trip: Trip, now: Date): string {
  const today = todayInTz(trip.timezone, now);
  const dayNumber =
    Math.round((Date.parse(event.date) - Date.parse(trip.startDate)) / MS_PER_DAY) + 1;
  const dayLabel = event.date === today ? t.index.today : t.index.dayN(dayNumber);
  const time = event.startsAt ? formatTime(event.startsAt, trip.timezone) : null;
  return time ? `${dayLabel} · ${time}` : dayLabel;
}
