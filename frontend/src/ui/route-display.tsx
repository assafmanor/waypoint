// How a transport route reads on a day row (ADR-0059 §3 amendment). Returns BOTH
// slots the row needs — the title node and the meta line — because they're two
// halves of one decision and must never disagree.
//
// Preferred (and almost always what you get): the inline `origin → destination`
// identity §3 asks for, with **shortened** place names (`shortPlaceLabel`), which
// is what makes it fit at all — `בן גוריון ← קפלאוויק` rather than two full
// official airport names. The meta then carries the destination's FULL name, so
// nothing is lost and the row stops repeating the origin (the old meta resolved
// to `fromPlaceId`).
//
// Fallback, for a route too long even shortened: the row goes destination-primary
// — the title is the destination alone and the meta becomes `מ־<origin>`. The
// destination keeps the title line because it's where you're going.
//
// The choice is a **pure function of the shortened names** (`ROUTE_INLINE_MAX_CHARS`),
// NOT a measurement of the row. An earlier revision measured each row's available
// width, which made Trip mode and the Plan builder disagree about the same flight:
// the builder row carries a drag grip, ▲/▼ and the ⋯ button, so it has less space
// and fell back where the Trip card didn't. Same input on both surfaces means they
// cannot diverge — and it needs no ResizeObserver, no latching, and no width
// stubbing to test.
//
// Nothing here truncates: both layouts wrap rather than clip, and each name stays
// bidi-isolated (in `RouteLabel`, or a `<bdi>` of its own) so Hebrew, Latin and
// mixed names keep their direction.
import { type ReactNode } from 'react';
import { shortRoute } from '../lib/place-label';
import { type Route } from '../lib/places';
import { ROUTE_INLINE_MAX_CHARS } from '../constants';
import { RouteLabel } from './RouteLabel';
import { t } from '../i18n/he';

export interface RouteDisplay {
  /** Title node for the row, or undefined when the event has no route (the
   *  caller falls back to the event title). */
  title?: ReactNode;
  /** Meta line to show instead of the row's default place name. */
  meta?: string;
}

export function routeDisplay(route: Route | null): RouteDisplay {
  if (!route) return {};
  const { from, to } = shortRoute(route);

  const fits = (from?.length ?? 0) + (to?.length ?? 0) <= ROUTE_INLINE_MAX_CHARS;
  // Both endpoints inline, plus the destination's full name as the meta.
  if (fits) return { title: <RouteLabel from={from} to={to} />, meta: route.to };

  // Destination-primary. With no destination there's only one name to show, and
  // moving it to the meta as "from X" would leave the title empty — so it stays.
  if (!to) return { title: <bdi>{from}</bdi> };
  return { title: <bdi>{to}</bdi>, meta: from ? t.event.routeFrom(from) : undefined };
}
