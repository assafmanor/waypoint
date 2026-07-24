// Route titles — the one place a transport title is written and read back.
//
// A transport booking has no name (ADR-0059 §3): its title is DERIVED from its
// endpoints and stored as `origin ← destination`, so the linked event's title and
// any place-less fallback still say where the flight goes. That stored string then
// reaches surfaces that get a TITLE and nothing else — the hard-conflict flag, the
// hard-edit confirm gate, a transition row, the change feed — and those printed it
// raw: two full official place names and a text arrow, right next to a route-aware
// surface showing the same flight shortened with the SVG arrow (ADR-0059 §3
// session-101 amendment).
//
// So the title is parsed back into its endpoints here and re-rendered like any
// other route (`ui/TitleLabel`). Parsing is safe because the separator is OURS:
// `ROUTE_TITLE_ARROW` is written by `routeTitle` and read by `parseRouteTitle`, it
// is padded with a space on both sides, and a title that doesn't hold exactly one
// of them is returned untouched — a hand-typed title can never be mistaken for a
// route. Fails to "the title, unchanged", never to a wrong name (the same property
// `shortPlaceLabel` keeps).
import { type Route } from './places';
import { shortPlaceLabel } from './place-label';

/** The separator inside a stored route title. Structural, not copy: it is data
 *  this module writes and reads, and it is also the only textual arrow the app
 *  keeps (screen-reader labels, where an SVG says nothing). Every VISIBLE arrow
 *  is `NavArrow` (design-language.md, ADR-0059 §3 session-95 amendment). */
export const ROUTE_TITLE_ARROW = '←';

const SEPARATOR = ` ${ROUTE_TITLE_ARROW} `;

/** A transport booking's stored title, derived from its route (ADR-0059 §3):
 *  `origin ← dest` — either endpoint may be blank. Returns '' when both are blank,
 *  which the sheet reads as "route required". This title backs the linked event's
 *  title and any place-less fallback, so a flight never carries a name. */
export function routeTitle(origin: string, dest: string): string {
  return [origin.trim(), dest.trim()].filter(Boolean).join(SEPARATOR);
}

/** The endpoints back out of a stored route title, or null when the title isn't
 *  one — including a half route (`routeTitle` with one blank endpoint), which has
 *  no separator and is just a place name. */
export function parseRouteTitle(title: string): Route | null {
  const parts = title.split(SEPARATOR);
  if (parts.length !== 2) return null;
  const [from, to] = parts.map((p) => p.trim());
  return from && to ? { from, to } : null;
}

/** Any title in display form, as plain text: a route title's endpoints shortened,
 *  anything else unchanged. For the few places only a string can go (a narrated
 *  change-feed line, an accessible name) — where an arrow must stay textual too.
 *  Visible standalone titles use `ui/TitleLabel`, which renders the SVG arrow. */
export function shortTitleText(title: string): string {
  const route = parseRouteTitle(title);
  if (!route) return title;
  return routeTitle(shortPlaceLabel(route.from!), shortPlaceLabel(route.to!));
}
