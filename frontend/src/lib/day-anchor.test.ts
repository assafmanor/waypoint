// `dayAnchorCoord` — where a day is lived, in coordinates.
//
// The cases that matter are the ones the ZONE sibling already had to answer, so
// they are asserted in the same terms: a settled day, an arrival day where the
// flight must abstain, a day with nothing placed, and a trip with nothing at all.
import { describe, expect, it } from 'vitest';
import type { Booking, Place, TripEvent } from '@waypoint/shared';
import { dayAnchorCoord, type ZoneEvidence } from './places';

const TOKYO = { lat: 35.6762, lng: 139.6503 };
const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };
/** ~2km from the Tel Aviv anchor: a different stop, the same day. */
const TEL_AVIV_NEARBY = { lat: 32.0684, lng: 34.7749 };

const place = (id: string, at: { lat: number; lng: number }): Place =>
  ({ id, name: id, lat: at.lat, lng: at.lng }) as Place;

const event = (over: Partial<TripEvent>): TripEvent =>
  ({ id: 'e', date: '2026-09-04', ...over }) as TripEvent;

const evidence = (over: Partial<ZoneEvidence>): ZoneEvidence => ({
  events: [],
  bookings: [],
  places: [],
  crossings: [],
  primaryZone: 'Asia/Tokyo',
  ...over,
});

describe('dayAnchorCoord', () => {
  it('takes the coordinate the day’s placed events agree on', () => {
    const at = dayAnchorCoord(
      '2026-09-04',
      evidence({
        places: [place('p1', TEL_AVIV), place('p2', TEL_AVIV_NEARBY)],
        events: [event({ id: 'a', placeId: 'p1' }), event({ id: 'b', placeId: 'p2' })],
      }),
      TOKYO,
    );
    // Two stops in one city are one place for the sun, so the day is not mixed
    // and the destination is not consulted.
    expect(at).toEqual(TEL_AVIV);
  });

  /**
   * **The arrival day, and the rule that makes it work without a rule of its
   * own.** A Tokyo→Tel Aviv flight is transport between two places, so it
   * abstains exactly as it does in `eventKnownZone` — which leaves the
   * destination hotel as the only voter, and the day resolves to the bed.
   */
  it('a zone-crossing booking does not vote, so an arrival day is the bed', () => {
    const at = dayAnchorCoord(
      '2026-09-04',
      evidence({
        places: [place('hnd', TOKYO), place('tlv', TEL_AVIV), place('hotel', TEL_AVIV_NEARBY)],
        bookings: [{ id: 'b1', fromPlaceId: 'hnd', toPlaceId: 'tlv' } as Booking],
        events: [
          event({ id: 'flight', bookingId: 'b1' }),
          event({ id: 'checkin', placeId: 'hotel' }),
        ],
      }),
      TOKYO,
    );
    expect(at).toEqual(TEL_AVIV_NEARBY);
  });

  it('a multi-day stay votes on its middle nights', () => {
    const at = dayAnchorCoord(
      '2026-09-04',
      evidence({
        places: [place('hotel', TEL_AVIV)],
        // The stay's own date is earlier and it runs past this day — the same
        // span `eventsOnDate` includes for the zone read.
        events: [
          event({ id: 'stay', date: '2026-09-02', endDate: '2026-09-06', placeId: 'hotel' }),
        ],
      }),
      TOKYO,
    );
    expect(at).toEqual(TEL_AVIV);
  });

  it('falls back to the destination when the day’s events disagree', () => {
    const at = dayAnchorCoord(
      '2026-09-04',
      evidence({
        places: [place('p1', TOKYO), place('p2', TEL_AVIV)],
        events: [event({ id: 'a', placeId: 'p1' }), event({ id: 'b', placeId: 'p2' })],
      }),
      TOKYO,
    );
    expect(at).toEqual(TOKYO);
  });

  it('falls back to the destination when nothing on the day is placed', () => {
    const at = dayAnchorCoord('2026-09-04', evidence({ events: [event({})] }), TOKYO);
    expect(at).toEqual(TOKYO);
  });

  /** A miss degrades, never a wrong answer: no destination and nothing placed
   *  means no daylight at all rather than a sunrise for somewhere else. */
  it('is undefined when there is no evidence and no destination', () => {
    expect(dayAnchorCoord('2026-09-04', evidence({}))).toBeUndefined();
  });

  it('ignores a placeless event rather than letting it abstain for the day', () => {
    const at = dayAnchorCoord(
      '2026-09-04',
      evidence({
        places: [place('p1', TEL_AVIV)],
        events: [event({ id: 'a', placeId: 'p1' }), event({ id: 'b' })],
      }),
      TOKYO,
    );
    expect(at).toEqual(TEL_AVIV);
  });
});
