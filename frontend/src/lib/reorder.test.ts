import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { planReorder } from './reorder';

const NOW = '2026-07-01T00:00:00Z';
const ev = (id: string, kind: TripEvent['kind'], hhmm: string, sortOrder: number): TripEvent => ({
  id,
  tripId: 't1',
  date: '2026-07-07',
  title: id,
  kind,
  status: EVENT_STATUS.PLANNED,
  startsAt: `2026-07-07T${hhmm}:00+09:00`,
  endsAt: `2026-07-07T${hhmm}:59+09:00`,
  sortOrder,
  source: 'manual',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'u1',
});

// Sorted byStart: A(soft 10) · B(hard 12) · C(soft 14) · D(soft 17)
const A = ev('A', EVENT_KIND.SOFT, '10:00', 1);
const B = ev('B', EVENT_KIND.HARD, '12:00', 2);
const C = ev('C', EVENT_KIND.SOFT, '14:00', 3);
const D = ev('D', EVENT_KIND.SOFT, '17:00', 4);
const day = [A, B, C, D];
const slot = (e: TripEvent) => ({ startsAt: e.startsAt, endsAt: e.endsAt, sortOrder: e.sortOrder });

describe('planReorder (soft-slot reassignment; hard events pinned)', () => {
  it('moving a soft event to another soft slot reassigns only the soft events between', () => {
    // C (soft, 3rd) → A's slot: soft order [A,C,D] → [C,A,D]
    const patches = planReorder(day, 'C', 'A');
    expect(patches).toEqual([
      { id: 'C', patch: slot(A) },
      { id: 'A', patch: slot(C) },
    ]);
  });

  it('never moves or references a hard event (B keeps its slot)', () => {
    const patches = planReorder(day, 'D', 'A');
    expect(patches.map((p) => p.id)).not.toContain('B');
    // [A,C,D] → [D,A,C]: all three soft events shift
    expect(patches.map((p) => p.id).sort()).toEqual(['A', 'C', 'D']);
  });

  it('is a no-op when moved onto itself', () => {
    expect(planReorder(day, 'C', 'C')).toEqual([]);
  });

  it('is a no-op when the target is a hard (non-soft) event', () => {
    expect(planReorder(day, 'C', 'B')).toEqual([]);
  });

  it('is a no-op when trying to move a hard event', () => {
    expect(planReorder(day, 'B', 'A')).toEqual([]);
  });
});
