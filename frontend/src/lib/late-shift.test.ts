import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { lateShift } from './late-shift';

const DATE = '2026-09-16';
const STAMP = '2026-09-01T00:00:00Z';
const ev = (
  id: string,
  start: string | null,
  end: string | null,
  over: Partial<TripEvent> = {},
): TripEvent => ({
  id,
  tripId: 't1',
  date: DATE,
  title: id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  startsAt: start ? `${DATE}T${start}:00+09:00` : undefined,
  endsAt: end ? `${DATE}T${end}:00+09:00` : undefined,
  sortOrder: 1,
  source: 'manual',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: 'u1',
  ...over,
});
const at = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00+09:00`);
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString();

// The seeded Tokyo day the ADR counted on, at 13:51.
const tour = ev('tour', '10:00', '16:00', { status: EVENT_STATUS.DONE });
const free = ev('free', '16:30', '19:30');
const ramen = ev('ramen', '19:30', '21:00', { kind: EVENT_KIND.HARD });
const bar = ev('bar', '21:30', '22:30');
const walk = ev('walk', '22:45', '23:15');
const day = [tour, free, ramen, bar, walk];

describe('lateShift — the day takes a delay (ADR-0231 §5)', () => {
  it('moves every planned soft row ahead of now, up to the first hard anchor, which stays', () => {
    const shift = lateShift(day, at('13:51'), 30);
    expect(shift.moved.map((e) => e.id)).toEqual(['free']);
    expect(shift.anchor?.id).toBe('ramen');
    expect(shift.patches).toEqual([
      { id: 'free', patch: { startsAt: iso('17:00'), endsAt: iso('20:00') } },
    ]);
  });

  it('nothing after the anchor moves — a booking re-synchronises you', () => {
    const shift = lateShift(day, at('13:51'), 45);
    expect(shift.patches.some((p) => p.id === 'bar' || p.id === 'walk')).toBe(false);
  });

  it('with no anchor ahead, the whole soft tail moves and keeps its gaps', () => {
    const shift = lateShift([free, bar, walk], at('13:51'), 15);
    expect(shift.anchor).toBeNull();
    expect(shift.patches.map((p) => p.id)).toEqual(['free', 'bar', 'walk']);
    expect(shift.patches[1].patch).toEqual({ startsAt: iso('21:45'), endsAt: iso('22:45') });
  });

  it('a row already started stays — the delay is about what is ahead', () => {
    const shift = lateShift([free, bar], at('17:00'), 30);
    expect(shift.moved.map((e) => e.id)).toEqual(['bar']);
  });

  it('records, skips and untimed rows never move', () => {
    const skipped = ev('skipped', '17:00', '18:00', { status: EVENT_STATUS.SKIPPED });
    const untimed = ev('untimed', null, null);
    const shift = lateShift([tour, skipped, untimed, bar], at('09:00'), 30);
    expect(shift.moved.map((e) => e.id)).toEqual(['bar']);
  });

  it('a start-only row moves start-only — it has no length to carry', () => {
    const shift = lateShift([ev('open', '18:00', null)], at('13:51'), 30);
    expect(shift.patches[0].patch).toEqual({ startsAt: iso('18:30') });
  });

  it('a hard anchor that has already started does not stop the shift behind it', () => {
    // Inside a booking at 20:00: the rows after it are what "we are late" is about now.
    const shift = lateShift(day, at('20:00'), 30);
    expect(shift.anchor).toBeNull();
    expect(shift.moved.map((e) => e.id)).toEqual(['bar', 'walk']);
  });

  // **The 2026-09-19 amendment** — the walk steps over a commitment it has collected nothing
  // for. Reported from an Iceland morning at ⁦08:42⁩ with a booked ⁦09:00⁩ ahead of it: the day
  // had nothing to offer, and offered the same afternoon again at ⁦09:01⁩.
  describe('a commitment stops the shift only once the delay has reached it', () => {
    const waterfall = ev('waterfall', '09:00', '10:30', { kind: EVENT_KIND.HARD });
    const lunch = ev('lunch', '12:30', '13:30');
    const iceland = [ev('asbyrgi', '07:00', '08:00'), waterfall, lunch, ramen, bar];

    it('the next thing ahead being a booking no longer empties the set', () => {
      const shift = lateShift(iceland, at('08:42'), 30);
      expect(shift.moved.map((e) => e.id)).toEqual(['lunch']);
      expect(shift.anchor?.id).toBe('ramen');
      expect(shift.patches.some((p) => p.id === 'waterfall')).toBe(false);
    });

    it('and the set does not change when that booking starts', () => {
      const before = lateShift(iceland, at('08:42'), 30);
      const after = lateShift(iceland, at('09:01'), 30);
      expect(after.moved.map((e) => e.id)).toEqual(before.moved.map((e) => e.id));
      expect(after.anchor?.id).toBe(before.anchor?.id);
    });

    it('a soft row beside the stepped-over booking still moves', () => {
      const peer = ev('peer', '09:00', '11:15', { sortOrder: 2 });
      const shift = lateShift([waterfall, peer], at('08:42'), 30);
      expect(shift.moved.map((e) => e.id)).toEqual(['peer']);
    });

    it('back-to-back commitments are all stepped over, and the anchor is the one that stops it', () => {
      const second = ev('second', '11:00', '12:00', { kind: EVENT_KIND.HARD });
      const shift = lateShift([waterfall, second, lunch, ramen], at('08:42'), 30);
      expect(shift.moved.map((e) => e.id)).toEqual(['lunch']);
      expect(shift.anchor?.id).toBe('ramen');
    });

    it('a day whose whole tail is commitments still has nothing to move', () => {
      const shift = lateShift([waterfall, ramen], at('08:42'), 30);
      expect(shift.moved).toEqual([]);
      expect(shift.anchor).toBeNull();
    });
  });
});
