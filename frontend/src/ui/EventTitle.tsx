// An event's board/timeline label. A transport-linked booking reads as its
// origin→destination route (ADR-0059 §3: a flight shows where it goes, not a
// name — resolved through the shared `eventRoute` derivation); everything else
// shows its title. The icon, if any, is rendered by the caller alongside this.
//
// Place names are shortened for display (`shortPlaceLabel`) because every surface
// that renders this is a glanceable row or card, where two full official airport
// names don't fit (ADR-0059 §3 amendment). The booking DETAIL and the booking
// FORM deliberately keep the full names — they're the record and the editor.
// A day row wants the meta line to follow the same decision, so it goes through
// `routeDisplay` instead of this component.
import { type Booking, type Place, type TripEvent } from '@waypoint/shared';
import { eventRoute } from '../lib/places';
import { shortPlaceLabel } from '../lib/place-label';
import { RouteLabel } from './RouteLabel';

export function EventTitle({
  event,
  bookings,
  places,
}: {
  event: TripEvent;
  bookings: Booking[];
  places: Place[];
}) {
  const route = eventRoute(event, bookings, places);
  if (!route) return <>{event.title}</>;
  return (
    <RouteLabel
      from={route.from && shortPlaceLabel(route.from)}
      to={route.to && shortPlaceLabel(route.to)}
    />
  );
}
