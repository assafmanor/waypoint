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
  bookingPlaceUrl,
  eventDirectionsUrl,
  eventDisplayZones,
  eventDurationLabel,
  eventEdgeZone,
  eventPlaceUrl,
  eventRoute,
  eventZones,
  bookingEndZones,
  currentZone,
  dayAmbientZone,
  mapsDirectionsUrl,
  mapsPlaceUrl,
  referencedPlaceIds,
  segmentZoneAt,
  tripZoneCrossings,
  type ZoneContext,
  type ZoneCrossing,
} from './places';
import { todayInTz } from './time';
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

  it('mapsPlaceUrl builds a search link with the place id when coords exist', () => {
    expect(mapsPlaceUrl(withCoords)).toBe(
      'https://www.google.com/maps/search/?api=1&query=35.6764%2C139.65&query_place_id=g-x',
    );
  });

  it('omits the place-id param when googlePlaceId is absent', () => {
    const noGoogle = place('pl-z', 'ללא', { lat: 1, lng: 2 });
    expect(mapsDirectionsUrl(noGoogle)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=1%2C2',
    );
  });

  it('returns null for a coordless place or undefined (no location, no button)', () => {
    expect(mapsDirectionsUrl(coordless)).toBeNull();
    expect(mapsPlaceUrl(coordless)).toBeNull();
    expect(mapsDirectionsUrl(undefined)).toBeNull();
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

  it('eventPlaceUrl / bookingPlaceUrl build the view (search) link, null when coordless', () => {
    const bk = booking({ id: 'bk', type: BOOKING_TYPE.HOTEL, placeId: 'pl-x' });
    expect(eventPlaceUrl(event({ placeId: 'pl-x' }), [], [withCoords])).toContain(
      '/search/?api=1&query=35.6764%2C139.65',
    );
    expect(bookingPlaceUrl(bk, [withCoords])).toContain('/search/?api=1&query=35.6764%2C139.65');
    // The view peer follows the same no-coords → null rule as directions.
    expect(eventPlaceUrl(event({ placeId: 'pl-y' }), [], [coordless])).toBeNull();
    expect(
      bookingPlaceUrl(booking({ id: 'b', type: BOOKING_TYPE.HOTEL }), [withCoords]),
    ).toBeNull();
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
  // Outbound crossing departing 2026-07-07 20:00Z (23:00 JLM).
  const cs = [{ at: Date.parse('2026-07-07T20:00:00Z'), fromZone: JLM, toZone: TYO }];

  it('frames a pre-crossing day in the origin zone and a later day in the destination', () => {
    expect(dayAmbientZone('2026-07-06', cs, TYO)).toBe(JLM);
    expect(dayAmbientZone('2026-07-09', cs, TYO)).toBe(TYO);
  });

  it('samples at noon, so a late-evening crossing leaves its own day on the origin', () => {
    // The crossing is at 23:00 local, but the day it departs is still lived in the
    // origin zone — sampling at noon is what keeps that true.
    expect(dayAmbientZone('2026-07-07', cs, TYO)).toBe(JLM);
  });

  it('falls back to the trip primary zone with no crossings', () => {
    expect(dayAmbientZone('2026-07-07', [], TYO)).toBe(TYO);
  });

  it('is NOT the live zone: mid-flight they disagree, which is the whole point', () => {
    // 21:00Z on the 7th — you are in the air, so the live zone has already rolled to
    // Tokyo, while the day you are flying through is still framed in Jerusalem
    // (ADR-0029 amendment: that is what keeps the travel day editable).
    const midFlight = Date.parse('2026-07-07T21:00:00Z');
    expect(currentZone(midFlight, cs, TYO)).toBe(TYO);
    expect(dayAmbientZone('2026-07-07', cs, TYO)).toBe(JLM);
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
