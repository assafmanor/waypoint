import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayTransitions, mergeDayEntries } from './day-entries';
import { buildTimeTree } from './time';

const OFF = '+09:00';
const at = (date: string, time: string) => `${date}T${time}:00${OFF}`;
const ms = (date: string, time: string) => Date.parse(at(date, time));

let seq = 0;
function ev(partial: Partial<TripEvent>): TripEvent {
  return {
    id: partial.id ?? `ev-${++seq}`,
    tripId: 't',
    date: partial.date ?? '2026-07-07',
    title: partial.title ?? 'x',
    kind: EVENT_KIND.HARD,
    status: EVENT_STATUS.PLANNED,
    source: EVENT_SOURCE.MANUAL,
    sortOrder: 1,
    createdAt: at('2026-07-07', '00:00'),
    updatedAt: at('2026-07-07', '00:00'),
    updatedBy: 'u',
    ...partial,
  };
}

const hotel2Nights = ev({
  id: 'hotel',
  category: 'lodging',
  date: '2026-07-07',
  endDate: '2026-07-09',
  startsAt: at('2026-07-07', '15:00'),
  endsAt: at('2026-07-09', '11:00'),
});

describe('dayTransitions', () => {
  it('yields check-in on day 1, check-out on the last day, nothing on the middle night', () => {
    const events = [hotel2Nights];

    const day1 = dayTransitions(events, '2026-07-07');
    expect(day1).toHaveLength(1);
    expect(day1[0].edge).toBe('start');
    expect(day1[0].labelKey).toBe('checkIn');
    expect(day1[0].atMs).toBe(ms('2026-07-07', '15:00'));

    expect(dayTransitions(events, '2026-07-08')).toHaveLength(0); // middle night

    const last = dayTransitions(events, '2026-07-09');
    expect(last).toHaveLength(1);
    expect(last[0].edge).toBe('end');
    expect(last[0].labelKey).toBe('checkOut');
    expect(last[0].atMs).toBe(ms('2026-07-09', '11:00'));
  });

  it('yields no transition entries for a same-day flight (single span row stays)', () => {
    const sameDayFlight = ev({
      id: 'flight',
      category: 'transport',
      date: '2026-07-07',
      startsAt: at('2026-07-07', '09:00'),
      endsAt: at('2026-07-07', '11:00'),
    });
    expect(dayTransitions([sameDayFlight], '2026-07-07')).toHaveLength(0);
  });

  it('splits a red-eye multi-day flight into departure (day 1) and arrival (day 2)', () => {
    const redEye = ev({
      id: 'redeye',
      category: 'transport',
      date: '2026-07-07',
      endDate: '2026-07-08',
      startsAt: at('2026-07-07', '23:00'),
      endsAt: at('2026-07-08', '06:00'),
    });

    const dep = dayTransitions([redEye], '2026-07-07');
    expect(dep).toHaveLength(1);
    expect(dep[0].edge).toBe('start');
    expect(dep[0].labelKey).toBe('departure');

    const arr = dayTransitions([redEye], '2026-07-08');
    expect(arr).toHaveLength(1);
    expect(arr[0].edge).toBe('end');
    expect(arr[0].labelKey).toBe('arrival');
  });
});

describe('mergeDayEntries', () => {
  it('orders event groups and transition points by instant', () => {
    const morning = ev({
      id: 'a',
      startsAt: at('2026-07-07', '09:00'),
      endsAt: at('2026-07-07', '10:00'),
    });
    const evening = ev({
      id: 'b',
      startsAt: at('2026-07-07', '18:00'),
      endsAt: at('2026-07-07', '19:00'),
    });
    const groups = buildTimeTree([morning, evening]);
    const transitions = dayTransitions([hotel2Nights], '2026-07-07'); // check-in 15:00

    const merged = mergeDayEntries(groups, transitions);

    expect(merged.map((e) => e.atMs)).toEqual([
      ms('2026-07-07', '09:00'),
      ms('2026-07-07', '15:00'),
      ms('2026-07-07', '18:00'),
    ]);
    expect(merged.map((e) => e.kind)).toEqual(['event', 'transition', 'event']);
  });
});
