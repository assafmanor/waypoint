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
  const at11 = Date.parse(at('11:00'));

  it('sits above the first row that is not behind us', () => {
    expect(nowLinePlacement(entriesFor(day), at11)).toEqual({ index: 1, inside: null });
  });

  it('falls after every row once the day is done', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('23:00')))).toEqual({
      index: 3,
      inside: null,
    });
  });

  it('sits above the first row before the day starts', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('06:00')))).toEqual({
      index: 0,
      inside: null,
    });
  });

  // **This is the line the file was shaped for** (ADR-0217 §1). It used to assert the
  // approximation — a running row got the marker ABOVE it — and the index still says that,
  // because a boundary needs it; what changed is that `inside` now names the row and how far
  // through it we are, and a host with an `inside` uses it instead of the index.
  it('says which row it is INSIDE, and how far through', () => {
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('09:45')))).toEqual({
      index: 0,
      inside: { key: 'morning', thruFrac: 0.5 },
    });
  });

  it('is inside nothing in a hole between two rows', () => {
    expect(nowLinePlacement(entriesFor(day), at11).inside).toBeNull();
  });

  // ADR-0041's forest: the moment is inside BOTH, and the marker belongs to the innermost.
  // Which rows hold it stays `.wp-event.now`'s question — this one has a single answer.
  it('takes the nested child of an envelope over its container', () => {
    const nested = [ev('festival', '16:00', '20:00'), ev('concert', '17:00', '18:00')];
    expect(nowLinePlacement(entriesFor(nested), Date.parse(at('17:30'))).inside).toEqual({
      key: 'concert',
      thruFrac: 0.5,
    });
    // …and hands it back to the container once the child is over.
    expect(nowLinePlacement(entriesFor(nested), Date.parse(at('19:00'))).inside?.key).toBe(
      'festival',
    );
  });

  it('takes the more recently entered peer of a cluster', () => {
    const peers = [ev('market', '14:00', '15:00'), ev('pools', '14:30', '15:30')];
    expect(nowLinePlacement(entriesFor(peers), Date.parse(at('14:45'))).inside?.key).toBe('pools');
  });

  it('is inside nothing on a row that has been settled', () => {
    const done = [{ ...ev('morning', '09:00', '10:30'), status: EVENT_STATUS.DONE }];
    const placed = nowLinePlacement(entriesFor(done), Date.parse(at('09:45')));
    expect(placed.inside).toBeNull();
    // The row keeps its place: it did start, so the boundary is still below it.
    expect(placed.index).toBe(0);
  });

  it('reads a start-only row as ending at its own instant', () => {
    // `show` has no end, so 16:01 is already past it — and it holds no moment at all.
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('16:01')))).toEqual({
      index: 3,
      inside: null,
    });
    expect(nowLinePlacement(entriesFor(day), Date.parse(at('16:00'))).inside).toBeNull();
  });

  it('has somewhere to go on an empty day', () => {
    expect(nowLinePlacement([], Date.parse(at('12:00')))).toEqual({ index: 0, inside: null });
  });
});
