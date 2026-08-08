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
// **AND THAT IS NOW THE BOTTOM RUNG OF A THREE-STEP CHAIN** (ADR-0166 §18, field report
// #23). The stripped name is what we show when we know nothing better; above it sit two
// answers this file did not have when it was written:
//
//   1. **`Place.nickname`** — what a human called it. Wins outright, because the cases
//      automation cannot resolve (Ben Gurion serves Tel Aviv AND Jerusalem, at equal rank in
//      Wikidata) are exactly the cases a person can answer in two taps.
//   2. **the city the airport serves** — `servedCity`, derived by the enrichment pipe
//      (ADR-0166 §18). `תל אביב`, not `נמל התעופה בן גוריון`.
//   3. **the stripped name**, below — for a place that is not an airport, or one whose
//      enrichment has not landed (or never will).
//
// **The IATA code is NOT in this chain** (owner's call, 2026-08-08, revising §18's first
// build). Every surface that reads this file is width-starved by construction — a day row, a
// board card, a route with TWO of these on one line — and `תל אביב · TLV ← פרנקפורט · FRA`
// spends the row's whole budget saying twice what `תל אביב ← פרנקפורט` says once. It also
// pushed most real pairs past `ROUTE_INLINE_MAX_CHARS`, so the inline route ADR-0059 §3 wants
// would have collapsed to the destination-primary fallback on the common case. The code lives
// where there is room for it and a reason to check it — the booking detail's own fact row,
// against a ticket — and `placeIataCode` is what that surface reads.
//
// The chain is one function, `derivedPlaceLabel`, and it answers `undefined` at rung 3 so the
// stripping stays where it is rather than being copied into it.
import { resolveTextVariant, SUMMARY_LANG_PREFERENCE } from '@waypoint/shared';
import type { DeliveredEnrichmentFields, Place } from '@waypoint/shared';
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
  // Hebrew — leading. The optional `של` is not decoration: Google's Hebrew names come in
  // both bindings — `נמל התעופה בן גוריון` and `נמל התעופה של פרנקפורט` — and stripping the
  // category phrase out of the second one without its genitive particle leaves a label that
  // opens with "of": `של פרנקפורט`. Ungrammatical, and it shipped on the app's loudest
  // surface. The particle belongs to the phrase being removed, so it goes with it.
  /^נמל התעופה(?: הבינלאומי)?\s+(?:של\s+)?/,
  /^שדה התעופה\s+(?:של\s+)?/,
  /^תחנת ה?רכבת(?: המרכזית)?\s+(?:של\s+)?/,
  /^תחנת ה?אוטובוס(?:ים)?(?: המרכזית)?\s+(?:של\s+)?/,
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
 *  `International`). Treated as "nothing real left", so the original is kept.
 *
 *  `של` is in here for the trailing case the pattern above cannot reach: a name ending in the
 *  particle with nothing after it (`נמל התעופה של`) has no `\s+` for the optional group to
 *  consume, so the strip leaves the bare particle — two characters, which clears
 *  `MIN_LABEL_CHARS` and would otherwise be returned as a place name. */
const MODIFIER_ONLY = /^(?:ה?בינלאומית?|ה?מרכזית?|international|central|של)$/i;

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

/**
 * **The two rungs above the stripping** (ADR-0166 §18) — a nickname, else the city the
 * airport serves — or `undefined` when neither is available, which is the signal to fall
 * through to `shortPlaceLabel`.
 *
 * `undefined` rather than the stripped name on purpose: the callers below already hold the
 * fallback, and a function that answered it here would have to be given the full name at every
 * call site that only has an id.
 */
export function derivedPlaceLabel(
  place: Pick<Place, 'name' | 'nickname'> | undefined,
  enrichment?: DeliveredEnrichmentFields,
): string | undefined {
  const nickname = place?.nickname?.trim();
  if (nickname) return nickname;
  // Hebrew where Wikidata had it, English otherwise — the same `he` → `en` preference the
  // summary resolves with (ADR-0166 §11.5), because it is the same question.
  return enrichment?.servedCity
    ? resolveTextVariant(enrichment.servedCity, SUMMARY_LANG_PREFERENCE)?.value
    : undefined;
}

/** **The airport's IATA code, for a surface with room for it** (ADR-0166 §18, revised) —
 *  the booking detail's own fact row, where you check it against a ticket. Deliberately not
 *  part of `derivedPlaceLabel`: see this file's header for why no row-shaped surface gets it. */
export function placeIataCode(enrichment?: DeliveredEnrichmentFields): string | undefined {
  return enrichment?.iata?.value;
}

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
