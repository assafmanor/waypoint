import { describe, it, expect } from 'vitest';
import { TRAVEL_BUFFER_SECONDS, type TripEvent } from '@waypoint/shared';
import {
  LEAVE_BY_SWAP_MINUTES,
  LEAVE_PHASE,
  heroArrival,
  heroLeaveBy,
  travelOrigin,
} from './hero-travel';

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
    expect(travelOrigin({ nowEvent: museum, events, nowMs: NOW }).event?.id).toBe('museum');
  });

  // In a gap the schedule's own last claim is where it left you — the same leg the day row
  // measures its hole with, so the two surfaces cannot disagree about one journey.
  it('falls back to the latest stop that has already started', () => {
    expect(travelOrigin({ events, nowMs: NOW }).event?.id).toBe('museum');
  });

  it('never takes something that has not started, and never the destination itself', () => {
    expect(travelOrigin({ events: [later], nowMs: NOW }).event).toBeUndefined();
    expect(travelOrigin({ events, nowMs: NOW, excludeEventId: 'museum' }).event?.id).toBe(
      'morning',
    );
  });

  it('ignores a clockless stop, which cannot claim a position it does not have', () => {
    expect(travelOrigin({ events: [ev({ id: 'idea' })], nowMs: NOW }).event).toBeUndefined();
  });

  it('has no origin on a day nothing has started on', () => {
    expect(travelOrigin({ events: [], nowMs: NOW }).event).toBeUndefined();
  });

  // ── THE MORNING BEFORE ANYTHING HAS STARTED (ADR-0206 §AD, built in M6a) ────────────────
  //
  // §AE3 shipped with no answer here and named it as the first thing to reconcile: scoped to the
  // clock's own day, there is no started stop until the day's first one begins, so on the read
  // where "when do I have to leave" matters most the board drew nothing at all.
  describe('the stay you woke in (ADR-0206 §AD)', () => {
    const hotel = ev({
      id: 'hotel',
      category: 'lodging',
      date: '2026-08-01',
      endDate: '2026-08-05',
      startsAt: '2026-08-01T15:00:00Z',
      endsAt: '2026-08-05T11:00:00Z',
    });

    it('answers the bed on a morning nothing has started on', () => {
      expect(travelOrigin({ events: [later], nowMs: NOW, wokeIn: hotel }).event?.id).toBe('hotel');
    });

    // **Only ever the fallback.** A stop that has actually started is later, and therefore a
    // stronger claim about where the plan left you — the bed is not a walk back, which this
    // function still refuses (see the skip case below).
    it('never displaces a stop that has already started', () => {
      expect(travelOrigin({ events, nowMs: NOW, wokeIn: hotel }).event?.id).toBe('museum');
    });

    it('never displaces the point in progress either', () => {
      expect(travelOrigin({ nowEvent: museum, events, nowMs: NOW, wokeIn: hotel }).event?.id).toBe(
        'museum',
      );
    });

    // The day whose only stops are one stay's two ends would otherwise ask for a leg from a
    // place to itself.
    it('is not its own origin when the bed IS the destination', () => {
      expect(
        travelOrigin({ events: [], nowMs: NOW, wokeIn: hotel, excludeEventId: 'hotel' }).event,
      ).toBeUndefined();
    });

    // Absent leaves §AE3's shipped behaviour untouched, which is what makes this additive.
    it('changes nothing when the caller has no bed to offer', () => {
      expect(travelOrigin({ events: [later], nowMs: NOW }).event).toBeUndefined();
    });

    // **A check-in hour that has passed is not a position at all** (field report, 2026-09-20,
    // amending §AF3). §AF3 found this row through the FLAG — Home derived `isStay` as
    // `originEvent.id === wokeIn?.id`, so tonight's hotel answered `false` and handed
    // `legDepartAfterMs` a check-out days away — and fixed the flag while leaving the row as the
    // origin. It is not one: `15:00` is when the door opens, so the clock passing it says nothing
    // about whether anybody is there. The board measured an evening drive out of a bed nobody had
    // reached, ⁦7 דק׳⁩ against the day view's ⁦3:26⁩ out of the stop they were driving from.
    it('does not take a bed whose check-in hour merely passed', () => {
      expect(travelOrigin({ events: [hotel], nowMs: NOW }).event).toBeUndefined();
    });

    // **And the flag §AF3 fixed still holds for the beds that DO reach this function** — the two
    // doors built for them, which are dated and bounded where the clock-walk was neither.
    it('still marks the bed it is handed as a bed', () => {
      const origin = travelOrigin({ events: [], nowMs: NOW, wokeIn: hotel });
      expect(origin.event?.id).toBe('hotel');
      expect(origin.isStay).toBe(true);
    });

    it('marks an ordinary stop as no bed at all', () => {
      expect(travelOrigin({ events, nowMs: NOW }).isStay).toBe(false);
      expect(travelOrigin({ nowEvent: museum, events, nowMs: NOW }).isStay).toBe(false);
    });
  });

  // ── A JOURNEY THAT CROSSES A NIGHT (field report, 2026-09-12) ───────────────────────────────
  //
  // The night board's `הבא בתור` is tomorrow's first stop (ADR-0214 §7), and the leg into it was
  // measured from whatever today left you at: `~1:36 שע׳ · צאו ב־05:33` on the board against
  // `~1:02 שע׳ · יציאה עד 06:08` in the day view, about one morning. You sleep in between, so
  // every claim about today is the wrong end of the leg.
  describe('the bed you sleep in first (ADR-0206 §AD, extended)', () => {
    const tonight = ev({
      id: 'tonight',
      category: 'lodging',
      date: '2026-08-26',
      endDate: '2026-08-27',
      startsAt: '2026-08-26T13:00:00Z',
      endsAt: '2026-08-27T09:00:00Z',
    });

    it('outranks the last stop today left you at', () => {
      const origin = travelOrigin({ events, nowMs: NOW, sleepsIn: tonight });
      expect(origin.event?.id).toBe('tonight');
      expect(origin.isStay).toBe(true);
    });

    // The one precedence the bed inverts, and deliberately: `nowEvent` is the strongest claim
    // about where you are NOW, and where you are now is not where tomorrow starts.
    it('outranks the point still in progress', () => {
      expect(
        travelOrigin({ nowEvent: museum, events, nowMs: NOW, sleepsIn: tonight }).event?.id,
      ).toBe('tonight');
    });

    it('is never its own origin, so a check-out next keeps the stop below it', () => {
      const origin = travelOrigin({
        events,
        nowMs: NOW,
        sleepsIn: tonight,
        excludeEventId: 'tonight',
      });
      expect(origin.event?.id).toBe('museum');
    });

    // A night nobody booked a bed for has no better answer than the shipped one — the caller
    // simply has nothing to hand over, and absence is what keeps this additive.
    it('changes nothing when no stay covers the night', () => {
      expect(travelOrigin({ events, nowMs: NOW }).event?.id).toBe('museum');
    });
  });

  // **ADR-0208 §2**, reported from a real day: the group skipped the stop they were at, and the
  // board went on measuring the leg out of a place nobody went to — a leave-by, and then a late
  // mark, derived from a claim the group had explicitly denied.
  describe('a claim the group denied (ADR-0208 §2)', () => {
    const skipped = ev({ id: 'museum', startsAt: museum.startsAt, status: 'skipped' });

    it('still names the stop, and says the plan may no longer claim it', () => {
      const origin = travelOrigin({ events: [morning, skipped, later], nowMs: NOW });
      expect(origin.event?.id).toBe('museum');
      expect(origin.denied).toBe(true);
    });

    // **It does NOT walk back to the morning.** A skip says nothing about place in either
    // direction — you may have skipped the café while standing outside it — so an older stop
    // is not a better answer, it is a staler one. The caller asks a fix instead.
    it('does not hand the role to an older stop', () => {
      expect(travelOrigin({ events: [morning, skipped, later], nowMs: NOW }).event?.id).not.toBe(
        'morning',
      );
    });

    it('is not denied when a later stop was the one that started', () => {
      const after = ev({ id: 'after', startsAt: new Date(at(-30)).toISOString() });
      const origin = travelOrigin({ events: [skipped, after, later], nowMs: NOW });
      expect(origin.event?.id).toBe('after');
      expect(origin.denied).toBe(false);
    });

    // `done` is the strongest origin there is — somebody said they were there.
    it('is not denied by a settle mark that says they went', () => {
      const done = ev({ id: 'museum', startsAt: museum.startsAt, status: 'done' });
      expect(travelOrigin({ events: [morning, done], nowMs: NOW }).denied).toBe(false);
    });
  });
});

// ══ AN ORIGIN WITH NO PLACE WALKS BACK, AS A CLAIM THAT DOES NOT STAND (ADR-0232 R6) ═════════
//
// The refusal this replaces — "offering it would invent a position" — was right about the CLAIM
// and wrong about the LEG. ADR-0208 §2 gave a claim the plan cannot back a shape, and an aurora
// watch with no place is that shape by another road: the leg leaves from the supermarket the plan
// last placed you at, and the board reads it only where a fix backs it (`originStands`).
describe('travelOrigin — an origin with no place (ADR-0232 R6)', () => {
  const morning = ev({ id: 'morning', startsAt: new Date(at(-240)).toISOString() });
  const supermarket = ev({ id: 'netto', startsAt: new Date(at(-180)).toISOString() });
  const aurora = ev({ id: 'aurora', startsAt: new Date(at(-30)).toISOString() });
  const events = [morning, supermarket, aurora];
  const placed = (event: TripEvent) => event.id !== 'aurora' && event.id !== 'call';
  const hotel = ev({
    id: 'hotel',
    category: 'lodging',
    date: '2026-08-01',
    endDate: '2026-08-05',
    startsAt: '2026-08-01T15:00:00Z',
    endsAt: '2026-08-05T11:00:00Z',
  });

  it('walks back to the last PLACED stop that has started, and denies the claim', () => {
    const claim = travelOrigin({ events, nowMs: NOW, placed });
    expect(claim.event?.id).toBe('netto');
    expect(claim.denied).toBe(true);
  });

  it('does the same for a placeless point in progress', () => {
    const claim = travelOrigin({ nowEvent: aurora, events, nowMs: NOW, placed });
    expect(claim.event?.id).toBe('netto');
    expect(claim.denied).toBe(true);
  });

  it('reaches the bed when nothing placed has started, still as a claim that does not stand', () => {
    const call = ev({ id: 'call', startsAt: new Date(at(-60)).toISOString() });
    const claim = travelOrigin({ events: [call], nowMs: NOW, placed, wokeIn: hotel });
    expect(claim.event?.id).toBe('hotel');
    expect(claim.denied).toBe(true);
    expect(claim.isStay).toBe(true);
  });

  it('has no origin at all with nothing placed behind and no bed — nothing is invented', () => {
    const call = ev({ id: 'call', startsAt: new Date(at(-60)).toISOString() });
    expect(travelOrigin({ events: [call], nowMs: NOW, placed }).event).toBeUndefined();
  });

  it('leaves a placed origin exactly as it was: the claim stands', () => {
    const claim = travelOrigin({ events: [morning, supermarket], nowMs: NOW, placed });
    expect(claim.event?.id).toBe('netto');
    expect(claim.denied).toBe(false);
  });

  it('takes every stop as placed when nobody says otherwise, which is the behaviour before this', () => {
    expect(travelOrigin({ events, nowMs: NOW })).toMatchObject({ event: aurora, denied: false });
  });
});

// ══ WHEN WE GET THERE (field report, 2026-09-20) ═══════════════════════════════════════════════
//
// The board could say when to leave and not when you would arrive, so once the leaving was done
// it had nothing true left to say — and said `זמן חופשי`.
describe('heroArrival', () => {
  const ARRIVE = NOW + 30 * MIN;

  it('is the clock plus what is left of the road', () => {
    expect(heroArrival({ remainingSeconds: 12 * 60, nowMs: NOW })?.etaMs).toBe(NOW + 12 * MIN);
  });

  it('is absent with no position behind it — a `בדרך` mark says where, not how far along', () => {
    expect(heroArrival({ remainingSeconds: null, nowMs: NOW })).toBeNull();
  });

  it('is absent once there is no road left, rather than an arrival in the past', () => {
    expect(heroArrival({ remainingSeconds: 0, nowMs: NOW })).toBeNull();
    expect(heroArrival({ remainingSeconds: -60, nowMs: NOW })).toBeNull();
  });

  it('counts the minutes past a deadline it lands after', () => {
    const read = heroArrival({
      remainingSeconds: 79 * 60,
      nowMs: NOW,
      arriveByMs: ARRIVE,
      arrivalIsDeadline: true,
    });
    expect(read?.lateMinutes).toBe(49);
  });

  it('is not late when it lands before', () => {
    expect(
      heroArrival({
        remainingSeconds: 18 * 60,
        nowMs: NOW,
        arriveByMs: ARRIVE,
        arrivalIsDeadline: true,
      })?.lateMinutes,
    ).toBeNull();
  });

  // Rounding is why this has to be asserted: eighteen seconds over rounds to `0`, and a red
  // `0 · דקות באיחור` for arriving on time is the tile accusing somebody of nothing.
  it('and zero is not late', () => {
    expect(
      heroArrival({
        remainingSeconds: 30 * 60 + 18,
        nowMs: NOW,
        arriveByMs: ARRIVE,
        arrivalIsDeadline: true,
      })?.lateMinutes,
    ).toBeNull();
  });

  // ADR-0206 §AI1's gate, read the same way the leave-by reads it: a check-in's hour is when the
  // door opens, so nothing arrives late to it — and a red tile counting against one would be
  // lateness for nothing.
  it('never calls an arrival late against a start that is not a deadline', () => {
    const read = heroArrival({
      remainingSeconds: 79 * 60,
      nowMs: NOW,
      arriveByMs: ARRIVE,
      arrivalIsDeadline: false,
    });
    expect(read?.etaMs).toBe(NOW + 79 * MIN);
    expect(read?.lateMinutes).toBeNull();
  });
});
