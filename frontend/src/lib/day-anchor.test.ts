// `dayAnchorCoord` — where a day is lived, in coordinates.
//
// The cases that matter are the ones the ZONE sibling already had to answer, so
// they are asserted in the same terms: a settled day, an arrival day where the
// flight must abstain, a day with nothing placed, and a trip with nothing at all.
import { describe, expect, it } from 'vitest';
import type { Booking, Place, TripEvent } from '@waypoint/shared';
import { dayAnchorCoord, liveAnchorCoord, type ZoneEvidence } from './places';

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

// `liveAnchorCoord` — where you are RIGHT NOW, in coordinates (ADR-0218's 2026-09-03 amendment
// §B). The coordinate twin of `liveZone`, so the cases are the ones that function already had
// to answer, plus the one rule that is deliberately inverted against `dayAnchorCoord` above.
describe('liveAnchorCoord', () => {
  const NOW = Date.parse('2026-09-04T12:00:00Z');
  const at = (offsetH: number) => new Date(NOW + offsetH * 3_600_000).toISOString();

  const timed = (over: Partial<TripEvent>): TripEvent =>
    ({ id: 'e', date: '2026-09-04', ...over }) as TripEvent;

  it('takes an event in progress over everything else', () => {
    expect(
      liveAnchorCoord(
        NOW,
        evidence({
          places: [place('tokyo', TOKYO), place('tlv', TEL_AVIV)],
          events: [
            timed({ id: 'now', placeId: 'tlv', startsAt: at(-1), endsAt: at(1) }),
            timed({ id: 'later', placeId: 'tokyo', startsAt: at(5), endsAt: at(6) }),
          ],
        }),
      ),
    ).toEqual(TEL_AVIV);
  });

  it('**reads a crossing’s DESTINATION mid-transit, where the day anchor abstains**', () => {
    // The inversion, and the whole of the owner's "or where we're headed". `dayAnchorCoord`
    // declines here on purpose — a thing that moves you cannot say where the DAY sits — and
    // ADR-0107 §8's rule for the live question is the opposite.
    const flight = timed({
      id: 'fly',
      bookingId: 'b',
      startsAt: at(-1),
      endsAt: at(2),
    });
    const ev = evidence({
      places: [place('tokyo', TOKYO), place('tlv', TEL_AVIV)],
      events: [flight],
      bookings: [{ id: 'b', fromPlaceId: 'tlv', toPlaceId: 'tokyo' } as Booking],
    });
    expect(liveAnchorCoord(NOW, ev)).toEqual(TOKYO);
    // …and the day sibling still abstains, so the two have not been collapsed into one answer.
    expect(dayAnchorCoord('2026-09-04', ev)).toBeUndefined();
  });

  it('takes the NEAREST placed event within the window, ahead or behind', () => {
    // "Where we're headed": an hour before the drive, the next place is already the answer.
    expect(
      liveAnchorCoord(
        NOW,
        evidence({
          places: [place('tokyo', TOKYO), place('tlv', TEL_AVIV)],
          events: [
            timed({ id: 'soon', placeId: 'tokyo', startsAt: at(1) }),
            timed({ id: 'ages', placeId: 'tlv', startsAt: at(-6) }),
          ],
        }),
      ),
    ).toEqual(TOKYO);
  });

  it('ignores an event beyond the window and falls back to the day’s own anchor', () => {
    // Twelve hours is `LIVE_ZONE_WINDOW_MS`; a stop five days out says nothing about now.
    expect(
      liveAnchorCoord(
        NOW,
        evidence({
          places: [place('tokyo', TOKYO)],
          events: [timed({ id: 'far', date: '2026-09-20', placeId: 'tokyo', startsAt: at(400) })],
        }),
        TEL_AVIV,
      ),
    ).toEqual(TEL_AVIV);
  });

  it('degrades to undefined with nothing placed and no destination', () => {
    expect(liveAnchorCoord(NOW, evidence({}))).toBeUndefined();
  });
});
