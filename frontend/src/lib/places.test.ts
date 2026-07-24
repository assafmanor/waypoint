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
  eventDirectionsUrl,
  eventRoute,
  mapsDirectionsUrl,
  mapsPlaceUrl,
  referencedPlaceIds,
} from './places';
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
});
