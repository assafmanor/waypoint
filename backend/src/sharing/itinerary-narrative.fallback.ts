import {
  dedupeConsecutive,
  NARRATIVE_SOURCE,
  ROUTE_ARROW,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  type SharedDay,
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
 * **What is left here is the TRIP's line and the route strip.** The DAY's title and summary
 * — `fallbackDayTitle`, `fallbackDaySummary`, `DayFacts`, `dedupeConsecutive` — moved to
 * `@waypoint/shared`'s `day-title.ts` when ADR-0219 §2 put the same title at the head of both
 * day surfaces in the app: the reader and the app must name a day from one derivation, and
 * `tripShapeOf` and `derivedPlaceLabel` made the same move for the same reason.
 */

/** How many stops the route STRIP shows. The trip's endpoints come from the whole route,
 *  never from this slice — see `fallbackTripTitle`. */
export const MAX_ROUTE_LABELS = 8;

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
