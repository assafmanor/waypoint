import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { JOIN_BOX, journeyIsAhead, nowInJoin, nowInJourney, nowLinePlacement } from './now-line';
import { DAY_JOURNEY_ARM, type DayJourney } from './day-joins';
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

// ── A HOLE IS TWO ROWS (ADR-0217's 2026-09-04 amendment) ────────────────────────────────────
//
// The reported day: a hole from ⁦08:00⁩ to ⁦17:00⁩ with a ⁦9⁩-minute drive at the end of it, and the
// arrow ⁦56%⁩ down a strip-plus-block — which is the drive, three and three-quarter hours before
// its own `יציאה עד 16:46`. `--thru` is a fraction of the marked BOX, so the pair had to stop
// being one box; these are the intervals that decide which.
describe('nowInJoin', () => {
  const OPENS = Date.parse(at('08:00'));
  const CLOSES = Date.parse(at('17:00'));
  /** The reported leg: leave by ⁦16:46⁩, ⁦9⁩ minutes, arrive ⁦16:55⁩ — five minutes of buffer. */
  const drive = (over: Partial<DayJourney> = {}): DayJourney => ({
    arm: DAY_JOURNEY_ARM.AHEAD,
    travelSeconds: 9 * 60,
    distanceMeters: 5300,
    distanceIsFloor: false,
    leaveByMs: Date.parse(at('16:46')),
    leaveByIsFloor: false,
    free: null,
    overrunSeconds: null,
    arriveAtMs: Date.parse(at('16:55')),
    arrivesAfterClose: false,
    remainingSeconds: null,
    ...over,
  });
  const hole = (over: Partial<Parameters<typeof nowInJoin>[0]> = {}) => ({
    opensMs: OPENS,
    closesMs: CLOSES,
    journey: drive(),
    ...over,
  });

  it('is in the free time while the departure is still ahead', () => {
    const placed = nowInJoin(hole(), Date.parse(at('13:01')));
    expect(placed?.key).toBe(JOIN_BOX.HOLE);
    // 5:01 of the 8:46 the strip states — a fraction of the FREE TIME and not of the hole.
    expect(placed?.thruFrac).toBeCloseTo(301 / 526, 6);
  });

  it('crosses into the journey at the leave-by, not before and not after', () => {
    expect(nowInJoin(hole(), Date.parse(at('16:45')))?.key).toBe(JOIN_BOX.HOLE);
    expect(nowInJoin(hole(), Date.parse(at('16:46')))?.key).toBe(JOIN_BOX.JOURNEY);
    // And it stays the journey's through the buffer: you are not in the room until it starts.
    expect(nowInJoin(hole(), Date.parse(at('16:58')))?.key).toBe(JOIN_BOX.JOURNEY);
  });

  // The owner's own exception: _"unless someone marked it as 'on the way'"_ (ADR-0207 §2).
  it('hands the whole hole to the journey once somebody says they are on the way', () => {
    const onWay = hole({ journey: drive({ arm: DAY_JOURNEY_ARM.ON_WAY }) });
    const placed = nowInJoin(onWay, Date.parse(at('13:01')));
    expect(placed?.key).toBe(JOIN_BOX.JOURNEY);
    expect(placed?.thruFrac).toBeCloseTo(301 / 540, 6);
  });

  // Half the arms state no departure at all (§AA4/§AM10/§AU1/§AZ1), and the block prints none
  // either. With nothing to divide the hole on, the app must not claim the travel has begun.
  it('leaves the whole hole free when the leg states no departure', () => {
    const quiet = hole({ journey: drive({ arm: DAY_JOURNEY_ARM.UNMEASURED, leaveByMs: null }) });
    expect(nowInJoin(quiet, Date.parse(at('16:50')))?.key).toBe(JOIN_BOX.HOLE);
  });

  // A leave-by clamped to the origin's own end (§AJ2) is the EARLIEST departure that exists, so
  // the free time before it is empty and the journey takes the hole from its first instant.
  it('gives the journey the whole hole when nothing is free before it', () => {
    const tight = hole({ journey: drive({ leaveByMs: OPENS }) });
    const placed = nowInJoin(tight, Date.parse(at('13:01')));
    expect(placed?.key).toBe(JOIN_BOX.JOURNEY);
    expect(placed?.thruFrac).toBeCloseTo(301 / 540, 6);
  });

  // **The journey's box means the JOURNEY, whether or not the hole draws one of its own** (the
  // 2026-09-05 amendment). Told which rows were drawn, this made the block's span the whole hole
  // — so the arrow entered a ⁦45⁩-minute drive two-thirds of the way down it.
  it('measures the journey over the journey, not over the hole around it', () => {
    const placed = nowInJoin(hole(), Date.parse(at('16:50')));
    expect(placed?.key).toBe(JOIN_BOX.JOURNEY);
    // 4 of the 14 minutes from the leave-by to the row below, never 8:50 of the hole's 9:00.
    expect(placed?.thruFrac).toBeCloseTo(4 / 14, 6);
  });

  it('gives the hole its whole self when no journey crosses it', () => {
    const empty = hole({ journey: null });
    expect(nowInJoin(empty, Date.parse(at('13:01')))?.key).toBe(JOIN_BOX.HOLE);
  });

  // A departure outside the hole cannot cut it — clamped rather than trusted, for the reason
  // `NowMarker` clamps `--thru`: the alternative is a span the moment falls outside of entirely.
  it('clamps a departure that lands outside the hole', () => {
    const early = hole({ journey: drive({ leaveByMs: OPENS - 60_000 }) });
    expect(nowInJoin(early, Date.parse(at('08:01')))?.key).toBe(JOIN_BOX.JOURNEY);
    const late = hole({ journey: drive({ leaveByMs: CLOSES + 60_000 }) });
    expect(nowInJoin(late, Date.parse(at('16:59')))?.key).toBe(JOIN_BOX.HOLE);
  });

  // The hole is only ever asked about a moment inside it, and every instant in it belongs to one
  // of the two boxes — so the two answers together cover it with nothing left over.
  it('answers for every instant of the hole', () => {
    for (let ms = OPENS; ms < CLOSES; ms += 7 * 60_000) {
      expect(nowInJoin(hole(), ms)).not.toBeNull();
    }
    expect(nowInJoin(hole(), CLOSES)).toBeNull();
    expect(nowInJoin(hole(), OPENS - 1)).toBeNull();
  });
});

// ── AND SO ARE THE DAY'S TWO ENDS ───────────────────────────────────────────────────────────
//
// `wakeJourney`, `arriveJourney` and `homeJourney` have no join above them (ADR-0206 §AD,
// ADR-0209 §1), so the boundary mark had exactly one place against all three: below. At ⁦05:00⁩
// that said an ⁦08:40⁩ drive out of the hotel was already behind us.
describe('nowInJourney · a leg with no join above it', () => {
  const wake: DayJourney = {
    arm: DAY_JOURNEY_ARM.AHEAD,
    travelSeconds: 18 * 60,
    distanceMeters: 4200,
    distanceIsFloor: false,
    leaveByMs: Date.parse(at('08:40')),
    leaveByIsFloor: false,
    free: null,
    overrunSeconds: null,
    arriveAtMs: Date.parse(at('08:58')),
    arrivesAfterClose: false,
    remainingSeconds: null,
  };

  it('holds the moment only between the departure and the arrival', () => {
    expect(nowInJourney(wake, Date.parse(at('05:00')))).toBeNull();
    expect(nowInJourney(wake, Date.parse(at('08:49')))?.thruFrac).toBeCloseTo(0.5, 6);
    expect(nowInJourney(wake, Date.parse(at('08:58')))).toBeNull();
  });

  it('says the leg is ahead only while it is', () => {
    expect(journeyIsAhead(wake, Date.parse(at('05:00')))).toBe(true);
    expect(journeyIsAhead(wake, Date.parse(at('08:40')))).toBe(false);
    expect(journeyIsAhead(wake, Date.parse(at('09:30')))).toBe(false);
    expect(journeyIsAhead(null, Date.parse(at('05:00')))).toBe(false);
  });

  // **The leg home states no leave-by**, and that is not an absence to work around: a stay is a
  // floor, so there is no deadline to count back from and the row says `הגעה ~X` alone (§AJ1).
  // The departure is still knowable — it is what the arrival was counted forward FROM.
  it('recovers the departure of a leg that advises none', () => {
    const home = { ...wake, leaveByMs: null, arriveAtMs: Date.parse(at('18:30')) };
    expect(journeyIsAhead(home, Date.parse(at('18:00')))).toBe(true);
    expect(nowInJourney(home, Date.parse(at('18:21')))?.thruFrac).toBeCloseTo(9 / 18, 6);
    expect(nowInJourney(home, Date.parse(at('18:31')))).toBeNull();
  });

  // ADR-0207 §2 / ADR-0208 §2: a claim somebody made outranks the clock, and a claim the app may
  // not make is withheld rather than guessed — `claimDenied` ships no arrival at all.
  it('is inside a leg somebody is on before its own leave-by, and never ahead of it', () => {
    const onWay = { ...wake, arm: DAY_JOURNEY_ARM.ON_WAY };
    expect(nowInJourney(onWay, Date.parse(at('08:30')))?.thruFrac).toBe(0);
    expect(journeyIsAhead(onWay, Date.parse(at('05:00')))).toBe(false);
  });

  it('claims nothing about a leg that predicts no arrival', () => {
    const quiet = { ...wake, arm: DAY_JOURNEY_ARM.UNMEASURED, leaveByMs: null, arriveAtMs: null };
    expect(nowInJourney(quiet, Date.parse(at('08:49')))).toBeNull();
    expect(journeyIsAhead(quiet, Date.parse(at('05:00')))).toBe(false);
  });
});
