// How a transport route reads on a width-starved timeline row (ADR-0059 §3
// amendment). Returns BOTH slots a day row needs — the title node and the meta
// line — because they're two halves of one decision and must never disagree.
//
// Preferred (and almost always what you get): the route stays the inline
// `origin → destination` identity ADR-0059 §3 asks for, but with **shortened**
// place names (`shortPlaceLabel`), which is what makes it fit at all —
// `בן גוריון ← קפלאוויק` instead of two full official airport names. The meta then
// carries the destination's FULL name, so nothing is lost and the row stops
// repeating the origin (the old meta resolved to `fromPlaceId`).
//
// Fallback, only when even the shortened route overflows: the row goes
// destination-primary — the title is the destination alone and the meta becomes
// `מ־<origin>`. The destination is the half that matters (it's where you're
// going), so it's the half that keeps the title line.
//
// Nothing is ever clamped or truncated by this: a name that still doesn't fit
// simply wraps. Both layouts keep each name in a `<bdi>` (inside `RouteLabel` or
// on its own), so Hebrew, Latin, and mixed names keep their own direction.
import { type ReactNode } from 'react';
import { shortPlaceLabel } from '../lib/place-label';
import { useOverflows } from '../lib/useOverflows';
import { type Route } from '../lib/places';
import { RouteLabel } from './RouteLabel';
import { t } from '../i18n/he';

export interface RouteDisplay {
  /** Title node for the row, or undefined when the event has no route (the
   *  caller falls back to the event title). */
  title?: ReactNode;
  /** Meta line to show instead of the row's default place name. */
  meta?: string;
}

export function useRouteDisplay(route: Route | null): RouteDisplay {
  const from = route?.from;
  const to = route?.to;
  const shortFrom = from ? shortPlaceLabel(from) : undefined;
  const shortTo = to ? shortPlaceLabel(to) : undefined;
  // Hook order stays unconditional; with no route the refs go unattached, so no
  // observer is created.
  const { rowRef, containerRef, overflows } = useOverflows<HTMLSpanElement>(
    `${shortFrom ?? ''} ${shortTo ?? ''}`,
  );

  if (!route) return {};

  if (overflows) {
    return {
      title: <bdi>{shortTo ?? shortFrom}</bdi>,
      // Once the title is destination-only, the origin lives here — shortened
      // too, since this line is even tighter than the title.
      meta: shortFrom ? t.event.routeFrom(shortFrom) : undefined,
    };
  }

  return {
    title: (
      <span className="route-fit" ref={containerRef}>
        <RouteLabel from={shortFrom} to={shortTo} rowRef={rowRef} />
      </span>
    ),
    // The full destination name, so shortening never loses information and the
    // row doesn't repeat the origin.
    meta: to,
  };
}
