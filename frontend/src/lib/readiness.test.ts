import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  DOCUMENT_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
} from '@waypoint/shared';
import type { Booking, DocumentSummary, Place, TripEvent } from '@waypoint/shared';
import { computeReadiness } from './readiness';

const NOW = '2026-07-01T00:00:00Z';
const DEST = 'Japan';

const event = (id: string, date: string): TripEvent => ({
  id,
  tripId: 't1',
  date,
  title: id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 1,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const booking = (id: string, type: Booking['type'], extra: Partial<Booking> = {}): Booking => ({
  id,
  tripId: 't1',
  type,
  title: id,
  source: BOOKING_SOURCE.MANUAL,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
  ...extra,
});

const place = (id: string, name: string): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

const passport = (id: string, ownerUserId?: string): DocumentSummary => ({
  id,
  tripId: 't1',
  type: DOCUMENT_TYPE.PASSPORT,
  title: id,
  mimeType: 'application/pdf',
  sizeBytes: 1,
  ownerUserId,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

// A 3-day trip (05→07) for compact, obvious empty-day math.
const RANGE = { startDate: '2026-07-05', endDate: '2026-07-07' };

// "Tokyo, Japan" reaches "Japan" (substring tolerance); "Tel Aviv" is home.
const PLACES = [place('home', 'Tel Aviv'), place('dest', 'Tokyo, Japan')];
const outbound = booking('out', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'home', toPlaceId: 'dest' });
const inbound = booking('in', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'dest', toPlaceId: 'home' });
const TRAVELERS = ['u1', 'u2', 'u3'];

// A fully-ready trip; each test overrides just the dimension it exercises.
const base = () => ({
  ...RANGE,
  destination: DEST,
  events: [event('a', '2026-07-05'), event('b', '2026-07-06'), event('c', '2026-07-07')],
  bookings: [outbound, inbound, booking('h', BOOKING_TYPE.HOTEL)],
  places: PLACES,
  documents: TRAVELERS.map((u) => passport(`p-${u}`, u)),
  travelerIds: TRAVELERS,
});

const check = (r: ReturnType<typeof computeReadiness>, id: string) =>
  r.checks.find((c) => c.id === id)!;

describe('computeReadiness', () => {
  it('marks every dimension complete → 100%', () => {
    const r = computeReadiness(base());
    expect(r.pct).toBe(100);
    expect(r.emptyDates).toEqual([]);
    expect(r.checks.every((c) => c.done)).toBe(true);
  });

  it('lists empty days chronologically and fails the itinerary check', () => {
    const r = computeReadiness({ ...base(), events: [event('a', '2026-07-06')] });
    expect(r.emptyDates).toEqual(['2026-07-05', '2026-07-07']);
    expect(check(r, 'itinerary').done).toBe(false);
    expect(check(r, 'itinerary').count).toBe(2);
  });

  it('flags missing lodging independently of flights', () => {
    const r = computeReadiness({ ...base(), bookings: [outbound, inbound] });
    expect(check(r, 'flights').done).toBe(true);
    expect(check(r, 'lodging').done).toBe(false);
  });

  it('treats a solo trip (only the creator) as an incomplete group', () => {
    const solo = computeReadiness({ ...base(), travelerIds: ['u1'] });
    expect(check(solo, 'group').done).toBe(false);
    const joined = computeReadiness({ ...base(), travelerIds: ['u1', 'u2'] });
    expect(check(joined, 'group').done).toBe(true);
  });

  it('is a rounded fraction of the five checks (one of five done → 20%)', () => {
    const r = computeReadiness({
      ...RANGE,
      destination: DEST,
      events: [], // all days empty
      bookings: [], // no round-trip, no lodging
      places: [],
      documents: [], // no passports
      travelerIds: ['u1', 'u2'], // only the group check passes
    });
    expect(r.pct).toBe(20);
  });

  describe('flights round-trip', () => {
    it('fails with an outbound leg only (no way home)', () => {
      const r = computeReadiness({ ...base(), bookings: [outbound] });
      const f = check(r, 'flights');
      expect(f.done).toBe(false);
      expect(f.hasOutbound).toBe(true);
      expect(f.hasReturn).toBe(false);
    });

    it('fails with a return leg only (no way in)', () => {
      const r = computeReadiness({ ...base(), bookings: [inbound] });
      const f = check(r, 'flights');
      expect(f.done).toBe(false);
      expect(f.hasOutbound).toBe(false);
      expect(f.hasReturn).toBe(true);
    });

    it('passes with both an outbound and a return leg', () => {
      const r = computeReadiness({ ...base(), bookings: [outbound, inbound] });
      expect(check(r, 'flights').done).toBe(true);
    });

    it('stays open for a flight whose endpoints are not recorded (degradation)', () => {
      const r = computeReadiness({
        ...base(),
        bookings: [booking('f', BOOKING_TYPE.FLIGHT)], // no from/to place
      });
      expect(check(r, 'flights').done).toBe(false);
    });
  });

  describe('per-traveller passports', () => {
    it('fails when a traveller has no passport, with a have/total rollup', () => {
      const r = computeReadiness({
        ...base(),
        documents: [passport('p1', 'u1'), passport('p2', 'u2')], // u3 missing
      });
      const d = check(r, 'documents');
      expect(d.done).toBe(false);
      expect(d.count).toBe(2);
      expect(d.total).toBe(3);
    });

    it('passes when every traveller uploaded a passport', () => {
      const r = computeReadiness(base());
      expect(check(r, 'documents').done).toBe(true);
    });

    it('does not count a group-owned passport (no owner) toward any traveller', () => {
      const r = computeReadiness({ ...base(), documents: [passport('grp', undefined)] });
      const d = check(r, 'documents');
      expect(d.done).toBe(false);
      expect(d.count).toBe(0);
    });
  });
});
