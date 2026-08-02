import { describe, expect, it } from 'vitest';
import { connectionMinutes, journeyLegs, roundTripPartner } from './booking-journey';
import { BOOKING_TYPE } from './constants';
import type { Booking, BookingType } from './entities';

let seq = 0;
type Timed = { at?: string; till?: string };
const bk = (over: Partial<Booking> & Timed = {}): Booking & Timed =>
  ({
    id: `bk-${++seq}`,
    tripId: 'trip-1',
    type: BOOKING_TYPE.FLIGHT as BookingType,
    title: 'טיסה',
    source: 'manual',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    updatedBy: 'u-1',
    ...over,
  }) as Booking & Timed;

/** The schedule a `Booking` doesn't carry (ADR-0047 §1) — here it rides on the
 *  fixture so each test states its own times inline. `till` is the arrival, which
 *  only the connection rule reads. */
const when = (b: Booking) => {
  const { at, till } = b as Booking & Timed;
  return { start: at ? Date.parse(at) : undefined, end: till ? Date.parse(till) : undefined };
};

const out = { fromPlaceId: 'tlv', toPlaceId: 'nrt' };
const back = { fromPlaceId: 'nrt', toPlaceId: 'tlv' };

describe('roundTripPartner', () => {
  it('pairs a mirrored route and calls the later leg the return', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, at: '2026-07-19T09:00:00Z' });
    const pair = roundTripPartner(a, [a, b], when);
    expect(pair).toMatchObject({ outbound: a, back: b, reason: 'mirrored-route' });
    // Symmetric: asking from the return gives the same pair, same way round.
    expect(roundTripPartner(b, [a, b], when)).toMatchObject({ outbound: a, back: b });
  });

  it('pairs a same-day out-and-back', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, at: '2026-07-05T21:00:00Z' });
    expect(roundTripPartner(a, [a, b], when)).toMatchObject({ outbound: a, back: b });
  });

  it('does not pair two legs going the same way', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...out, at: '2026-07-06T06:00:00Z' });
    expect(roundTripPartner(a, [a, b], when)).toBeNull();
  });

  it('does not pair a half route with another half route', () => {
    const a = bk({ fromPlaceId: 'tlv', at: '2026-07-05T06:00:00Z' });
    const b = bk({ fromPlaceId: 'nrt', at: '2026-07-19T09:00:00Z' });
    expect(roundTripPartner(a, [a, b], when)).toBeNull();
  });

  it('prefers a shared confirmation code over a mirrored route', () => {
    const a = bk({ ...out, confirmationCode: 'XR7Q2M', at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, confirmationCode: 'XR7Q2M', at: '2026-07-19T09:00:00Z' });
    expect(roundTripPartner(a, [a, b], when)).toMatchObject({ reason: 'shared-code' });
  });

  it('pairs on a shared code even when the routes are not a mirror', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'nrt', confirmationCode: 'XR7Q2M' });
    const b = bk({ fromPlaceId: 'kix', toPlaceId: 'tlv', confirmationCode: ' XR7Q2M ' });
    expect(roundTripPartner(a, [a, b], when)).toMatchObject({ reason: 'shared-code' });
  });

  it('ignores an empty confirmation code on both sides', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'nrt', confirmationCode: '  ' });
    const b = bk({ fromPlaceId: 'kix', toPlaceId: 'tlv', confirmationCode: '' });
    expect(roundTripPartner(a, [a, b], when)).toBeNull();
  });

  it('gives each leg of a multi-city trip its nearest candidate', () => {
    // Three legs sharing one PNR: out on the 5th, back on the 19th, and an earlier
    // hop on the 3rd. Nearest-in-time is what stops all three claiming each other.
    const hop = bk({ ...out, confirmationCode: 'PNR1', at: '2026-07-03T06:00:00Z' });
    const a = bk({ ...out, confirmationCode: 'PNR1', at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, confirmationCode: 'PNR1', at: '2026-07-19T09:00:00Z' });
    const all = [hop, a, b];
    expect(roundTripPartner(a, all, when)).toMatchObject({ outbound: hop, back: a });
    expect(roundTripPartner(b, all, when)).toMatchObject({ outbound: a, back: b });
  });

  it('does not pair across transport modes', () => {
    const a = bk({ ...out, type: BOOKING_TYPE.FLIGHT, confirmationCode: 'PNR1' });
    const b = bk({ ...back, type: BOOKING_TYPE.TRAIN, confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a, b], when)).toBeNull();
  });

  it('excludes a non-route type sharing the same code', () => {
    const a = bk({ ...out, confirmationCode: 'PNR1' });
    const hotel = bk({ type: BOOKING_TYPE.HOTEL, placeId: 'ryokan', confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a, hotel], when)).toBeNull();
  });

  it('never pairs a booking with itself', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'tlv', confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a], when)).toBeNull();
  });

  it('pairs an unscheduled leg and treats the subject as the outbound', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back });
    expect(roundTripPartner(a, [a, b], when)).toMatchObject({ outbound: a, back: b });
    expect(roundTripPartner(b, [a, b], when)).toMatchObject({ outbound: b, back: a });
  });

  it('prefers a scheduled candidate over an unscheduled one', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const near = bk({ ...back, at: '2026-07-19T09:00:00Z' });
    const undated = bk({ ...back });
    expect(roundTripPartner(a, [a, undated, near], when)).toMatchObject({ back: near });
  });
});

// **The connection** (ADR-0159) — the other relation, and the one that had to be
// taught not to look like a round trip.
describe('connectionMinutes', () => {
  const leg1 = { fromPlaceId: 'nrt', toPlaceId: 'dxb' };
  const leg2 = { fromPlaceId: 'dxb', toPlaceId: 'tlv' };

  it('measures from the arrival to the next departure', () => {
    const a = bk({ ...leg1, at: '2026-07-12T00:30:00Z', till: '2026-07-12T06:10:00Z' });
    const b = bk({ ...leg2, at: '2026-07-12T08:50:00Z' });
    expect(connectionMinutes(a, b, when)).toBe(160);
  });

  it('is directional — the same two legs the other way round are not a connection', () => {
    const a = bk({ ...leg1, at: '2026-07-12T00:30:00Z', till: '2026-07-12T06:10:00Z' });
    const b = bk({ ...leg2, at: '2026-07-12T08:50:00Z' });
    expect(connectionMinutes(b, a, when)).toBeNull();
  });

  it('refuses a journey that comes back to where it started — that is a MIRROR', () => {
    // Out at 06:00, back at 21:00 the same day. It chains through `nrt` and sits well
    // inside the window, so ONLY the returns-to-origin rule can tell these apart.
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z', till: '2026-07-05T12:00:00Z' });
    const b = bk({ ...back, at: '2026-07-05T21:00:00Z' });
    expect(connectionMinutes(a, b, when)).toBeNull();
    expect(roundTripPartner(a, [a, b], when)).toMatchObject({ outbound: a, back: b });
  });

  it('refuses a gap past the type window, and takes the type from the profile', () => {
    // 30 hours in Dubai is a stopover, not a layover — past a flight's 24h ceiling.
    const a = bk({ ...leg1, at: '2026-07-12T00:30:00Z', till: '2026-07-12T06:10:00Z' });
    const late = bk({ ...leg2, at: '2026-07-13T12:10:00Z' });
    expect(connectionMinutes(a, late, when)).toBeNull();
    // The same 6-hour gap: inside a flight's window, exactly on a train's edge.
    const arrive = '2026-07-12T06:10:00Z';
    const depart = '2026-07-12T12:10:00Z';
    const f1 = bk({ ...leg1, at: '2026-07-12T00:30:00Z', till: arrive });
    const f2 = bk({ ...leg2, at: depart });
    expect(connectionMinutes(f1, f2, when)).toBe(360);
    const t1 = bk({ ...leg1, type: BOOKING_TYPE.TRAIN, at: '2026-07-12T05:00:00Z', till: arrive });
    const t2 = bk({ ...leg2, type: BOOKING_TYPE.TRAIN, at: depart });
    expect(connectionMinutes(t1, t2, when)).toBe(360);
    const t3 = bk({ ...leg2, type: BOOKING_TYPE.TRAIN, at: '2026-07-12T12:11:00Z' });
    expect(connectionMinutes(t1, t3, when)).toBeNull();
  });

  it('refuses a negative gap and an unscheduled leg', () => {
    const a = bk({ ...leg1, at: '2026-07-12T00:30:00Z', till: '2026-07-12T06:10:00Z' });
    expect(connectionMinutes(a, bk({ ...leg2, at: '2026-07-12T05:00:00Z' }), when)).toBeNull();
    expect(connectionMinutes(a, bk({ ...leg2 }), when)).toBeNull();
    expect(
      connectionMinutes(bk({ ...leg1 }), bk({ ...leg2, at: '2026-07-12T08:50:00Z' }), when),
    ).toBeNull();
  });

  it('falls back to the departure when a leg has no arrival', () => {
    // A leg scheduled start-only still connects — measured from its start, which is
    // the only instant there is.
    const a = bk({ ...leg1, at: '2026-07-12T00:30:00Z' });
    const b = bk({ ...leg2, at: '2026-07-12T08:50:00Z' });
    expect(connectionMinutes(a, b, when)).toBe(500);
  });
});

describe('journeyLegs', () => {
  const l1 = { fromPlaceId: 'nrt', toPlaceId: 'dxb' };
  const l2 = { fromPlaceId: 'dxb', toPlaceId: 'ath' };
  const l3 = { fromPlaceId: 'ath', toPlaceId: 'tlv' };

  const three = () => [
    bk({ ...l1, at: '2026-07-12T00:30:00Z', till: '2026-07-12T06:10:00Z' }),
    bk({ ...l2, at: '2026-07-12T08:50:00Z', till: '2026-07-12T12:35:00Z' }),
    bk({ ...l3, at: '2026-07-12T14:00:00Z', till: '2026-07-12T15:30:00Z' }),
  ];

  it('answers [booking] for a leg that connects to nothing', () => {
    const lone = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    expect(journeyLegs(lone, [lone], when)).toEqual([lone]);
  });

  it('walks BOTH ways, so the middle leg finds the whole journey', () => {
    const [a, b, c] = three();
    const all = [c, a, b]; // deliberately out of order — travel order is derived
    expect(journeyLegs(b, all, when).map((l) => l.id)).toEqual([a.id, b.id, c.id]);
    expect(journeyLegs(a, all, when).map((l) => l.id)).toEqual([a.id, b.id, c.id]);
    expect(journeyLegs(c, all, when).map((l) => l.id)).toEqual([a.id, b.id, c.id]);
  });

  it('leaves an unrelated booking out of it', () => {
    const legs = three();
    const hotel = bk({ type: BOOKING_TYPE.HOTEL, placeId: 'ryokan' });
    const other = bk({ ...out, at: '2026-07-20T06:00:00Z' });
    expect(journeyLegs(legs[0], [...legs, hotel, other], when)).toHaveLength(3);
  });

  it('terminates on an itinerary that loops back through the same airport', () => {
    // nrt→dxb→ath→nrt→dxb inside one day: the chain can re-enter, and the cycle guard
    // is the only reason this returns at all.
    const loop = [
      bk({ ...l1, at: '2026-07-12T00:00:00Z', till: '2026-07-12T02:00:00Z' }),
      bk({ ...l2, at: '2026-07-12T03:00:00Z', till: '2026-07-12T05:00:00Z' }),
      bk({
        fromPlaceId: 'ath',
        toPlaceId: 'nrt',
        at: '2026-07-12T06:00:00Z',
        till: '2026-07-12T08:00:00Z',
      }),
      bk({ ...l1, at: '2026-07-12T09:00:00Z', till: '2026-07-12T11:00:00Z' }),
    ];
    expect(journeyLegs(loop[0], loop, when).length).toBeLessThanOrEqual(loop.length);
  });

  it('is what stops a through-ticketed layover being called the return', () => {
    // One PNR across both legs — which `sharesCode` would otherwise pair, naming the
    // second half of the outbound journey "the return".
    const a = bk({
      ...l1,
      confirmationCode: 'EK319',
      at: '2026-07-12T00:30:00Z',
      till: '2026-07-12T06:10:00Z',
    });
    const b = bk({ ...l2, confirmationCode: 'EK319', at: '2026-07-12T08:50:00Z' });
    expect(roundTripPartner(a, [a, b], when)).toBeNull();
    expect(connectionMinutes(a, b, when)).toBe(160);
  });
});
