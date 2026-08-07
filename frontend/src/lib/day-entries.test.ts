import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayTransitions, mergeDayEntries, placeDayEntries } from './day-entries';
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

  it('yields nothing for a skipped booking — it is on the shelf, not on the day', () => {
    const skipped = { ...hotel2Nights, status: EVENT_STATUS.SKIPPED };
    expect(dayTransitions([skipped], '2026-07-07')).toHaveLength(0);
    expect(dayTransitions([skipped], '2026-07-09')).toHaveLength(0);
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

describe('placeDayEntries', () => {
  // The reported day, 11 September: a check-in whose 15:00 is a FLOOR, sorted above a
  // flight that lands at 18:15 and a second that lands at 23:20.
  const flight1 = ev({
    id: 'f1',
    category: 'transport',
    icon: '✈️',
    startsAt: at('2026-07-07', '15:30'),
    endsAt: at('2026-07-07', '18:15'),
  });
  const flight2 = ev({
    id: 'f2',
    category: 'transport',
    icon: '✈️',
    startsAt: at('2026-07-07', '21:00'),
    endsAt: at('2026-07-07', '23:20'),
  });
  const place = (events: TripEvent[], untimed: TripEvent[] = [], date = '2026-07-07') => {
    const timed = events.filter((e) => e.startsAt && !dayTransitions([e], date).length);
    const groups = buildTimeTree(timed);
    return placeDayEntries(mergeDayEntries(groups, dayTransitions(events, date)), untimed, groups);
  };

  it('takes a check-in OUT of the ordered list — a floor names no position', () => {
    const { positioned, commitments } = place([hotel2Nights, flight1, flight2]);
    expect(commitments).toHaveLength(1);
    expect(commitments[0].event.id).toBe('hotel');
    expect(commitments[0].edge).toBe('start');
    // The floor is still carried, so the row can say `מ-15:00` without claiming 15:00.
    expect(commitments[0].atMs).toBe(ms('2026-07-07', '15:00'));
    expect(positioned.every((e) => e.kind === 'event')).toBe(true);
  });

  it('leaves the two flights ADJACENT, which is what un-suppresses their join', () => {
    // `dayBlocks` ends a run on anything that is not a leaf event entry, so while the
    // check-in sat between them no gap AND no connection band could be derived for that
    // window at all. This is the assertion that the ordering of the two calls matters.
    const { positioned } = place([hotel2Nights, flight1, flight2]);
    expect(positioned).toHaveLength(2);
    expect(positioned.map((e) => (e.kind === 'event' ? e.atMs : -1))).toEqual([
      ms('2026-07-07', '15:30'),
      ms('2026-07-07', '21:00'),
    ]);
  });

  it('splits the unpositioned by hard/soft — a commitment up, an idea down', () => {
    const errand = ev({ id: 'errand', kind: EVENT_KIND.SOFT, startsAt: undefined });
    const ticket = ev({ id: 'ticket', kind: EVENT_KIND.HARD, startsAt: undefined });
    const { commitments, ideas } = place([hotel2Nights, flight1], [errand, ticket]);
    expect(ideas.map((r) => r.event.id)).toEqual(['errand']);
    // The check-in AND the clockless booking, because the discriminator is commitment
    // rather than whether a number is present.
    expect(commitments.map((r) => r.event.id)).toEqual(['hotel', 'ticket']);
    expect(commitments[1].atMs).toBeUndefined();
  });

  it('keeps a CHECK-OUT in the list — a ceiling is closed on the side you act', () => {
    const { positioned, commitments } = place([hotel2Nights], [], '2026-07-09');
    expect(commitments).toHaveLength(0);
    expect(positioned).toHaveLength(1);
    expect(positioned[0].atMs).toBe(ms('2026-07-09', '11:00'));
  });

  it('rises a check-out ABOVE a flight that leaves before it, and only then', () => {
    // The owner\'s case: "there could be a flight before the max checkout time".
    const early = ev({
      id: 'early',
      category: 'transport',
      icon: '✈️',
      date: '2026-07-09',
      startsAt: at('2026-07-09', '10:00'),
      endsAt: at('2026-07-09', '13:00'),
    });
    const { positioned } = place([hotel2Nights, early], [], '2026-07-09');
    expect(positioned[0].kind).toBe('transition');
    expect(positioned[0].atMs).toBe(ms('2026-07-09', '10:00'));

    // With nothing to intersect against it does not move — the test §4 failed from the
    // other side, and the reason a ceiling is decidable where a floor is not.
    const late = ev({
      id: 'late',
      category: 'transport',
      icon: '✈️',
      date: '2026-07-09',
      startsAt: at('2026-07-09', '14:00'),
      endsAt: at('2026-07-09', '17:00'),
    });
    const stayed = place([hotel2Nights, late], [], '2026-07-09');
    const checkout = stayed.positioned.find((e) => e.kind === 'transition');
    expect(checkout?.atMs).toBe(ms('2026-07-09', '11:00'));
  });

  it('does not let a HELD span anchor a deadline — only a journey takes you away', () => {
    // A car hire is `transport` by category and `held` by glyph (ADR-0162/0163), so it
    // is not in transit and cannot move a check-out above itself.
    const hire = ev({
      id: 'hire',
      category: 'transport',
      icon: '🚗',
      date: '2026-07-09',
      startsAt: at('2026-07-09', '09:00'),
      endsAt: at('2026-07-09', '17:00'),
    });
    const { positioned } = place([hotel2Nights, hire], [], '2026-07-09');
    const checkout = positioned.find((e) => e.kind === 'transition');
    expect(checkout?.atMs).toBe(ms('2026-07-09', '11:00'));
  });
});
