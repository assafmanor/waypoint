import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import {
  GAP_CHARACTER,
  NIGHT_BAND,
  gapCharacter,
  gapDrawsDayRail,
  type GapCharacterInput,
} from './gap-character';

const TODAY = '2026-08-29';
const TOMORROW = '2026-08-30';

const ev = (over: Partial<TripEvent> & { id: string; date: string }): TripEvent =>
  ({
    tripId: 't1',
    title: over.title ?? 'משהו',
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    ...over,
  }) as TripEvent;

const hotel = ev({ id: 'hotel', date: '2026-08-27', title: 'Rooms Hotel Tbilisi' });
const laterToday = ev({ id: 'later', date: TODAY, startsAt: '2026-08-29T15:00:00Z' });
const tomorrowFlight = ev({ id: 'flight', date: TOMORROW, startsAt: '2026-08-30T07:00:00Z' });

/** Mid-afternoon on a day with things on it — the ordinary gap, and the baseline every other
 *  case here is one field away from. */
const base: GapCharacterInput = {
  hour: 13,
  next: laterToday,
  today: TODAY,
  dayHasEvents: true,
  onWay: false,
};

describe('gapCharacter', () => {
  it('a real gap with something later TODAY is `open` — the one case `זמן חופשי` was right about', () => {
    expect(gapCharacter(base).kind).toBe(GAP_CHARACTER.OPEN);
  });

  describe('on the way — the reported defect', () => {
    it('the device mark wins, because a person supplied it', () => {
      expect(gapCharacter({ ...base, onWay: true }).kind).toBe(GAP_CHARACTER.ON_THE_WAY);
    });

    it('and it outranks the bed: up and out at 06:20 is moving, not at a hotel', () => {
      const read = gapCharacter({ ...base, hour: 6, wokeIn: hotel, onWay: true });
      expect(read.kind).toBe(GAP_CHARACTER.ON_THE_WAY);
    });

    // The mark is stored per event id, so a mark with nothing to be on the way TO is not a
    // state — it is a stale key. Falling through is what keeps it from claiming a journey.
    it('but a mark with no next is not a journey', () => {
      const read = gapCharacter({ ...base, next: undefined, onWay: true });
      expect(read.kind).toBe(GAP_CHARACTER.DAY_DONE);
    });
  });

  describe('at the stay — night and morning are one member', () => {
    it('02:40 in bed is `לילה`, and it reports the stay rather than a claim about sleeping', () => {
      const read = gapCharacter({ ...base, hour: 2, wokeIn: hotel, next: tomorrowFlight });
      expect(read.kind).toBe(GAP_CHARACTER.AT_THE_STAY);
      expect(read.band).toBe(NIGHT_BAND.NIGHT);
      expect(read.stay).toBe(hotel);
    });

    it('06:40 is the same member, the other band', () => {
      const read = gapCharacter({ ...base, hour: 6, wokeIn: hotel, next: laterToday });
      expect(read.kind).toBe(GAP_CHARACTER.AT_THE_STAY);
      expect(read.band).toBe(NIGHT_BAND.MORNING);
    });

    it('23:30 is night again — the window is closed at both ends', () => {
      const read = gapCharacter({ ...base, hour: 23, wokeIn: hotel, next: tomorrowFlight });
      expect(read.kind).toBe(GAP_CHARACTER.AT_THE_STAY);
      expect(read.band).toBe(NIGHT_BAND.NIGHT);
    });

    // `wokeIn` survives all day — it is `travelOrigin`'s fallback, not a live position — so
    // without this bound an empty day would claim you were at the hotel at lunchtime.
    it('but INSIDE the waking window the bed is a stale claim and is not made', () => {
      expect(gapCharacter({ ...base, hour: 11, wokeIn: hotel }).kind).toBe(GAP_CHARACTER.OPEN);
      expect(
        gapCharacter({ ...base, hour: 11, wokeIn: hotel, next: undefined, dayHasEvents: false })
          .kind,
      ).toBe(GAP_CHARACTER.EMPTY_DAY);
    });

    it('the window edges belong to the day, not to the night', () => {
      expect(gapCharacter({ ...base, hour: 7, wokeIn: hotel }).kind).toBe(GAP_CHARACTER.OPEN);
      expect(gapCharacter({ ...base, hour: 22, wokeIn: hotel }).kind).toBe(GAP_CHARACTER.OPEN);
    });
  });

  describe('the two empties, told apart by the DATE of next and not by its absence', () => {
    // This is the load-bearing one. `deriveNow` is trip-scoped, so at 22:40 mid-trip `next`
    // is tomorrow's flight — an `if (!next)` test would have called this `open` forever.
    it('an evening whose next is TOMORROW is `day-done`, even though next exists', () => {
      const read = gapCharacter({ ...base, hour: 22, next: tomorrowFlight });
      expect(read.kind).toBe(GAP_CHARACTER.DAY_DONE);
    });

    it('the trip’s last evening is the same read, reached with no next at all', () => {
      expect(gapCharacter({ ...base, hour: 22, next: undefined }).kind).toBe(
        GAP_CHARACTER.DAY_DONE,
      );
    });

    it('a day nobody planned is NOT a day that is over', () => {
      const read = gapCharacter({
        ...base,
        hour: 11,
        next: tomorrowFlight,
        dayHasEvents: false,
      });
      expect(read.kind).toBe(GAP_CHARACTER.EMPTY_DAY);
    });
  });

  describe('gapDrawsDayRail', () => {
    it('drops the rail exactly where it would draw a day you are not in', () => {
      expect(gapDrawsDayRail(GAP_CHARACTER.AT_THE_STAY)).toBe(false);
      expect(gapDrawsDayRail(GAP_CHARACTER.EMPTY_DAY)).toBe(false);
    });

    it('and keeps it everywhere the day is the frame you are inside', () => {
      expect(gapDrawsDayRail(GAP_CHARACTER.OPEN)).toBe(true);
      expect(gapDrawsDayRail(GAP_CHARACTER.ON_THE_WAY)).toBe(true);
      expect(gapDrawsDayRail(GAP_CHARACTER.DAY_DONE)).toBe(true);
    });
  });
});
