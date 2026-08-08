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
//
// An event whose booking isn't in reach (an unlinked event, or a title that
// outlived its places) still falls through to `TitleLabel`, so a stored route
// title reads as a route rather than as raw text.
import { type Booking, type Place, type TripEvent } from '@waypoint/shared';
import { eventRoute } from '../lib/places';
import { shortRoute } from '../lib/place-label';
import { usePlaceLabels } from '../state/place-labels';
import { RouteLabel } from './RouteLabel';
import { TitleLabel } from './TitleLabel';

export function EventTitle({
  event,
  bookings,
  places,
}: {
  event: TripEvent;
  bookings: Booking[];
  places: Place[];
}) {
  // A place's own label — a nickname, or the city an airport serves — outranks the stripping
  // (ADR-0166 §18). Read from context rather than taken as a prop: every host of this
  // component would otherwise have to thread it, and outside a trip there simply are none.
  const placeLabels = usePlaceLabels();
  const route = eventRoute(event, bookings, places, placeLabels);
  if (!route) return <TitleLabel title={event.title} />;
  return <RouteLabel {...shortRoute(route)} />;
}
