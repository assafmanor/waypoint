import {
  BOOKING_TYPE,
  NARRATIVE_SOURCE,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_TRIP_SHAPE,
  type BookingType,
  type SharedDay,
  type SharedDayTitle,
  type SharedDaySummary,
  type ShareTripShape,
} from '@waypoint/shared';

/**
 * **The narrative that never fails**, and the reason sharing works before any model exists.
 *
 * ADR-0213 §2 requires a complete public page with no `Day` entity, no authored titles and
 * no provider — so this derives everything it says from rows that are already there: the
 * places a day passes through, what its bookings are, and the titles of its first events.
 *
 * **It emits no word of any language, and it no longer emits sentences either.** The first
 * version joined values with punctuation (`רייקיאוויק ← ויק`) so that one derivation could
 * feed a Hebrew page and a Hebrew PDF. That held the locale line and cost the thing the
 * owner then asked for: _"Some day titles could also be derived (flying to Iceland, flying
 * back…)"_. A server holding no copy cannot say "flying" — it can only join.
 *
 * So a day now ships a **kind and its values** (`{ kind: 'flightOut', to }`), the shape
 * `journey.mode` already uses one field over, and each renderer keys its own words off it.
 * The locale boundary is unchanged and the page can finally speak.
 *
 * `SHARE_DAY_KIND.NONE` is a legitimate answer — a day with no places and no events has
 * nothing true to say about itself, and inventing something is exactly the mandatory day
 * title the owner rejected. Renderers fall back to the date.
 */

/** How many stops the route STRIP shows. The trip's endpoints come from the whole route,
 *  never from this slice — see `fallbackTripTitle`. */
export const MAX_ROUTE_LABELS = 8;
const MAX_SUMMARY_EVENTS = 2;

/** Consecutive de-duplication: a route is where you *changed* to, not every stop that
 *  repeated the last one. Empty and blank labels drop out entirely. */
export function dedupeConsecutive(labels: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw?.trim();
    if (!label) continue;
    if (out[out.length - 1] === label) continue;
    out.push(label);
  }
  return out;
}

/** **The whole route, uncapped.** Capping here is what made a twelve-day trip's title end
 *  at day eight: the slice ran first and `fallbackTripTitle` then took the last element of
 *  the SLICE. The strip's cap belongs to the projection, and only to what it draws. */
export function routeLabelsFrom(principalPlaces: readonly (string | null | undefined)[]): string[] {
  return dedupeConsecutive(principalPlaces);
}

/**
 * **What the route STRIP draws: the ends, always, and as much of the middle as fits.**
 *
 * A plain `slice(0, n)` ends the strip wherever the cap fell, so a long trip's strip stopped
 * at a stop it never finished at — and beside a title naming the real endpoints it would now
 * disagree with it. Keeping the last element makes the two agree by construction. The
 * dropped stops are the interior, which is what a summary of a route is allowed to lose.
 */
export function routeStrip(wholeRoute: readonly string[]): string[] {
  if (wholeRoute.length <= MAX_ROUTE_LABELS) return [...wholeRoute];
  return [...wholeRoute.slice(0, MAX_ROUTE_LABELS - 1), wholeRoute[wholeRoute.length - 1]];
}

/**
 * What one day is made of, as far as naming it is concerned. Assembled by the projection,
 * which is the only thing holding the rows; kept as a parameter object so this module stays
 * a pure derivation with no Prisma shape in it.
 */
export interface DayFacts {
  /** Every place the day touches, in order, legs contributing both their ends. */
  stops: readonly (string | null | undefined)[];
  /** The booking types the day holds, in order — the discriminant the phrasing keys off. */
  bookingTypes: readonly (BookingType | null | undefined)[];
  /** Where the day's lodging is, if it has one. */
  lodgingPlace?: string;
  /** Event titles in order, for the fallback second line. */
  eventTitles: readonly string[];
  /** Where a flight on this day lands — an airport's own name, so it is what a MID-trip
   *  flight is titled by and never what the outbound one is. */
  flightTo?: string;
  /** The trip's `destination`, which is what an outbound flight is actually going to.
   *  `נמל התעופה הבינלאומי קפלוויק` is where the plane lands; `איסלנד` is where you are
   *  going, and it is the thing the owner asked the day to say. */
  tripDestination?: string;
  /** **The trip's outbound flight day**, and the test is deliberately narrow: the first day
   *  holding a flight AND the trip's first day holding anything at all. Without the second
   *  half, a domestic trip whose only flight is a hop on day three would announce itself as
   *  flying to the country it never left. */
  outbound?: boolean;
  /** …and the returning one: the last flight day, on the last day holding anything, and not
   *  the same day as the outbound — a single flight day is an departure, never a return. */
  returning?: boolean;
  /** **The region the day's stops share** (Wikidata `P131`), when a clear majority agree.
   *  The best name a day can have, because it is where you WERE rather than what you
   *  happened to stop at — a day whose eleven stops are all in Skútustaðahreppur is
   *  `מיוואטן`, not two of its waterfalls. */
  region?: string;
  /** **What the day's stops ARE** (Wikidata `P31`), when a clear majority agree. Below the
   *  region, because where beats what. */
  kind?: string;
  /** **The trip's shape** (owner, 2026-08-30). On a `base` trip every day leaves from and
   *  returns to the same bed, so a `from ← to` title describes the commute rather than the
   *  day — `רייקיאוויק ← גולפוס` on nine consecutive days says the same false thing nine
   *  times. Absent is treated as "we do not know", which takes today's behaviour. */
  tripShape?: ShareTripShape;
}

/**
 * **A day's headline.** Flights first, because a flight is the one event that renames its
 * whole day — everything else on a travel day is what you did between airports.
 *
 * `flightHome` carries no value on purpose: "home" is not a place this derivation knows, it
 * is the absence of the trip, and naming the destination airport instead is what produced
 * `נתב״ג ← נמל התעופה הבינלאומי קפלוויק` on a returning day.
 */
export function fallbackDayTitle(facts: DayFacts): SharedDayTitle {
  const flying = facts.bookingTypes.some((type) => type === BOOKING_TYPE.FLIGHT);
  if (flying) {
    if (facts.returning) return { kind: SHARE_DAY_KIND.FLIGHT_HOME };
    if (facts.outbound && facts.tripDestination) {
      return { kind: SHARE_DAY_KIND.FLIGHT_OUT, to: facts.tripDestination };
    }
    if (facts.flightTo) return { kind: SHARE_DAY_KIND.FLIGHT, to: facts.flightTo };
  }
  // **Where you were, then what you saw, then where you went** (ADR-0166's 2026-08-30
  // amendment). Both come from claims the enrichment pass already reads, and both beat a
  // route made of two arbitrary stop names — which is the rule these replace.
  if (facts.region) return { kind: SHARE_DAY_KIND.REGION, at: facts.region };
  if (facts.kind) return { kind: SHARE_DAY_KIND.KIND, of: facts.kind };
  const stops = dedupeConsecutive(facts.stops);
  if (stops.length === 0) return { kind: SHARE_DAY_KIND.NONE };
  // **On a star trip a day is a PLACE, never a route.** Every day of one starts and ends at
  // the same base, so `base ← wherever` describes the commute — and it repeats, nearly
  // identically, for every day of the trip. The furthest stop is what the day was about;
  // the base is already in the header, on the stay line.
  if (facts.tripShape === SHARE_TRIP_SHAPE.BASE) {
    const away = stops.find((stop) => stop !== facts.lodgingPlace) ?? stops[0];
    return { kind: SHARE_DAY_KIND.PLACE, at: away };
  }
  // **A round trip is a place, not a route.** A leg contributes both its endpoints, so a day
  // that leaves Reykjavík and comes back has the same label at both ends, and
  // `רייקיאוויק ← רייקיאוויק` says less than the bare name does.
  const [from] = stops;
  const to = stops[stops.length - 1];
  if (from === to) return { kind: SHARE_DAY_KIND.PLACE, at: from };
  return { kind: SHARE_DAY_KIND.ROUTE, from, to };
}

/**
 * **A day's second line, and it must not repeat the first.**
 *
 * Where you sleep beats what you did: it is the one fact a reader scans a day for that the
 * headline never carries. Only a day with no bed to name falls back to its events — and
 * then to the ones the headline did not already say, which on a flight day is what stopped
 * two airport names printing under a headline made of the same two airport names.
 */
export function fallbackDaySummary(facts: DayFacts, title: SharedDayTitle): SharedDaySummary {
  if (facts.lodgingPlace) {
    return { kind: SHARE_DAY_SUMMARY_KIND.STAY, place: facts.lodgingPlace };
  }
  const said = new Set(titleValues(title));
  const titles = facts.eventTitles
    .filter((eventTitle) => !said.has(eventTitle.trim()))
    .slice(0, MAX_SUMMARY_EVENTS);
  return titles.length > 0
    ? { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles }
    : { kind: SHARE_DAY_SUMMARY_KIND.NONE };
}

/** The values a headline already put on screen, so the line under it can avoid them. */
function titleValues(title: SharedDayTitle): string[] {
  switch (title.kind) {
    case SHARE_DAY_KIND.ROUTE:
      return [title.from, title.to];
    case SHARE_DAY_KIND.PLACE:
      return [title.at];
    case SHARE_DAY_KIND.FLIGHT:
    case SHARE_DAY_KIND.FLIGHT_OUT:
      return [title.to];
    default:
      return [];
  }
}

/**
 * The trip's own line: its route, end to end, and the one string still composed here.
 *
 * It stays a composed string because a **generated** narrative replaces it with prose
 * (ADR-0213 §2) — so its type is already "whatever the model would have written", and a
 * kind would have to be invented for the deterministic half alone. Its values are isolated
 * exactly as before; a renderer of it must not set `dir="auto"`, which skips isolates when
 * it sniffs. Takes `routeLabels` UNCAPPED: the endpoints are the trip's, not the strip's.
 */
export function fallbackTripTitle(routeLabels: readonly string[], tripName: string): string {
  // **THE TRIP'S NAME IS THE TRIP'S TITLE** (ADR-0213's 2026-08-30 amendment; owner, on the
  // masthead: _"Why נתב״ג to Frankfurt?? What does it have to do with anything?"_).
  //
  // This used to compose first-stop → last-stop, and on any trip you fly to both ends are
  // transit airports — so the loudest line on the page named two places the trip is not
  // about. It is the same defect on a non-flight trip too, one level quieter:
  // `רייקיאוויק ← סנייפלסנס` describes a drive, not a holiday in Iceland.
  //
  // A person already named this trip, in `Trip.name`, and that name is what they call it
  // when they talk about it. The route stays available — `routeLabels` still feeds the
  // narrative generator's input — it just stops being the headline.
  const name = tripName.trim();
  if (name) return isolate(name);
  // Nameless is possible (a trip created by an import), and only then is the route the best
  // thing we have to call it.
  if (routeLabels.length === 0) return '';
  if (routeLabels.length === 1) return isolate(routeLabels[0]);
  const from = routeLabels[0];
  const to = routeLabels[routeLabels.length - 1];
  if (from === to) return isolate(from);
  return `${isolate(from)}${ROUTE_ARROW}${isolate(to)}`;
}

/**
 * A value the app did not write, kept whole and self-directed inside a composed line
 * (ADR-0118). `FSI` rather than `LRI`: a stop can be `Kerið Crater` or `אסבירג׳י`, and
 * first-strong is exactly the question "which of those is this one".
 */
const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';
const isolate = (value: string): string =>
  `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;

export interface NarrativeStrings {
  source: typeof NARRATIVE_SOURCE.DETERMINISTIC | typeof NARRATIVE_SOURCE.GENERATED;
  title: string;
  summary: string;
  days: Map<number, { title: string; summary: string }>;
}

/** Apply resolved narrative strings onto already-projected days. Kept separate from the
 *  projection so a generated result and a fallback take the identical path — a model can
 *  change the words on a day and nothing else about it.
 *
 *  A generated day arrives as prose with no kind to key off, so it lands as `text`: the
 *  renderers print it verbatim and reach for no word table. */
export function applyNarrative(days: SharedDay[], narrative: NarrativeStrings): SharedDay[] {
  return days.map((day) => {
    const override = narrative.days.get(day.ordinal);
    if (!override) return day;
    return {
      ...day,
      title: { kind: SHARE_DAY_KIND.TEXT, text: override.title },
      summary: override.summary
        ? { kind: SHARE_DAY_SUMMARY_KIND.TEXT, text: override.summary }
        : { kind: SHARE_DAY_SUMMARY_KIND.NONE },
    };
  });
}
