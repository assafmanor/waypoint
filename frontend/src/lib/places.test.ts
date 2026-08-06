import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type Booking,
  type Place,
  type TripEvent,
} from '@waypoint/shared';
import {
  bookingDirectionsUrl,
  bookingMapPlace,
  bookingShowOnMap,
  eventDirectionsUrl,
  eventDisplayZones,
  eventDurationLabel,
  eventEdgeZone,
  eventMapPlace,
  eventRoute,
  eventShowOnMap,
  ideaShowOnMap,
  eventZones,
  bookingEndZones,
  currentZone,
  dayAmbientZone,
  authoringZone,
  dayZoneContext,
  isDayOver,
  liveToday,
  liveZone,
  liveZoneContext,
  mapsDirectionsUrl,
  mapsDayRouteUrl,
  mapsKnowledgeUrl,
  nextDestination,
  referencedPlaceIds,
  segmentZoneAt,
  tripZoneCrossings,
  type ZoneContext,
  type ZoneCrossing,
  type ZoneEvidence,
} from './places';
import { isoToTimeInput, todayInTz, zonedIso, zoneOffsetMinutes } from './time';
import type { MaybeItem } from '@waypoint/shared';

const place = (id: string, name: string, coords?: Partial<Place>): Place => ({
  id,
  tripId: 't',
  name,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...coords,
});

const booking = (partial: Partial<Booking> & Pick<Booking, 'id' | 'type'>): Booking => ({
  tripId: 't',
  title: 'x',
  source: BOOKING_SOURCE.MANUAL,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const event = (partial: Partial<TripEvent>): TripEvent => ({
  id: 'ev',
  tripId: 't',
  date: '2026-07-07',
  title: 'טיסה',
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 1,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const PLACES = [place('pl-tlv', 'נתב״ג'), place('pl-nrt', 'נריטה')];

describe('eventRoute', () => {
  it('resolves a transport-linked event to its origin→destination places', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-tlv',
      toPlaceId: 'pl-nrt',
    });
    expect(eventRoute(event({ bookingId: 'bk' }), [bk], PLACES)).toEqual({
      from: 'נתב״ג',
      to: 'נריטה',
    });
  });

  it('returns null for a non-transport booking (falls back to the title)', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'pl-nrt' });
    expect(eventRoute(event({ bookingId: 'bk' }), [bk], PLACES)).toBeNull();
  });

  // **The bug this shipped with** (ADR-0163 §3's miss, owner report 2026-08-04). §3 made a
  // hire's stored TITLE its company, and this derivation kept rebuilding a route from the
  // place FKs — so the day row and the Index row printed `נריטה ← נריטה` regardless, and
  // `נריטה ← -` whenever the return place was unset. The gate is `titlesFromRoute`, not the
  // category and not `carriesRoute`: a hire HAS a route and is not NAMED by one.
  it('returns null for a car hire, which carries a route but is named by its company', () => {
    const sameCounter = booking({
      id: 'bk',
      type: BOOKING_TYPE.CAR,
      fromPlaceId: 'pl-nrt',
      toPlaceId: 'pl-nrt',
    });
    expect(eventRoute(event({ bookingId: 'bk' }), [sameCounter], PLACES)).toBeNull();
    // The one-way hire too — the route is real, it is just not this row's name.
    const oneWay = booking({
      id: 'bk',
      type: BOOKING_TYPE.CAR,
      fromPlaceId: 'pl-tlv',
      toPlaceId: 'pl-nrt',
    });
    expect(eventRoute(event({ bookingId: 'bk' }), [oneWay], PLACES)).toBeNull();
    // …and the half-filled one, which is what produced the visible `-`.
    const noReturn = booking({ id: 'bk', type: BOOKING_TYPE.CAR, fromPlaceId: 'pl-nrt' });
    expect(eventRoute(event({ bookingId: 'bk' }), [noReturn], PLACES)).toBeNull();
  });

  // The three travelling modes are untouched by the narrowing.
  it('still resolves a route for every mode that IS named by one', () => {
    for (const type of [BOOKING_TYPE.FLIGHT, BOOKING_TYPE.TRAIN, BOOKING_TYPE.TRANSIT]) {
      const bk = booking({ id: 'bk', type, fromPlaceId: 'pl-tlv', toPlaceId: 'pl-nrt' });
      expect(eventRoute(event({ bookingId: 'bk' }), [bk], PLACES)).toEqual({
        from: 'נתב״ג',
        to: 'נריטה',
      });
    }
  });

  it('returns null for an unlinked event (it never carries a route)', () => {
    expect(eventRoute(event({ bookingId: undefined, placeId: 'pl-tlv' }), [], PLACES)).toBeNull();
  });

  it('returns the partial route when only one endpoint is set', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.FLIGHT, fromPlaceId: 'pl-tlv' });
    expect(eventRoute(event({ bookingId: 'bk' }), [bk], PLACES)).toEqual({
      from: 'נתב״ג',
      to: undefined,
    });
  });

  it('returns null when a transport booking has no endpoints yet', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.FLIGHT });
    expect(eventRoute(event({ bookingId: 'bk' }), [bk], PLACES)).toBeNull();
  });
});

describe('referencedPlaceIds (ADR-0112: in-trip = referenced, not merely cached)', () => {
  const maybe = (placeId?: string): MaybeItem =>
    ({ id: 'm', tripId: 't', title: 'x', placeId }) as MaybeItem;

  it('collects placeIds from events, bookings (single + transport endpoints), and maybe-items', () => {
    const ids = referencedPlaceIds(
      [event({ placeId: 'pl-event' })],
      [
        booking({ id: 'b1', type: BOOKING_TYPE.HOTEL, placeId: 'pl-hotel' }),
        booking({
          id: 'b2',
          type: BOOKING_TYPE.FLIGHT,
          fromPlaceId: 'pl-from',
          toPlaceId: 'pl-to',
        }),
      ],
      [maybe('pl-maybe')],
    );
    expect([...ids].sort()).toEqual(['pl-event', 'pl-from', 'pl-hotel', 'pl-maybe', 'pl-to']);
  });

  it('excludes a cached-only place that nothing references', () => {
    // 'pl-cached' exists as a row but no entity points at it → not in the trip.
    const ids = referencedPlaceIds([event({ placeId: 'pl-event' })], [], []);
    expect(ids.has('pl-cached')).toBe(false);
    expect(ids.has('pl-event')).toBe(true);
  });
});

describe('Google Maps deep-links (Phase 2: no coordinates → no link)', () => {
  const withCoords = place('pl-x', 'מקום', { lat: 35.6764, lng: 139.65, googlePlaceId: 'g-x' });
  const coordless = place('pl-y', 'שם בלבד'); // a name-only Place-lite

  it('mapsDirectionsUrl builds a dir link with the place id when coords exist', () => {
    expect(mapsDirectionsUrl(withCoords)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=35.6764%2C139.65&destination_place_id=g-x',
    );
  });

  // The whole day as one free directions deep-link, which ships with the day
  // connector that draws the same order (ADR-0121 §10). Origin → waypoints →
  // destination, in exactly that sequence, so a paid-Routes follow-up can reuse it.
  it('mapsDayRouteUrl carries the day’s stops as origin, waypoints and destination', () => {
    expect(
      mapsDayRouteUrl([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
        { lat: 5, lng: 6 },
      ]),
    ).toBe('https://www.google.com/maps/dir/?api=1&origin=1%2C2&destination=5%2C6&waypoints=3%2C4');
  });

  it('mapsDayRouteUrl omits waypoints for two stops, and is null under two', () => {
    expect(
      mapsDayRouteUrl([
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ]),
    ).toBe('https://www.google.com/maps/dir/?api=1&origin=1%2C2&destination=3%2C4');
    expect(mapsDayRouteUrl([{ lat: 1, lng: 2 }])).toBeNull();
    expect(mapsDayRouteUrl([])).toBeNull();
  });

  it('omits the place-id param when googlePlaceId is absent', () => {
    const noGoogle = place('pl-z', 'ללא', { lat: 1, lng: 2 });
    expect(mapsDirectionsUrl(noGoogle)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=1%2C2',
    );
  });

  it('returns null for a coordless place or undefined (no location, no button)', () => {
    expect(mapsDirectionsUrl(coordless)).toBeNull();
    expect(mapsDirectionsUrl(undefined)).toBeNull();
  });

  // `עוד בגוגל` (ADR-0167 §6): a different question from `נווט` and from the retired
  // `mapsPlaceUrl`, on the same free universal-URL builder. Never null — §6 wants it present
  // even for a place we know nothing about, which is the majority case.
  it('mapsKnowledgeUrl opens Google’s own panel when we have its place id', () => {
    expect(mapsKnowledgeUrl(withCoords)).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D7%9E%D7%A7%D7%95%D7%9D&query_place_id=g-x',
    );
  });

  it('mapsKnowledgeUrl disambiguates a hand-dropped pin by address, else by point', () => {
    const dropped = place('pl-d', 'הפינה', { lat: 35.1, lng: 139.2 });
    expect(mapsKnowledgeUrl(dropped)).toContain(
      'query=%D7%94%D7%A4%D7%99%D7%A0%D7%94%2035.1%2C139.2',
    );
    const addressed = place('pl-a', 'הפינה', { lat: 35.1, lng: 139.2, address: 'Shibuya 1-2' });
    expect(mapsKnowledgeUrl(addressed)).toContain('Shibuya%201-2');
    // A coordless Place-lite still gets a way through: a name search beats nothing.
    expect(mapsKnowledgeUrl(coordless)).toBe(
      'https://www.google.com/maps/search/?api=1&query=%D7%A9%D7%9D%20%D7%91%D7%9C%D7%91%D7%93',
    );
  });

  it('eventDirectionsUrl follows the authority rule (transport → origin)', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-x',
      toPlaceId: 'pl-y',
    });
    const url = eventDirectionsUrl(event({ bookingId: 'bk' }), [bk], [withCoords, coordless]);
    expect(url).toContain('destination=35.6764%2C139.65');
  });

  it('eventDirectionsUrl is null when the resolved place is coordless', () => {
    expect(eventDirectionsUrl(event({ placeId: 'pl-y' }), [], [coordless])).toBeNull();
  });

  it('bookingDirectionsUrl resolves a single-place booking to its place', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'pl-x' });
    expect(bookingDirectionsUrl(bk, [withCoords])).toContain('destination=35.6764%2C139.65');
  });

  it('bookingDirectionsUrl is null when the booking has no mappable place', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL });
    expect(bookingDirectionsUrl(bk, [withCoords])).toBeNull();
  });

  // `מפה` resolves to a PLACE, not a URL: since Phase 6 its destination is our own
  // map focused on that place, never Google's place view (ADR-0121 §8). Same
  // authority rule and the same no-coords → no-affordance rule as directions.
  it('eventMapPlace / bookingMapPlace resolve the place to focus, undefined when coordless', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'pl-x' });
    expect(eventMapPlace(event({ placeId: 'pl-x' }), [], [withCoords])?.id).toBe('pl-x');
    expect(bookingMapPlace(bk, [withCoords])?.id).toBe('pl-x');
    expect(eventMapPlace(event({ placeId: 'pl-y' }), [], [coordless])).toBeUndefined();
    expect(
      bookingMapPlace(booking({ id: 'b', type: BOOKING_TYPE.HOTEL }), [withCoords]),
    ).toBeUndefined();
  });

  // **A ROUTE HAS TWO PLACES AND THE ROW KNOWS WHICH ONE IT IS** (owner, 2026-08-06: _"the map
  // centers around the departure and not the landing, which is wrong in this case. It should be
  // aware of the relevant node."_). `eventPlaceId` answers with the ORIGIN, which is right for a
  // surface about the booking as a whole and wrong for a per-edge row: a card labelled `נחיתה`
  // sent you to the airport you took off from.
  it('a route resolves to the END this edge is about, and to the origin without one', () => {
    const from = place('pl-from', 'פרנקפורט', { lat: 50.03, lng: 8.56 });
    const to = place('pl-to', 'בן גוריון', { lat: 32.0, lng: 34.88 });
    const flight = booking({
      id: 'fl',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-from',
      toPlaceId: 'pl-to',
    });
    const leg = event({ bookingId: 'fl' });
    const places = [from, to];
    expect(eventMapPlace(leg, [flight], places, 'end')?.id).toBe('pl-to');
    expect(eventMapPlace(leg, [flight], places, 'start')?.id).toBe('pl-from');
    // No edge is the booking-level question, whose answer is unchanged.
    expect(eventMapPlace(leg, [flight], places)?.id).toBe('pl-from');
  });
});

describe('nextDestination (navigate-to-next, ADR-0106 §6)', () => {
  const hotel = place('pl-hotel', 'מלון', { lat: 35.68, lng: 139.76, googlePlaceId: 'g-hotel' });
  const airport = place('pl-tlv2', 'נתב״ג', { lat: 32.0, lng: 34.88, googlePlaceId: 'g-tlv' });
  const arrival = place('pl-nrt2', 'נריטה', { lat: 35.77, lng: 140.39 });
  const nameOnly = place('pl-lite', 'שם בלבד');
  const PL = [hotel, airport, arrival, nameOnly];
  const NOW = Date.parse('2026-07-07T09:00:00Z');
  const at = (h: string) => `2026-07-07T${h}:00Z`;

  it('picks the earliest upcoming event with a mappable place', () => {
    const later = event({ id: 'later', placeId: 'pl-hotel', startsAt: at('15:00') });
    const sooner = event({ id: 'sooner', placeId: 'pl-nrt2', startsAt: at('11:00') });
    const result = nextDestination([later, sooner], [], PL, NOW);
    expect(result?.event.id).toBe('sooner');
    expect(result?.place.id).toBe('pl-nrt2');
    expect(result?.url).toContain('destination=35.77%2C140.39');
  });

  it('resolves transport to its ORIGIN — you go to the airport you fly from', () => {
    const flight = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-tlv2',
      toPlaceId: 'pl-nrt2',
    });
    const result = nextDestination(
      [event({ id: 'fl', bookingId: 'bk', startsAt: at('12:00') })],
      [flight],
      PL,
      NOW,
    );
    expect(result?.place.id).toBe('pl-tlv2');
  });

  it('looks past an event with no place, and past a coordless Place-lite', () => {
    const placeless = event({ id: 'soft', startsAt: at('10:00'), kind: EVENT_KIND.SOFT });
    const lite = event({ id: 'lite', placeId: 'pl-lite', startsAt: at('10:30') });
    const mappable = event({ id: 'real', placeId: 'pl-hotel', startsAt: at('14:00') });
    expect(nextDestination([placeless, lite, mappable], [], PL, NOW)?.event.id).toBe('real');
  });

  it('ignores what is behind you, in progress, done, skipped, or untimed', () => {
    const passed = event({ id: 'passed', placeId: 'pl-hotel', startsAt: at('07:00') });
    const inProgress = event({
      id: 'inprog',
      placeId: 'pl-hotel',
      startsAt: at('08:00'),
      endsAt: at('10:00'),
    });
    const done = event({
      id: 'done',
      placeId: 'pl-hotel',
      startsAt: at('11:00'),
      status: EVENT_STATUS.DONE,
    });
    const skipped = event({
      id: 'skipped',
      placeId: 'pl-hotel',
      startsAt: at('12:00'),
      status: EVENT_STATUS.SKIPPED,
    });
    const untimed = event({ id: 'untimed', placeId: 'pl-hotel' });
    expect(
      nextDestination([passed, inProgress, done, skipped, untimed], [], PL, NOW),
    ).toBeUndefined();
  });

  it('offers a hotel before check-in but not once you are inside the stay', () => {
    const stay = (startsAt: string) =>
      event({ id: 'stay', placeId: 'pl-hotel', startsAt, endsAt: at('20:00') });
    expect(nextDestination([stay(at('15:00'))], [], PL, NOW)?.place.id).toBe('pl-hotel');
    expect(nextDestination([stay(at('08:00'))], [], PL, NOW)).toBeUndefined();
  });

  it('is undefined when nothing upcoming has a location (no tile rather than a wrong one)', () => {
    expect(nextDestination([], [], PL, NOW)).toBeUndefined();
    expect(
      nextDestination([event({ id: 'x', placeId: 'pl-lite', startsAt: at('18:00') })], [], PL, NOW),
    ).toBeUndefined();
  });
});

describe('per-event display zones (ADR-0107 multi-zone model)', () => {
  const JLM = 'Asia/Jerusalem';
  const TYO = 'Asia/Tokyo';
  const NYC = 'America/New_York';
  const PRIMARY = TYO; // trip primary = destination (ADR-0107 §5)

  const tlv = place('pl-tlv', 'נתב״ג', { timezone: JLM });
  const nrt = place('pl-nrt', 'נריטה', { timezone: TYO });
  const coordless = place('pl-lite', 'שם בלבד'); // Place-lite, no timezone
  const ZONED = [tlv, nrt, coordless];

  // Outbound flight TLV→NRT departing 20:00Z — the one zone crossing.
  const flightBk = booking({
    id: 'bk-fl',
    type: BOOKING_TYPE.FLIGHT,
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-nrt',
  });
  const flightEv = event({
    id: 'ev-fl',
    bookingId: 'bk-fl',
    startsAt: '2026-07-07T20:00:00Z',
    endsAt: '2026-07-08T09:00:00Z',
  });
  const crossings = tripZoneCrossings([flightEv], [flightBk], ZONED);
  const zones = (e: TripEvent, opts?: { bookings?: Booking[] }) =>
    eventDisplayZones(e, {
      bookings: opts?.bookings ?? [],
      places: ZONED,
      crossings,
      primaryZone: PRIMARY,
    });

  describe('tripZoneCrossings', () => {
    it('builds a crossing for a flight whose endpoint zones differ', () => {
      expect(crossings).toEqual([
        { at: Date.parse('2026-07-07T20:00:00Z'), fromZone: JLM, toZone: TYO },
      ]);
    });

    it('ignores a same-zone hop and a coordless endpoint', () => {
      const sameZone = booking({
        id: 'b1',
        type: BOOKING_TYPE.TRAIN,
        fromPlaceId: 'pl-nrt',
        toPlaceId: 'pl-nrt',
      });
      const missingZone = booking({
        id: 'b2',
        type: BOOKING_TYPE.FLIGHT,
        fromPlaceId: 'pl-tlv',
        toPlaceId: 'pl-lite',
      });
      const evs = [
        event({ id: 'e1', bookingId: 'b1', startsAt: '2026-07-09T10:00:00Z' }),
        event({ id: 'e2', bookingId: 'b2', startsAt: '2026-07-10T10:00:00Z' }),
      ];
      expect(tripZoneCrossings(evs, [sameZone, missingZone], ZONED)).toEqual([]);
    });

    it('sorts crossings by departure instant', () => {
      const back = booking({
        id: 'bk-ret',
        type: BOOKING_TYPE.FLIGHT,
        fromPlaceId: 'pl-nrt',
        toPlaceId: 'pl-tlv',
      });
      const retEv = event({ id: 'ev-ret', bookingId: 'bk-ret', startsAt: '2026-07-20T02:00:00Z' });
      const cs = tripZoneCrossings([retEv, flightEv], [back, flightBk], ZONED);
      expect(cs.map((c) => c.at)).toEqual([
        Date.parse('2026-07-07T20:00:00Z'),
        Date.parse('2026-07-20T02:00:00Z'),
      ]);
    });
  });

  describe('segmentZoneAt', () => {
    it('reads origin before the crossing and destination at/after it', () => {
      expect(segmentZoneAt(Date.parse('2026-07-07T05:00:00Z'), crossings)).toBe(JLM);
      expect(segmentZoneAt(Date.parse('2026-07-07T20:00:00Z'), crossings)).toBe(TYO);
      expect(segmentZoneAt(Date.parse('2026-07-09T10:00:00Z'), crossings)).toBe(TYO);
    });

    it('is undefined when nothing anchors the timeline', () => {
      expect(segmentZoneAt(Date.parse('2026-07-07T05:00:00Z'), [])).toBeUndefined();
    });
  });

  describe('eventDisplayZones', () => {
    it('honours a manual displayTimezone override for both ends, over any place', () => {
      const pinned = event({
        id: 'ev-p',
        placeId: 'pl-nrt',
        displayTimezone: NYC,
        startsAt: '2026-07-09T10:00:00Z',
      });
      expect(zones(pinned)).toEqual({ start: NYC, end: NYC });
    });

    it('renders transport start in the origin zone and end in the destination zone', () => {
      expect(zones(flightEv, { bookings: [flightBk] })).toEqual({ start: JLM, end: TYO });
    });

    it('drives both ends from a single attached place', () => {
      const placed = event({ id: 'ev-pl', placeId: 'pl-nrt', startsAt: '2026-07-09T10:00:00Z' });
      expect(zones(placed)).toEqual({ start: TYO, end: TYO });
    });

    it('gives a placeless event its itinerary segment zone (origin before, destination after)', () => {
      const coffee = event({ id: 'ev-c', startsAt: '2026-07-07T05:00:00Z' }); // before the flight
      const dinner = event({ id: 'ev-d', startsAt: '2026-07-08T10:00:00Z' }); // after the flight
      expect(zones(coffee)).toEqual({ start: JLM, end: JLM });
      expect(zones(dinner)).toEqual({ start: TYO, end: TYO });
    });

    it('falls back to the trip primary zone with no anchoring transport or no time', () => {
      const noCrossing = (e: TripEvent) =>
        eventDisplayZones(e, { bookings: [], places: ZONED, crossings: [], primaryZone: PRIMARY });
      expect(noCrossing(event({ id: 'ev-x', startsAt: '2026-07-07T05:00:00Z' }))).toEqual({
        start: PRIMARY,
        end: PRIMARY,
      });
      expect(zones(event({ id: 'ev-u', startsAt: undefined }))).toEqual({
        start: PRIMARY,
        end: PRIMARY,
      });
    });

    it('falls back to the segment zone for a coordless attached place', () => {
      const liteAfter = event({ id: 'ev-l', placeId: 'pl-lite', startsAt: '2026-07-08T10:00:00Z' });
      expect(zones(liteAfter)).toEqual({ start: TYO, end: TYO });
    });
  });

  const ctxWith = (ambientZone: string): ZoneContext => ({
    bookings: [flightBk],
    places: ZONED,
    crossings,
    primaryZone: PRIMARY,
    ambientZone,
  });

  // Jerusalem is UTC+3 in July (IDT), Tokyo is UTC+9 → Tokyo is +360 min ahead.
  describe('eventZones — the shift drives visibility', () => {
    it('no shift for a single-zone event matching the day ambient', () => {
      const dinner = event({
        id: 'z1',
        startsAt: '2026-07-08T10:00:00Z',
        endsAt: '2026-07-08T11:00:00Z',
      }); // after the flight → TYO, ambient TYO
      expect(eventZones(dinner, ctxWith(TYO))).toEqual({
        startZone: TYO,
        endZone: TYO,
        deltaMinutes: undefined,
      });
    });

    it('a single-zone event differing from ambient carries the shift vs the day', () => {
      const coffee = event({
        id: 'z2',
        startsAt: '2026-07-07T05:00:00Z',
        endsAt: '2026-07-07T06:00:00Z',
      }); // before the flight → JLM, ambient TYO → Jerusalem is 6h behind Tokyo
      expect(eventZones(coffee, ctxWith(TYO))).toEqual({
        startZone: JLM,
        endZone: JLM,
        deltaMinutes: -360,
      });
    });

    it('a zone-crossing transport carries destination-vs-origin, regardless of ambient', () => {
      const expected = { startZone: JLM, endZone: TYO, deltaMinutes: 360 };
      expect(eventZones(flightEv, ctxWith(JLM))).toEqual(expected);
      expect(eventZones(flightEv, ctxWith(TYO))).toEqual(expected);
    });
  });

  describe('eventEdgeZone — transition edges', () => {
    it('carries the edge zone + its shift vs ambient (departure origin, arrival destination)', () => {
      // Departure edge measured against a Tokyo ambient → Jerusalem is 6h behind.
      expect(eventEdgeZone(flightEv, 'start', ctxWith(TYO))).toEqual({
        zone: JLM,
        deltaMinutes: -360,
      });
      // Arrival edge measured against a Jerusalem ambient → Tokyo is 6h ahead.
      expect(eventEdgeZone(flightEv, 'end', ctxWith(JLM))).toEqual({
        zone: TYO,
        deltaMinutes: 360,
      });
    });

    it('a same-zone edge is bare when it matches ambient, shifted when it differs', () => {
      const hotel = event({
        id: 'h',
        placeId: 'pl-nrt', // TYO
        startsAt: '2026-07-09T05:00:00Z',
        endsAt: '2026-07-12T02:00:00Z',
      });
      expect(eventEdgeZone(hotel, 'start', ctxWith(TYO))).toEqual({
        zone: TYO,
        deltaMinutes: undefined,
      });
      expect(eventEdgeZone(hotel, 'start', ctxWith(JLM))).toEqual({
        zone: TYO,
        deltaMinutes: 360,
      });
    });
  });

  describe('eventDurationLabel — shown for transport + zone-shifted rows', () => {
    it('labels a transport row (always)', () => {
      // The flight has start + end and a transport booking → duration shows.
      expect(eventDurationLabel(flightEv, flightBk, { deltaMinutes: 360 })).toBeTruthy();
    });

    it('labels a zone-shifted non-transport row (its raw times can misread)', () => {
      const dinner = event({
        id: 'd',
        startsAt: '2026-07-08T10:00:00Z',
        endsAt: '2026-07-08T12:00:00Z',
      });
      expect(eventDurationLabel(dinner, undefined, { deltaMinutes: -360 })).toBeTruthy();
    });

    it('is undefined for a same-zone non-transport row (the range is self-evident)', () => {
      const dinner = event({
        id: 'd2',
        startsAt: '2026-07-08T10:00:00Z',
        endsAt: '2026-07-08T12:00:00Z',
      });
      expect(eventDurationLabel(dinner, undefined, { deltaMinutes: undefined })).toBeUndefined();
    });

    it('is undefined without a start+end span', () => {
      expect(
        eventDurationLabel(event({ id: 'd3', startsAt: '2026-07-08T10:00:00Z' }), flightBk, {
          deltaMinutes: undefined,
        }),
      ).toBeUndefined();
    });
  });
});

describe('currentZone — the live "now" follows your itinerary segment (ADR-0107 §4)', () => {
  const JLM = 'Asia/Jerusalem';
  const TYO = 'Asia/Tokyo';
  // One outbound crossing, departing 20:00Z.
  const cs = [{ at: Date.parse('2026-07-07T20:00:00Z'), fromZone: JLM, toZone: TYO }];

  it('reads the origin zone before the crossing and the destination at/after it', () => {
    expect(currentZone(Date.parse('2026-07-07T05:00:00Z'), cs, TYO)).toBe(JLM);
    expect(currentZone(Date.parse('2026-07-07T20:00:00Z'), cs, TYO)).toBe(TYO);
    expect(currentZone(Date.parse('2026-07-09T10:00:00Z'), cs, TYO)).toBe(TYO);
  });

  it('falls back to the trip primary zone when nothing anchors the timeline', () => {
    expect(currentZone(Date.parse('2026-07-07T05:00:00Z'), [], TYO)).toBe(TYO);
  });

  it('rolls the calendar day at the live segment midnight, so "today" re-anchors', () => {
    // 22:00Z on the 7th: still the 7th in Jerusalem (+3 → 01:00 on the 8th, so the
    // 8th) — the point is the two zones disagree about the date, and the live zone
    // is what "today" must follow after the crossing.
    const at = new Date('2026-07-07T16:00:00Z'); // 19:00 JLM (7th) vs 01:00 TYO (8th)
    expect(todayInTz(currentZone(at.getTime(), cs, TYO), at)).toBe('2026-07-07'); // pre-crossing → JLM
    const after = new Date('2026-07-07T20:30:00Z'); // 05:30 TYO on the 8th
    expect(todayInTz(currentZone(after.getTime(), cs, TYO), after)).toBe('2026-07-08');
  });
});

describe('dayAmbientZone — the zone a given DAY is framed in (ADR-0107)', () => {
  const JLM = 'Asia/Jerusalem';
  const TYO = 'Asia/Tokyo';
  const NIC = 'Asia/Nicosia'; // same offset as Jerusalem, different zone
  // Outbound crossing departing 2026-07-07 20:00Z (23:00 JLM).
  const cs = [{ at: Date.parse('2026-07-07T20:00:00Z'), fromZone: JLM, toZone: TYO }];
  /** Evidence with no events at all — the old crossing-only behaviour. */
  const bare = (crossings = cs, primaryZone = TYO): ZoneEvidence => ({
    events: [],
    bookings: [],
    places: [],
    crossings,
    primaryZone,
  });

  it('frames a pre-crossing day in the origin zone and a later day in the destination', () => {
    expect(dayAmbientZone('2026-07-06', bare())).toBe(JLM);
    expect(dayAmbientZone('2026-07-09', bare())).toBe(TYO);
  });

  it('samples at noon, so a late-evening crossing leaves its own day on the origin', () => {
    // The crossing is at 23:00 local, but the day it departs is still lived in the
    // origin zone — sampling at noon is what keeps that true.
    expect(dayAmbientZone('2026-07-07', bare())).toBe(JLM);
  });

  it('falls back to the trip primary zone with no crossings', () => {
    expect(dayAmbientZone('2026-07-07', bare([]))).toBe(TYO);
  });

  it('is NOT the live zone: mid-flight they disagree, which is the whole point', () => {
    // 21:00Z on the 7th — you are in the air, so the segment has already rolled to
    // Tokyo, while the day you are flying through is still framed in Jerusalem
    // (ADR-0029 amendment: that is what keeps the travel day editable).
    const midFlight = Date.parse('2026-07-07T21:00:00Z');
    expect(currentZone(midFlight, cs, TYO)).toBe(TYO);
    expect(dayAmbientZone('2026-07-07', bare())).toBe(JLM);
  });

  // ── The day's own events outrank the crossing-derived segment (session 100) ──
  describe("the day's own events", () => {
    const pl = (id: string, timezone?: string) => place(id, id, timezone ? { timezone } : {});
    const at = (id: string, date: string, placeId?: string, extra: Partial<TripEvent> = {}) =>
      event({ id, date, placeId, startsAt: `${date}T09:00:00Z`, ...extra });

    it('frames the day in the zone its own placed events agree on, not the last flight', () => {
      // The reported bug: after an outbound TLV→Tokyo flight, a later day whose only
      // events are in Cyprus was framed in TOKYO, so every event on it drew a shift
      // pill against a zone nothing on that day was in.
      const evidence: ZoneEvidence = {
        events: [at('e1', '2026-07-09', 'pl-nic'), at('e2', '2026-07-09', 'pl-jlm')],
        bookings: [],
        places: [pl('pl-nic', NIC), pl('pl-jlm', JLM)],
        crossings: cs,
        primaryZone: TYO,
      };
      expect(dayAmbientZone('2026-07-09', evidence)).toBe(NIC);
    });

    it('agrees by OFFSET, so two same-time zones are not a mixed day', () => {
      // Nicosia and Jerusalem are different zone ids that always agree about the
      // time, so a day split between them has one ambient — and neither event gets
      // a pill against it (the delta is 0).
      const evidence: ZoneEvidence = {
        events: [at('e1', '2026-07-09', 'pl-nic'), at('e2', '2026-07-09', 'pl-jlm')],
        bookings: [],
        places: [pl('pl-nic', NIC), pl('pl-jlm', JLM)],
        crossings: [],
        primaryZone: TYO,
      };
      const ambient = dayAmbientZone('2026-07-09', evidence);
      const noon = new Date(Date.parse('2026-07-09T09:00:00Z'));
      expect(zoneOffsetMinutes(noon, ambient)).toBe(zoneOffsetMinutes(noon, JLM));
    });

    it('abstains on a genuinely mixed day, falling back to the segment (a travel day)', () => {
      const evidence: ZoneEvidence = {
        events: [at('e1', '2026-07-09', 'pl-nic'), at('e2', '2026-07-09', 'pl-tyo')],
        bookings: [],
        places: [pl('pl-nic', NIC), pl('pl-tyo', TYO)],
        crossings: cs,
        primaryZone: 'UTC',
      };
      expect(dayAmbientZone('2026-07-09', evidence)).toBe(TYO); // the segment, not a guess
    });

    it('ignores placeless events, so the vote can never just confirm the segment', () => {
      // A placeless event's zone IS the segment zone; letting it vote would make the
      // consensus circular and this rule a no-op.
      const evidence: ZoneEvidence = {
        events: [at('e1', '2026-07-09'), at('e2', '2026-07-09')],
        bookings: [],
        places: [],
        crossings: cs,
        primaryZone: 'UTC',
      };
      expect(dayAmbientZone('2026-07-09', evidence)).toBe(TYO);
    });

    it('ignores a zone-crossing flight: it moves you, it cannot say where the day is', () => {
      const flight = booking({
        id: 'bk',
        type: BOOKING_TYPE.FLIGHT,
        fromPlaceId: 'pl-jlm',
        toPlaceId: 'pl-tyo',
      });
      const evidence: ZoneEvidence = {
        events: [at('e1', '2026-07-09', undefined, { bookingId: 'bk' })],
        bookings: [flight],
        places: [pl('pl-jlm', JLM), pl('pl-tyo', TYO)],
        crossings: cs,
        primaryZone: 'UTC',
      };
      expect(dayAmbientZone('2026-07-09', evidence)).toBe(TYO); // the segment
    });

    it('counts a multi-night stay on its middle nights (where you are sleeping)', () => {
      const hotel = booking({ id: 'bk-h', type: BOOKING_TYPE.HOTEL, placeId: 'pl-nic' });
      const evidence: ZoneEvidence = {
        events: [
          event({
            id: 'stay',
            bookingId: 'bk-h',
            date: '2026-07-08',
            endDate: '2026-07-11',
            startsAt: '2026-07-08T12:00:00Z',
            endsAt: '2026-07-11T08:00:00Z',
          }),
        ],
        bookings: [hotel],
        places: [pl('pl-nic', NIC)],
        crossings: cs,
        primaryZone: 'UTC',
      };
      // The 9th carries no event of its own, but the stay covers it.
      expect(dayAmbientZone('2026-07-09', evidence)).toBe(NIC);
    });
  });
});

describe('liveZone — the clock follows the day you are in (ADR-0107 session-100)', () => {
  const JLM = 'Asia/Jerusalem';
  const KEF = 'Atlantic/Reykjavik';
  const NIC = 'Asia/Nicosia';

  it("reads the day's own zone, not the zone of the last flight taken", () => {
    // The reported bug, end to end: a TLV→KEF flight on the 24th makes every later
    // instant "Iceland" by segment, so the now-line showed 21:31 while the traveler's
    // day (all Cyprus/Israel bookings) was at 00:31.
    const crossings = [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }];
    const evidence: ZoneEvidence = {
      events: [
        event({
          id: 'taverna',
          date: '2026-07-25',
          placeId: 'pl-nic',
          startsAt: '2026-07-24T21:00:00Z',
        }),
      ],
      bookings: [],
      places: [place('pl-nic', 'טברנה', { timezone: NIC })],
      crossings,
      primaryZone: JLM,
    };
    const nowMs = Date.parse('2026-07-24T21:31:00Z'); // 00:31 the next day in Cyprus
    expect(currentZone(nowMs, crossings, JLM)).toBe(KEF); // the raw segment
    expect(liveZone(nowMs, evidence)).toBe(NIC); // what the clock now reads
    expect(todayInTz(liveZone(nowMs, evidence), new Date(nowMs))).toBe('2026-07-25');
  });

  it("reads an in-progress event's own zone (the taverna is happening now)", () => {
    const evidence: ZoneEvidence = {
      events: [
        event({
          id: 'taverna',
          date: '2026-07-25',
          placeId: 'pl-nic',
          startsAt: '2026-07-24T21:30:00Z',
          endsAt: '2026-07-24T22:30:00Z',
        }),
      ],
      bookings: [],
      places: [place('pl-nic', 'טברנה', { timezone: NIC })],
      crossings: [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }],
      primaryZone: JLM,
    };
    expect(liveZone(Date.parse('2026-07-24T22:00:00Z'), evidence)).toBe(NIC);
  });

  it('reads the DESTINATION while a crossing flight is in progress (§8)', () => {
    const flight = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-jlm',
      toPlaceId: 'pl-kef',
    });
    const evidence: ZoneEvidence = {
      events: [
        event({
          id: 'fl',
          bookingId: 'bk',
          date: '2026-07-24',
          startsAt: '2026-07-24T04:15:00Z',
          endsAt: '2026-07-24T11:00:00Z',
        }),
      ],
      bookings: [flight],
      places: [
        place('pl-jlm', 'נתב״ג', { timezone: JLM }),
        place('pl-kef', 'קפלאוויק', { timezone: KEF }),
      ],
      crossings: [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }],
      primaryZone: JLM,
    };
    expect(liveZone(Date.parse('2026-07-24T08:00:00Z'), evidence)).toBe(KEF);
  });

  it('ignores an event days away — it says nothing about the current clock', () => {
    const evidence: ZoneEvidence = {
      events: [
        event({
          id: 'later',
          date: '2026-07-30',
          placeId: 'pl-nic',
          startsAt: '2026-07-30T09:00:00Z',
        }),
      ],
      bookings: [],
      places: [place('pl-nic', 'טברנה', { timezone: NIC })],
      crossings: [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }],
      primaryZone: JLM,
    };
    // Falls through to the day frame (here: the segment), not to Cyprus.
    expect(liveZone(Date.parse('2026-07-24T21:31:00Z'), evidence)).toBe(KEF);
  });

  it('still follows the segment mid-flight, where the day has no consensus', () => {
    const crossings = [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }];
    const evidence: ZoneEvidence = {
      events: [],
      bookings: [],
      places: [],
      crossings,
      primaryZone: JLM,
    };
    expect(liveZone(Date.parse('2026-07-24T06:00:00Z'), evidence)).toBe(KEF);
  });
});

describe('booking zone overrides — per-end pins (ADR-0107 §6 session-99 amendment)', () => {
  const JLM = 'Asia/Jerusalem';
  const KEF = 'Atlantic/Reykjavik';
  const TYO = 'Asia/Tokyo';
  // 'pl-lite' is a coordless Place-lite: a real trip place with no timezone, which
  // is the whole reason an override exists.
  const PLACES_LITE = [
    place('pl-tlv', 'נתב״ג', { timezone: JLM }),
    place('pl-nrt', 'נריטה', { timezone: TYO }),
    place('pl-lite', 'קפלאוויק'),
  ];
  const ctx = (bookings: Booking[], crossings: ZoneCrossing[] = []) => ({
    bookings,
    places: PLACES_LITE,
    crossings,
    primaryZone: TYO,
  });

  it('a pinned end wins over the segment fallback, per end', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-tlv',
      toPlaceId: 'pl-lite',
      endDisplayTimezone: KEF,
    });
    const ev = event({ bookingId: 'bk', startsAt: '2026-07-07T04:15:00Z' });
    // Origin still derives from its real place; only the unknowable end is pinned.
    expect(eventDisplayZones(ev, ctx([bk]))).toEqual({ start: JLM, end: KEF });
  });

  it('a place with a real zone still wins over nothing being pinned', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-tlv',
      toPlaceId: 'pl-nrt',
    });
    const ev = event({ bookingId: 'bk', startsAt: '2026-07-07T04:15:00Z' });
    expect(eventDisplayZones(ev, ctx([bk]))).toEqual({ start: JLM, end: TYO });
  });

  it("a single-place booking's start pin drives BOTH ends", () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.HOTEL,
      placeId: 'pl-lite',
      startDisplayTimezone: KEF,
    });
    const ev = event({ bookingId: 'bk', startsAt: '2026-07-07T14:00:00Z' });
    expect(eventDisplayZones(ev, ctx([bk]))).toEqual({ start: KEF, end: KEF });
  });

  it('the EVENT override still outranks a booking pin (both ends)', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-lite',
      toPlaceId: 'pl-lite',
      startDisplayTimezone: JLM,
      endDisplayTimezone: KEF,
    });
    const ev = event({
      bookingId: 'bk',
      startsAt: '2026-07-07T04:15:00Z',
      displayTimezone: TYO,
    });
    expect(eventDisplayZones(ev, ctx([bk]))).toEqual({ start: TYO, end: TYO });
  });

  it('pinned zones make a real crossing, so the itinerary partitions on them', () => {
    // Both endpoints are coordless, so before the pins there is NO crossing at all
    // and every placeless time falls back to the trip primary.
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-lite',
      toPlaceId: 'pl-lite',
    });
    const ev = event({ bookingId: 'bk', startsAt: '2026-07-07T04:15:00Z' });
    expect(tripZoneCrossings([ev], [bk], PLACES_LITE)).toEqual([]);

    const pinned = { ...bk, startDisplayTimezone: JLM, endDisplayTimezone: KEF };
    expect(tripZoneCrossings([ev], [pinned], PLACES_LITE)).toEqual([
      { at: Date.parse('2026-07-07T04:15:00Z'), fromZone: JLM, toZone: KEF },
    ]);
  });

  it('bookingEndZones reports "unknown" rather than guessing a zone', () => {
    const bk = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-tlv',
      toPlaceId: 'pl-lite',
    });
    // The caller (the form's chip, the crossing detection) needs to distinguish
    // "we know this end" from "we fell back", so this returns undefined, not a
    // fallback zone.
    expect(bookingEndZones(bk, PLACES_LITE)).toEqual({ from: JLM, to: undefined });
  });
});

describe('zone contexts — one builder, so surfaces cannot diverge (session 102)', () => {
  const JLM = 'Asia/Jerusalem';
  const KEF = 'Atlantic/Reykjavik';
  const NIC = 'Asia/Nicosia';
  // The reported trip: one outbound TLV→KEF crossing, then a Cyprus/Israel day.
  const crossings = [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }];
  const taverna = event({
    id: 'taverna',
    date: '2026-07-25',
    placeId: 'pl-nic',
    startsAt: '2026-07-24T21:00:00Z',
    endsAt: '2026-07-24T21:15:00Z',
  });
  const avram = event({
    id: 'avram',
    date: '2026-07-25',
    placeId: 'pl-jlm',
    startsAt: '2026-07-25T04:00:00Z',
    endsAt: '2026-07-25T05:00:00Z',
  });
  const evidence: ZoneEvidence = {
    events: [taverna, avram],
    bookings: [],
    places: [
      place('pl-nic', 'טברנה', { timezone: NIC }),
      place('pl-jlm', 'הנכד של אברם', { timezone: JLM }),
    ],
    crossings,
    primaryZone: JLM,
  };

  it('gives a day surface the DAY ambient — the Trip view and the Plan builder get the same context', () => {
    // Plan mode used to derive its own crossings and its own segment-at-noon ambient,
    // so it kept showing pills the Trip view had stopped showing. Both now call this.
    const ctx = dayZoneContext('2026-07-25', evidence);
    expect(ctx.ambientZone).toBe(NIC);
    // Same input → same context, which is the property that keeps the two in step.
    expect(dayZoneContext('2026-07-25', evidence)).toEqual(ctx);
  });

  it('kills both reported pills: same-offset events on their own day', () => {
    const ctx = dayZoneContext('2026-07-25', evidence);
    expect(eventZones(taverna, ctx).deltaMinutes).toBeUndefined();
    expect(eventZones(avram, ctx).deltaMinutes).toBeUndefined();
  });

  it('gives a live surface the LIVE ambient — a shift there means "not where I am"', () => {
    const nowMs = Date.parse('2026-07-24T21:31:00Z'); // 00:31 in Cyprus
    expect(liveZoneContext(nowMs, evidence).ambientZone).toBe(NIC);
  });

  it('carries the shared evidence through unchanged, so nothing is re-derived', () => {
    const ctx = dayZoneContext('2026-07-25', evidence);
    expect(ctx.crossings).toBe(evidence.crossings);
    expect(ctx.bookings).toBe(evidence.bookings);
    expect(ctx.places).toBe(evidence.places);
    expect(ctx.primaryZone).toBe(evidence.primaryZone);
  });
});

describe('authoringZone — a form types in the zone the view reads back (session 128)', () => {
  const JLM = 'Asia/Jerusalem';
  const TYO = 'Asia/Tokyo';
  // ADR-0107's worked example: a Tokyo trip (primary = destination) whose outbound
  // TLV→NRT flight departs 20:00Z on the 7th. Before it you are on Jerusalem's clock.
  const flightBk = booking({
    id: 'bk-fl',
    type: BOOKING_TYPE.FLIGHT,
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-nrt',
  });
  const flightEv = event({
    id: 'ev-fl',
    bookingId: 'bk-fl',
    startsAt: '2026-07-07T20:00:00Z',
    endsAt: '2026-07-08T09:00:00Z',
  });
  const places = [
    place('pl-tlv', 'נתב״ג', { timezone: JLM }),
    place('pl-nrt', 'נריטה', { timezone: TYO }),
    place('pl-lite', 'שם בלבד'),
  ];
  const evidence: ZoneEvidence = {
    events: [flightEv],
    bookings: [flightBk],
    places,
    crossings: tripZoneCrossings([flightEv], [flightBk], places),
    primaryZone: TYO,
  };

  it('types a pre-departure time on the origin clock, not the trip primary', () => {
    expect(authoringZone({}, { date: '2026-07-07', time: '15:00' }, evidence)).toBe(JLM);
  });

  it('types a post-arrival time on the destination clock', () => {
    expect(authoringZone({}, { date: '2026-07-08', time: '19:00' }, evidence)).toBe(TYO);
  });

  it('lets a picked place answer over the segment', () => {
    // Standing in Israel on flight day, but the place is in Tokyo.
    expect(
      authoringZone({ placeId: 'pl-nrt' }, { date: '2026-07-07', time: '15:00' }, evidence),
    ).toBe(TYO);
    // A coordless Place-lite answers nothing, so the segment still does.
    expect(
      authoringZone({ placeId: 'pl-lite' }, { date: '2026-07-07', time: '15:00' }, evidence),
    ).toBe(JLM);
  });

  it("stands in the day's noon when no time is typed yet", () => {
    // A fresh draft on a day starts in THAT day's zone rather than the primary —
    // otherwise the chip states one zone and the first typed digit changes it.
    expect(authoringZone({}, { date: '2026-07-07' }, evidence)).toBe(JLM);
    expect(authoringZone({}, { date: '2026-07-08' }, evidence)).toBe(TYO);
  });

  it('round-trips: the instant it builds reads back as the time that was typed', () => {
    // The bug this closes — the shelf slotted 15:00 in the trip primary (Tokyo)
    // while the day view rendered the row in the day's own zone (Jerusalem), so a
    // pre-departure idea reappeared at 09:00.
    const zone = authoringZone({}, { date: '2026-07-07', time: '15:00' }, evidence);
    const scheduled = event({
      id: 'ev-new',
      date: '2026-07-07',
      startsAt: zonedIso('2026-07-07', '15:00', zone),
    });
    const shown = eventDisplayZones(scheduled, evidence).start;
    expect(isoToTimeInput(scheduled.startsAt!, shown)).toBe('15:00');
    // Authored in the trip primary instead (the old behaviour), it shifts.
    const wrong = zonedIso('2026-07-07', '15:00', evidence.primaryZone);
    expect(isoToTimeInput(wrong, shown)).toBe('09:00');
  });
});

describe('liveToday — one answer to "what day is it now", in both modes (session 102)', () => {
  const JLM = 'Asia/Jerusalem';
  const KEF = 'Atlantic/Reykjavik';
  const NIC = 'Asia/Nicosia';
  const crossings = [{ at: Date.parse('2026-07-24T04:15:00Z'), fromZone: JLM, toZone: KEF }];
  const evidence: ZoneEvidence = {
    events: [
      event({
        id: 'taverna',
        date: '2026-07-25',
        placeId: 'pl-nic',
        startsAt: '2026-07-24T21:00:00Z',
        endsAt: '2026-07-24T21:15:00Z',
      }),
    ],
    bookings: [],
    places: [place('pl-nic', 'טברנה', { timezone: NIC })],
    crossings,
    primaryZone: JLM,
  };
  const nowMs = Date.parse('2026-07-24T21:31:00Z'); // 00:31 on the 25th in Cyprus

  it('rolls with the live zone, not the trip primary', () => {
    expect(liveToday(nowMs, evidence)).toBe('2026-07-25');
    expect(liveZone(nowMs, evidence)).toBe(NIC);
  });

  it('takes no mode, so Trip and Plan cannot disagree about "now"', () => {
    // The bug this replaces: the day-strip anchor and the Plan builder's
    // now-reference each read `todayInTz(trip.timezone, …)` on their own, so
    // switching modes changed what time it was. There is one function now and it
    // has no mode parameter — the type system is the guarantee.
    expect(liveToday(nowMs, evidence)).toBe(liveToday(nowMs, evidence));
    expect(liveToday.length).toBe(2); // (nowMs, evidence) — nothing else to pass
  });
});

describe('isDayOver — a day ends when its LAST clock says so (ADR-0029 session-103)', () => {
  const JLM = 'Asia/Jerusalem';
  const AKL = 'Pacific/Auckland';
  const NIC = 'Asia/Nicosia';
  const DAY = '2026-07-07';
  const flight = booking({
    id: 'bk',
    type: BOOKING_TYPE.FLIGHT,
    fromPlaceId: 'pl-tlv',
    toPlaceId: 'pl-akl',
  });
  const places = [
    place('pl-tlv', 'נתב״ג', { timezone: JLM }),
    place('pl-akl', 'אוקלנד', { timezone: AKL }),
    place('pl-nic', 'ניקוסיה', { timezone: NIC }),
  ];
  // A far-eastbound red-eye: leaves 02:00 Jerusalem on the 7th, lands in Auckland
  // on the 8th. The whole of the 7th is "after the crossing", so its ambient is AKL.
  const airborne = event({
    id: 'fl',
    bookingId: 'bk',
    date: DAY,
    startsAt: '2026-07-06T23:00:00Z',
    endsAt: '2026-07-08T02:00:00Z',
  });
  const travelDay: ZoneEvidence = {
    events: [airborne],
    bookings: [flight],
    places,
    crossings: tripZoneCrossings([airborne], [flight], places),
    primaryZone: JLM,
  };

  it('does NOT lock a travel day while the traveler is still inside it', () => {
    // 18:00 on the 7th where they departed — but 03:00 on the 8th in Auckland, the
    // day's ambient. Keying the gate to the ambient (session 96) locked this.
    const midFlight = Date.parse('2026-07-07T15:00:00Z');
    expect(dayAmbientZone(DAY, travelDay)).toBe(AKL); // the ambient really is AKL
    expect(isDayOver(DAY, travelDay, midFlight)).toBe(false);
  });

  it('locks it once the day is over in the LAST of its zones', () => {
    // 00:30 on the 8th in Jerusalem — now the 7th is over everywhere it touched.
    expect(isDayOver(DAY, travelDay, Date.parse('2026-07-07T21:30:00Z'))).toBe(true);
    // …and an hour earlier it is not (23:30 on the 7th in Jerusalem).
    expect(isDayOver(DAY, travelDay, Date.parse('2026-07-07T20:30:00Z'))).toBe(false);
  });

  it('is unchanged on a single-zone day: its one clock decides', () => {
    const dinner = event({ id: 'd', date: DAY, placeId: 'pl-nic', startsAt: `${DAY}T17:00:00Z` });
    const oneZone: ZoneEvidence = {
      events: [dinner],
      bookings: [],
      places,
      crossings: [],
      primaryZone: NIC,
    };
    // 23:00 Nicosia on the 7th → not over; 00:15 on the 8th → over.
    expect(isDayOver(DAY, oneZone, Date.parse('2026-07-07T20:00:00Z'))).toBe(false);
    expect(isDayOver(DAY, oneZone, Date.parse('2026-07-07T21:15:00Z'))).toBe(true);
  });

  it('treats same-offset zones as one clock (no phantom extra hour)', () => {
    // Nicosia + Jerusalem both +3: the day ends for both at the same instant.
    const evening = event({ id: 'a', date: DAY, placeId: 'pl-nic', startsAt: `${DAY}T17:00:00Z` });
    const later = event({ id: 'b', date: DAY, placeId: 'pl-tlv', startsAt: `${DAY}T18:00:00Z` });
    const twoNames: ZoneEvidence = {
      events: [evening, later],
      bookings: [],
      places,
      crossings: [],
      primaryZone: JLM,
    };
    expect(isDayOver(DAY, twoNames, Date.parse('2026-07-07T20:59:00Z'))).toBe(false);
    expect(isDayOver(DAY, twoNames, Date.parse('2026-07-07T21:01:00Z'))).toBe(true);
  });

  it('falls back to the ambient for a day with no zone-bearing events', () => {
    const bare: ZoneEvidence = {
      events: [],
      bookings: [],
      places: [],
      crossings: [],
      primaryZone: NIC,
    };
    expect(isDayOver(DAY, bare, Date.parse('2026-07-07T20:00:00Z'))).toBe(false);
    expect(isDayOver(DAY, bare, Date.parse('2026-07-07T21:15:00Z'))).toBe(true);
  });
});

// The handler builders every `מפה` call site goes through (ADR-0121 §8 amendment). They exist
// so a call site is one expression and cannot forget EITHER reason to have no button — no
// mappable place, or no Map tab to route to — which is what "absent, not broken" means in
// practice.
describe('eventShowOnMap / bookingShowOnMap / ideaShowOnMap', () => {
  const withCoords = place('pl-c', 'מלון', { lat: 35.68, lng: 139.76 });
  const coordless = place('pl-lite', 'שם בלבד');
  const PL = [withCoords, coordless];
  const show = (calls: string[]) => (placeId: string) => calls.push(placeId);

  it('returns a handler that focuses the resolved place', () => {
    const calls: string[] = [];
    const handler = eventShowOnMap(event({ placeId: 'pl-c' }), [], PL, show(calls));
    expect(handler).toBeTypeOf('function');
    handler!();
    expect(calls).toEqual(['pl-c']);
  });

  it('follows the booking link, resolving transport to its ORIGIN', () => {
    const calls: string[] = [];
    const flight = booking({
      id: 'bk',
      type: BOOKING_TYPE.FLIGHT,
      fromPlaceId: 'pl-c',
      toPlaceId: 'pl-lite',
    });
    eventShowOnMap(event({ bookingId: 'bk' }), [flight], PL, show(calls))!();
    expect(calls).toEqual(['pl-c']);
  });

  // Both no-button cases, on both builders. A coordless Place-lite is still
  // referenced and still real — it simply has no position for the camera to move to.
  it('is undefined with no place, and with a coordless one', () => {
    const nop = () => {};
    expect(eventShowOnMap(event({}), [], PL, nop)).toBeUndefined();
    expect(eventShowOnMap(event({ placeId: 'pl-lite' }), [], PL, nop)).toBeUndefined();
    const stay = booking({ id: 'b1', type: BOOKING_TYPE.HOTEL });
    expect(bookingShowOnMap(stay, PL, nop)).toBeUndefined();
    const lite = booking({ id: 'b2', type: BOOKING_TYPE.HOTEL, placeId: 'pl-lite' });
    expect(bookingShowOnMap(lite, PL, nop)).toBeUndefined();
  });

  // `useShowPlaceOnMap()` is null outside the trip shell. A leaf must DROP the
  // affordance there, never throw for want of a context it doesn't own.
  it('is undefined when there is no Map tab to route to, even with a good place', () => {
    expect(eventShowOnMap(event({ placeId: 'pl-c' }), [], PL, null)).toBeUndefined();
    const stay = booking({ id: 'b3', type: BOOKING_TYPE.HOTEL, placeId: 'pl-c' });
    expect(bookingShowOnMap(stay, PL, null)).toBeUndefined();
  });

  it('resolves a booking to its single place', () => {
    const calls: string[] = [];
    const stay = booking({ id: 'b4', type: BOOKING_TYPE.HOTEL, placeId: 'pl-c' });
    bookingShowOnMap(stay, PL, show(calls))!();
    expect(calls).toEqual(['pl-c']);
  });

  // **The shelf idea** (§8's 2026-08-04 amendment), which had no builder and no badge — the
  // one entity most likely to BE a place, since every place added from the map outside an
  // errand becomes one. Simpler than the two above because an idea holds its `placeId`
  // directly; what it shares is the pair of no-button cases collapsing into one `undefined`.
  it('focuses a shelf idea’s own place', () => {
    const calls: string[] = [];
    ideaShowOnMap({ placeId: 'pl-c' }, PL, show(calls))!();
    expect(calls).toEqual(['pl-c']);
  });

  it('drops the affordance for an idea with no place, a coordless one, or no Map tab', () => {
    const nop = () => {};
    expect(ideaShowOnMap({}, PL, nop)).toBeUndefined();
    expect(ideaShowOnMap({ placeId: 'pl-lite' }, PL, nop)).toBeUndefined();
    expect(ideaShowOnMap({ placeId: 'pl-c' }, PL, null)).toBeUndefined();
  });
});
