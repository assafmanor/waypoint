// Shared booking-presentation grammar (ADR-0059 §3): the transition wording used
// by the hero, the glance markers, and the Index row/detail so a booking reads
// consistently wherever it appears. The keys are ADR-0063's profile transition
// keys (`checkIn`/`checkOut`/`departure`/`arrival`).
import {
  categoryForBookingType,
  edgeMeaning,
  eventMidSpan,
  eventTransitionKeys,
  isBracketed,
  windowBoundOf,
  type BookingType,
  type EventCategory,
  type TripEvent,
} from '@waypoint/shared';
import { ltrIsolate } from './bidi';
import { formatTime } from './time';
import { t } from '../i18n/he';

/** The Hebrew word for a profile transition key (המראה / צ׳ק-אין …). */
export const transitionLabel = (key: string): string =>
  (t.glance.transition as Record<string, string>)[key] ?? key;

/** The Hebrew word for a `midSpan` key — what the middle of a bracketed span is called
 *  while you are inside it (`בטיסה` / `בדרך` / `הרכב אצלנו`). The ends' resolver above,
 *  applied to the middle: same lookup shape, same reason (the word belongs to the mode,
 *  not to the surface showing it). */
export const midSpanWord = (key: string): string =>
  (t.board.midSpan as Record<string, string>)[key] ?? key;

/** How this event's middle reads right now — its two words and whether it is a journey
 *  or a held resource — or `undefined` when its middle does not surface at all.
 *
 *  One resolution for every surface that shows a span in progress, so the collapsed
 *  board and the lifted hero cannot disagree about what you are inside. */
export function eventMidSpanWords(event: TripEvent):
  | {
      kind: 'journey' | 'held';
      live: string;
      label: string;
    }
  | undefined {
  const mid = eventMidSpan(event);
  if (!mid) return undefined;
  return { kind: mid.kind, live: midSpanWord(mid.liveKey), label: midSpanWord(mid.labelKey) };
}

/** The transition word for ONE end of a bracketed event — its take-off or landing,
 *  departure or arrival, check-in or check-out — resolved through the same per-mode
 *  keys the hero and glance markers use (ADR-0063). `undefined` for an event with no
 *  bracketed ends, or for a mid-span day where neither end happens. */
export function eventEdgeTransition(
  event: TripEvent,
  edge: 'start' | 'end' | undefined,
): string | undefined {
  if (!edge || !isBracketed(event)) return undefined;
  const keys = eventTransitionKeys(event);
  const key = edge === 'end' ? keys?.endKey : keys?.startKey;
  return key ? transitionLabel(key) : undefined;
}

/** **WHAT ONE EDGE'S CLOCK SAYS** (ADR-0171 §3 · ADR-0184 §5), in one place because two
 *  surfaces now say it: the day's own transition row and the ambient strip above the list.
 *  A `window` reads as a range, a ceiling as `עד 11:00`, a floor as `מ-15:00`, and `exact`
 *  stays unmarked — it is the default, and marking it would put a word on nearly every row
 *  in the app to say "normal".
 *
 *  **Every branch isolates its numeric run**, and that is load-bearing rather than defensive.
 *  The strip's `.as` renders `${label} · ${phrase}` with no `dir` attribute at all, so a
 *  Hebrew word leads, the element resolves RTL, and an un-isolated range renders
 *  `21:00–17:00` there. The row's own box is RTL too since ADR-0184 §9d. Isolating the RUN
 *  is the rule that holds in every container (ADR-0118) — and this app has now paid for that
 *  lesson three times. */
export function edgeTimePhrase(
  event: Pick<
    TripEvent,
    'category' | 'icon' | 'startsAt' | 'endsAt' | 'startWindowEnd' | 'endWindowStart'
  >,
  edge: 'start' | 'end',
  atMs: number,
  zone: string,
): string {
  const bound = windowBoundOf(event, edge);
  if (bound) {
    // **A WINDOW READS ITS TWO AUTHORED NUMBERS, not `atMs`** — and this is a fix to what
    // shipped in ADR-0184 §9b, caught by writing the assertion rather than by looking at it.
    // `atMs` is where `edgeAt` PLACED the row, which for a windowed edge is not one of the
    // window's ends: a floor of 17:00 with a window to 20:00, pushed to a 22:00 landing,
    // rendered `20:00–22:00` — a window nobody typed, hiding that the real one had closed
    // (ADR-0184 §6's missed state). ADR-0184 §4's own words are the rule here: the row is
    // placed, never re-timed.
    const own = edge === 'start' ? event.startsAt : event.endsAt;
    const pair = [Date.parse(bound), Date.parse(own!)];
    return ltrIsolate(
      `${formatTime(new Date(Math.min(...pair)), zone)}–${formatTime(
        new Date(Math.max(...pair)),
        zone,
      )}`,
    );
  }
  // A single clock DOES read where the row was placed, which is ADR-0171 §10b and not an
  // inconsistency with the branch above: a check-out pinned to 09:40 by the hike you are on
  // means "be out by 09:40", and an unmarked 11:00 there would be actively wrong. One
  // authored number can be intersected; two describe a window, and intersecting only one end
  // of it invents the other.
  const clock = ltrIsolate(formatTime(new Date(atMs), zone));
  const meaning = edgeMeaning(event, edge);
  if (meaning === 'not-after') return t.day.untilTime(clock);
  if (meaning === 'not-before') return t.day.fromTime(clock);
  return clock;
}

/** **The ambient strip's read-out on a day the stay has an EDGE** (owner, 2026-08-13):
 *  `צ׳ק-אאוט · עד 09:40` where it used to say `לילה 1 מתוך 1`.
 *
 *  The count was the wrong fact for an edge day and the report is what makes that obvious:
 *  two guesthouses on one day — one being left, one being arrived at — both read
 *  `לילה 1 מתוך 1`, i.e. the same words for opposite events. `N מתוך M` stays on the middle
 *  days, where where-you-are-sleeping is all there is to say.
 *
 *  Takes the entry from the day's PLACED list rather than the authored instant, so the strip
 *  and the row cannot print two different numbers for one edge — the row's clock is bounded
 *  by `edgeAt` and the authored one is not. */
export function edgeSentence(
  entry: { event: TripEvent; edge: 'start' | 'end'; atMs: number; labelKey: string },
  zone: string,
): string {
  const phrase = edgeTimePhrase(entry.event, entry.edge, entry.atMs, zone);
  return `${transitionLabel(entry.labelKey)} · ${phrase}`;
}

/** Badge tint class for a booking's category (ADR-0059 §3 shared grammar):
 *  teal for lodging (a place), amber for transport (a time/commitment); none
 *  otherwise. Kept on the ADR-0028 budget — never decorative. */
export function bookingBadgeClass(category: EventCategory | null | undefined): string {
  if (category === 'lodging') return 'stay';
  if (category === 'transport') return 'trans';
  return '';
}

export const badgeClassForBookingType = (type: BookingType): string =>
  bookingBadgeClass(categoryForBookingType(type));
