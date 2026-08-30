import { NARRATIVE_SOURCE, type SharedDay } from '@waypoint/shared';

/**
 * **The narrative that never fails**, and the reason sharing works before any model exists.
 *
 * ADR-0213 §2 requires a complete public page with no `Day` entity, no authored titles and
 * no provider — so this derives everything it says from rows that are already there: the
 * places a day passes through, and the titles of its first events.
 *
 * **It emits no prose.** A deterministic title is `רייקיאוויק ← ויק`; a deterministic
 * summary is `נחיתה בקפלוויק · כניסה לדירה`. Both are trip data joined by punctuation, with
 * no word of any language in them — which is what lets one server-side derivation feed a
 * Hebrew page and a Hebrew PDF without this package owning UI copy. The sentence a reader
 * sees around the counts ("9 ימים · 21 אירועים") is composed by each renderer from
 * `trip.dayCount`/`eventCount`, in its own locale.
 *
 * An empty string is a legitimate answer — a day with no places and no events has nothing
 * true to say about itself, and inventing something is exactly the mandatory-day-title the
 * owner rejected. Renderers fall back to the date.
 */

/** The app's separator between peer facts, and never an em dash (root CLAUDE.md). */
export const NARRATIVE_SEPARATOR = ' · ';

/**
 * **Every value this module joins is isolated, and the join is not** (ADR-0118, and the
 * owner's report: _"the arrows are pointing the wrong way sometimes, when the names are
 * latin"_).
 *
 * A composed line here holds place names and event titles the app did not write, in
 * whatever script the world gave them — so its direction cannot be sniffed from its own
 * content. Under `dir="auto"`, `Haifoss ← Stutur crater` resolves LTR, which puts the
 * ORIGIN on the left and leaves the arrow pointing back at it; the identical string with a
 * Hebrew first stop resolves RTL and reads correctly. Two rows differing only in their data
 * disagreed about which way the trip goes.
 *
 * The repair is what `lib/bidi.ts` already does for a number and its unit, one level up:
 * each **value** becomes an isolate so it keeps its own internal direction, and the
 * punctuation between them stays in the surrounding flow, which both renderers pin to the
 * page's RTL. **A renderer of these strings must therefore NOT set `dir="auto"` on the
 * element** — `dir="auto"` ignores characters inside isolates when it sniffs, so a fully
 * isolated line has no strong character left and falls back to LTR.
 *
 * `FSI` rather than `LRI` for the values: a stop can be `Kerið Crater` or `אסבירג׳י`, and
 * first-strong is exactly the question "which of those is this one".
 */
const FIRST_STRONG_ISOLATE = '\u2068';
const LEFT_TO_RIGHT_ISOLATE = '\u2066';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

/** A value the app did not write, kept whole and self-directed inside a composed line. */
const isolate = (value: string): string =>
  `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;

/**
 * The route arrow, in an isolate of its own so its rendered direction is a constant.
 * Chromium leaves `←` unmirrored at either base direction, but mirroring an arrow inside an
 * RTL run is what the bidi algorithm permits, and this line's whole point is that the same
 * data renders the same way everywhere.
 */
export const ROUTE_ARROW = `${LEFT_TO_RIGHT_ISOLATE} ← ${POP_DIRECTIONAL_ISOLATE}`;

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
 * A route line between two stops, each isolated, so the arrow means the same thing whatever
 * script the names are in.
 *
 * **A round trip is a place, not a route.** Now that a leg contributes both its endpoints,
 * a day that leaves Reykjavík and comes back has the same label at both ends, and
 * `רייקיאוויק ← רייקיאוויק` says less than the bare name does.
 */
const routeLine = (from: string, to: string): string =>
  from === to ? isolate(from) : `${isolate(from)}${ROUTE_ARROW}${isolate(to)}`;

/** A day's title: where it went, or where it was. */
export function fallbackDayTitle(dayPlaceLabels: readonly (string | null | undefined)[]): string {
  const stops = dedupeConsecutive(dayPlaceLabels);
  if (stops.length === 0) return '';
  if (stops.length === 1) return isolate(stops[0]);
  return routeLine(stops[0], stops[stops.length - 1]);
}

/** A day's summary: what it actually holds, in order, truncated rather than paraphrased. */
export function fallbackDaySummary(eventTitles: readonly string[]): string {
  return eventTitles.slice(0, MAX_SUMMARY_EVENTS).map(isolate).join(NARRATIVE_SEPARATOR);
}

/** The trip's own line: its route, end to end. The counts beside it are fields, not
 *  sentences. Takes `routeLabels` UNCAPPED — the endpoints are the trip's, not the
 *  strip's. */
export function fallbackTripTitle(routeLabels: readonly string[], tripName: string): string {
  if (routeLabels.length === 0) return isolate(tripName);
  if (routeLabels.length === 1) return isolate(routeLabels[0]);
  return routeLine(routeLabels[0], routeLabels[routeLabels.length - 1]);
}

export interface NarrativeStrings {
  source: typeof NARRATIVE_SOURCE.DETERMINISTIC | typeof NARRATIVE_SOURCE.GENERATED;
  title: string;
  summary: string;
  days: Map<number, { title: string; summary: string }>;
}

/** Apply resolved narrative strings onto already-projected days. Kept separate from the
 *  projection so a generated result and a fallback take the identical path — a model can
 *  change the words on a day and nothing else about it. */
export function applyNarrative(days: SharedDay[], narrative: NarrativeStrings): SharedDay[] {
  return days.map((day) => {
    const override = narrative.days.get(day.ordinal);
    return override ? { ...day, title: override.title, summary: override.summary } : day;
  });
}
