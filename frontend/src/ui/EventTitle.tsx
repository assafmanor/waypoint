// An event's board/timeline label. A transport-linked booking reads as its
// origin→destination route (ADR-0059 §3: a flight shows where it goes, not a
// name — resolved through the shared `eventRoute` derivation); everything else
// shows its title. The icon, if any, is rendered by the caller alongside this.
import { type Booking, type Place, type TripEvent } from '@waypoint/shared';
import { eventRoute } from '../lib/places';
import { RouteLabel } from './RouteLabel';

export function EventTitle({
  event,
  bookings,
  places,
  stack = false,
}: {
  event: TripEvent;
  bookings: Booking[];
  places: Place[];
  /** Let a long route fall back to the stacked origin/destination rail instead of
   *  wrapping or truncating (the day timelines — ADR-0059 §3 amendment). */
  stack?: boolean;
}) {
  const route = eventRoute(event, bookings, places);
  return route ? <RouteLabel from={route.from} to={route.to} stack={stack} /> : <>{event.title}</>;
}
