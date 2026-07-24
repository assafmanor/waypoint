// A booking's title, transport-aware (ADR-0048): a flight/train shows its
// origin → destination Places via the shared RouteLabel, everything else shows
// the booking title. Falls back to the title if a transport row has no
// endpoints yet. Shared between the bookings-screen row (ADR-0098) and the
// Index landing tile's "next" preview.
import { BOOKING_TYPE, type Booking, type Place } from '@waypoint/shared';
import { RouteLabel } from './RouteLabel';
import { placeName } from '../lib/places';
import { shortPlaceLabel } from '../lib/place-label';

const isTransport = (b: Booking): boolean =>
  b.type === BOOKING_TYPE.FLIGHT || b.type === BOOKING_TYPE.TRAIN;

export function BookingTitle({ booking, places }: { booking: Booking; places: Place[] }) {
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  if (isTransport(booking) && (from || to)) {
    // Shortened like every other glanceable route label (ADR-0059 §3 amendment);
    // the booking detail keeps the full names.
    return <RouteLabel from={from && shortPlaceLabel(from)} to={to && shortPlaceLabel(to)} />;
  }
  return <span>{booking.title}</span>;
}
