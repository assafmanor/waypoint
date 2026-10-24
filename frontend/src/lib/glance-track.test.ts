import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { buildDayGlance } from './glance';
import { trackMetaFor } from './day-track';
import { glanceTrack } from './glance-track';

const DATE = '2026-09-15';
/** The clock sits at ⁦13:40⁩ in every case, so `spent` and `ahead` are both on screen. */
const NOW = Date.parse(`${DATE}T13:40:00Z`);
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
    icon: '🍜',
    startsAt: `${DATE}T${from}:00Z`,
    ...(to ? { endsAt: `${DATE}T${to}:00Z` } : {}),
    ...over,
  }) as TripEvent;

/** A stay whose check-out lands today: an ambient span (ADR-0054), so it has an anchor and no
 *  block on the counted rail — the case §2 of ADR-0215 is about. */
const stayEndingToday = () =>
  ev('15:00', null, {
    date: '2026-09-12',
    endDate: DATE,
    category: 'lodging',
    icon: '🏨',
    startsAt: '2026-09-12T15:00:00Z',
    endsAt: `${DATE}T10:00:00Z`,
  });

const trackOf = (events: TripEvent[]) => {
  const glance = buildDayGlance(events, DATE, NOW, W0, W1, 'UTC');
  return { glance, ...glanceTrack({ glance, meta: trackMetaFor(events, glance.segs) }) };
};

describe('glanceTrack', () => {
  it('one block per segment, in the glance own fractions', () => {
    const { blocks } = trackOf([ev('09:30', '11:00'), ev('13:00', '14:30'), ev('19:00', '21:00')]);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => +b.startFrac.toFixed(4))).toEqual([0.1563, 0.375, 0.75]);
  });

  // The half this file inherits (ADR-0041): `segs` are the containment forest's roots, so two
  // events that overlap are ONE block before this adapter sees them.
  it('an overlap is one block, and a containment is one block', () => {
    expect(trackOf([ev('10:00', '12:00'), ev('11:00', '13:00')]).blocks).toHaveLength(1);
    expect(trackOf([ev('14:00', '18:00'), ev('15:00', '16:00')]).blocks).toHaveLength(1);
  });

  it('marks the clock behind it as spent, and everything ahead as not', () => {
    const { blocks } = trackOf([ev('09:30', '11:00'), ev('19:00', '21:00')]);
    expect(blocks.map((b) => b.spent)).toEqual([true, false]);
  });

  it('a settled block is spent too, so the rail says one thing about behind-us', () => {
    const { blocks } = trackOf([ev('19:00', '21:00', { status: EVENT_STATUS.DONE })]);
    expect(blocks[0].spent).toBe(true);
  });

  it('a skipped stop is hatched rather than dropped, and never counted', () => {
    const { blocks, glance } = trackOf([
      ev('10:00', '11:00'),
      ev('19:00', '20:00', { status: EVENT_STATUS.SKIPPED }),
    ]);
    expect(blocks.map((b) => b.skipped)).toEqual([false, true]);
    expect(glance.remaining).toBe(0);
  });

  it('hard comes from the event, so the commitment axis is on the rail', () => {
    const { blocks } = trackOf([
      ev('10:00', '11:00'),
      ev('19:00', '20:00', { kind: EVENT_KIND.HARD }),
    ]);
    expect(blocks.map((b) => b.hard)).toEqual([false, true]);
  });

  it('a zero-length event and a start-only one both read as ticks', () => {
    const { blocks } = trackOf([ev('15:00', '15:00'), ev('17:00', null)]);
    expect(blocks.map((b) => b.point)).toEqual([true, true]);
  });

  it('a tail across midnight is flagged, so its trailing edge can fade', () => {
    const { blocks } = trackOf([ev('21:00', null, { endsAt: '2026-09-16T01:30:00Z' })]);
    expect(blocks[0].nextDay).toBe(true);
    expect(blocks[0].endFrac).toBe(1);
  });

  it('a composite carries the flag, so the card can keep the cue and drop the number', () => {
    const { blocks } = trackOf([ev('10:00', '12:00'), ev('11:00', '13:00')]);
    expect(blocks[0].composite).toBe(true);
  });

  // ── THE EDGE WITH NO BLOCK ────────────────────────────────────────────────
  it('an ambient stay edge becomes a hard tick at its own instant', () => {
    const { blocks, glance } = trackOf([stayEndingToday(), ev('19:00', '20:00')]);
    expect(glance.segs).toHaveLength(1); // the stay draws no counted block
    expect(blocks).toHaveLength(2);
    const tick = blocks[0];
    expect(tick.point).toBe(true);
    expect(tick.hard).toBe(true);
    expect(tick.startFrac).toBeCloseTo(0.1875, 4); // ⁦10:00⁩ of a ⁦07:00–23:00⁩ window
  });

  it('the tick carries the stay own icon, from the anchor rather than from the caller', () => {
    const { marks } = trackOf([stayEndingToday()]);
    expect(marks.map((m) => m.icon)).toEqual(['🏨']);
  });

  // The reason the tick is not phase-derived: `remaining` counts an unreached edge until it is
  // settled or the day ends (ADR-0164), so greying the check-out at ⁦10:01⁩ would contradict the
  // number on the same card.
  it('a passed edge is NOT spent, because the count still holds it', () => {
    const { blocks } = trackOf([stayEndingToday()]);
    expect(blocks[0].spent).toBe(false);
  });

  // **The case the running app found and no drawing had** (ADR-0215's build log): a hotel's
  // check-in is the hour the door OPENS (ADR-0171's floor), which on an arrival day can fall
  // while the long-haul flight is still in the air. Drawn as a tick it landed inside the
  // flight's own block — amber on amber, invisible, and the only overlap this design forbids.
  it('an edge that falls INSIDE a block is not drawn twice', () => {
    const flight = ev('12:00', '22:00', { category: 'transport', kind: EVENT_KIND.HARD });
    const stay = ev('15:00', null, {
      date: DATE,
      endDate: '2026-09-18',
      category: 'lodging',
      icon: '🏨',
      startsAt: `${DATE}T15:00:00Z`,
      endsAt: '2026-09-18T10:00:00Z',
    });
    const { glance, blocks } = trackOf([flight, stay]);
    // The check-in anchor is still derived and still counted — only the tick goes.
    expect(glance.anchors.some((a) => a.standalone)).toBe(true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].point).toBe(false);
  });

  it('an edge at a block own boundary is still drawn, since nothing occupies that instant', () => {
    const morning = ev('08:00', '10:00');
    const stay = ev('10:00', null, {
      date: '2026-09-12',
      endDate: DATE,
      category: 'lodging',
      icon: '🏨',
      startsAt: '2026-09-12T15:00:00Z',
      endsAt: `${DATE}T10:00:00Z`,
    });
    const { blocks } = trackOf([morning, stay]);
    expect(blocks.filter((b) => b.point)).toHaveLength(1);
  });

  it('an anchor whose event IS on the rail adds nothing', () => {
    const flight = ev('14:00', '17:00', { category: 'transport', kind: EVENT_KIND.HARD });
    const { blocks, glance } = trackOf([flight]);
    expect(glance.anchors[0].kind).toBe('span');
    expect(glance.anchors[0].standalone).toBe(false);
    expect(blocks).toHaveLength(1);
  });

  it('blocks stay in time order once the ticks are merged in', () => {
    const { blocks } = trackOf([ev('19:00', '20:00'), stayEndingToday(), ev('11:00', '12:00')]);
    const starts = blocks.map((b) => b.startFrac);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('no two blocks overlap on a twelve-item day', () => {
    const { blocks } = trackOf([
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
    expect(blocks).toHaveLength(12);
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++)
        expect(
          Math.min(blocks[i].endFrac, blocks[j].endFrac) -
            Math.max(blocks[i].startFrac, blocks[j].startFrac),
        ).toBeLessThan(1e-9);
  });

  it('marks thin to the cap on a busy day, and the blocks all stay', () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      ev(`${String(8 + i).padStart(2, '0')}:00`, `${String(8 + i).padStart(2, '0')}:30`),
    );
    const { blocks, marks } = trackOf(events);
    expect(blocks).toHaveLength(12);
    expect(marks).toHaveLength(5);
  });

  it('a mark sits over the middle of its block', () => {
    const { marks } = trackOf([ev('09:30', '11:00')]);
    expect(marks[0].frac).toBeCloseTo((0.15625 + 0.25) / 2, 6);
  });

  it('no cue: this rail has a clock in it, and two look-here marks is one too many', () => {
    const { blocks } = trackOf([ev('09:30', '11:00'), ev('19:00', '21:00')]);
    expect(blocks.every((b) => !b.cue)).toBe(true);
  });
});
