// The frontend's half of the place-label chain. **The derivation itself now lives in
// `@waypoint/shared`** (moved 2026-08-30) so the sharing projection can call the same
// function instead of re-implementing a worse one — see that file's header. Re-exported
// here so every call site keeps its import.
export { shortPlaceLabel, derivedPlaceLabel, placeIataCode } from '@waypoint/shared';
import { shortPlaceLabel } from '@waypoint/shared';
import { type Route } from './places';

/** Every place's label, keyed by id — what a surface looks a route endpoint up in.
 *  Only places whose label is DERIVED have a key: the stripping fallback is not stored,
 *  so a missing key means "shorten the name", which is what every surface did before. */
export type PlaceLabels = Readonly<Record<string, string>>;

/** **The whole chain, for a surface holding one place** — the derived label if there is one,
 *  else the stripped name. The single-place counterpart of `shortRoute`, so no call site has
 *  to write the `?? shortPlaceLabel(…)` half itself and quietly get it wrong on one screen. */
export function placeLabelOf(
  labels: PlaceLabels,
  placeId: string | undefined,
  name: string | undefined,
): string | undefined {
  const derived = placeId ? labels[placeId] : undefined;
  return derived ?? (name ? shortPlaceLabel(name) : undefined);
}

/** Both endpoints of a route, shortened — what every glanceable route surface
 *  shows (`EventTitle`, `BookingTitle`, `TitleLabel`, `routeDisplay`), so they
 *  can't diverge on which half gets shortened. Absent endpoints stay absent.
 *
 *  **A label the chain already derived is returned untouched.** Stripping `נמל התעופה` out of
 *  `תל אביב · TLV` would find nothing, but stripping it out of a NICKNAME could — a person is
 *  free to call a place `שדה התעופה של אמא`, and the point of a nickname is that it is not
 *  ours to edit. `eventRoute` fills these in when it has the labels; a `Route` parsed back out
 *  of a stored title (`TitleLabel`) has only names, and gets today's behaviour. */
export function shortRoute(route: Route): Route {
  return {
    from: route.fromLabel ?? (route.from ? shortPlaceLabel(route.from) : undefined),
    to: route.toLabel ?? (route.to ? shortPlaceLabel(route.to) : undefined),
  };
}
