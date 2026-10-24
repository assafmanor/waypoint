import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { buildDayGlance } from './glance';
import { tomorrowRibbon } from './tomorrow';

const TOMORROW = '2026-09-15';
/** The clock is TODAY at ⁦22:40⁩ — every case here is the night board's own moment. */
const NOW = Date.parse('2026-09-14T22:40:00Z');
const W0 = Date.parse(`${TOMORROW}T07:00:00Z`);
const W1 = Date.parse(`${TOMORROW}T23:00:00Z`);

let n = 0;
const ev = (from: string, to: string | null, over: Partial<TripEvent> = {}): TripEvent =>
  ({
    id: `e${++n}`,
    tripId: 't1',
    title: `ev${n}`,
    date: TOMORROW,
    kind: EVENT_KIND.SOFT,
    status: EVENT_STATUS.PLANNED,
    sortOrder: n,
    category: 'sightseeing',
    startsAt: `${TOMORROW}T${from}:00Z`,
    ...(to ? { endsAt: `${TOMORROW}T${to}:00Z` } : {}),
    ...over,
  }) as TripEvent;

const glanceOf = (events: TripEvent[]) => buildDayGlance(events, TOMORROW, NOW, W0, W1, 'UTC');

/** The ribbon, with every segment given an icon so marks are about spacing alone. */
const ribbonOf = (events: TripEvent[], cap?: number) => {
  const glance = glanceOf(events);
  const meta = Object.fromEntries(
    glance.segs.map((seg) => [
      seg.key,
      { icon: '⛩️', hard: events.find((e) => e.id === seg.key)?.kind === EVENT_KIND.HARD },
    ]),
  );
  return tomorrowRibbon({ glance, meta, ...(cap === undefined ? {} : { cap }) });
};

describe('tomorrowRibbon', () => {
  it('a plain day: one block per stop, in the glance own fractions', () => {
    const r = ribbonOf([ev('10:30', '12:30'), ev('14:00', '16:00'), ev('19:30', '21:30')]);
    expect(r.count).toBe(3);
    expect(r.blocks.map((b) => +b.startFrac.toFixed(4))).toEqual([0.2188, 0.4375, 0.7813]);
  });

  // **The half the ribbon inherits** (ADR-0214 §1). `DayGlance.segs` are the containment
  // forest's roots, so two events that overlap are ONE block before this file sees them —
  // which is why nothing here has an overlap rule to get wrong.
  it('two events that overlap are ONE block, never two', () => {
    const r = ribbonOf([ev('10:00', '12:00'), ev('11:00', '13:00')]);
    expect(r.count).toBe(1);
    expect(r.blocks[0].startFrac).toBeCloseTo(0.1875, 4);
    expect(r.blocks[0].endFrac).toBeCloseTo(0.375, 4);
  });

  it('one event containing another is ONE block', () => {
    expect(ribbonOf([ev('10:00', '14:00'), ev('11:00', '12:00')]).count).toBe(1);
  });

  it('three events on the same minute are ONE block', () => {
    expect(ribbonOf([ev('10:00', '11:00'), ev('10:00', '11:30'), ev('10:00', '10:45')]).count).toBe(
      1,
    );
  });

  it('no two blocks overlap, on a twelve-item day', () => {
    const r = ribbonOf([
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
    ]);
    expect(r.count).toBe(12);
    for (let i = 0; i < r.blocks.length; i++)
      for (let j = i + 1; j < r.blocks.length; j++) {
        const a = r.blocks[i];
        const b = r.blocks[j];
        expect(Math.min(a.endFrac, b.endFrac) - Math.max(a.startFrac, b.startFrac)).toBeLessThan(
          1e-9,
        );
      }
  });

  // A zero-LENGTH event arrives as a zero-WIDTH segment with `point: false` — the shipped rail
  // draws nothing at all for it (`docs/backlog.md`). The ribbon reads both shapes as a tick.
  it('a zero-length event and a start-only one both read as points', () => {
    const r = ribbonOf([ev('15:00', '15:00'), ev('17:00', null)]);
    expect(r.blocks.map((b) => b.point)).toEqual([true, true]);
  });

  it('a tail across midnight is flagged, so its trailing edge can fade', () => {
    const r = ribbonOf([ev('21:00', null, { endsAt: '2026-09-16T01:30:00Z' })]);
    expect(r.blocks[0].nextDay).toBe(true);
    expect(r.blocks[0].endFrac).toBe(1);
  });

  it('the cue is the FIRST block, because that is what the rank-1 title names', () => {
    const r = ribbonOf([ev('08:00', '09:00'), ev('12:00', '13:00'), ev('18:00', '19:00')]);
    expect(r.blocks.map((b) => b.cue)).toEqual([true, false, false]);
  });

  it('hard comes from the caller, since a glance segment does not carry commitment', () => {
    const r = ribbonOf([ev('08:00', '09:00', { kind: EVENT_KIND.HARD }), ev('12:00', '13:00')]);
    expect(r.blocks.map((b) => b.hard)).toEqual([true, false]);
  });

  it('a segment with no icon carries no mark, and its block stays', () => {
    const glance = glanceOf([ev('08:00', '09:00'), ev('12:00', '13:00')]);
    const r = tomorrowRibbon({ glance, meta: { [glance.segs[0].key]: { icon: '🚄' } } });
    expect(r.count).toBe(2);
    expect(r.marks).toHaveLength(1);
  });

  // A day nobody has filled in still has a glance (`empty: false` — the stay's own edges are
  // anchors), so the emptiness test is the COUNT of blocks and never `glance.empty`.
  it('a tomorrow with only a stay edge has no blocks, and the glance is not empty', () => {
    const stay = ev('10:00', null, {
      date: '2026-09-12',
      endDate: TOMORROW,
      category: 'lodging',
      endsAt: `${TOMORROW}T10:00:00Z`,
    });
    const glance = glanceOf([stay]);
    expect(glance.empty).toBe(false);
    expect(tomorrowRibbon({ glance, meta: {} }).count).toBe(0);
  });

  it('a skipped stop is dropped rather than struck', () => {
    const r = ribbonOf([
      ev('10:00', '11:00'),
      ev('12:00', '13:00', { status: EVENT_STATUS.SKIPPED }),
    ]);
    expect(r.count).toBe(1);
  });
});
