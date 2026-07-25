// Shared booking-presentation grammar (ADR-0059 §3): the transition wording used
// by the hero, the glance markers, and the Index row/detail so a booking reads
// consistently wherever it appears. The keys are ADR-0063's profile transition
// keys (`checkIn`/`checkOut`/`departure`/`arrival`).
import {
  categoryForBookingType,
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
