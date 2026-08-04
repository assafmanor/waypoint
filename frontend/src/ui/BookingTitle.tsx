// A booking's title, transport-aware (ADR-0048): a flight/train shows its
// origin → destination Places via the shared RouteLabel, everything else shows
// the booking title. Falls back to the title if a transport row has no
// endpoints yet. Shared between the bookings-screen row (ADR-0098) and the
// Index landing tile's "next" preview.
//
// **The question is `titlesFromRoute`, not `carriesRoute`** (ADR-0163 §3, extended here
// after the owner reported the miss). The two agreed until the car hire, which carries a
// route and is called Hertz — so this drew `נריטה ← נריטה` for a hire, and `נריטה ← -`
// whenever its return place was unset, no matter what §3 had stored as the title.
import { titlesFromRoute, type Booking, type Place } from '@waypoint/shared';
import { RouteLabel } from './RouteLabel';
import { TitleLabel } from './TitleLabel';
import { placeName } from '../lib/places';
import { shortRoute } from '../lib/place-label';

export function BookingTitle({ booking, places }: { booking: Booking; places: Place[] }) {
  const from = placeName(places, booking.fromPlaceId);
  const to = placeName(places, booking.toPlaceId);
  if (titlesFromRoute(booking.type) && (from || to)) {
    // Shortened like every other glanceable route label (ADR-0059 §3 amendment);
    // the booking detail keeps the full names.
    return <RouteLabel {...shortRoute({ from, to })} />;
  }
  // No endpoints in reach: the stored title may still BE a route, so it reads as
  // one instead of as raw text (session-101 amendment).
  return (
    <span>
      <TitleLabel title={booking.title} />
    </span>
  );
}
