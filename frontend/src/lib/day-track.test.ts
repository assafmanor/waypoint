import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { buildDayGlance } from './glance';
import {
  MARK_MIN_FRAC,
  thinMarks,
  trackBlockClass,
  trackBlocks,
  trackMarks,
  trackMetaFor,
  type TrackMark,
} from './day-track';
import { DAY_TRACK } from '../constants';

const DATE = '2026-09-15';
const NOW = Date.parse('2026-09-14T22:40:00Z');
const W0 = Date.parse(`${DATE}T07:00:00Z`);
const W1 = Date.parse(`${DATE}T23:00:00Z`);

let n = 0;
const ev = (from: string, to: string | null, over: Partial<TripEvent> = {}): TripEvent =>
  ({
    id: `e${++n}`,
    tripId: 't1',
    title: `ev${n}`,
    date: DATE,
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    sortOrder: n,
    category: 'sightseeing',
    startsAt: `${DATE}T${from}:00Z`,
    ...(to ? { endsAt: `${DATE}T${to}:00Z` } : {}),
    ...over,
  }) as TripEvent;

const segsOf = (events: TripEvent[]) => buildDayGlance(events, DATE, NOW, W0, W1, 'UTC').segs;
/** The same segments read from INSIDE the day — `NOW` above is the night board's moment, where a
 *  future day has no phase but `upcoming`. The spent axis only exists on a day you are in. */
const segsToday = (events: TripEvent[]) =>
  buildDayGlance(events, DATE, Date.parse(`${DATE}T13:40:00Z`), W0, W1, 'UTC').segs;

describe('trackBlocks', () => {
  // **The half a track inherits** (ADR-0214 §1). `DayGlance.segs` are the containment forest's
  // roots, so two events that overlap are ONE segment before this file sees them — which is why
  // nothing here has an overlap rule to get wrong.
  it('two events that overlap are ONE block, never two', () => {
    const blocks = trackBlocks(segsOf([ev('10:00', '12:00'), ev('11:00', '13:00')]), {});
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startFrac).toBeCloseTo(0.1875, 4);
    expect(blocks[0].endFrac).toBeCloseTo(0.375, 4);
    expect(blocks[0].composite).toBe(true);
  });

  it('one event containing another is ONE block', () => {
    expect(trackBlocks(segsOf([ev('10:00', '14:00'), ev('11:00', '12:00')]), {})).toHaveLength(1);
  });

  it('no two blocks overlap, on a twelve-item day', () => {
    const blocks = trackBlocks(
      segsOf([
        ev('07:30', '08:00'),
        ev('08:00', '08:20'),
        ev('08:25', '08:40'),
        ev('09:00', '10:30'),
        ev('10:45', '11:00'),
        ev('11:00', '11:15'),
        ev('12:00', '13:00'),
        ev('13:10', '13:25'),
        ev('14:00', '16:00'),
        ev('16:10', '16:25'),
        ev('18:00', '19:30'),
        ev('20:00', '22:30'),
      ]),
      {},
    );
    expect(blocks).toHaveLength(12);
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++)
        expect(
          Math.min(blocks[i].endFrac, blocks[j].endFrac) -
            Math.max(blocks[i].startFrac, blocks[j].startFrac),
        ).toBeLessThan(1e-9);
  });

  // A zero-LENGTH event arrives as a zero-WIDTH segment with `point: false` — the shipped rail
  // draws nothing at all for it (`docs/backlog.md`). A track reads both shapes as a tick.
  it('a zero-length event and a start-only one both read as points', () => {
    const blocks = trackBlocks(segsOf([ev('15:00', '15:00'), ev('17:00', null)]), {});
    expect(blocks.map((b) => b.point)).toEqual([true, true]);
  });

  it('a tail across midnight is flagged, so its trailing edge can fade', () => {
    const blocks = trackBlocks(segsOf([ev('21:00', null, { endsAt: '2026-09-16T01:30:00Z' })]), {});
    expect(blocks[0].nextDay).toBe(true);
    expect(blocks[0].endFrac).toBe(1);
  });

  it('hard comes from the caller, since a glance segment carries no commitment', () => {
    const segs = segsOf([ev('08:00', '09:00'), ev('12:00', '13:00')]);
    const blocks = trackBlocks(segs, { [segs[0].key]: { hard: true } });
    expect(blocks.map((b) => b.hard)).toEqual([true, false]);
  });

  it('the cue is whichever segment the caller names, and nothing by default', () => {
    const segs = segsOf([ev('08:00', '09:00'), ev('12:00', '13:00')]);
    expect(trackBlocks(segs, {}).some((b) => b.cue)).toBe(false);
    expect(trackBlocks(segs, {}, { isCue: (_seg, i) => i === 1 }).map((b) => b.cue)).toEqual([
      false,
      true,
    ]);
  });

  it('include filters, so a consumer can drop a phase it does not draw', () => {
    const segs = segsOf([ev('08:00', '09:00'), ev('12:00', '13:00')]);
    expect(trackBlocks(segs, {}, { include: (seg) => seg.key === segs[1].key })).toHaveLength(1);
  });
});

describe('trackMarks', () => {
  it('a segment with no icon carries no mark', () => {
    const segs = segsOf([ev('08:00', '09:00'), ev('12:00', '13:00')]);
    expect(trackMarks(segs, { [segs[0].key]: { icon: '🚄' } })).toHaveLength(1);
  });

  // A mark labels the BLOCK, so it sits over its middle — the block is what carries the time.
  // And the position has to be the DRAWN one, because `thinMarks` spaces marks by `frac`.
  it('a mark sits at its block middle, not at its start', () => {
    const segs = segsOf([ev('08:00', '12:00')]);
    const [mark] = trackMarks(segs, { [segs[0].key]: { icon: '🚄' } });
    expect(mark.frac).toBeCloseTo((segs[0].startFrac + segs[0].endFrac) / 2, 6);
    expect(mark.frac).toBeGreaterThan(segs[0].startFrac);
  });

  it('a zero-length block puts its mark exactly on its instant', () => {
    const segs = segsOf([ev('15:00', '15:00')]);
    const [mark] = trackMarks(segs, { [segs[0].key]: { icon: '🏨' } });
    expect(mark.frac).toBeCloseTo(segs[0].startFrac, 6);
  });
});

describe('thinMarks', () => {
  const at = (...fracs: number[]): TrackMark[] =>
    fracs.map((frac, i) => ({ key: `k${i}`, frac, icon: '⛩️' }));

  it('drops a mark that cannot clear its neighbour', () => {
    // Two marks a third of `MARK_MIN_FRAC` apart cannot both be drawn.
    const kept = thinMarks(at(0.2, 0.2 + MARK_MIN_FRAC / 3, 0.9));
    expect(kept.map((m) => m.frac)).toEqual([0.2, 0.9]);
  });

  it('keeps a pair that clears it exactly', () => {
    expect(thinMarks(at(0.2, 0.2 + MARK_MIN_FRAC))).toHaveLength(2);
  });

  // **The mistake the drawing made, pinned.** One greedy step with a cap-derived spacing read
  // a cap of ⁦5⁩ as a ⁦1/5⁩ gap across the whole window, so five stops inside three hours kept
  // ONE mark. A cap limits a count; it says nothing about spacing.
  it('a cluster inside three hours keeps more than one mark', () => {
    const kept = thinMarks(at(0.125, 0.156, 0.188, 0.219, 0.266), 5);
    expect(kept.length).toBeGreaterThan(1);
    expect(kept[0].frac).toBe(0.125);
  });

  it('the cap samples evenly and always keeps the first and the last', () => {
    const kept = thinMarks(at(0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1), 5);
    expect(kept).toHaveLength(5);
    expect(kept[0].frac).toBe(0);
    expect(kept[kept.length - 1].frac).toBe(1);
  });

  it('a set already inside the cap is returned untouched', () => {
    expect(thinMarks(at(0, 0.4, 0.8), DAY_TRACK.MARK_CAP)).toHaveLength(3);
  });
});

// ── THE SPENT / SKIPPED AXIS (ADR-0215 §3) ───────────────────────────────────
// Derived from the segment's own phase rather than asked of the caller, which is what keeps the
// night board unchanged by its existence: tomorrow is a day nobody has lived, so every segment
// there comes back `upcoming` and both flags are false throughout.
describe('the spent axis', () => {
  it('is false for everything on a FUTURE day, which is the board invariant', () => {
    const blocks = trackBlocks(segsOf([ev('09:00', '10:00'), ev('19:00', '20:00')]), {});
    expect(blocks.every((b) => !b.spent && !b.skipped)).toBe(true);
  });

  it('marks passed and done behind the clock, and leaves now/upcoming alone', () => {
    const blocks = trackBlocks(
      segsToday([
        ev('09:00', '10:00'),
        ev('13:00', '14:30'),
        ev('19:00', '20:00'),
        ev('20:30', '21:00', { status: EVENT_STATUS.DONE }),
      ]),
      {},
    );
    expect(blocks.map((b) => b.spent)).toEqual([true, false, false, true]);
  });

  it('a skip is its own flag, never a spent block', () => {
    const blocks = trackBlocks(
      segsToday([ev('09:00', '10:00', { status: EVENT_STATUS.SKIPPED })]),
      {},
    );
    expect(blocks[0].skipped).toBe(true);
    expect(blocks[0].spent).toBe(false);
  });

  it('every flag reaches the class list, so two hosts cannot spell one block two ways', () => {
    // Four events, three blocks: the pair at ⁦11:00⁩/⁦12:00⁩ overlaps and comes back as one
    // composite (ADR-0041), which is also why this is the fixture that proves `multi`.
    const events = [
      ev('09:00', '10:00', { kind: EVENT_KIND.HARD }),
      ev('11:00', '13:00'),
      ev('12:00', '14:00'),
      ev('19:00', '19:00'),
    ];
    const segs = segsToday(events);
    const blocks = trackBlocks(segs, trackMetaFor(events, segs));
    expect(blocks).toHaveLength(3);
    expect(trackBlockClass(blocks[0])).toBe('wp-track-blk hard spent');
    expect(trackBlockClass(blocks[1])).toContain('multi');
    expect(trackBlockClass(blocks[2])).toContain('point');
  });
});

describe('trackMetaFor', () => {
  it('resolves each segment icon and commitment from the day own events', () => {
    const events = [
      ev('09:00', '10:00', { icon: '🍜' }),
      ev('19:00', '20:00', { icon: '⛩️', kind: EVENT_KIND.HARD }),
    ];
    const segs = segsToday(events);
    const meta = trackMetaFor(events, segs);
    expect(segs.map((seg) => meta[seg.key])).toEqual([
      { icon: '🍜', hard: false },
      { icon: '⛩️', hard: true },
    ]);
  });

  it('a segment whose event is not in the list carries no icon rather than a wrong one', () => {
    const events = [ev('09:00', '10:00', { icon: '🍜' })];
    const meta = trackMetaFor([], segsToday(events));
    expect(Object.values(meta)).toEqual([{ hard: false }]);
  });

  it('a composite is keyed on its first member, and takes that event glyph', () => {
    const events = [ev('11:00', '13:00', { icon: '🎏' }), ev('12:00', '14:00', { icon: '🏯' })];
    const segs = segsToday(events);
    expect(segs).toHaveLength(1);
    expect(trackMetaFor(events, segs)[segs[0].key].icon).toBe('🎏');
  });
});
