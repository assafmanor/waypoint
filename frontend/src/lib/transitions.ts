// Shared booking-presentation grammar (ADR-0059 §3): the transition wording used
// by the hero, the glance markers, and the Index row/detail so a booking reads
// consistently wherever it appears. The keys are ADR-0063's profile transition
// keys (`checkIn`/`checkOut`/`departure`/`arrival`).
import {
  categoryForBookingType,
  eventMidSpan,
  eventTransitionKeys,
  isBracketed,
  type BookingType,
  type EventCategory,
  type TripEvent,
} from '@waypoint/shared';
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
