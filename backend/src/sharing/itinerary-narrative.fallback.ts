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
/** RTL-neutral route arrow. Reads right-to-left in a Hebrew page as `from ← to`. */
export const ROUTE_ARROW = ' ← ';

const MAX_ROUTE_LABELS = 8;
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

export function routeLabelsFrom(principalPlaces: readonly (string | null | undefined)[]): string[] {
  return dedupeConsecutive(principalPlaces).slice(0, MAX_ROUTE_LABELS);
}

/** A day's title: where it went, or where it was. */
export function fallbackDayTitle(dayPlaceLabels: readonly (string | null | undefined)[]): string {
  const stops = dedupeConsecutive(dayPlaceLabels);
  if (stops.length === 0) return '';
  if (stops.length === 1) return stops[0];
  return `${stops[0]}${ROUTE_ARROW}${stops[stops.length - 1]}`;
}

/** A day's summary: what it actually holds, in order, truncated rather than paraphrased. */
export function fallbackDaySummary(eventTitles: readonly string[]): string {
  return eventTitles.slice(0, MAX_SUMMARY_EVENTS).join(NARRATIVE_SEPARATOR);
}

/** The trip's own line: its route. The counts beside it are fields, not sentences. */
export function fallbackTripTitle(routeLabels: readonly string[], tripName: string): string {
  if (routeLabels.length === 0) return tripName;
  if (routeLabels.length === 1) return routeLabels[0];
  return `${routeLabels[0]}${ROUTE_ARROW}${routeLabels[routeLabels.length - 1]}`;
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
