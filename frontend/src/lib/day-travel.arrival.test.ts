// @vitest-environment jsdom
//
// The walk back to a bed you already hold has no deadline (owner, 2026-10-05: a Rome day read
// `חסרות 66:16 שע׳` off the check-in window that shut three days earlier).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { TripEvent } from '@waypoint/shared';
import { dayFeasibility, dayJourney } from './day-joins';
import { legArrival, type DayLeg } from './day-travel';

const stamp = { tripId: 't1', createdAt: '', updatedAt: '', updatedBy: 'u1' };
const ev = (id: string, extra: Partial<TripEvent>): TripEvent => ({
  id,
  date: '2026-06-24',
  title: id,
  kind: 'soft',
  status: 'planned',
  sortOrder: 0,
  source: 'manual',
  ...stamp,
  ...extra,
});

// Checked in on the 21st inside a 15:00–20:00 window; the 24th is night 4 of 4.
const apartment = ev('apt', {
  kind: 'hard',
  category: 'lodging',
  date: '2026-06-21',
  endDate: '2026-06-25',
  startsAt: '2026-06-21T13:00:00Z',
  startWindowEnd: '2026-06-21T18:00:00Z',
  endsAt: '2026-06-25T08:00:00Z',
});
const dinner = ev('dinner', {
  startsAt: '2026-06-24T18:00:00Z',
  endsAt: '2026-06-24T20:00:00Z',
});

const journey = (leg: DayLeg) =>
  dayJourney({
    departAfterMs: Date.parse(dinner.endsAt!),
    ...legArrival(leg),
    travelSeconds: 900,
    // Planned ahead, as the report was: before check-in, so no leg has passed.
    nowMs: Date.parse('2026-06-01T07:00:00Z'),
  });

describe('legArrival: the leg back into the bed', () => {
  it('into a bed already held, there is no deadline and so no shortfall', () => {
    const home = journey({ from: dinner, to: apartment, toIsHeldStay: true });
    expect(home?.free).toBeNull();
    expect(dayFeasibility([home]).overrunSeconds).toBe(0);
  });

  it('on the check-in night the window still shuts', () => {
    const home = journey({ from: dinner, to: apartment });
    expect(dayFeasibility([home]).legs).toBe(1);
  });
});
