import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { nowLinePlacement } from './now-line';
import { mergeDayEntries } from './day-entries';
import { buildTimeTree } from './time';

const STAMP = '2026-07-01T00:00:00Z';
const at = (hhmm: string) => `2026-07-12T${hhmm}:00+09:00`;
const ev = (id: string, start: string, end?: string): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-12',
  title: id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  startsAt: at(start),
  endsAt: end ? at(end) : undefined,
  sortOrder: 1,
  source: 'manual',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: 'u1',
});

const entriesFor = (events: TripEvent[]) => mergeDayEntries(buildTimeTree(events), []);
const day = [ev('morning', '09:00', '10:30'), ev('lunch', '12:30', '13:20'), ev('show', '16:00')];

describe('nowLinePlacement', () => {
  it('sits above the first row that is not behind us', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('11:00')))).toEqual({ index: 1 });
  });

  it('falls after every row once the day is done', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('23:00')))).toEqual({ index: 3 });
  });

  it('sits above the first row before the day starts', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('06:00')))).toEqual({ index: 0 });
  });

  // The approximation this file exists to eventually replace, pinned so the change is
  // visible when it is made: a row you are INSIDE gets the marker above it, not through
  // it (see the backlog line "the now-line says where we actually are").
  it('places a running row above itself, not inside it — today', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('09:45')))).toEqual({ index: 0 });
  });

  it('reads a start-only row as ending at its own instant', () => {
    // `show` has no end, so 16:01 is already past it.
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('16:01')))).toEqual({ index: 3 });
  });

  it('has somewhere to go on an empty day', () => {
    expect(nowLinePlacement([], Date.parse(at('12:00')))).toEqual({ index: 0 });
  });
});
