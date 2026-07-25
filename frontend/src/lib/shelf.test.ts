import { describe, expect, it } from 'vitest';
import {
  EVENT_KIND,
  EVENT_SOURCE,
  EVENT_STATUS,
  type MaybeItem,
  type TripEvent,
} from '@waypoint/shared';
import { shelfGroups } from './shelf';

const DAY = '2026-07-20';

const idea = (id: string, targetDate?: string, consumed = false): MaybeItem =>
  ({ id, tripId: 't', title: id, consumed, targetDate }) as MaybeItem;

const event = (partial: Partial<TripEvent> & Pick<TripEvent, 'id'>): TripEvent => ({
  tripId: 't',
  date: DAY,
  title: partial.id,
  kind: EVENT_KIND.SOFT,
  status: EVENT_STATUS.PLANNED,
  source: EVENT_SOURCE.MANUAL,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  updatedBy: 'u',
  ...partial,
});

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('shelfGroups (ADR-0116 §2/§3)', () => {
  it('splits ideas pencilled in for the day from the rest of the pool', () => {
    const groups = shelfGroups(
      [idea('today', DAY), idea('someday'), idea('later', '2026-07-22')],
      [],
      DAY,
    );
    expect(ids(groups.forDay)).toEqual(['today']);
    expect(ids(groups.pool)).toEqual(['someday', 'later']);
  });

  it('dateless ideas lead the pool — they are the ones still asking to be placed', () => {
    const groups = shelfGroups([idea('later', '2026-07-22'), idea('someday')], [], DAY);
    expect(ids(groups.pool)).toEqual(['someday', 'later']);
  });

  it('a consumed idea is off the shelf entirely (ADR-0027: parked or placed)', () => {
    const groups = shelfGroups([idea('placed', DAY, true), idea('parked', DAY)], [], DAY);
    expect(ids(groups.forDay)).toEqual(['parked']);
    expect(ids(groups.pool)).toEqual([]);
  });

  it("carries the day's skipped soft events — the parking lot, in both modes", () => {
    const groups = shelfGroups(
      [],
      [
        event({ id: 'bailed', status: EVENT_STATUS.SKIPPED }),
        event({ id: 'still-on' }),
        event({ id: 'other-day', status: EVENT_STATUS.SKIPPED, date: '2026-07-21' }),
        event({ id: 'hard-skip', status: EVENT_STATUS.SKIPPED, kind: EVENT_KIND.HARD }),
      ],
      DAY,
    );
    // Only this day's SOFT skipped events park here.
    expect(ids(groups.skipped)).toEqual(['bailed']);
  });

  it('an all-dateless trip reads as one pool, so the shelf looks unchanged', () => {
    const groups = shelfGroups([idea('a'), idea('b')], [], DAY);
    expect(groups.forDay).toEqual([]);
    expect(groups.skipped).toEqual([]);
    expect(ids(groups.pool)).toEqual(['a', 'b']);
  });
});
