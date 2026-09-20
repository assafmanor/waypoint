import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { t } from '../i18n/he';
import {
  GAP_CHARACTER,
  NIGHT_BAND,
  gapCharacter,
  gapDrawsDayRail,
  gapIsLocative,
  gapWords,
  type GapCharacterInput,
} from './gap-character';
import { TRAVEL_STANCE } from './travel-position';

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
  leavePassed: false,
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

  // The 2026-09-15 amendment to §8: reported from a device at ⁦11:16⁩, where the title said
  // `פנוי · זמן חופשי` over the card's own red `12 דקות באיחור ליציאה`.
  describe('due out — the gap that is not free any more', () => {
    it('a passed leave-by takes the gap out of `open`', () => {
      const read = gapCharacter({ ...base, leavePassed: true });
      expect(read.kind).toBe(GAP_CHARACTER.DUE_OUT);
      expect(gapWords(read).title).toBe(t.board.gap.dueOut.title);
    });

    it('and the words no longer contradict the tile beside them', () => {
      expect(gapWords(gapCharacter({ ...base, leavePassed: true })).title).not.toBe(
        t.board.freeTitle,
      );
    });

    it('`בדרך` still wins — the person answered the question the departure was asking', () => {
      const read = gapCharacter({ ...base, leavePassed: true, onWay: true });
      expect(read.kind).toBe(GAP_CHARACTER.ON_THE_WAY);
    });

    it('and it outranks the bed: late out of a hotel at 05:40 is late, not `בוקר`', () => {
      const read = gapCharacter({ ...base, hour: 5, wokeIn: hotel, leavePassed: true });
      expect(read.kind).toBe(GAP_CHARACTER.DUE_OUT);
    });

    // The band belongs to every arm (the 2026-09-01 amendment), so the rail still comes off at
    // ⁦05:40⁩ — what this arm declines to do is SPEND it on a label carrying real information.
    it('carries the band without printing it', () => {
      const read = gapCharacter({ ...base, hour: 5, leavePassed: true });
      expect(read.band).toBe(NIGHT_BAND.MORNING);
      expect(gapDrawsDayRail(read)).toBe(false);
      expect(gapWords(read).label).toBe(t.board.gap.dueOut.label);
    });

    it('a passed leave-by with nothing to be late FOR is not a state', () => {
      const read = gapCharacter({ ...base, next: undefined, leavePassed: true });
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

  // ── THE HOUR IS CARRIED BY EVERY ARM (the 2026-09-01 amendment) ─────────────
  // Reported from a phone at ⁦01:12⁩: a night whose next event was a ⁦07:00⁩ check-in, so the plan
  // had no bed to name, the read was `open`, and the board said `פנוי · זמן חופשי` over a rail
  // whose knob sat at ⁦0%⁩ under `עכשיו`. Both were the night going unnoticed because the night
  // was keyed on the arm that happened to need it first.
  describe('the band is a fact about the hour, not about the arm', () => {
    it('an open gap in the small hours carries the night band', () => {
      const read = gapCharacter({ ...base, hour: 1, next: laterToday });
      expect(read.kind).toBe(GAP_CHARACTER.OPEN);
      expect(read.band).toBe(NIGHT_BAND.NIGHT);
    });

    it('and before the day opens it carries the morning one', () => {
      expect(gapCharacter({ ...base, hour: 6, next: laterToday }).band).toBe(NIGHT_BAND.MORNING);
    });

    it('inside the window there is no band at all', () => {
      expect(gapCharacter({ ...base, hour: 13 }).band).toBeUndefined();
      expect(gapCharacter({ ...base, hour: 7 }).band).toBeUndefined();
      expect(gapCharacter({ ...base, hour: 22 }).band).toBeUndefined();
    });

    it('every arm carries it, including the two that do not spend it on words', () => {
      expect(gapCharacter({ ...base, hour: 2, next: laterToday, onWay: true }).band).toBe(
        NIGHT_BAND.NIGHT,
      );
      expect(gapCharacter({ ...base, hour: 23, next: tomorrowFlight }).band).toBe(NIGHT_BAND.NIGHT);
      expect(
        gapCharacter({ ...base, hour: 2, next: tomorrowFlight, dayHasEvents: false }).band,
      ).toBe(NIGHT_BAND.NIGHT);
    });
  });

  describe('the words an open gap uses at that hour', () => {
    it('say which hours are free rather than claiming a day that has not started', () => {
      const read = gapCharacter({ ...base, hour: 1, next: laterToday });
      expect(gapWords(read)).toEqual({
        label: t.board.gap.band.night,
        title: t.board.freeTitle,
      });
    });

    it('and are the ordinary two inside the window', () => {
      const read = gapCharacter({ ...base, hour: 13 });
      expect(gapWords(read)).toEqual({ label: t.board.freeLabel, title: t.board.freeTitle });
    });

    // The stay keeps its own title — the band was never the whole of that arm's words.
    it('the stay still names the place, in the same two band words', () => {
      const read = gapCharacter({ ...base, hour: 2, wokeIn: hotel, next: tomorrowFlight });
      expect(gapWords(read, 'Rooms Hotel')).toEqual({
        label: t.board.gap.band.night,
        title: 'Rooms Hotel',
      });
    });
  });

  describe('gapDrawsDayRail', () => {
    const read = (over: Partial<GapCharacterInput>) => gapCharacter({ ...base, ...over });

    // `dayProgress` clamps at both ends, so a rail outside the window is pinned at ⁦0%⁩ or ⁦100%⁩
    // under the word `עכשיו` — a day you are not in, in both directions.
    it('drops the rail everywhere the clock is outside the window, in EVERY arm', () => {
      expect(gapDrawsDayRail(read({ hour: 1, next: laterToday }))).toBe(false);
      expect(gapDrawsDayRail(read({ hour: 2, wokeIn: hotel, next: tomorrowFlight }))).toBe(false);
      expect(gapDrawsDayRail(read({ hour: 23, next: tomorrowFlight }))).toBe(false);
      expect(gapDrawsDayRail(read({ hour: 6, next: laterToday, onWay: true }))).toBe(false);
    });

    it('and where the day has nothing on it at any hour', () => {
      expect(gapDrawsDayRail(read({ hour: 11, next: undefined, dayHasEvents: false }))).toBe(false);
    });

    it('and keeps it everywhere the day is the frame you are inside', () => {
      expect(gapDrawsDayRail(read({ hour: 13 }))).toBe(true);
      expect(gapDrawsDayRail(read({ hour: 13, onWay: true }))).toBe(true);
      expect(gapDrawsDayRail(read({ hour: 22, next: tomorrowFlight }))).toBe(true);
    });
  });
});

// ══ THE FIX REACHES THE TITLE (field report, 2026-09-20) ═══════════════════════════════════════
//
// The board read `פנוי · זמן חופשי` while the day view, one tab away at the same minute, drew the
// leg as in progress off the same `travelStance`. `ON_THE_WAY` existed here from this file's first
// commit and nothing but a human press could reach it: the screen passed `onWay` and kept the
// stance to itself, so ADR-0207 §2's fix could WITHDRAW the leave-by and never replace it — and
// what it fell through to was the loudest false statement on the card.
describe('gapCharacter — a fix may now supply the character (ADR-0207 §2 as amended)', () => {
  it('reads on-the-way off an `en-route` fix with nobody having pressed anything', () => {
    expect(gapCharacter({ ...base, stance: TRAVEL_STANCE.EN_ROUTE }).kind).toBe(
      GAP_CHARACTER.ON_THE_WAY,
    );
  });

  it('and still off the mark alone, which is what a fix cannot always answer', () => {
    expect(gapCharacter({ ...base, onWay: true }).kind).toBe(GAP_CHARACTER.ON_THE_WAY);
  });

  it('reads `arrived` at the next stop before its clock', () => {
    expect(gapCharacter({ ...base, stance: TRAVEL_STANCE.ARRIVED }).kind).toBe(
      GAP_CHARACTER.ARRIVED,
    );
  });

  // The stale-mark case, and the reason `arrived` is ordered first: somebody pressed `בדרך` half
  // an hour ago and has since got there. ADR-0207 §2 already withdraws the mark on this stance;
  // this is that withdrawal reaching the words.
  it('and `arrived` outranks a mark the arrival has already answered', () => {
    expect(gapCharacter({ ...base, onWay: true, stance: TRAVEL_STANCE.ARRIVED }).kind).toBe(
      GAP_CHARACTER.ARRIVED,
    );
  });

  // `at-origin` is the one arm that makes the app louder, and it is the leave-by's to spend
  // (`עדיין כאן`). As a CHARACTER it would say what `open` and `due-out` already say.
  it('changes nothing on `at-origin` or `unknown`', () => {
    expect(gapCharacter({ ...base, stance: TRAVEL_STANCE.AT_ORIGIN }).kind).toBe(
      GAP_CHARACTER.OPEN,
    );
    expect(gapCharacter({ ...base, stance: TRAVEL_STANCE.UNKNOWN }).kind).toBe(GAP_CHARACTER.OPEN);
    expect(gapCharacter(base).kind).toBe(GAP_CHARACTER.OPEN);
  });

  // A fix is about the leg INTO something. With nothing next there is no leg for it to be on.
  it('says nothing about a stance with no next point', () => {
    const { next: _next, ...noNext } = base;
    expect(gapCharacter({ ...noNext, stance: TRAVEL_STANCE.EN_ROUTE }).kind).toBe(
      GAP_CHARACTER.DAY_DONE,
    );
    expect(gapCharacter({ ...noNext, stance: TRAVEL_STANCE.ARRIVED }).kind).toBe(
      GAP_CHARACTER.DAY_DONE,
    );
  });

  it('wears the teal costume, which is what a position claim spends (rule 4)', () => {
    expect(gapIsLocative(GAP_CHARACTER.ARRIVED)).toBe(true);
    expect(gapIsLocative(GAP_CHARACTER.ON_THE_WAY)).toBe(true);
    // A clock with no position behind it stays amber — the distinction the hue is carrying.
    expect(gapIsLocative(GAP_CHARACTER.DUE_OUT)).toBe(false);
  });

  it('says `הגענו`, the word the day row already settles an edge with', () => {
    expect(gapWords({ kind: GAP_CHARACTER.ARRIVED })).toEqual(t.board.gap.arrived);
  });

  // It carries the band like every arm since the 2026-09-01 amendment (so the rail still comes
  // off at ⁦05:40⁩) and spends it on nothing: arriving at ⁦05:40⁩ is arriving.
  it('carries the band without spending it', () => {
    const read = gapCharacter({ ...base, hour: 5, stance: TRAVEL_STANCE.ARRIVED });
    expect(read.band).toBe(NIGHT_BAND.MORNING);
    expect(gapWords(read)).toEqual(t.board.gap.arrived);
    expect(gapDrawsDayRail(read)).toBe(false);
  });
});
