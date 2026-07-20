import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { hotelWifi, nextCodedBooking } from './home-quick';

const NOW = Date.parse('2026-07-20T12:00:00+09:00');
const ISO = '2026-07-01T00:00:00Z';
const at = (offsetH: number) => new Date(NOW + offsetH * 3_600_000).toISOString();

const booking = (id: string, code?: string): Booking => ({
  id,
  tripId: 't1',
  type: BOOKING_TYPE.RESTAURANT,
  title: id,
  confirmationCode: code,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

const linked = (
  bookingId: string,
  startOffsetH: number,
  status = EVENT_STATUS.PLANNED,
): TripEvent => ({
  id: `ev-${bookingId}`,
  tripId: 't1',
  date: '2026-07-20',
  title: 'x',
  kind: EVENT_KIND.HARD,
  status,
  startsAt: at(startOffsetH),
  endsAt: at(startOffsetH + 1),
  bookingId,
  sortOrder: 1,
  source: 'manual',
  createdAt: ISO,
  updatedAt: ISO,
  updatedBy: 'u1',
});

describe('nextCodedBooking', () => {
  it('picks the earliest upcoming coded booking', () => {
    const bookings = [booking('b-late', 'LATE'), booking('b-soon', 'SOON')];
    const events = [linked('b-late', 5), linked('b-soon', 2)];
    expect(nextCodedBooking(bookings, events, NOW)?.booking.id).toBe('b-soon');
  });

  it('ignores bookings without a confirmation code', () => {
    const bookings = [booking('b-nocode'), booking('b-code', 'C')];
    const events = [linked('b-nocode', 1), linked('b-code', 3)];
    expect(nextCodedBooking(bookings, events, NOW)?.booking.id).toBe('b-code');
  });

  it('ignores past and unscheduled coded bookings', () => {
    const past = booking('b-past', 'PAST');
    const unscheduled = booking('b-unsched', 'UNS'); // no linked event
    const bookings = [past, unscheduled];
    const events = [linked('b-past', -3)];
    expect(nextCodedBooking(bookings, events, NOW)).toBeUndefined();
  });

  it('returns undefined when nothing qualifies', () => {
    expect(nextCodedBooking([], [], NOW)).toBeUndefined();
  });
});

const WIFI = { network: 'Net', password: 'pw' };

const hotel = (id: string, wifi?: { network?: string; password?: string }): Booking => ({
  ...booking(id),
  type: BOOKING_TYPE.HOTEL,
  details: wifi ? { wifi } : undefined,
});

const stay = (bookingId: string, startOffsetH: number, endOffsetH: number): TripEvent => ({
  ...linked(bookingId, startOffsetH),
  startsAt: at(startOffsetH),
  endsAt: at(endOffsetH),
});

describe('hotelWifi', () => {
  it('shows WiFi while checked in (now inside the stay span)', () => {
    const bookings = [hotel('h', WIFI)];
    const events = [stay('h', -10, 20)];
    expect(hotelWifi(bookings, events, NOW)).toEqual(WIFI);
  });

  it('hides WiFi before check-in', () => {
    const bookings = [hotel('h', WIFI)];
    const events = [stay('h', 2, 30)];
    expect(hotelWifi(bookings, events, NOW)).toBeUndefined();
  });

  it('hides WiFi after check-out', () => {
    const bookings = [hotel('h', WIFI)];
    const events = [stay('h', -30, -2)];
    expect(hotelWifi(bookings, events, NOW)).toBeUndefined();
  });

  it('falls back to a hotel with WiFi but no scheduled stay', () => {
    const bookings = [hotel('h', WIFI)];
    expect(hotelWifi(bookings, [], NOW)).toEqual(WIFI);
  });

  it('prefers the hotel whose stay currently contains now over an unscheduled one', () => {
    const active = { network: 'Active', password: 'now' };
    const bookings = [hotel('h-unsched', WIFI), hotel('h-active', active)];
    const events = [stay('h-active', -5, 5)];
    expect(hotelWifi(bookings, events, NOW)).toEqual(active);
  });

  it('ignores a hotel with no WiFi and non-hotel bookings', () => {
    const bookings = [hotel('h-empty'), booking('b-code', 'C')];
    const events = [stay('h-empty', -5, 5), linked('b-code', -1)];
    expect(hotelWifi(bookings, events, NOW)).toBeUndefined();
  });
});
