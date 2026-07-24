// A stored title, in display form. The route-aware fallback behind every surface
// that holds a TITLE and nothing else (ADR-0059 §3 session-101 amendment).
//
// A transport title is stored as `origin ← destination` (lib/route-title), so a
// surface that printed `event.title` raw showed two full official place names and a
// text arrow — while the same flight one row up read `בן גוריון ← קפלאוויק` with
// the SVG arrow. This renders any title the way the route surfaces do: shortened
// endpoints through `RouteLabel` when the title IS a route, the title itself
// otherwise. Non-route titles are untouched, so it's safe on any title.
//
// Prefer `EventTitle`/`BookingTitle` where the entity is at hand — they resolve the
// route from `fromPlaceId`/`toPlaceId`, so a renamed place is reflected. This is
// for the surfaces that can't: the hard-conflict flag, the hard-edit confirm gate,
// a transition row.
import { parseRouteTitle } from '../lib/route-title';
import { shortRoute } from '../lib/place-label';
import { RouteLabel } from './RouteLabel';

export function TitleLabel({ title }: { title: string }) {
  const route = parseRouteTitle(title);
  if (!route) return <>{title}</>;
  return <RouteLabel {...shortRoute(route)} />;
}
