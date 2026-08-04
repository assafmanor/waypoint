import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayPositions, firstPositionFitting, POSITION_AT } from './day-positions';

const TZ = 'Asia/Tokyo';
const DATE = '2026-07-07';
const NOW = '2026-07-01T00:00:00Z';
const ev = (id: string, start: string | null, end?: string): TripEvent => ({
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
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

// 09:00–10:00, 10:30–12:30, 15:00–16:00 — one real gap (12:30→15:00), one seam-sized join
// (10:00→10:30), and both day edges.
const A = ev('A', '09:00', '10:00');
const B = ev('B', '10:30', '12:30');
const C = ev('C', '15:00', '16:00');
const day = [A, B, C];

const at = (p: { at: string }) => p.at;

describe('dayPositions', () => {
  it('offers a position after every row and at both day edges, in day order', () => {
    const positions = dayPositions(day, DATE, TZ);
    expect(positions.map(at)).toEqual([
      POSITION_AT.DAY_START,
      POSITION_AT.AFTER, // after A
      POSITION_AT.AFTER, // after B
      POSITION_AT.DAY_END,
    ]);
    expect(positions[1].afterEvent?.id).toBe('A');
    expect(positions[1].beforeEvent?.id).toBe('B');
  });

  it('names the row on each side, so a chooser can say "before the flight"', () => {
    const positions = dayPositions(day, DATE, TZ);
    expect(positions[0].beforeEvent?.id).toBe('A'); // the day's head
    expect(positions.at(-1)!.afterEvent?.id).toBe('C'); // its tail
  });

  it('keeps positions with no free time in them — a seam is a position', () => {
    // A ends 10:00 and B starts 10:30: half an hour, under the chip threshold.
    const afterA = dayPositions(day, DATE, TZ)[1];
    expect(afterA.free.minutes).toBe(30);
    // …and it still carries a droppable slot.
    expect(afterA.free.fill.start).toBe('10:00');
  });

  it('computes each slot through lib/gaps, so it matches what a drop would land on', () => {
    const afterB = dayPositions(day, DATE, TZ)[2];
    expect(afterB.free.minutes).toBe(150); // 12:30 → 15:00
    expect(afterB.free.fill).toEqual({ date: DATE, start: '12:30', end: '13:30' });
  });

  // ADR-0161 §4: the moved event's own two positions are the two places it already is.
  describe('excluding the event being moved', () => {
    it('drops the positions immediately either side of it', () => {
      const positions = dayPositions(day, DATE, TZ, { exclude: 'B' });
      // Without B: A then C. So the head, one position between them, and the tail.
      expect(positions.map(at)).toEqual([
        POSITION_AT.DAY_START,
        POSITION_AT.AFTER,
        POSITION_AT.DAY_END,
      ]);
      expect(positions[1].afterEvent?.id).toBe('A');
      expect(positions[1].beforeEvent?.id).toBe('C');
    });

    // The join that matters: with B gone, "after A" and "before C" are ONE position rather
    // than two, and it spans the whole of the time B was using.
    it('re-joins the day around it rather than leaving a hole', () => {
      const between = dayPositions(day, DATE, TZ, { exclude: 'B' })[1];
      expect(between.free.minutes).toBe(300); // 10:00 → 15:00
    });

    it('drops the day-start position when the moved event is the first row', () => {
      const positions = dayPositions(day, DATE, TZ, { exclude: 'A' });
      expect(positions[0].at).toBe(POSITION_AT.DAY_START);
      expect(positions[0].beforeEvent?.id).toBe('B'); // B is the first row now, not A
    });
  });

  // The three days that can hang a position off nothing timed (ADR-0161 §2's amendment).
  describe('a day with nothing timed', () => {
    it('offers the whole day, once', () => {
      for (const events of [[], [ev('u', null)], [ev('u', null), ev('v', null)]]) {
        const positions = dayPositions(events, DATE, TZ);
        expect(positions.map(at)).toEqual([POSITION_AT.WHOLE_DAY]);
        expect(positions[0].free.fill.start).toBe('07:00');
      }
    });

    it('falls back to the whole day when the only timed row is the one being moved', () => {
      expect(dayPositions([A], DATE, TZ, { exclude: 'A' }).map(at)).toEqual([
        POSITION_AT.WHOLE_DAY,
      ]);
    });
  });
});

// ADR-0161 §4: what a surface prefills when it defaults rather than asking — Trip mode's
// Tier-1 quick-schedule. Its default used to be "after everything".
describe('firstPositionFitting', () => {
  const positions = dayPositions(day, DATE, TZ);

  it('takes the first position with room, not the last one on the day', () => {
    // The day's head (09:00 window → 07:00 opening) has 120 minutes; the join after A has 30.
    const fitting = firstPositionFitting(positions, 90)!;
    expect(fitting.at).toBe(POSITION_AT.DAY_START);
    // …and it is emphatically not the tail, which is what `nextSlot` would have given.
    expect(fitting.key).not.toBe(positions.at(-1)!.key);
  });

  it('skips positions too small for it', () => {
    // 150 minutes fits the 12:30→15:00 join but not the 30-minute one after A.
    const fitting = firstPositionFitting(positions, 121)!;
    expect(fitting.afterEvent?.id).toBe('B');
  });

  it('falls back to the last position when nothing on the day has room', () => {
    const fitting = firstPositionFitting(positions, 10_000)!;
    expect(fitting.key).toBe(positions.at(-1)!.key);
  });

  it('answers null only when there are no positions at all', () => {
    expect(firstPositionFitting([], 60)).toBeNull();
  });
});
