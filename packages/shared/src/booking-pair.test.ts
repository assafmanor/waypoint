import { describe, expect, it } from 'vitest';
import { roundTripPartner } from './booking-pair';
import { BOOKING_TYPE } from './constants';
import type { Booking, BookingType } from './entities';

let seq = 0;
const bk = (over: Partial<Booking> & { at?: string } = {}): Booking & { at?: string } =>
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
  }) as Booking & { at?: string };

/** The schedule a `Booking` doesn't carry (ADR-0047 §1) — here it rides on the
 *  fixture so each test states its own times inline. */
const startAt = (b: Booking) => {
  const at = (b as Booking & { at?: string }).at;
  return at ? Date.parse(at) : undefined;
};

const out = { fromPlaceId: 'tlv', toPlaceId: 'nrt' };
const back = { fromPlaceId: 'nrt', toPlaceId: 'tlv' };

describe('roundTripPartner', () => {
  it('pairs a mirrored route and calls the later leg the return', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, at: '2026-07-19T09:00:00Z' });
    const pair = roundTripPartner(a, [a, b], startAt);
    expect(pair).toMatchObject({ outbound: a, back: b, reason: 'mirrored-route' });
    // Symmetric: asking from the return gives the same pair, same way round.
    expect(roundTripPartner(b, [a, b], startAt)).toMatchObject({ outbound: a, back: b });
  });

  it('pairs a same-day out-and-back', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, at: '2026-07-05T21:00:00Z' });
    expect(roundTripPartner(a, [a, b], startAt)).toMatchObject({ outbound: a, back: b });
  });

  it('does not pair two legs going the same way', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...out, at: '2026-07-06T06:00:00Z' });
    expect(roundTripPartner(a, [a, b], startAt)).toBeNull();
  });

  it('does not pair a half route with another half route', () => {
    const a = bk({ fromPlaceId: 'tlv', at: '2026-07-05T06:00:00Z' });
    const b = bk({ fromPlaceId: 'nrt', at: '2026-07-19T09:00:00Z' });
    expect(roundTripPartner(a, [a, b], startAt)).toBeNull();
  });

  it('prefers a shared confirmation code over a mirrored route', () => {
    const a = bk({ ...out, confirmationCode: 'XR7Q2M', at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, confirmationCode: 'XR7Q2M', at: '2026-07-19T09:00:00Z' });
    expect(roundTripPartner(a, [a, b], startAt)).toMatchObject({ reason: 'shared-code' });
  });

  it('pairs on a shared code even when the routes are not a mirror', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'nrt', confirmationCode: 'XR7Q2M' });
    const b = bk({ fromPlaceId: 'kix', toPlaceId: 'tlv', confirmationCode: ' XR7Q2M ' });
    expect(roundTripPartner(a, [a, b], startAt)).toMatchObject({ reason: 'shared-code' });
  });

  it('ignores an empty confirmation code on both sides', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'nrt', confirmationCode: '  ' });
    const b = bk({ fromPlaceId: 'kix', toPlaceId: 'tlv', confirmationCode: '' });
    expect(roundTripPartner(a, [a, b], startAt)).toBeNull();
  });

  it('gives each leg of a multi-city trip its nearest candidate', () => {
    // Three legs sharing one PNR: out on the 5th, back on the 19th, and an earlier
    // hop on the 3rd. Nearest-in-time is what stops all three claiming each other.
    const hop = bk({ ...out, confirmationCode: 'PNR1', at: '2026-07-03T06:00:00Z' });
    const a = bk({ ...out, confirmationCode: 'PNR1', at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back, confirmationCode: 'PNR1', at: '2026-07-19T09:00:00Z' });
    const all = [hop, a, b];
    expect(roundTripPartner(a, all, startAt)).toMatchObject({ outbound: hop, back: a });
    expect(roundTripPartner(b, all, startAt)).toMatchObject({ outbound: a, back: b });
  });

  it('does not pair across transport modes', () => {
    const a = bk({ ...out, type: BOOKING_TYPE.FLIGHT, confirmationCode: 'PNR1' });
    const b = bk({ ...back, type: BOOKING_TYPE.TRAIN, confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a, b], startAt)).toBeNull();
  });

  it('excludes a non-route type sharing the same code', () => {
    const a = bk({ ...out, confirmationCode: 'PNR1' });
    const hotel = bk({ type: BOOKING_TYPE.HOTEL, placeId: 'ryokan', confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a, hotel], startAt)).toBeNull();
  });

  it('never pairs a booking with itself', () => {
    const a = bk({ fromPlaceId: 'tlv', toPlaceId: 'tlv', confirmationCode: 'PNR1' });
    expect(roundTripPartner(a, [a], startAt)).toBeNull();
  });

  it('pairs an unscheduled leg and treats the subject as the outbound', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const b = bk({ ...back });
    expect(roundTripPartner(a, [a, b], startAt)).toMatchObject({ outbound: a, back: b });
    expect(roundTripPartner(b, [a, b], startAt)).toMatchObject({ outbound: b, back: a });
  });

  it('prefers a scheduled candidate over an unscheduled one', () => {
    const a = bk({ ...out, at: '2026-07-05T06:00:00Z' });
    const near = bk({ ...back, at: '2026-07-19T09:00:00Z' });
    const undated = bk({ ...back });
    expect(roundTripPartner(a, [a, undated, near], startAt)).toMatchObject({ back: near });
  });
});
