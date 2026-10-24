// **THE APP'S HALF OF HOW A DAY IS NAMED** (ADR-0219 §2/§7). The rules themselves are
// `@waypoint/shared`'s and tested there (`day-title.test.ts` in that package); what is
// answered here is where their inputs come from — which is exactly where the derivation
// went wrong.
//
// A linked event's place is its BOOKING's (ADR-0048), and the column on the event is cleared
// on save. `buildDayFacts` read that cleared column, so a day whose stops are booked offered
// the naming rule nothing: the owner's day 12 read `מפלי גולפוס ← Kerið Crater` — its two
// unbooked waterfalls — when its first stop was a booked zip line (2026-09-05). The projection
// had the same line and the same defect, so the reader agreed with the app about the wrong
// answer, which is why no surface could catch it.
import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  type Booking,
  type Place,
  type Trip,
  type TripEvent,
} from '@waypoint/shared';
import { buildDayFacts } from './day-title';

const DAY = '2026-07-07';
const stamps = { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };

const place = (id: string, name: string, address?: string): Place =>
  ({ id, tripId: 't1', name, address, ...stamps }) as Place;

const event = (over: Partial<TripEvent>): TripEvent =>
  ({
    id: over.id ?? 'e',
    tripId: 't1',
    date: DAY,
    title: 'x',
    kind: 'soft',
    status: 'planned',
    ...over,
  }) as TripEvent;

const booking = (over: Partial<Booking>): Booking =>
  ({
    id: over.id ?? 'b',
    tripId: 't1',
    type: BOOKING_TYPE.ACTIVITY,
    title: 'x',
    ...over,
  }) as Booking;

/** Everything a day's facts are built from, with only the day's rows varying. */
const factsFor = (dayEvents: TripEvent[], bookings: Booking[], places: Place[]) =>
  buildDayFacts({
    trip: { destination: 'איסלנד', startDate: DAY } as Pick<Trip, 'destination' | 'startDate'>,
    date: DAY,
    dayEvents,
    events: dayEvents,
    bookings,
    places,
    placeLabels: {},
    enrichments: {},
  });

describe('buildDayFacts · a booked stop is a stop', () => {
  const places = [place('p-zip', 'Zip line'), place('p-kerid', 'Kerið Crater')];

  it('takes a linked row’s place from its booking, and puts it in the day’s order', () => {
    const facts = factsFor(
      [
        event({ id: 'e-zip', bookingId: 'b-zip', sortOrder: 0 }),
        event({ id: 'e-kerid', placeId: 'p-kerid', sortOrder: 1 }),
      ],
      [booking({ id: 'b-zip', placeId: 'p-zip' })],
      places,
    );
    // FIRST — the position that decides the `from ← to` title, and the one that was missing.
    expect(facts.stops).toEqual(['Zip line', 'Kerið Crater']);
  });

  it('contributes both ends for a leg and neither as a single place', () => {
    const facts = factsFor(
      [event({ id: 'e-fly', bookingId: 'b-fly', sortOrder: 0 })],
      [
        booking({
          id: 'b-fly',
          type: BOOKING_TYPE.FLIGHT,
          fromPlaceId: 'p-zip',
          toPlaceId: 'p-kerid',
        }),
      ],
      places,
    );
    expect(facts.stops).toEqual(['Zip line', 'Kerið Crater']);
  });

  it('leaves an unlinked row reading its own place, as it always did', () => {
    const facts = factsFor([event({ id: 'e', placeId: 'p-kerid' })], [], places);
    expect(facts.stops).toEqual(['Kerið Crater']);
  });
});

// **AND WHAT A STOP IS CALLED** (ADR-0219's second follow-up; owner, of a head reading
// `מפלי גולפוס ← Árhólmar 1`: _"it should read zip line (the event title) instead of the
// address"_). The rule itself is `buildDayStopSequence`'s and is tested in `@waypoint/shared`;
// what this asserts is that the app HANDS IT what it needs — the event's title and the place's
// address — which is the half a shared unit test cannot see.
describe('buildDayFacts · a place named by its own street line', () => {
  it('titles the day by the trip’s word for the stop', () => {
    const facts = factsFor(
      [event({ id: 'e-zip', bookingId: 'b-zip', title: 'Zip line', sortOrder: 0 })],
      [booking({ id: 'b-zip', placeId: 'p-zip' })],
      [place('p-zip', 'Árhólmar 1', 'Árhólmar 1, 800 Selfoss, Iceland')],
    );
    expect(facts.stops).toEqual(['Zip line']);
  });

  it('leaves a real name alone, however generic the title beside it', () => {
    const facts = factsFor(
      [event({ id: 'e', placeId: 'p-falls', title: 'טיול בוקר' })],
      [],
      [place('p-falls', 'Skógafoss', 'Skógafoss, 861, Iceland')],
    );
    expect(facts.stops).toEqual(['Skógafoss']);
  });
});
