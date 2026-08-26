import { describe, it, expect } from 'vitest';
import { TRAVEL_BUFFER_SECONDS, type TripEvent } from '@waypoint/shared';
import { LEAVE_BY_SWAP_MINUTES, LEAVE_PHASE, heroLeaveBy, travelOrigin } from './hero-travel';

const MIN = 60_000;
/** A fixed clock. Nothing here reads the system one — these are pure functions and `now`
 *  arrives as an argument, which is what makes the phases assertable at all. */
const NOW = Date.parse('2026-08-26T14:00:00Z');

const at = (minutesFromNow: number) => NOW + minutesFromNow * MIN;

describe('heroLeaveBy — is leaving the live question yet? (ADR-0206 §Z1)', () => {
  // §D4: offline, refused by the gate, over the ceiling, still warming, provider down — and a
  // leg somebody declared תחב״צ, which has no provider at all (§AA4). Every one of them is the
  // same answer, and the board keeps counting to the event.
  it('answers null with no estimate, so the swap cannot fire', () => {
    expect(heroLeaveBy({ arriveByMs: at(60), travelSeconds: null, nowMs: NOW })).toBeNull();
  });

  it('answers null for an unmeasurable arrival or a non-finite estimate', () => {
    expect(heroLeaveBy({ arriveByMs: Number.NaN, travelSeconds: 600, nowMs: NOW })).toBeNull();
    expect(heroLeaveBy({ arriveByMs: at(60), travelSeconds: Number.NaN, nowMs: NOW })).toBeNull();
  });

  it('subtracts the journey AND the buffer, and hands back the instant', () => {
    // 60 minutes out, a 20-minute walk, plus §D5's buffer → leave at 14:35.
    const leave = heroLeaveBy({ arriveByMs: at(60), travelSeconds: 20 * 60, nowMs: NOW })!;
    expect(leave.leaveByMs).toBe(at(60) - (20 * 60 + TRAVEL_BUFFER_SECONDS) * 1000);
    expect(leave.minutesToLeave).toBe(35);
  });

  it('is AHEAD above the threshold and LIVE at or under it', () => {
    // Time-to-leave 31 → ahead; 30 → live. The boundary is inclusive, because the tile should
    // swap AT the threshold rather than a minute after it.
    const walk = 10 * 60;
    const arriveIn = (m: number) => at(m + 10 + TRAVEL_BUFFER_SECONDS / 60);
    expect(heroLeaveBy({ arriveByMs: arriveIn(31), travelSeconds: walk, nowMs: NOW })!.phase).toBe(
      LEAVE_PHASE.AHEAD,
    );
    expect(heroLeaveBy({ arriveByMs: arriveIn(30), travelSeconds: walk, nowMs: NOW })!.phase).toBe(
      LEAVE_PHASE.LIVE,
    );
  });

  // **§AA1's number is measured on TIME-TO-LEAVE, not time-to-event**, and this is the spec that
  // says so: two legs of very different lengths swap at the same distance from their own
  // leave-by. On the other end the length of the walk would move the swap, so a 70-minute leg
  // would swap 70 minutes before a departure that is not yet close at all.
  it('measures the threshold from the LEAVE-BY, so the length of the leg cannot move it', () => {
    const short = heroLeaveBy({ arriveByMs: at(35), travelSeconds: 5 * 60, nowMs: NOW })!;
    const long = heroLeaveBy({ arriveByMs: at(95), travelSeconds: 65 * 60, nowMs: NOW })!;
    expect(short.minutesToLeave).toBe(25);
    expect(long.minutesToLeave).toBe(25);
    expect(short.phase).toBe(LEAVE_PHASE.LIVE);
    expect(long.phase).toBe(LEAVE_PHASE.LIVE);
    // …and the long leg is nowhere near its event, which is exactly the case the other end
    // would have got wrong.
    expect(LEAVE_BY_SWAP_MINUTES).toBe(30);
  });

  // `leaveBy` refuses to clamp for this reason (its own docblock): a leave-by already gone is
  // §V1.4's whole mark, and clamping would delete the fact.
  it('reports a passed leave-by as PASSED, with a negative count', () => {
    const leave = heroLeaveBy({ arriveByMs: at(3), travelSeconds: 5 * 60, nowMs: NOW })!;
    expect(leave.phase).toBe(LEAVE_PHASE.PASSED);
    expect(leave.minutesToLeave).toBe(-7);
  });

  it('honours a caller-supplied threshold, so the number stays one constant', () => {
    const leave = heroLeaveBy({
      arriveByMs: at(50),
      travelSeconds: 5 * 60,
      nowMs: NOW,
      swapMinutes: 45,
    })!;
    expect(leave.minutesToLeave).toBe(40);
    expect(leave.phase).toBe(LEAVE_PHASE.LIVE);
  });
});

const ev = (over: Partial<TripEvent> & { id: string }): TripEvent =>
  ({
    tripId: 'trip',
    title: over.id,
    date: '2026-08-26',
    kind: 'soft',
    status: 'planned',
    ...over,
  }) as TripEvent;

describe('travelOrigin — which stop the journey leaves from', () => {
  const morning = ev({ id: 'morning', startsAt: new Date(at(-240)).toISOString() });
  const museum = ev({ id: 'museum', startsAt: new Date(at(-90)).toISOString() });
  const later = ev({ id: 'later', startsAt: new Date(at(90)).toISOString() });
  const events = [morning, museum, later];

  it('is the point in progress when there is one', () => {
    expect(travelOrigin({ nowEvent: museum, events, nowMs: NOW })?.id).toBe('museum');
  });

  // In a gap the schedule's own last claim is where it left you — the same leg the day row
  // measures its hole with, so the two surfaces cannot disagree about one journey.
  it('falls back to the latest stop that has already started', () => {
    expect(travelOrigin({ events, nowMs: NOW })?.id).toBe('museum');
  });

  it('never takes something that has not started, and never the destination itself', () => {
    expect(travelOrigin({ events: [later], nowMs: NOW })).toBeUndefined();
    expect(travelOrigin({ events, nowMs: NOW, excludeEventId: 'museum' })?.id).toBe('morning');
  });

  it('ignores a clockless stop, which cannot claim a position it does not have', () => {
    expect(travelOrigin({ events: [ev({ id: 'idea' })], nowMs: NOW })).toBeUndefined();
  });

  it('has no origin on a day nothing has started on', () => {
    expect(travelOrigin({ events: [], nowMs: NOW })).toBeUndefined();
  });
});
