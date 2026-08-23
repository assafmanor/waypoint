import { describe, expect, it } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_TYPE,
  DOCUMENT_TYPE,
  EVENT_CATEGORY,
  EVENT_KIND,
  EVENT_STATUS,
} from './constants';
import type { Booking, DocumentSummary, Place, TripEvent } from './entities';
import { computeReadiness, reachesDestination } from './readiness';

const NOW = '2026-07-01T00:00:00Z';
const DEST = { name: 'Japan' };

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

// A lodging stay: the event that carries a hotel booking's check-in→check-out
// span (bookings hold no dates — readiness.ts reads them off the linked event).
const stay = (bookingId: string, checkIn: string, checkOut: string): TripEvent => ({
  ...event(`stay-${bookingId}`, checkIn),
  endDate: checkOut,
  bookingId,
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

const place = (id: string, name: string, extra: Partial<Place> = {}): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
  ...extra,
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
  events: [
    event('a', '2026-07-05'),
    event('b', '2026-07-06'),
    event('c', '2026-07-07'),
    stay('h', '2026-07-05', '2026-07-07'), // covers both trip nights (05, 06)
  ],
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

    it('reaches on the name alone when the endpoint has no location (pre-picker)', () => {
      // PLACES are name-only Place-lites: "Tokyo, Japan" reaches "Japan" and nothing
      // else can place it. The route the location routes must not displace.
      const r = computeReadiness({ ...base(), bookings: [outbound, inbound] });
      const f = check(r, 'flights');
      expect(f.hasOutbound).toBe(true);
      expect(f.hasReturn).toBe(true);
    });
  });

  // Field report #5: a real round trip read as missing because the airport is not
  // named after the country it is in. Where the leg lands is the truth; the name
  // is only what we had before the picker.
  describe('flights reaching a destination the airport is not named after', () => {
    const ICELAND = { name: 'Iceland', timezone: 'Atlantic/Reykjavik', countryCode: 'IS' };
    const KEF = place('kef', 'Keflavík International Airport', {
      timezone: 'Atlantic/Reykjavik',
    });
    const TLV = place('tlv', 'Ben Gurion Airport', { timezone: 'Asia/Jerusalem' });
    const VIE = place('vie', 'Vienna International Airport', { timezone: 'Europe/Vienna' });
    const roundTrip = [
      booking('out', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'tlv', toPlaceId: 'kef' }),
      booking('back', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'kef', toPlaceId: 'tlv' }),
    ];

    it('passes on the zone the endpoint sits in, sharing no text with the destination', () => {
      // Neither name contains the other, which is the whole of what the check used to read.
      const r = computeReadiness({
        ...base(),
        destination: ICELAND,
        places: [KEF, TLV],
        bookings: roundTrip,
      });
      const f = check(r, 'flights');
      expect(f.hasOutbound).toBe(true);
      expect(f.hasReturn).toBe(true);
      expect(f.done).toBe(true);
    });

    it('passes for a destination named in another script than its airport', () => {
      const r = computeReadiness({
        ...base(),
        destination: { ...ICELAND, name: 'איסלנד' },
        places: [place('kef', 'Reykjavík', { timezone: 'Atlantic/Reykjavik' }), TLV],
        bookings: roundTrip,
      });
      expect(check(r, 'flights').done).toBe(true);
    });

    it('does not count a leg into another country as reaching the destination', () => {
      const r = computeReadiness({
        ...base(),
        destination: ICELAND,
        places: [TLV, VIE],
        bookings: [
          booking('out', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'tlv', toPlaceId: 'vie' }),
          booking('back', BOOKING_TYPE.FLIGHT, { fromPlaceId: 'vie', toPlaceId: 'tlv' }),
        ],
      });
      const f = check(r, 'flights');
      expect(f.hasOutbound).toBe(false);
      expect(f.hasReturn).toBe(false);
    });

    it('reaches a multi-zone destination country from any of that country zones', () => {
      const r = computeReadiness({
        ...base(),
        destination: { name: 'United States', timezone: 'America/New_York', countryCode: 'US' },
        places: [
          place('kef', 'Los Angeles International Airport', { timezone: 'America/Los_Angeles' }),
          TLV,
        ],
        bookings: roundTrip,
      });
      expect(check(r, 'flights').done).toBe(true);
    });

    it('reaches when the endpoint IS the destination place', () => {
      const r = computeReadiness({
        ...base(),
        destination: { name: 'Iceland', googlePlaceId: 'ChIJ_dest' },
        places: [place('kef', 'Keflavík', { googlePlaceId: 'ChIJ_dest' }), TLV],
        bookings: roundTrip,
      });
      expect(check(r, 'flights').done).toBe(true);
    });

    it('stays open for an endpoint no route can place (degradation)', () => {
      const r = computeReadiness({
        ...base(),
        destination: ICELAND,
        places: [place('kef', 'Keflavík'), place('tlv', 'Ben Gurion')], // name-only, pre-picker
        bookings: roundTrip,
      });
      const f = check(r, 'flights');
      expect(f.done).toBe(false);
      expect(f.hasOutbound).toBe(false);
      expect(f.hasReturn).toBe(false);
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

    it('counts an unattributed passport toward the head-count (owner picker deferred)', () => {
      // Uploads are group-owned today (no per-owner picker), so a passport with no
      // owner must still count — otherwise no uploaded passport ever would.
      const r = computeReadiness({
        ...base(),
        documents: [passport('grp', undefined)],
        travelerIds: ['u1'],
      });
      const d = check(r, 'documents');
      expect(d.done).toBe(true);
      expect(d.count).toBe(1);
      expect(d.total).toBe(1);
    });
  });

  describe('lodging night-coverage', () => {
    it('fails when a trip night is left uncovered', () => {
      const r = computeReadiness({
        ...base(),
        bookings: [outbound, inbound, booking('h', BOOKING_TYPE.HOTEL)],
        events: [stay('h', '2026-07-05', '2026-07-06')], // covers night 05 only
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.count).toBe(1);
      expect(l.total).toBe(2);
    });

    it('passes when stitched-together hotels cover every night', () => {
      const r = computeReadiness({
        ...base(),
        bookings: [
          outbound,
          inbound,
          booking('h1', BOOKING_TYPE.HOTEL),
          booking('h2', BOOKING_TYPE.HOTEL),
        ],
        events: [stay('h1', '2026-07-05', '2026-07-06'), stay('h2', '2026-07-06', '2026-07-07')],
      });
      expect(check(r, 'lodging').done).toBe(true);
    });

    it('does not credit a hotel booking that has no dated event', () => {
      const r = computeReadiness({
        ...base(),
        bookings: [outbound, inbound, booking('h', BOOKING_TYPE.HOTEL)],
        events: [], // hotel exists but its span is unknown
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.count).toBe(0);
    });

    it('credits a lodging-category event that has no booking at all', () => {
      const r = computeReadiness({
        ...base(),
        bookings: [outbound, inbound], // the spare room is nobody's booking
        events: [
          {
            ...event('friends', '2026-07-05'),
            endDate: '2026-07-07',
            category: EVENT_CATEGORY.LODGING,
          },
        ],
      });
      expect(check(r, 'lodging').done).toBe(true);
    });
  });

  // The 2026-08-14 amendment: a night you spend in the air, on a night bus, or awake
  // waiting for a 1am flight is not a night anyone books a room for. The window is
  // 22:00→08:00 trip-local and the threshold 5h, so every instant below is JST (UTC+9)
  // written as the UTC it really is.
  describe('nights nobody books a bed for', () => {
    const JAPAN = { name: 'Japan', timezone: 'Asia/Tokyo' };
    const OSAKA = place('osaka', 'Osaka, Japan');

    // A carried leg: the instants live on the event, never on the booking (ADR-0047 §1).
    const leg = (bookingId: string, startsAt: string, endsAt: string): TripEvent => ({
      ...event(`leg-${bookingId}`, startsAt.slice(0, 10)),
      bookingId,
      startsAt,
      endsAt,
    });

    // Nights 07-05 and 07-06; the hotel covers only the first, so the second is the
    // one every case below is really about.
    const firstNightOnly = () => ({
      ...base(),
      destination: JAPAN,
      places: [...PLACES, OSAKA],
      bookings: [outbound, inbound, booking('h', BOOKING_TYPE.HOTEL)],
      events: [stay('h', '2026-07-05', '2026-07-06')],
    });

    it('does not ask for a bed on the night of a 01:00 flight home', () => {
      // Departs Tokyo 07-07 01:00 JST — three hours between dinner and the airport.
      const r = computeReadiness({
        ...firstNightOnly(),
        events: [
          ...firstNightOnly().events,
          leg('in', '2026-07-06T16:00:00Z', '2026-07-06T23:00:00Z'),
        ],
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(true);
      expect(l.total).toBe(1); // night 07-06 left the denominator, it did not sit in it
    });

    it('still asks for a bed on the night before a 06:00 flight home', () => {
      // Departs Tokyo 07-07 06:00 JST — eight sleepable hours, so you slept somewhere.
      const r = computeReadiness({
        ...firstNightOnly(),
        events: [
          ...firstNightOnly().events,
          leg('in', '2026-07-06T21:00:00Z', '2026-07-07T04:00:00Z'),
        ],
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.count).toBe(1);
      expect(l.total).toBe(2);
    });

    it('asks for a bed on the night you LAND at 01:00 (the opposite fact)', () => {
      // The pair that decides the design: same clock reading, opposite direction.
      // Lands Tokyo 07-06 01:00 JST, so seven hours of that night want a room.
      const r = computeReadiness({
        ...firstNightOnly(),
        events: [
          stay('h', '2026-07-06', '2026-07-07'), // covers night 06, not night 05
          leg('out', '2026-07-05T09:00:00Z', '2026-07-05T16:00:00Z'),
        ],
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.total).toBe(2);
    });

    it('does not ask for a bed on an overnight bus between two places in-country', () => {
      // Tokyo 07-05 21:00 JST → Osaka 07-06 04:00 JST. Both endpoints reach Japan, so
      // the arrival wins and you are present for the four hours left — under the floor.
      const r = computeReadiness({
        ...firstNightOnly(),
        bookings: [
          outbound,
          inbound,
          booking('h', BOOKING_TYPE.HOTEL),
          booking('bus', BOOKING_TYPE.TRANSIT, { fromPlaceId: 'dest', toPlaceId: 'osaka' }),
        ],
        events: [
          stay('h', '2026-07-06', '2026-07-07'), // covers night 06 only
          leg('bus', '2026-07-05T12:00:00Z', '2026-07-05T19:00:00Z'),
        ],
      });
      expect(check(r, 'lodging').done).toBe(true);
    });

    it('leaves the night open for a leg with no times (degradation)', () => {
      // The same 01:00 flight with no clock on it. Nothing is subtracted, so the check
      // stays open — never a false pass, which is the whole posture of ADR-0061.
      const r = computeReadiness({
        ...firstNightOnly(),
        events: [...firstNightOnly().events, { ...event('leg-in', '2026-07-07'), bookingId: 'in' }],
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.total).toBe(2);
    });

    it('leaves every night open when the trip has no timezone to read them in', () => {
      const r = computeReadiness({
        ...firstNightOnly(),
        destination: { name: 'Japan' }, // pre-ADR-0113 trip, no zone from the pick
        events: [
          ...firstNightOnly().events,
          leg('in', '2026-07-06T16:00:00Z', '2026-07-06T23:00:00Z'),
        ],
      });
      expect(check(r, 'lodging').total).toBe(2);
    });

    it('does not treat a car hire as time in motion', () => {
      // A hire spans both nights and is parked through them — reading its span as motion
      // would tell a five-day rental it needs no lodging at all.
      const r = computeReadiness({
        ...firstNightOnly(),
        bookings: [
          outbound,
          inbound,
          booking('car', BOOKING_TYPE.CAR, { fromPlaceId: 'dest', toPlaceId: 'dest' }),
        ],
        events: [leg('car', '2026-07-05T00:00:00Z', '2026-07-07T00:00:00Z')],
      });
      const l = check(r, 'lodging');
      expect(l.done).toBe(false);
      expect(l.total).toBe(2);
    });
  });
});

/** **The predicate the booking form now reads too** (ADR-0203 §5). Pinned directly rather
 *  than only through `computeReadiness`, because it has a second consumer: with one caller
 *  its three tiers were an implementation detail, and with two the degradation clause — it
 *  can say "yes" or "cannot confirm", never "no" — is a contract a form depends on to only
 *  ever REMOVE a suggestion. */
describe('reachesDestination (ADR-0203 §5, exported)', () => {
  const ICELAND = { name: 'Iceland', timezone: 'Atlantic/Reykjavik', countryCode: 'IS' };

  it('answers on the ZONE, which is what a name cannot establish', () => {
    // The comment in the function says it: "Keflavík reaches Iceland because of where it
    // is, which no reading of its name can establish."
    const kef = place('kef', 'Keflavík International Airport', {
      timezone: 'Atlantic/Reykjavik',
    });
    expect(reachesDestination(kef, ICELAND)).toBe(true);
    expect(kef.name.toLowerCase().includes('iceland')).toBe(false);
  });

  it('answers on the NAME for a Place-lite that has no location at all', () => {
    expect(reachesDestination(place('x', 'Tokyo, Japan'), { name: 'Japan' })).toBe(true);
  });

  it('answers on the picked place ITSELF', () => {
    const dest = { name: 'Somewhere', googlePlaceId: 'g-1' };
    expect(reachesDestination(place('p', 'unrelated words', { googlePlaceId: 'g-1' }), dest)).toBe(
      true,
    );
  });

  it('CANNOT ANSWER NO — an unplaceable endpoint is unconfirmed, not refused', () => {
    // The whole basis on which a form may filter with it: every false is "no evidence",
    // so the worst a filter can do is offer nothing.
    expect(reachesDestination(undefined, ICELAND)).toBe(false);
    expect(reachesDestination(place('p', 'Ben Gurion Airport'), ICELAND)).toBe(false);
    expect(reachesDestination(place('p', 'Ben Gurion Airport'), { name: '' })).toBe(false);
  });

  it('accepts any zone of a multi-zone destination country, and never a second country', () => {
    const US = { name: 'United States', timezone: 'America/New_York', countryCode: 'US' };
    const lax = place('lax', 'Los Angeles International', { timezone: 'America/Los_Angeles' });
    expect(reachesDestination(lax, US)).toBe(true);
    expect(reachesDestination(place('yyz', 'Toronto', { timezone: 'America/Toronto' }), US)).toBe(
      false,
    );
  });

  /** §5's filter, stated as the property the form relies on: the two ends of a journey
   *  decide WHICH edge of the trip it is, and an internal hop decides neither. */
  it('separates the way there, the way home, and an internal hop', () => {
    const tlv = place('tlv', 'Ben Gurion Airport', { timezone: 'Asia/Jerusalem' });
    const kef = place('kef', 'Keflavík', { timezone: 'Atlantic/Reykjavik' });
    const aey = place('aey', 'Akureyri', { timezone: 'Atlantic/Reykjavik' });
    const edge = (from: Place, to: Place) =>
      reachesDestination(to, ICELAND) && !reachesDestination(from, ICELAND)
        ? 'out'
        : reachesDestination(from, ICELAND) && !reachesDestination(to, ICELAND)
          ? 'back'
          : null;
    expect(edge(tlv, kef)).toBe('out');
    expect(edge(kef, tlv)).toBe('back');
    // Both ends inside the destination: the trip's edges are the wrong answer, so none.
    expect(edge(kef, aey)).toBe(null);
    // Neither end placeable: also none, and for the same reason.
    expect(edge(place('a', 'Downtown'), place('b', 'The Old Port'))).toBe(null);
  });

  /** **A sharp edge in the name tier, pinned rather than fixed** — found by writing the
   *  spec above with one-letter fixtures, which passed for the wrong reason.
   *  `nameReachesDestination` matches by substring in BOTH directions, so any place whose
   *  name is a substring of the destination's "reaches" it: `'a'` is inside `'Iceland'`.
   *
   *  Left alone deliberately. It is shipped behaviour with `computeReadiness` as its first
   *  consumer, the docblock already warns the tier is true "only by luck", and narrowing it
   *  is a change to a derivation the Plan readiness count depends on — not something to
   *  take on inside ADR-0203's build. What it DOES cost is stated where it matters: §5's
   *  filter can only remove a suggestion **given endpoints that are really placeable**, so a
   *  one- or two-character Place-lite can still tip it to the wrong edge. On the backlog. */
  it('matches a name by substring in both directions, which a tiny name exploits', () => {
    expect(reachesDestination(place('a', 'a'), ICELAND)).toBe(true);
    expect(reachesDestination(place('l', 'LAND'), ICELAND)).toBe(true);
  });
});
