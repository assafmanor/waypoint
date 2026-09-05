import { describe, expect, it } from 'vitest';
import { BOOKING_TYPE } from './constants';
import { SHARE_DAY_KIND, SHARE_DAY_SUMMARY_KIND, SHARE_TRIP_SHAPE } from './sharing';
import type { ShareTripShape } from './sharing';
import { fallbackDaySummary, fallbackDayTitle, type DayFacts } from './day-title';

/**
 * **The derivation that names a day**, tested as a pure function because that is what it is
 * (ADR-0213's 2026-08-30 amendment). Every kind here is one the renderers have a word for;
 * a kind with no case in this file is a kind nothing in CI ever produces.
 */
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  stops: [],
  bookingTypes: [],
  eventTitles: [],
  ...over,
});

describe('fallbackDayTitle', () => {
  it('names the trip destination on the outbound flight, never the arrival airport', () => {
    const title = fallbackDayTitle(
      facts({
        bookingTypes: [BOOKING_TYPE.FLIGHT],
        flightTo: 'נמל התעופה הבינלאומי קפלוויק',
        tripDestination: 'איסלנד',
        outbound: true,
        stops: ['נתב״ג', 'נמל התעופה הבינלאומי קפלוויק'],
      }),
    );
    expect(title).toEqual({ kind: SHARE_DAY_KIND.FLIGHT_OUT, to: 'איסלנד' });
  });

  it('carries no place on the way home, because home is not a place it knows', () => {
    const title = fallbackDayTitle(
      facts({ bookingTypes: [BOOKING_TYPE.FLIGHT], flightTo: 'נתב״ג', returning: true }),
    );
    expect(title).toEqual({ kind: SHARE_DAY_KIND.FLIGHT_HOME });
  });

  // The guard that keeps a domestic hop from announcing a country nobody left: a mid-trip
  // flight is neither end, so it is titled by where it actually lands.
  it('titles a mid-trip flight by its arrival', () => {
    expect(
      fallbackDayTitle(facts({ bookingTypes: [BOOKING_TYPE.FLIGHT], flightTo: 'אקוריירי' })),
    ).toEqual({ kind: SHARE_DAY_KIND.FLIGHT, to: 'אקוריירי' });
  });

  it('routes a day between two stops and names a day that stayed put', () => {
    expect(fallbackDayTitle(facts({ stops: ['ויק', 'הפיורדים'] }))).toEqual({
      kind: SHARE_DAY_KIND.ROUTE,
      from: 'ויק',
      to: 'הפיורדים',
    });
    // A leg contributes both its ends, so a round trip has the same label twice — and
    // `רייקיאוויק ← רייקיאוויק` says less than the bare name does.
    expect(fallbackDayTitle(facts({ stops: ['רייקיאוויק', 'רייקיאוויק'] }))).toEqual({
      kind: SHARE_DAY_KIND.PLACE,
      at: 'רייקיאוויק',
    });
  });

  it('says nothing about a day with nothing in it', () => {
    expect(fallbackDayTitle(facts())).toEqual({ kind: SHARE_DAY_KIND.NONE });
  });

  // A flight with no arrival place recorded cannot be phrased as one, so it falls through
  // to the stops rather than printing a sentence with a hole in it.
  it('falls back to the route when a flight has no arrival to name', () => {
    expect(
      fallbackDayTitle(facts({ bookingTypes: [BOOKING_TYPE.FLIGHT], stops: ['ויק', 'קפלוויק'] })),
    ).toEqual({ kind: SHARE_DAY_KIND.ROUTE, from: 'ויק', to: 'קפלוויק' });
  });
});

describe('fallbackDaySummary', () => {
  it('says where the night is, in preference to what the day held', () => {
    expect(
      fallbackDaySummary(facts({ lodgingPlace: 'Laugavegur 22', eventTitles: ['מפל גולפוס'] }), {
        kind: SHARE_DAY_KIND.NONE,
      }),
    ).toEqual({ kind: SHARE_DAY_SUMMARY_KIND.STAY, place: 'Laugavegur 22' });
  });

  // **The second line must not repeat the first.** This is the whole reason a flight day
  // printed two airport names under a headline made of the same two airport names.
  it('drops the event titles the headline already said', () => {
    expect(
      fallbackDaySummary(facts({ eventTitles: ['ויק', 'החוף השחור', 'קפה'] }), {
        kind: SHARE_DAY_KIND.ROUTE,
        from: 'ויק',
        to: 'הפיורדים',
      }),
    ).toEqual({ kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['החוף השחור', 'קפה'] });
  });

  it('is empty when the headline said everything there was', () => {
    expect(
      fallbackDaySummary(facts({ eventTitles: ['ויק'] }), {
        kind: SHARE_DAY_KIND.PLACE,
        at: 'ויק',
      }),
    ).toEqual({ kind: SHARE_DAY_SUMMARY_KIND.NONE });
  });
  /**
   * **A star trip's day is a place, not a route** (owner, 2026-08-30). This is the rule the
   * shape classification exists to serve: on a trip with one base, every day leaves from
   * and returns to the same bed, so `base ← wherever` is a description of the commute — and
   * it repeats, nearly identically, on every day of the trip.
   */
  describe('the day title depends on the trip shape', () => {
    const facts = (tripShape?: ShareTripShape): DayFacts => ({
      stops: ['Tokyo', 'Nikko', 'Tokyo'],
      bookingTypes: [],
      lodgingPlace: 'Tokyo',
      eventTitles: [],
      tripShape,
    });

    it('names the day by where it went, on a star trip', () => {
      expect(fallbackDayTitle(facts(SHARE_TRIP_SHAPE.BASE))).toEqual({
        kind: SHARE_DAY_KIND.PLACE,
        // Not `Tokyo`, which is where it slept and is already on the stay line.
        at: 'Nikko',
      });
    });

    it('still says a route on a rolling trip', () => {
      expect(
        fallbackDayTitle({
          ...facts(SHARE_TRIP_SHAPE.LINE),
          stops: ['Lisboa', 'Porto'],
          lodgingPlace: 'Porto',
        }),
      ).toEqual({ kind: SHARE_DAY_KIND.ROUTE, from: 'Lisboa', to: 'Porto' });
    });

    it('takes the old behaviour when the shape is not known', () => {
      // A trip that records no nights has no shape, and a title rule that guessed one
      // would be inventing exactly the thing this derivation refuses to invent.
      expect(fallbackDayTitle(facts(undefined))).toEqual({
        kind: SHARE_DAY_KIND.PLACE,
        at: 'Tokyo',
      });
    });

    it('falls back to the first stop when every stop IS the base', () => {
      // A day spent entirely at home base: there is no "away" stop to name, and the base
      // itself is the only true answer.
      expect(
        fallbackDayTitle({ ...facts(SHARE_TRIP_SHAPE.BASE), stops: ['Tokyo', 'Tokyo'] }),
      ).toEqual({ kind: SHARE_DAY_KIND.PLACE, at: 'Tokyo' });
    });
  });
  /**
   * **Where you were, then what you saw, then where you went** (ADR-0166's 2026-08-30
   * amendment). Both new rungs come from claims the enrichment pass already reads, and both
   * beat a route made of two arbitrary stop names — which is the rule they replace.
   */
  describe('a day named from its enrichment', () => {
    const base: DayFacts = {
      stops: ['Baugur Bjólfs', 'Hengifoss', 'Stuðlagil Canyon'],
      bookingTypes: [],
      eventTitles: [],
    };

    it('prefers the region to a route between two of its stops', () => {
      expect(fallbackDayTitle({ ...base, region: 'מיוואטן' })).toEqual({
        kind: SHARE_DAY_KIND.REGION,
        at: 'מיוואטן',
      });
    });

    it('falls to what the stops ARE when there is no region', () => {
      expect(fallbackDayTitle({ ...base, kind: 'מפל מים' })).toEqual({
        kind: SHARE_DAY_KIND.KIND,
        of: 'מפל מים',
      });
    });

    it('prefers the region to the kind — where beats what', () => {
      expect(fallbackDayTitle({ ...base, region: 'מיוואטן', kind: 'מפל מים' }).kind).toBe(
        SHARE_DAY_KIND.REGION,
      );
    });

    it('still says a flight first, because a flight renames its whole day', () => {
      expect(
        fallbackDayTitle({
          ...base,
          region: 'מיוואטן',
          bookingTypes: [BOOKING_TYPE.FLIGHT],
          returning: true,
        }),
      ).toEqual({ kind: SHARE_DAY_KIND.FLIGHT_HOME });
    });
  });
});
