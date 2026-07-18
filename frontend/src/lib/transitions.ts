// Shared booking-presentation grammar (ADR-0059 §3): the transition wording used
// by the hero, the glance markers, and the Index row/detail so a booking reads
// consistently wherever it appears. The keys are ADR-0063's profile transition
// keys (`checkIn`/`checkOut`/`departure`/`arrival`).
import { categoryForBookingType, type BookingType, type EventCategory } from '@waypoint/shared';
import { t } from '../i18n/he';

/** The Hebrew word for a profile transition key (המראה / צ׳ק-אין …). */
export const transitionLabel = (key: string): string =>
  (t.glance.transition as Record<string, string>)[key] ?? key;

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
