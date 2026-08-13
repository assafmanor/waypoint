import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayTransitions, mergeDayEntries, placeDayEntries, staysOnDate } from './day-entries';
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

// The strip used to skip the stay's own first and last day, so a hotel vanished from the top
// of the day you checked into it. Both boundaries are the whole point of the change, and both
// are the kind of `<` that reads correct.
describe('staysOnDate', () => {
  it('covers every day of the stay, edges included', () => {
    expect(staysOnDate([hotel2Nights], '2026-07-07').map((e) => e.id)).toEqual(['hotel']);
    expect(staysOnDate([hotel2Nights], '2026-07-08').map((e) => e.id)).toEqual(['hotel']);
    expect(staysOnDate([hotel2Nights], '2026-07-09').map((e) => e.id)).toEqual(['hotel']);
  });

  it('stops at them, though — a stay is not ambient the day before or after', () => {
    expect(staysOnDate([hotel2Nights], '2026-07-06')).toHaveLength(0);
    expect(staysOnDate([hotel2Nights], '2026-07-10')).toHaveLength(0);
  });

  it('takes only ambient spans, so an ordinary event never reaches the strip', () => {
    const dinner = ev({ id: 'dinner', startsAt: at('2026-07-07', '20:00') });
    expect(staysOnDate([dinner], '2026-07-07')).toHaveLength(0);
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

  it('sinks a check-in BELOW the legs that land after it, and keeps it in the list', () => {
    // The reported bug: the floor claimed 15:00 and so read above a flight that had not
    // even departed at 15:30 — "check into your Iceland hotel, then fly to Iceland". Note
    // it clears BOTH legs: you land at 18:15 and then fly again to 23:20.
    const { positioned, commitments } = place([hotel2Nights, flight1, flight2]);
    expect(commitments).toHaveLength(0);
    expect(positioned.map((e) => e.kind)).toEqual(['event', 'event', 'transition']);
    expect(positioned[2].atMs).toBe(ms('2026-07-07', '23:20'));
  });

  it('leaves the two flights ADJACENT, which is what un-suppresses their join', () => {
    // `dayBlocks` ends a run on anything that is not a leaf event entry, so while the
    // check-in sat between them no gap AND no connection band could be derived for that
    // window at all. It is now in the list again, so what keeps them adjacent is a
    // combination: the floor sorts clear of both, and `day-joins.ts` treats a flexible
    // edge as transparent even when it does not.
    const { positioned } = place([hotel2Nights, flight1, flight2]);
    expect(positioned.filter((e) => e.kind === 'event').map((e) => e.atMs)).toEqual([
      ms('2026-07-07', '15:30'),
      ms('2026-07-07', '21:00'),
    ]);
  });

  it('a check-in with nothing to clear keeps its own floor', () => {
    // The other side of the rule: nothing is guessed. With no leg landing after 15:00 and
    // nothing overlapping it, the row sits exactly where it was authored.
    const { positioned } = place([hotel2Nights]);
    expect(positioned).toHaveLength(1);
    expect(positioned[0].atMs).toBe(ms('2026-07-07', '15:00'));
  });

  it('sinks a check-in below a hard event it sits INSIDE, journey or not', () => {
    // Owner, 2026-08-13: _"it could be any hard event (train or anything really)"_. A hard
    // tour running 14:00–17:00 is not a journey and still means you are not at the desk.
    const tour = ev({
      id: 'tour',
      kind: EVENT_KIND.HARD,
      startsAt: at('2026-07-07', '14:00'),
      endsAt: at('2026-07-07', '17:00'),
    });
    const { positioned } = place([hotel2Nights, tour]);
    const checkin = positioned.find((e) => e.kind === 'transition');
    expect(checkin?.atMs).toBe(ms('2026-07-07', '17:00'));
  });

  it('is not moved by a hard event it does NOT overlap', () => {
    const dinner = ev({
      id: 'dinner',
      kind: EVENT_KIND.HARD,
      startsAt: at('2026-07-07', '20:00'),
      endsAt: at('2026-07-07', '22:00'),
    });
    const { positioned } = place([hotel2Nights, dinner]);
    const checkin = positioned.find((e) => e.kind === 'transition');
    expect(checkin?.atMs).toBe(ms('2026-07-07', '15:00'));
  });

  it('splits the unpositioned by hard/soft — a commitment up, an idea down', () => {
    const errand = ev({ id: 'errand', kind: EVENT_KIND.SOFT, startsAt: undefined });
    const ticket = ev({ id: 'ticket', kind: EVENT_KIND.HARD, startsAt: undefined });
    const { commitments, ideas } = place([hotel2Nights, flight1], [errand, ticket]);
    expect(ideas.map((r) => r.event.id)).toEqual(['errand']);
    // Only the clockless booking now: an edge always has a bound to place it by, so the
    // strip holds what has no clock at all and nothing else.
    expect(commitments.map((r) => r.event.id)).toEqual(['ticket']);
    expect(commitments[0].atMs).toBeUndefined();
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
    // is not in transit and cannot move a check-out above itself. It OVERLAPS the 11:00
    // deadline, which is what the overlap clause added in 2026-08-13 would otherwise
    // catch: holding a car from 09:00 is not being occupied by it.
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

  it('pulls a check-out above a hard event it sits INSIDE, journey or not', () => {
    // The ceiling's half of the overlap clause: a hard tour from 09:00 means you were out
    // of the room by 09:00, whatever the hotel's 11:00 says.
    const tour = ev({
      id: 'tour',
      kind: EVENT_KIND.HARD,
      date: '2026-07-09',
      startsAt: at('2026-07-09', '09:00'),
      endsAt: at('2026-07-09', '13:00'),
    });
    const { positioned } = place([hotel2Nights, tour], [], '2026-07-09');
    const checkout = positioned.find((e) => e.kind === 'transition');
    expect(checkout?.atMs).toBe(ms('2026-07-09', '09:00'));
  });
});

describe('placeDayEntries — a closed window comes back into the list (ADR-0184 §4)', () => {
  const windowed = ev({
    id: 'hotel-window',
    category: 'lodging',
    date: '2026-07-07',
    endDate: '2026-07-09',
    startsAt: at('2026-07-07', '17:00'),
    endsAt: at('2026-07-09', '11:00'),
    startWindowEnd: at('2026-07-07', '21:00'),
  });
  const landing = ev({
    id: 'flight',
    category: 'transport',
    icon: '✈️',
    startsAt: at('2026-07-07', '15:30'),
    endsAt: at('2026-07-07', '18:15'),
  });

  const place = (events: TripEvent[]) => {
    const transitions = dayTransitions(events, '2026-07-07');
    const timed = events.filter((e) => e.startsAt && !e.endDate);
    const groups = buildTimeTree(timed);
    return placeDayEntries(mergeDayEntries(groups, transitions), [], groups);
  };

  it('places a bare floor in the LIST, not the strip', () => {
    // Reverses this section's original assertion (ADR-0184 §4 / ADR-0171 §10a). A floor and
    // a window are the same hotel, and reading one in the strip and the other in the list
    // was the same booking answering differently depending on whether a second number had
    // been typed. The landing at 18:15 is what it clears.
    const { positioned, commitments } = place([hotel2Nights, landing]);
    expect(commitments).toHaveLength(0);
    const row = positioned.find((e) => e.kind === 'transition' && e.event.id === 'hotel');
    expect(row?.atMs).toBe(ms('2026-07-07', '18:15'));
  });

  it('gives a CLOSED window the same treatment, floor and all', () => {
    // Its floor is 17:00 and the leg lands at 18:15, so the window's row clears the flight
    // exactly as the bare floor does. Before this it sat at 17:00, above the landing —
    // ADR-0184 §4 placed a window at its floor unmoved, which is the reported bug with a
    // range instead of a bare clock.
    const { positioned, commitments } = place([windowed, landing]);
    expect(commitments).toHaveLength(0);
    const row = positioned.find((e) => e.kind === 'transition' && e.event.id === 'hotel-window');
    expect(row?.atMs).toBe(ms('2026-07-07', '18:15'));
  });

  it('leaves the check-OUT edge alone — only the end it was authored on changes', () => {
    const { positioned } = place([windowed]);
    const out = positioned.filter((e) => e.kind === 'transition');
    // Day 1 carries the check-in only; the check-out belongs to the 9th.
    expect(out.every((e) => e.edge === 'start')).toBe(true);
  });
});
