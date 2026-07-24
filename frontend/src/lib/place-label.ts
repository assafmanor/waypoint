// Short display labels for place names (ADR-0059 §3 amendment).
//
// Google returns a place's full official name — `נמל התעופה הבינלאומי קפלאוויק`,
// `Charles de Gaulle Airport` — and there is NO short-name field to ask for
// instead: `shortFormattedAddress` is an address, `addressComponents[].shortText`
// abbreviates address parts only, and there's no IATA code. (Reading the
// airport's `locality` doesn't work either — Ben Gurion's is "לוד".) So the
// shortening is ours.
//
// The trick is that the length comes from **generic category words**, not from
// the distinctive part of the name. So we enumerate the noise, never the places:
// this list grows with how many KINDS of place exist (airport, train station,
// bus terminal), not with how many places exist. Stripping `נמל התעופה` turns
// `נמל התעופה בן גוריון` into `בן גוריון` without knowing anything about Ben
// Gurion — and the same nine patterns handle Keflavík, Narita, Haneda, Charles
// de Gaulle and Amsterdam Central.
//
// Three properties this deliberately keeps:
//   • Display-only. `Place.name` is untouched, so the full name still shows in
//     the booking detail and as a tooltip, and nothing here needs a migration.
//   • Never destructive. If stripping leaves nothing real (the name WAS the
//     category phrase, or less than MIN_LABEL_CHARS remains), the original is
//     returned unchanged.
//   • Fails to "no change", never to a wrong name. A category phrase we haven't
//     listed — or a name in a script we have no patterns for (東京駅) — simply
//     displays in full, exactly as it does today.
//
// It deliberately does NOT produce colloquial abbreviations (`נתב״ג`): those need
// a per-place dictionary, which is what a user-set place nickname is for.
import { type Route } from './places';

/** Shortest remainder we'll accept — below this the strip clearly ate the name. */
const MIN_LABEL_CHARS = 2;

/** Generic category phrasing, per language. Hebrew leads with the category
 *  (`נמל התעופה X`), English trails it (`X Airport`) — so the anchors differ.
 *  The whitespace at the strip boundary is **mandatory**: that alone makes a name
 *  that is nothing but the category phrase (`נמל התעופה`, `Station`) fail to
 *  match, so it's kept whole. Ordered longest-first within a family so the more
 *  specific phrase wins. */
const CATEGORY_NOISE: readonly RegExp[] = [
  // Hebrew — leading
  /^נמל התעופה(?: הבינלאומי)?\s+/,
  /^שדה התעופה\s+/,
  /^תחנת ה?רכבת(?: המרכזית)?\s+/,
  /^תחנת ה?אוטובוס(?:ים)?(?: המרכזית)?\s+/,
  // English — trailing
  /\s+International Airport$/i,
  /\s+Airport$/i,
  /\s+(?:Railway|Train)\s+Station$/i,
  /\s+Central Station$/i,
  /\s+Station$/i,
];

/** A remainder that's only a category modifier is no better than the full name —
 *  it happens when a name is the category phrase plus its qualifier and nothing
 *  else (`תחנת הרכבת המרכזית` → `המרכזית`, `International Airport` →
 *  `International`). Treated as "nothing real left", so the original is kept. */
const MODIFIER_ONLY = /^(?:ה?בינלאומית?|ה?מרכזית?|international|central)$/i;

/** The distinctive part of a place's name, for width-starved surfaces (the day
 *  timeline row). Returns the name unchanged when there's no known category
 *  phrasing to drop, or when dropping it would leave nothing meaningful. */
export function shortPlaceLabel(name: string): string {
  const full = name.trim();
  for (const noise of CATEGORY_NOISE) {
    const short = full.replace(noise, '').trim();
    if (short === full || short.length < MIN_LABEL_CHARS) continue;
    if (MODIFIER_ONLY.test(short)) continue;
    return short;
  }
  return full;
}

/** Both endpoints of a route, shortened — what every glanceable route surface
 *  shows (`EventTitle`, `BookingTitle`, `TitleLabel`, `routeDisplay`), so they
 *  can't diverge on which half gets shortened. Absent endpoints stay absent. */
export function shortRoute(route: Route): Route {
  return {
    from: route.from ? shortPlaceLabel(route.from) : undefined,
    to: route.to ? shortPlaceLabel(route.to) : undefined,
  };
}
