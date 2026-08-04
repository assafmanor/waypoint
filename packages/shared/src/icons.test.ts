import { describe, expect, it } from 'vitest';
import type { BookingType, EventCategory, TripEvent } from './entities';
import { BOOKING_TYPE, BOOKING_TYPE_TO_CATEGORY } from './constants';
import {
  authorsRoundTrip,
  bookingTypeDurationUnit,
  connectionWindow,
  isTightConnection,
  titlesFromRoute,
  BOOKING_TYPE_PROFILE,
  carriesRoute,
  CATEGORY_TIME_PROFILE,
  defaultKindForBookingType,
  hasSpanSchedule,
  eventDurationUnit,
  eventEndBoundary,
  eventTransitionKeys,
  isAmbient,
  isBracketed,
  isMultiDay,
  searchVibeIcons,
  typicalMinutesFor,
} from './icons';

const ORDINARY_CATEGORIES: EventCategory[] = [
  'food',
  'sightseeing',
  'nature',
  'activity',
  'shopping',
  'services',
  'other',
];

const ev = (partial: Partial<TripEvent>): TripEvent => ({
  id: 'ev',
  tripId: 't',
  date: '2026-07-07',
  title: 'x',
  kind: 'soft',
  status: 'planned',
  source: 'manual',
  sortOrder: 1,
  createdAt: '2026-07-07T00:00:00Z',
  updatedAt: '2026-07-07T00:00:00Z',
  updatedBy: 'u',
  ...partial,
});

describe('CATEGORY_TIME_PROFILE', () => {
  it('has one row per category (9)', () => {
    expect(Object.keys(CATEGORY_TIME_PROFILE)).toHaveLength(9);
  });

  it('seeds transport & lodging as bracketed + ambient-when-multi-day with transition keys', () => {
    expect(CATEGORY_TIME_PROFILE.transport).toEqual({
      bracketed: true,
      ambientWhenMultiDay: true,
      transitions: { startKey: 'departure', endKey: 'arrival' },
      durationUnit: 'hours',
      typicalMinutes: 60,
    });
    expect(CATEGORY_TIME_PROFILE.lodging).toEqual({
      bracketed: true,
      ambientWhenMultiDay: true,
      transitions: { startKey: 'checkIn', endKey: 'checkOut' },
      durationUnit: 'nights',
      typicalMinutes: 60,
    });
  });

  // `toMatchObject`, not `toEqual`, and the change is the point: since ADR-0161 §5 these
  // categories are ordinary in BEHAVIOUR and no longer identical, because typical length is
  // the one axis they differ on. Asserted below rather than here.
  it('seeds every other category as ordinary in behaviour', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(CATEGORY_TIME_PROFILE[category]).toMatchObject({
        bracketed: false,
        ambientWhenMultiDay: false,
        durationUnit: 'auto',
      });
    }
  });
});

// ADR-0161 §5: the default length offered when something is placed at a position and has
// no length of its own. The values are tunable; what is asserted is that every category has
// one, that it varies where the ADR says it should, and that the two ends of the range are
// the ones intended — a flat 60 for everything is what this replaced.
describe('typicalMinutesFor', () => {
  it('answers for every category, and for an unset one', () => {
    for (const category of Object.keys(CATEGORY_TIME_PROFILE) as EventCategory[]) {
      expect(typicalMinutesFor(category), category).toBeGreaterThan(0);
    }
    expect(typicalMinutesFor(null)).toBe(60);
    expect(typicalMinutesFor(undefined)).toBe(60);
  });

  it('varies by category rather than offering an hour for everything', () => {
    expect(typicalMinutesFor('food')).toBe(90);
    expect(typicalMinutesFor('sightseeing')).toBe(120);
    expect(typicalMinutesFor('nature')).toBe(180);
    expect(typicalMinutesFor('services')).toBe(60);
  });

  // A bracketed category's length comes from its two ends, so its value is the ordinary
  // one and carries no claim — asserted so a future tuning pass does not read meaning into it.
  it('leaves the bracketed categories on the default', () => {
    expect(typicalMinutesFor('transport')).toBe(60);
    expect(typicalMinutesFor('lodging')).toBe(60);
  });
});

describe('eventDurationUnit', () => {
  it('reads hours for transport, nights for lodging, auto otherwise', () => {
    expect(eventDurationUnit(ev({ category: 'transport' }))).toBe('hours');
    expect(eventDurationUnit(ev({ category: 'lodging' }))).toBe('nights');
    for (const category of ORDINARY_CATEGORIES) {
      expect(eventDurationUnit(ev({ category }))).toBe('auto');
    }
    expect(eventDurationUnit(ev({ category: undefined }))).toBe('auto');
  });
});

describe('isBracketed', () => {
  it('is true for transport & lodging', () => {
    expect(isBracketed(ev({ category: 'transport' }))).toBe(true);
    expect(isBracketed(ev({ category: 'lodging' }))).toBe(true);
  });

  it('is false for ordinary categories and for a null/unset category', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(isBracketed(ev({ category }))).toBe(false);
    }
    expect(isBracketed(ev({ category: undefined }))).toBe(false);
  });
});

describe('isMultiDay', () => {
  it('is true when endDate lands on a later day', () => {
    expect(isMultiDay(ev({ date: '2026-07-07', endDate: '2026-07-09' }))).toBe(true);
  });

  it('is false with no endDate (single overnight tail) or a same-day endDate', () => {
    expect(isMultiDay(ev({ date: '2026-07-07' }))).toBe(false);
    expect(isMultiDay(ev({ date: '2026-07-07', endDate: '2026-07-07' }))).toBe(false);
  });
});

describe('eventTransitionKeys', () => {
  it('resolves generic departure/arrival for a train (or any transport that carries you)', () => {
    // `🚗` was in this list until ADR-0162 — a hire is the one transport mode you drive
    // yourself, so it is picked up and returned rather than departed and arrived. It has
    // its own case below; the modes left here are the ones the generic wording fits.
    for (const icon of ['🚄', '🚆', '🚌', '⛴️', '🚡']) {
      expect(eventTransitionKeys(ev({ category: 'transport', icon }))).toEqual({
        startKey: 'departure',
        endKey: 'arrival',
      });
    }
  });

  it('resolves the same generic keys for transport with no icon (manual event)', () => {
    expect(eventTransitionKeys(ev({ category: 'transport', icon: undefined }))).toEqual({
      startKey: 'departure',
      endKey: 'arrival',
    });
  });

  it('refines to take-off/landing for a flight (✈️)', () => {
    expect(eventTransitionKeys(ev({ category: 'transport', icon: '✈️' }))).toEqual({
      startKey: 'flightDeparture',
      endKey: 'flightArrival',
    });
  });

  // The second glyph refinement, and the reason `ICON_TIME_PROFILE` holds a `Partial` of
  // the profile rather than a transitions pair (ADR-0162): a hire disagrees with its
  // category about BOTH its wording and its unit.
  it('refines to pick-up/return for a car hire (🚗), and reads it in days not hours', () => {
    const hire = ev({ category: 'transport', icon: '🚗' });
    expect(eventTransitionKeys(hire)).toEqual({ startKey: 'carPickup', endKey: 'carDropoff' });
    expect(eventDurationUnit(hire)).toBe('auto');
    // The category it belongs to is untouched — a bus still reads in hours.
    expect(eventDurationUnit(ev({ category: 'transport', icon: '🚌' }))).toBe('hours');
  });

  it('resolves check-in/check-out for lodging', () => {
    expect(eventTransitionKeys(ev({ category: 'lodging', icon: '🏨' }))).toEqual({
      startKey: 'checkIn',
      endKey: 'checkOut',
    });
  });

  it('is undefined for a non-bracketed or unset category', () => {
    expect(eventTransitionKeys(ev({ category: 'food' }))).toBeUndefined();
    expect(eventTransitionKeys(ev({ category: undefined }))).toBeUndefined();
  });
});

describe('isAmbient', () => {
  it('is true for a multi-day transport or lodging event', () => {
    expect(isAmbient(ev({ category: 'lodging', date: '2026-07-07', endDate: '2026-07-09' }))).toBe(
      true,
    );
    expect(
      isAmbient(ev({ category: 'transport', date: '2026-07-07', endDate: '2026-07-08' })),
    ).toBe(true);
  });

  it('is false for a same-day bracketed event (a same-day flight still counts)', () => {
    expect(isAmbient(ev({ category: 'transport', date: '2026-07-07' }))).toBe(false);
  });

  it('is false for an ordinary category even when multi-day', () => {
    for (const category of ORDINARY_CATEGORIES) {
      expect(isAmbient(ev({ category, date: '2026-07-07', endDate: '2026-07-09' }))).toBe(false);
    }
  });
});

describe('searchVibeIcons', () => {
  it('matches a glyph by any of its Hebrew or English terms, case-insensitively', () => {
    expect(searchVibeIcons('סקי')).toContain('🎿');
    expect(searchVibeIcons('SKI')).toContain('🎿');
  });

  it('returns none for a blank query (the picker shows the spaced clusters instead)', () => {
    expect(searchVibeIcons('')).toHaveLength(0);
    expect(searchVibeIcons('   ')).toHaveLength(0);
  });

  it('returns none for an unmatched query', () => {
    expect(searchVibeIcons('zzzznotaterm')).toHaveLength(0);
  });
});

describe('eventEndBoundary', () => {
  it('uses the exact end instant when endsAt is set (arrival / check-out / activity end)', () => {
    const endsAt = '2026-07-07T14:30:00Z';
    expect(eventEndBoundary(ev({ startsAt: '2026-07-07T10:30:00Z', endsAt }))).toEqual({
      kind: 'instant',
      at: Date.parse(endsAt),
    });
  });

  it('falls back to the whole check-out day for a multi-day stay with no end time', () => {
    expect(
      eventEndBoundary(
        ev({ date: '2026-07-05', endDate: '2026-07-09', startsAt: '2026-07-05T15:00:00Z' }),
      ),
    ).toEqual({ kind: 'day', date: '2026-07-09' });
  });

  it('prefers the end instant over the day even for a multi-day stay (check-out wins over check-in)', () => {
    const endsAt = '2026-07-09T11:00:00Z';
    expect(
      eventEndBoundary(
        ev({
          date: '2026-07-05',
          endDate: '2026-07-09',
          startsAt: '2026-07-05T15:00:00Z',
          endsAt,
        }),
      ),
    ).toEqual({ kind: 'instant', at: Date.parse(endsAt) });
  });

  it('uses the single moment for a same-day event with only a start', () => {
    const startsAt = '2026-07-07T09:00:00Z';
    expect(eventEndBoundary(ev({ startsAt }))).toEqual({
      kind: 'instant',
      at: Date.parse(startsAt),
    });
  });

  it('falls back to the whole day for an untimed event (only a date)', () => {
    expect(eventEndBoundary(ev({ date: '2026-07-07' }))).toEqual({
      kind: 'day',
      date: '2026-07-07',
    });
  });
});

// ── ADR-0154 §2 · the booking-type shape profile ────────────────────────────────
// These assert the PROPERTIES that made the table worth having, not a copy of its
// rows: a row-by-row echo would pass just as happily with the bug the table exists
// to prevent.
describe('BOOKING_TYPE_PROFILE (ADR-0154 §2)', () => {
  const ALL_TYPES = Object.values(BOOKING_TYPE) as BookingType[];

  it('covers every booking type, so a new one cannot be silently defaulted', () => {
    for (const type of ALL_TYPES) expect(BOOKING_TYPE_PROFILE[type]).toBeDefined();
    expect(Object.keys(BOOKING_TYPE_PROFILE).sort()).toEqual([...ALL_TYPES].sort());
  });

  // The invariant the six scattered predicates were each half-stating, and the one
  // the server enforces: a route-shaped type is exactly the transport-category one.
  it('agrees with the category mapping about which types carry a route', () => {
    for (const type of ALL_TYPES) {
      expect(carriesRoute(type)).toBe(BOOKING_TYPE_TO_CATEGORY[type] === 'transport');
    }
  });

  it('gives the four transport modes a route, and every other type a single place', () => {
    expect(carriesRoute(BOOKING_TYPE.FLIGHT)).toBe(true);
    expect(carriesRoute(BOOKING_TYPE.TRAIN)).toBe(true);
    // A hire's route is its counters: picked up at one, dropped at another (ADR-0162).
    // Both ends may be the same place, which a route already allows.
    expect(carriesRoute(BOOKING_TYPE.CAR)).toBe(true);
    // **The gap ADR-0154 pinned open is closed** (ADR-0156). This assertion used to read
    // `carriesRoute(OTHER) === false` with a comment saying the picker offered `other` as
    // 🚌 and the model disagreed. It does not any more: the pill writes `transit`, which
    // carries a route like the two above, and `other` is back to meaning a booking that
    // is not transport at all.
    expect(carriesRoute(BOOKING_TYPE.TRANSIT)).toBe(true);
    for (const type of [BOOKING_TYPE.HOTEL, BOOKING_TYPE.RESTAURANT, BOOKING_TYPE.ACTIVITY]) {
      expect(carriesRoute(type)).toBe(false);
    }
    expect(carriesRoute(BOOKING_TYPE.OTHER)).toBe(false);
  });

  // `places` and `schedule` are separate axes on purpose: a hotel is two endpoints
  // at ONE place. If someone ever collapses them, this is what fails.
  it('keeps the place shape and the schedule shape independent', () => {
    expect(hasSpanSchedule(BOOKING_TYPE.HOTEL)).toBe(true);
    expect(carriesRoute(BOOKING_TYPE.HOTEL)).toBe(false);
  });

  it('spans exactly the types that have two endpoints', () => {
    expect(ALL_TYPES.filter(hasSpanSchedule).sort()).toEqual(
      [
        BOOKING_TYPE.FLIGHT,
        BOOKING_TYPE.TRAIN,
        BOOKING_TYPE.TRANSIT,
        BOOKING_TYPE.CAR,
        BOOKING_TYPE.HOTEL,
        BOOKING_TYPE.ACTIVITY,
      ].sort(),
    );
  });

  // ADR-0136 §4: booked-ness and commitment are different axes, and a restaurant
  // booking being soft is the case that proves it.
  it('opens a restaurant and an `other` booking soft, and the span types hard', () => {
    expect(defaultKindForBookingType(BOOKING_TYPE.RESTAURANT)).toBe('soft');
    expect(defaultKindForBookingType(BOOKING_TYPE.OTHER)).toBe('soft');
    for (const type of ALL_TYPES.filter(hasSpanSchedule)) {
      expect(defaultKindForBookingType(type)).toBe('hard');
    }
  });

  // A mirrored leg reverses a route, so it can only belong to a type that has one.
  it('only offers a mirrored return where there is a route to mirror', () => {
    for (const type of ALL_TYPES) {
      if (authorsRoundTrip(type)) expect(carriesRoute(type)).toBe(true);
    }
    expect(ALL_TYPES.filter(authorsRoundTrip).sort()).toEqual(
      [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT].sort(),
    );
  });

  // The sequence half of the same axis (ADR-0159). Same claim as above, and the same
  // reason: a connection chains one leg's destination into the next leg's origin, so
  // it needs a route on both.
  it('only offers a connection where there is a route to chain', () => {
    for (const type of ALL_TYPES) {
      if (connectionWindow(type)) expect(carriesRoute(type)).toBe(true);
    }
    expect(ALL_TYPES.filter((t) => connectionWindow(t) != null).sort()).toEqual(
      [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT].sort(),
    );
  });

  // The two numbers are a decision, not a detail, so they are pinned: a flight is
  // measured against the aviation layover/stopover line, a platform is not.
  it('gives a flight an airport window and a train a platform one', () => {
    expect(connectionWindow(BOOKING_TYPE.FLIGHT)).toEqual({
      maxGapMinutes: 24 * 60,
      tightMinutes: 90,
    });
    expect(connectionWindow(BOOKING_TYPE.TRAIN)).toEqual({
      maxGapMinutes: 6 * 60,
      tightMinutes: 20,
    });
    expect(isTightConnection(BOOKING_TYPE.FLIGHT, 90)).toBe(true);
    expect(isTightConnection(BOOKING_TYPE.FLIGHT, 91)).toBe(false);
    expect(isTightConnection(BOOKING_TYPE.TRAIN, 90)).toBe(false);
    // Nothing about a hotel is a short connection, and asking is not an error.
    expect(isTightConnection(BOOKING_TYPE.HOTEL, 5)).toBe(false);
  });

  // **The claim ADR-0162 rests on**, and the reason a hire is not just `transit` with a
  // different glyph. ADR-0154 §2 promised a new mode would be one row; 0156 proved that
  // for a row that was a COPY of `transportProfile`. This is the first row that isn't,
  // and each of the three assertions below is a behaviour that was wrong while car hire
  // was folded into `transit`.
  it('gives a car hire a route and a span, but no return leg and no connection', () => {
    expect(carriesRoute(BOOKING_TYPE.CAR)).toBe(true);
    expect(hasSpanSchedule(BOOKING_TYPE.CAR)).toBe(true);
    expect(defaultKindForBookingType(BOOKING_TYPE.CAR)).toBe('hard');
    // You are driving it: a "return" is not a second rental to buy…
    expect(authorsRoundTrip(BOOKING_TYPE.CAR)).toBe(false);
    // …and two hires four hours apart are two hires, not one journey with a change.
    expect(connectionWindow(BOOKING_TYPE.CAR)).toBeNull();
    expect(isTightConnection(BOOKING_TYPE.CAR, 30)).toBe(false);
  });

  // **`titleFrom` is its own axis** (ADR-0163 §3), and this is the assertion that says why:
  // it is NOT the same question as `carriesRoute`. A hire has a route AND a name, and
  // asking the route question to decide the title is what saved `נריטה ← נריטה`.
  it('separates having a route from being named by it', () => {
    for (const type of [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT]) {
      expect(carriesRoute(type)).toBe(true);
      expect(titlesFromRoute(type)).toBe(true);
    }
    // The one row where the two answers differ — the whole reason for the column.
    expect(carriesRoute(BOOKING_TYPE.CAR)).toBe(true);
    expect(titlesFromRoute(BOOKING_TYPE.CAR)).toBe(false);
    // Nothing without a route can be titled by one.
    for (const type of ALL_TYPES) {
      if (titlesFromRoute(type)) expect(carriesRoute(type)).toBe(true);
    }
  });

  // The `durationUnit` column exists for exactly one row, so the test says so: it is an
  // exception to the category, not a new default for everyone (ADR-0162).
  it('reads a hire in the days you hold it, and every other transport in hours', () => {
    expect(bookingTypeDurationUnit(BOOKING_TYPE.CAR)).toBe('auto');
    for (const type of [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT]) {
      expect(bookingTypeDurationUnit(type)).toBe('hours');
    }
    // Untouched types still answer from their category — that is the fallback working.
    expect(bookingTypeDurationUnit(BOOKING_TYPE.HOTEL)).toBe('nights');
    expect(bookingTypeDurationUnit(BOOKING_TYPE.RESTAURANT)).toBe('auto');
  });
});
