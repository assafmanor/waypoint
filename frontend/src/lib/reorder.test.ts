import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { planSwap } from './reorder';

const NOW = '2026-07-01T00:00:00Z';
/** `hours` is the event's LENGTH, which is the whole subject of these tests: before
 *  ADR-0161 a swap traded it along with the position. */
const ev = (
  id: string,
  kind: TripEvent['kind'],
  hhmm: string,
  hours: number | null,
): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: `2026-07-07T${hhmm}:00+09:00`,
  endsAt:
    hours === null
      ? undefined
      : new Date(Date.parse(`2026-07-07T${hhmm}:00+09:00`) + hours * 3600_000).toISOString(),
  sortOrder: 1,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

// The report's own example: a one-hour event and a two-hour one.
const A = ev('A', EVENT_KIND.SOFT, '10:00', 1); // 10:00–11:00
const B = ev('B', EVENT_KIND.HARD, '12:00', 1); // pinned anchor
const C = ev('C', EVENT_KIND.SOFT, '14:00', 2); // 14:00–16:00
const D = ev('D', EVENT_KIND.SOFT, '17:00', null); // untimed end
const day = [A, B, C, D];

const startOf = (p: { patch: { startsAt?: string | null } }) => p.patch.startsAt;
const lengthHoursOf = (p: { patch: { startsAt?: string | null; endsAt?: string | null } }) =>
  p.patch.endsAt && p.patch.startsAt
    ? (Date.parse(p.patch.endsAt) - Date.parse(p.patch.startsAt)) / 3600_000
    : null;

describe('planSwap (positions trade; each event keeps its own length)', () => {
  it('gives each event the other one’s START', () => {
    const [a, c] = planSwap(day, 'A', 'C');
    expect([a.id, c.id]).toEqual(['A', 'C']);
    expect(startOf(a)).toBe(C.startsAt);
    expect(startOf(c)).toBe(A.startsAt);
  });

  // THE REPORTED BUG, as a test: "A will get B's schedule (same start time, same
  // duration), and B will get A's". A is one hour and C is two; after the swap they must
  // still be one hour and two hours.
  it('does NOT trade their durations', () => {
    const [a, c] = planSwap(day, 'A', 'C');
    expect(lengthHoursOf(a)).toBe(1);
    expect(lengthHoursOf(c)).toBe(2);
  });

  it('patches exactly the two events and nothing else on the day', () => {
    expect(planSwap(day, 'A', 'C').map((p) => p.id)).toEqual(['A', 'C']);
  });

  it('never writes sortOrder — the list sorts by start', () => {
    for (const p of planSwap(day, 'A', 'C')) expect(p.patch).not.toHaveProperty('sortOrder');
  });

  it('keeps a start-only event start-only rather than inventing an end', () => {
    const [, d] = planSwap(day, 'A', 'D');
    expect(d.id).toBe('D');
    expect(startOf(d)).toBe(A.startsAt);
    expect(d.patch.endsAt).toBeUndefined();
  });

  it('carries a length across midnight as absolute ms (ADR-0037)', () => {
    const late = ev('L', EVENT_KIND.SOFT, '23:00', 3); // 23:00 → 02:00 next day
    const patches = planSwap([late, C], 'C', 'L');
    const c = patches.find((p) => p.id === 'C')!;
    expect(startOf(c)).toBe(late.startsAt);
    expect(lengthHoursOf(c)).toBe(2);
  });

  it('is a no-op on itself', () => {
    expect(planSwap(day, 'C', 'C')).toEqual([]);
  });

  // ADR-0011: a hard event is a pinned anchor. It is neither a drag source nor a swap
  // target, in either direction.
  it('refuses a hard event as the target', () => {
    expect(planSwap(day, 'C', 'B')).toEqual([]);
  });

  it('refuses a hard event as the mover', () => {
    expect(planSwap(day, 'B', 'A')).toEqual([]);
  });

  it('refuses an event that is not on the day', () => {
    expect(planSwap(day, 'A', 'nope')).toEqual([]);
  });

  // An untimed row holds no position to give away — it reaches one through a seam drop,
  // which hands it that slot's own block instead.
  it('refuses an untimed event, which has no position to trade', () => {
    const untimed = { ...D, startsAt: undefined, endsAt: undefined } as TripEvent;
    expect(planSwap([A, untimed], 'A', untimed.id)).toEqual([]);
  });
});
