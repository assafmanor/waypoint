import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  BOOKING_TYPE_TO_CATEGORY,
  CATEGORY_TO_BOOKING_TYPE,
  EVENT_CATEGORY,
} from './constants';

// The `satisfies Record<…>` on both objects is the real guard — a new BookingType or
// EventCategory is a compile error until both directions answer it. What a runtime test
// adds is the part the compiler cannot see: that the two directions AGREE (ADR-0136 §2).
describe('the category ↔ booking-type pair', () => {
  it('answers every category, with the collapses ADR-0136 §2 tabulates', () => {
    expect(Object.keys(CATEGORY_TO_BOOKING_TYPE).sort()).toEqual(
      Object.values(EVENT_CATEGORY).sort(),
    );
    // Several categories collapse onto one type — the map is not injective, which is why
    // the form STATES its guess rather than deciding silently.
    expect(CATEGORY_TO_BOOKING_TYPE.sightseeing).toBe(BOOKING_TYPE.ACTIVITY);
    expect(CATEGORY_TO_BOOKING_TYPE.nature).toBe(BOOKING_TYPE.ACTIVITY);
    expect(CATEGORY_TO_BOOKING_TYPE.shopping).toBe(BOOKING_TYPE.OTHER);
    expect(CATEGORY_TO_BOOKING_TYPE.services).toBe(BOOKING_TYPE.OTHER);
  });

  // The honest edge, stated so a later "fix" has to argue with it: `transport` cannot tell a
  // train from a flight, and the form's own category pill is how you correct it.
  it('guesses flight for transport, deliberately', () => {
    expect(CATEGORY_TO_BOOKING_TYPE.transport).toBe(BOOKING_TYPE.FLIGHT);
    expect(BOOKING_TYPE_TO_CATEGORY.train).toBe(EVENT_CATEGORY.TRANSPORT);
  });

  // Stability, not symmetry: a category's type, read back as a category and forward again,
  // must land on the same type. This is what catches the two directions drifting apart
  // (a `shopping → other` beside an `other → services`) rather than merely growing.
  it('round-trips stably through the type it guesses', () => {
    for (const category of Object.values(EVENT_CATEGORY)) {
      const type = CATEGORY_TO_BOOKING_TYPE[category];
      expect(CATEGORY_TO_BOOKING_TYPE[BOOKING_TYPE_TO_CATEGORY[type]]).toBe(type);
    }
  });
});
