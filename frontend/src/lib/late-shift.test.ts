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
});
