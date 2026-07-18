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
import { eventRoute } from './places';

const place = (id: string, name: string): Place => ({
  id,
  tripId: 't',
  name,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
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
