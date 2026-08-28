import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  TRAVEL_BUFFER_SECONDS,
  TRAVEL_FIT,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import {
  DAY_JOURNEY_ARM,
  connectionStops,
  dayBlocks,
  dayFeasibility,
  dayJourney,
  dayTravelTotal,
  joinBetween,
  narrowGapForTravel,
} from './day-joins';
import { bookingWhen } from './booking-journey';
import { mergeDayEntries } from './day-entries';
import { buildTimeTree } from './time';
import { gapBetween } from './gaps';

const TZ = 'Asia/Tokyo';
const MIN = 60_000;
const STAMP = '2026-07-01T00:00:00Z';

const ev = (over: Partial<TripEvent> & { id: string }): TripEvent => ({
  tripId: 't1',
  date: '2026-07-12',
  title: over.id,
  kind: EVENT_KIND.HARD,
  status: EVENT_STATUS.PLANNED,
  sortOrder: 1,
  source: 'manual',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: 'u1',
  ...over,
});

const bk = (over: Partial<Booking> & { id: string }): Booking => ({
  tripId: 't1',
  type: BOOKING_TYPE.FLIGHT,
  title: over.id,
  source: 'manual',
  createdAt: STAMP,
  updatedAt: STAMP,
  updatedBy: 'u1',
  ...over,
});

/** Tokyo→Dubai lands 06:10, Dubai→Tel Aviv leaves 08:50: a 2h40 layover. */
const leg1 = ev({
  id: 'e-leg1',
  bookingId: 'b-leg1',
  startsAt: '2026-07-12T00:30:00+09:00',
  endsAt: '2026-07-12T06:10:00+09:00',
});
const leg2 = ev({
  id: 'e-leg2',
  bookingId: 'b-leg2',
  startsAt: '2026-07-12T08:50:00+09:00',
  endsAt: '2026-07-12T12:35:00+09:00',
});
const bLeg1 = bk({ id: 'b-leg1', fromPlaceId: 'nrt', toPlaceId: 'dxb' });
const bLeg2 = bk({ id: 'b-leg2', fromPlaceId: 'dxb', toPlaceId: 'tlv' });

const ctxFor = (events: TripEvent[], bookings: Booking[] = []) => ({
  bookings,
  when: bookingWhen(events),
  tz: TZ,
});

describe('joinBetween', () => {
  it('states free time once it clears the floor Plan mode already uses', () => {
    const lunch = ev({
      id: 'lunch',
      startsAt: '2026-07-12T12:30:00+09:00',
      endsAt: '2026-07-12T13:20:00+09:00',
    });
    const show = ev({ id: 'show', startsAt: '2026-07-12T16:00:00+09:00' });
    expect(joinBetween(lunch, show, ctxFor([lunch, show]))).toMatchObject({
      kind: 'gap',
      minutes: 160,
    });
  });

  // ADR-0161 §9: the strip is tappable, so the join carries the SLOT a fill lands on —
  // `gapBetween`'s own, which it used to derive and throw away. The tap has to open the same
  // slot Plan mode's chip offers, and the room is what caps a category's length there.
  it('carries the slot a fill lands on, not just the measurement', () => {
    const lunch = ev({
      id: 'lunch',
      startsAt: '2026-07-12T12:30:00+09:00',
      endsAt: '2026-07-12T13:20:00+09:00',
    });
    const show = ev({ id: 'show', startsAt: '2026-07-12T16:00:00+09:00' });
    const join = joinBetween(lunch, show, ctxFor([lunch, show]))!;
    expect(join.kind).toBe('gap');
    if (join.kind !== 'gap') return;
    expect(join.free).toEqual(gapBetween(lunch, show, TZ));
    // The block starts where the free time does — 13:20, the end of lunch.
    expect(join.free.fill.start).toBe('13:20');
  });

  it('says nothing about a hole under the floor', () => {
    const a = ev({ id: 'a', startsAt: '2026-07-12T10:00:00+09:00' });
    const b = ev({ id: 'b', startsAt: '2026-07-12T10:40:00+09:00' });
    expect(joinBetween(a, b, ctxFor([a, b]))).toBeNull();
  });

  it('names a connection instead, with the stop and the mode', () => {
    const events = [leg1, leg2];
    expect(joinBetween(leg1, leg2, ctxFor(events, [bLeg1, bLeg2]))).toEqual({
      kind: 'connection',
      minutes: 160,
      stopPlaceId: 'dxb',
      tight: false,
      type: BOOKING_TYPE.FLIGHT,
    });
  });

  it('calls a connection short by the mode’s own measure, not by the gap floor', () => {
    // 12 minutes on a platform: below every free-time threshold there is, and the
    // single most important thing on the screen.
    const t1 = ev({
      id: 'e-t1',
      bookingId: 'b-t1',
      startsAt: '2026-07-12T09:12:00+09:00',
      endsAt: '2026-07-12T11:29:00+09:00',
    });
    const t2 = ev({ id: 'e-t2', bookingId: 'b-t2', startsAt: '2026-07-12T11:41:00+09:00' });
    const bookings = [
      bk({ id: 'b-t1', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'tyo', toPlaceId: 'kyo' }),
      bk({ id: 'b-t2', type: BOOKING_TYPE.TRAIN, fromPlaceId: 'kyo', toPlaceId: 'nar' }),
    ];
    expect(joinBetween(t1, t2, ctxFor([t1, t2], bookings))).toMatchObject({
      kind: 'connection',
      minutes: 12,
      tight: true,
      type: BOOKING_TYPE.TRAIN,
    });
  });

  it('prefers the connection over the gap on a long layover', () => {
    // Seven hours in Dubai would clear the gap floor twice over. It is not free time.
    const late = ev({ id: 'e-late', bookingId: 'b-leg2', startsAt: '2026-07-12T13:40:00+09:00' });
    const join = joinBetween(leg1, late, ctxFor([leg1, late], [bLeg1, bLeg2]));
    expect(join).toMatchObject({ kind: 'connection', minutes: 450 });
  });
});

describe('dayBlocks', () => {
  const blocksFor = (events: TripEvent[], bookings: Booking[] = []) =>
    dayBlocks(mergeDayEntries(buildTimeTree(events), []), ctxFor(events, bookings));

  it('takes both legs of a journey into ONE block', () => {
    const blocks = blocksFor([leg1, leg2], [bLeg1, bLeg2]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].journey).toBe(true);
    expect(blocks[0].entries.map((e) => e.index)).toEqual([0, 1]);
    expect(blocks[0].entries[1].join).toMatchObject({ kind: 'connection' });
  });

  it('leaves unconnected rows as blocks of their own, gap and all', () => {
    const lunch = ev({
      id: 'lunch',
      startsAt: '2026-07-12T12:30:00+09:00',
      endsAt: '2026-07-12T13:20:00+09:00',
    });
    const show = ev({ id: 'show', startsAt: '2026-07-12T16:00:00+09:00' });
    const blocks = blocksFor([lunch, show]);
    expect(blocks.map((b) => b.journey)).toEqual([false, false]);
    expect(blocks[1].entries[0].join).toMatchObject({ kind: 'gap', minutes: 160 });
  });

  it('keeps the index the now-line is placed against, across a block boundary', () => {
    const lunch = ev({
      id: 'lunch',
      startsAt: '2026-07-11T12:30:00+09:00',
      endsAt: '2026-07-11T13:20:00+09:00',
      date: '2026-07-11',
    });
    const blocks = blocksFor([{ ...lunch, date: '2026-07-12' }, leg1, leg2], [bLeg1, bLeg2]);
    // Three rows, two blocks — and every row keeps its position in the merged list,
    // which is the only thing the now-line's index means.
    expect(blocks.flatMap((b) => b.entries.map((e) => e.index))).toEqual([0, 1, 2]);
  });

  it('does not chain a third leg that is not connected to the second', () => {
    const later = ev({
      id: 'e-later',
      bookingId: 'b-later',
      startsAt: '2026-07-12T20:00:00+09:00',
    });
    const blocks = blocksFor(
      [leg1, leg2, later],
      [bLeg1, bLeg2, bk({ id: 'b-later', fromPlaceId: 'hnd', toPlaceId: 'osa' })],
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].entries).toHaveLength(2);
  });
});

describe('connectionStops', () => {
  it('names the stop on both days an overnight connection touches', () => {
    const arrive = ev({
      id: 'e-a',
      bookingId: 'b-leg1',
      startsAt: '2026-07-12T20:00:00+09:00',
      endsAt: '2026-07-12T23:30:00+09:00',
    });
    const depart = ev({
      id: 'e-b',
      bookingId: 'b-leg2',
      date: '2026-07-13',
      startsAt: '2026-07-13T06:00:00+09:00',
    });
    const events = [arrive, depart];
    const stops = connectionStops([bLeg1, bLeg2], events, bookingWhen(events));
    // The stop is Dubai, and it is true of the day you land and the day you leave.
    expect(stops.map((s) => s.date).sort()).toEqual(['2026-07-12', '2026-07-13']);
    expect(stops.every((s) => s.placeId === 'dxb')).toBe(true);
  });

  // **AND NOT ON A DAY YOU WERE SOMEWHERE ELSE** (2026-08-06). `dateOf` read the event's own
  // `date` — the day a leg BEGINS — so an inbound leg that takes off one evening and lands the
  // next morning filed its layover under the day you took off, when you were still at the origin
  // airport. The two dates this function means are named in its own doc, "arrives on one and
  // leaves on the next": the arrival of the leg that brings you in, the departure of the one
  // that takes you out. Here both are the same day, so there is one stop, not two.
  it('does not claim the day the inbound leg took off from somewhere else', () => {
    const arrive = ev({
      id: 'e-a',
      bookingId: 'b-leg1',
      date: '2026-07-11',
      endDate: '2026-07-12',
      startsAt: '2026-07-11T22:00:00+09:00',
      endsAt: '2026-07-12T02:00:00+09:00',
    });
    const depart = ev({
      id: 'e-b',
      bookingId: 'b-leg2',
      date: '2026-07-12',
      startsAt: '2026-07-12T05:00:00+09:00',
    });
    const events = [arrive, depart];
    const stops = connectionStops([bLeg1, bLeg2], events, bookingWhen(events));
    expect(stops.map((s) => s.date)).toEqual(['2026-07-12']);
  });

  it('is empty when nothing chains', () => {
    const lunch = ev({ id: 'lunch', startsAt: '2026-07-12T12:30:00+09:00' });
    expect(connectionStops([bLeg1], [lunch], bookingWhen([lunch]))).toEqual([]);
  });
});

describe('a flexible edge is transparent to the measurement (ADR-0171 §5)', () => {
  const at = (time: string) => `2026-07-12T${time}:00+09:00`;
  const morning = ev({ id: 'e-am', startsAt: at('09:00'), endsAt: at('10:00') });
  const evening = ev({ id: 'e-pm', startsAt: at('16:00'), endsAt: at('17:00') });
  // A stay whose CHECK-OUT lands between them. Its 11:00 is a ceiling, not an hour it
  // occupies, so the four free hours either side of it are one hole and not two.
  const stay = ev({
    id: 'e-stay',
    category: 'lodging',
    date: '2026-07-10',
    endDate: '2026-07-12',
    startsAt: '2026-07-10T15:00:00+09:00',
    endsAt: at('11:00'),
  });
  const ctx = { bookings: [], when: bookingWhen([]), tz: TZ };

  it('measures ACROSS a check-out instead of being stopped by it', () => {
    const entries = mergeDayEntries(buildTimeTree([morning, evening]), [
      { event: stay, edge: 'end' as const, atMs: Date.parse(at('11:00')), labelKey: 'checkOut' },
    ]);
    const blocks = dayBlocks(entries, ctx);
    const joins = blocks.flatMap((b) => b.entries.map((e) => e.join)).filter(Boolean);
    // Six free hours, stated once — the same answer the day would give with no stay at all.
    expect(joins).toHaveLength(1);
    expect(joins[0]!.kind).toBe('gap');
    expect(joins[0]!.minutes).toBe(gapBetween(morning, evening, TZ)!.minutes);
  });

  it('still lets an EXACT transition end the run — a moment is a moment', () => {
    // The same shape with a multi-day flight's arrival in the middle. That edge IS an
    // instant you are committed to, so it keeps the shipped behaviour.
    const redeye = ev({
      id: 'e-redeye',
      category: 'transport',
      icon: '✈️',
      date: '2026-07-11',
      endDate: '2026-07-12',
      startsAt: '2026-07-11T23:00:00+09:00',
      endsAt: at('11:00'),
    });
    const entries = mergeDayEntries(buildTimeTree([morning, evening]), [
      {
        event: redeye,
        edge: 'end' as const,
        atMs: Date.parse(at('11:00')),
        labelKey: 'flightArrival',
      },
    ]);
    const joins = dayBlocks(entries, ctx)
      .flatMap((b) => b.entries.map((e) => e.join))
      .filter(Boolean);
    expect(joins).toHaveLength(0);
  });
});

// ── THE JOURNEY IN A HOLE (ADR-0206 §V1.1 / §V1.3 / §V1.4) ────────────────────────────────
//
// The arithmetic only. What the row SAYS is `DayJoinRow.test.tsx`'s and what the screen wires is
// `screens/DayView.travel.test.tsx`'s — including the failing spec §V1.1 owes as a bug fix.
describe('dayJourney', () => {
  /** The mockup's own scenario and the ADR's own example: a 2:40 hole with a 40-minute walk in
   *  it, leaving 2:00 free. Taken from the drawing rather than invented, so this file and
   *  `a-travel-time-between-two-points-v2.html` cannot disagree about the case. */
  const HOLE_START = Date.parse('2026-07-12T05:00:00Z');
  const HOLE_END = HOLE_START + 160 * MIN;
  const WALK = 40 * 60;
  const journey = (over: Parameters<typeof dayJourney>[0] extends infer T ? Partial<T> : never) =>
    dayJourney({
      departAfterMs: HOLE_START,
      arriveByMs: HOLE_END,
      travelSeconds: WALK,
      nowMs: HOLE_START,
      ...over,
    });

  it('takes the journey out of the free time — the correction §V1.1 leads with', () => {
    expect(journey({})?.free?.freeSeconds).toBe(120 * 60);
    expect(journey({})?.free?.availableSeconds).toBe(160 * 60);
  });

  // §D4, and the direction of the failure is the point: inventing a walk we did not measure
  // costs somebody their afternoon, where saying nothing costs them a number they never had.
  it('answers null with no estimate, so the slot reads exactly as it read before', () => {
    expect(journey({ travelSeconds: null })).toBeNull();
  });

  // `ROUTE_MIN_CROW_M`'s own absence (ADR-0205 §Z2): two stops that are one place.
  it('answers null for a zero-length leg rather than saying `0 דק׳`', () => {
    expect(journey({ travelSeconds: 0 })).toBeNull();
  });

  // **The leave-by is `heroLeaveBy`'s**, so the board, the hero and this row cannot name three
  // different minutes for one departure. Asserted against the shared buffer, never a literal.
  it('derives the leave-by through the shared function, buffer included', () => {
    expect(journey({})?.leaveByMs).toBe(HOLE_END - (WALK + TRAVEL_BUFFER_SECONDS) * 1000);
  });

  it('is AHEAD while the leave-by is still to come', () => {
    expect(journey({})?.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
  });

  it('is PASSED once the leave-by has gone by', () => {
    const passed = journey({ nowMs: HOLE_END - 10 * MIN });
    expect(passed?.arm).toBe(DAY_JOURNEY_ARM.PASSED);
    expect(passed?.leaveByMs).not.toBeNull();
  });

  // **The arm the ADR did not name, and the reason it exists.** Every leave-by of a finished day
  // has gone by, so without this a day read at 22:00 prints `זמן היציאה עבר` on every hole of it
  // — true, useless, and four wrong nudges before breakfast.
  it('is PAST once the row below has started, and offers no departure there', () => {
    const past = journey({ nowMs: HOLE_END + MIN });
    expect(past?.arm).toBe(DAY_JOURNEY_ARM.PAST);
    expect(past?.leaveByMs).toBeNull();
    // …and it keeps the measurement, because the correction is a fact and not advice.
    expect(past?.free?.freeSeconds).toBe(120 * 60);
  });

  // PAST is checked FIRST: a leg that ran late is still behind you.
  it('reads a late hole that is already behind you as PAST, not PASSED', () => {
    expect(journey({ nowMs: HOLE_END + MIN, travelSeconds: 200 * 60 })?.arm).toBe(
      DAY_JOURNEY_ARM.PAST,
    );
  });

  it('is ON_WAY once somebody says so, whatever the clock says', () => {
    const moving = journey({ nowMs: HOLE_END - 10 * MIN, onWay: true });
    expect(moving?.arm).toBe(DAY_JOURNEY_ARM.ON_WAY);
  });

  // ADR-0207 §6 — what is LEFT, and only on the arm that is about being under way.
  it('carries the remaining time on ON_WAY and nowhere else', () => {
    expect(journey({ onWay: true, remainingSeconds: 12 * 60 })?.remainingSeconds).toBe(12 * 60);
    expect(journey({ remainingSeconds: 12 * 60 })?.remainingSeconds).toBeNull();
  });

  // ── ADR-0208 §2: a claim needs something to stand on ────────────────────────────────────
  //
  // **The measurement survives a denied claim and the advice does not**, and the split is the
  // whole of this surface's reading of §2: the hole is still the hole and the walk is still in
  // it, so §V1.1's correction is a fact about the plan rather than a claim about the traveller.
  // What may not be said is where to be and when.
  it('withdraws the leave-by on a denied claim and keeps the measurement', () => {
    const denied = journey({ nowMs: HOLE_END - 10 * MIN, claimDenied: true });
    expect(denied?.leaveByMs).toBeNull();
    expect(denied?.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
    expect(denied?.free?.freeSeconds).toBe(120 * 60);
    expect(denied?.travelSeconds).toBe(WALK);
  });

  it('never marks a denied claim late, which is the report ADR-0208 answers', () => {
    expect(journey({ nowMs: HOLE_END - 10 * MIN, claimDenied: true })?.arm).not.toBe(
      DAY_JOURNEY_ARM.PASSED,
    );
  });

  // A mark is a person's own statement, so it outranks the denial rather than being blocked by it.
  it('still honours `בדרך` on a denied claim', () => {
    expect(journey({ claimDenied: true, onWay: true })?.arm).toBe(DAY_JOURNEY_ARM.ON_WAY);
  });

  // **§AD — the day's first leg, out of the stay you woke in.** An ambient stay has no check-out
  // instant on a middle night, and the day window's dawn would claim you could have left at 07:00.
  it('reports no free time where there is no window, and still reports the journey', () => {
    const bookend = dayJourney({ arriveByMs: HOLE_END, travelSeconds: WALK, nowMs: HOLE_START });
    expect(bookend?.free).toBeNull();
    expect(bookend?.travelSeconds).toBe(WALK);
    expect(bookend?.leaveByMs).toBe(HOLE_END - (WALK + TRAVEL_BUFFER_SECONDS) * 1000);
  });
});

describe('narrowGapForTravel', () => {
  const gapAt = (startHHMM: string, endHHMM: string) => ({
    minutes: 0,
    fill: { date: '2026-07-12', start: startHHMM, end: endHHMM },
  });

  const journeyFreeing = (freeSeconds: number) =>
    ({ free: { freeSeconds } }) as unknown as Parameters<typeof narrowGapForTravel>[1];

  // The common case, and why the offer was only wrong at the margin: the journey sits at the END
  // of a hole, so a 60-minute block at its start is untouched by a 40-minute walk two hours later.
  it('leaves a slot alone when the journey does not reach it', () => {
    const gap = gapAt('14:00', '15:00');
    expect(narrowGapForTravel(gap, journeyFreeing(120 * 60), TZ).fill).toEqual(gap.fill);
  });

  // **AND IT CORRECTS `minutes` EVEN THEN.** The first draft rewrote only `fill.end`, so a Gap
  // whose block needed no capping still reported the whole hole — and the free-time strip, which
  // asks a Gap how long it is, then stated a length a walk had already eaten (ADR-0206 §AH3).
  it('reports what is free, not how long the hole is', () => {
    expect(narrowGapForTravel(gapAt('14:00', '15:00'), journeyFreeing(120 * 60), TZ).minutes).toBe(
      120,
    );
    expect(narrowGapForTravel(gapAt('14:00', '15:00'), journeyFreeing(30 * 60), TZ).minutes).toBe(
      30,
    );
  });

  // …and the margin, which is where the control was handing out a slot the walk eats.
  it('caps the slot at what is actually free', () => {
    const narrowed = narrowGapForTravel(gapAt('14:00', '15:00'), journeyFreeing(30 * 60), TZ);
    expect(narrowed.fill.end).toBe('14:30');
    expect(narrowed.minutes).toBe(30);
    expect(narrowed.fill.start).toBe('14:00');
  });

  it('leaves the slot alone when there is nothing to narrow against (§D4)', () => {
    const gap = gapAt('14:00', '15:00');
    expect(narrowGapForTravel(gap, null, TZ)).toBe(gap);
  });
});

// ── THE LEG THAT DOES NOT FIT (ADR-0206 §V1.1's third `fit`) ──────────────────────────────
//
// `freeAfterTravel` has answered `overruns` since M2 and **nothing rendered it**, so a 78-minute
// walk into a 60-minute gap read `פנוי לפני 0 דק׳` — not a small amount of free time, a journey
// nobody can make. Reported from a real day on both surfaces.
// **A MODE THE GATE REFUSES IS AN ANSWER, NOT AN ABSENCE** (ADR-0206 §AM10). Field report,
// 2026-08-27: _"I changed a drive to a walk and the route simply disappeared from the plan day"_.
// The gate refuses a walk past ⁦15 km⁩, so no estimate is ever coming, so `dayJourney` answered
// `null` and the hole rendered nothing — including the mode control that had just been used, which
// made the change irreversible on the surface that made it. Exactly the failure §AA4's `DECLARED`
// arm was added to prevent, in the sibling case nobody covered.
describe('dayJourney — the mode chosen cannot cover the leg (§AM10)', () => {
  const START = Date.parse('2026-07-12T05:00:00Z');
  const refused = (over: Partial<Parameters<typeof dayJourney>[0]> = {}) =>
    dayJourney({
      departAfterMs: START,
      arriveByMs: START + 160 * MIN,
      // What the gate leaves behind: no estimate, ever.
      travelSeconds: null,
      distanceMeters: 41_000,
      nowMs: START,
      tooFarForMode: true,
      ...over,
    });

  it('renders a journey rather than nothing, so the mode control survives the choice', () => {
    expect(refused()).not.toBeNull();
    expect(refused()?.arm).toBe(DAY_JOURNEY_ARM.TOO_FAR);
  });

  it('keeps the distance and states no duration — the two facts it does have', () => {
    expect(refused()?.distanceMeters).toBe(41_000);
    expect(refused()?.travelSeconds).toBeNull();
  });

  it('gives no leave-by and corrects no free time: there is nothing measured to correct', () => {
    expect(refused()?.leaveByMs).toBeNull();
    expect(refused()?.free).toBeNull();
  });

  // A declared leg is never asked about, so it can never be refused — and it says something
  // different (`בלי הערכת זמן` against `רחוק מדי`). The order between them is not arbitrary.
  it('ranks below the declaration, which is never asked and so never refused', () => {
    expect(refused({ declared: true })?.arm).toBe(DAY_JOURNEY_ARM.DECLARED);
  });
});

/**
 * **THE ROW HAS TO EXIST WHILE THE NUMBER IS BEING WORKED OUT** (ADR-0206 §AU1).
 *
 * The report: two stops added to a day, and the holes into them drew nothing at all — no time, no
 * distance, and no mode control, because the block that carries it is the thing that did not
 * render. The estimate was coming; the app simply never said so.
 */
describe('dayJourney — the number is still being computed (§AU1)', () => {
  const START = Date.parse('2026-07-12T05:00:00Z');
  const computing = (over: Partial<Parameters<typeof dayJourney>[0]> = {}) =>
    dayJourney({
      departAfterMs: START,
      arriveByMs: START + 120 * MIN,
      // The state this arm is about: asked for, not answered yet.
      travelSeconds: null,
      nowMs: START,
      warming: true,
      ...over,
    });

  it('renders a journey rather than nothing, so the row and its mode control appear at once', () => {
    expect(computing()).not.toBeNull();
    expect(computing()?.arm).toBe(DAY_JOURNEY_ARM.WARMING);
  });

  /** **No crow-flies stand-in** — §AM10 already drew this line for the pending case: a number that
   *  later becomes a routed one is a figure that changes under the reader, and the day's total
   *  reads these journeys. */
  it('states no duration and no distance, because it has neither yet', () => {
    expect(computing()?.travelSeconds).toBeNull();
    expect(computing({ distanceMeters: 4100 })?.distanceMeters).toBeNull();
  });

  /** §V1.1's rule: never a pessimistic guess about a journey nobody has measured. */
  it('gives no leave-by and corrects no free time', () => {
    expect(computing()?.leaveByMs).toBeNull();
    expect(computing()?.free).toBeNull();
  });

  /** Ranked last of the three no-estimate flags, because it is the only temporary one: a declared
   *  leg is never asked and a refused one is never coming, so either makes this irrelevant. */
  it('ranks below the declaration and the refusal, which are both permanent', () => {
    expect(computing({ declared: true })?.arm).toBe(DAY_JOURNEY_ARM.DECLARED);
    expect(computing({ tooFarForMode: true })?.arm).toBe(DAY_JOURNEY_ARM.TOO_FAR);
  });

  /** And it contributes nothing to the day's roll-ups, which stay the settled claim they were. */
  it('is invisible to the day total and to the verdict', () => {
    const journeys = [computing()];
    expect(dayTravelTotal(journeys, 0)).toEqual({
      distanceMeters: null,
      travelSeconds: null,
      partial: false,
    });
    expect(dayFeasibility(journeys).fit).toBe(TRAVEL_FIT.UNKNOWN);
  });
});

describe('dayJourney — the journey does not fit (§AG)', () => {
  const START = Date.parse('2026-07-12T05:00:00Z');
  const overrunning = (holeMinutes: number, walkMinutes: number) =>
    dayJourney({
      departAfterMs: START,
      arriveByMs: START + holeMinutes * MIN,
      travelSeconds: walkMinutes * 60,
      nowMs: START,
    });

  it('reports OVERRUNS with the shortfall, not zero free time', () => {
    const journey = overrunning(60, 78);
    expect(journey?.arm).toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(journey?.overrunSeconds).toBe(18 * 60);
    // …and it offers no departure, because there was never one to make.
    expect(journey?.leaveByMs).toBeNull();
  });

  // **Checked before every clock arm, and that ordering is the decision.** An infeasible leg's
  // leave-by is behind the previous stop's own end, so `PASSED` fires on it at once and would say
  // `זמן היציאה עבר` for ever — advice about a departure that was never possible. The shortfall
  // does not decay, so it is what the row says until somebody moves something.
  it('outranks a passed leave-by, whose arm would otherwise always win', () => {
    const journey = dayJourney({
      departAfterMs: START,
      arriveByMs: START + 60 * MIN,
      travelSeconds: 78 * 60,
      nowMs: START + 59 * MIN,
    });
    expect(journey?.arm).toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(journey?.arm).not.toBe(DAY_JOURNEY_ARM.PASSED);
  });

  // A gap behind you is a record whatever it never was, so `PAST` still leads.
  it('yields to PAST, because a gap behind you is history', () => {
    const journey = dayJourney({
      departAfterMs: START,
      arriveByMs: START + 60 * MIN,
      travelSeconds: 78 * 60,
      nowMs: START + 61 * MIN,
    });
    expect(journey?.arm).toBe(DAY_JOURNEY_ARM.PAST);
  });

  it('is not reached while the journey does fit', () => {
    expect(overrunning(160, 40)?.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
    expect(overrunning(160, 40)?.overrunSeconds).toBeNull();
  });

  // **TWO ROWS THAT TOUCH.** The whole journey is the shortfall, and `availableSeconds` is what a
  // renderer branches on to say so without repeating the duration it already printed.
  //
  // `nowMs` sits INSIDE the earlier event rather than on the boundary, which is the live state
  // this describes: you are still in the first row and the second begins the moment it ends. On
  // the boundary itself `PAST` correctly wins — a gap behind you is a record however impossible it
  // was — and the first draft of this fixture sat exactly there and asserted the wrong arm.
  it('reports a zero gap as a zero window, with the journey as the whole shortfall', () => {
    const journey = dayJourney({
      departAfterMs: START,
      arriveByMs: START,
      travelSeconds: 12 * 60,
      nowMs: START - 10 * MIN,
    });
    expect(journey?.arm).toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(journey?.free?.availableSeconds).toBe(0);
    expect(journey?.overrunSeconds).toBe(12 * 60);
  });

  // The bookend leg has no window at all (§AF3), so it can never overrun — there is nothing to
  // overrun. It must not fall into this arm by way of a `null` free.
  it('never overruns the day’s first leg, which has no window', () => {
    const bookend = dayJourney({
      arriveByMs: START + 60 * MIN,
      travelSeconds: 78 * 60,
      nowMs: START,
    });
    expect(bookend?.arm).not.toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(bookend?.free).toBeNull();
  });
});

// ── A HOLE TOO SHORT FOR A `gap` JOIN STILL HAS A JOURNEY (§Z5 §M2) ───────────────────────
//
// `gapBetween` is FLOORED by `GAP_MIN_MINUTES`, so a hole under an hour — including a zero-length
// one, two rows that touch — produces no `gap` join at all. Gating the journey on that join is
// exactly how the case §Z5 §M2 forbade stayed silent: _"a 45-minute hole holding a 40-minute walk"_.
describe('dayBlocks — the row above is recorded whether or not a join survived the floor', () => {
  const at = (hhmm: string) => `2026-07-12T${hhmm}:00+09:00`;
  // **Both rows carry an END, and the first draft of this omitted the second one's.** A start-only
  // row landing exactly on the previous row's end is CONTAINED by it (ADR-0041), so the two nest
  // into one group and there is no adjacency to record at all — a fixture that proved nothing
  // about the floor it meant to test.
  const pair = (endsAt: string, nextStartsAt: string, nextEndsAt = at('23:00')) => {
    const a = ev({ id: 'a', startsAt: at('09:00'), endsAt, placeId: 'pa' });
    const b = ev({ id: 'b', startsAt: nextStartsAt, endsAt: nextEndsAt, placeId: 'pb' });
    const entries = mergeDayEntries(buildTimeTree([a, b]), []);
    return dayBlocks(entries, { bookings: [], when: bookingWhen([]), tz: TZ });
  };
  const originsOf = (blocks: ReturnType<typeof dayBlocks>) =>
    blocks.flatMap((b) => b.entries.map((e) => e.from?.id));

  it('records it for a 45-minute hole, which earns no chip and no join', () => {
    const blocks = pair(at('11:00'), at('11:45'));
    expect(
      gapBetween(ev({ id: 'a', endsAt: at('11:00') }), ev({ id: 'b', startsAt: at('11:45') }), TZ),
    ).toBeNull();
    expect(originsOf(blocks)).toEqual([undefined, 'a']);
  });

  it('records it for two rows that TOUCH, where there is no hole at all', () => {
    expect(originsOf(pair(at('11:00'), at('11:00')))).toEqual([undefined, 'a']);
  });

  it('still records it where the hole is long enough to earn a join', () => {
    expect(originsOf(pair(at('11:00'), at('14:00')))).toEqual([undefined, 'a']);
  });
});

// ── A DEPARTURE THE APP MAY STATE (ADR-0206 §AI) ──────────────────────────────────────────
//
// Two defects, one rule. The owner read both off ADR-0209's mockup, on shipped code:
//
//   §AI1 · `dayJourney` read `arriveByMs` from the destination's `startsAt` unconditionally, so a
//   check-in WINDOW's opening was used as a deadline — `יציאה 16:18` to arrive the instant the
//   door opens, with nothing due until 20:00. And withholding the printed clock is not enough:
//   `arm` still went `PASSED` off that invented deadline, so the row turned `--miss` at 16:19 and
//   the board would say `באיחור` for being late to nothing.
//
//   §AI2 · `leaveBy` has no clamp against `departAfterMs`, so the same block advised leaving at
//   16:18 from a stop running to 16:40 — a departure from inside an event you are still in.
//
// The rule both collapse into: **the app states a departure only when it has a deadline to count
// back from AND the departure is one you could actually make.** Otherwise it states the ARRIVAL,
// which is what it can stand behind — and licenses no late mark, because there is nothing to be
// late for (ADR-0208's own thesis: a claim needs something to stand on).
describe('dayJourney — a flexible arrival licenses no leave-by (ADR-0206 §AI1)', () => {
  const AT = (hhmm: string) => Date.parse(`2026-07-12T${hhmm}:00Z`);
  const leg = (extra: Parameters<typeof dayJourney>[0]) => dayJourney(extra)!;

  /** The mockup's own case: Systrakaffi to 16:40, a 22-minute drive, a window from 17:00. */
  const WINDOW_CASE = {
    departAfterMs: AT('16:40'),
    arriveByMs: AT('17:00'),
    travelSeconds: 22 * 60,
    distanceMeters: 18_000,
  };

  it('states no departure at all, where the destination has no deadline', () => {
    const j = leg({ ...WINDOW_CASE, nowMs: AT('16:00'), flexibleArrival: true });
    expect(j.leaveByMs).toBeNull();
  });

  // **The half that would have shipped broken** (owner). The arm is what paints `--miss` and what
  // the board reads for `באיחור`, so gating only the sentence leaves the claim standing.
  it('never turns PASSED off a deadline it invented', () => {
    // 16:19 is past the leave-by the old arithmetic produced (16:18 = 17:00 − 22min − buffer).
    const j = leg({ ...WINDOW_CASE, nowMs: AT('16:19'), flexibleArrival: true });
    expect(j.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
    expect(j.leaveByMs).toBeNull();
  });

  it('states the arrival instead, which is what it can stand behind', () => {
    const j = leg({ ...WINDOW_CASE, nowMs: AT('16:00'), flexibleArrival: true });
    // When you can leave, plus the leg — not counted back from a floor.
    expect(j.arriveAtMs).toBe(AT('17:02'));
    expect(j.arrivesAfterClose).toBe(false);
  });

  it('says when that arrival lands after the window has shut', () => {
    const j = leg({
      ...WINDOW_CASE,
      departAfterMs: AT('20:10'),
      arriveByMs: AT('17:00'),
      nowMs: AT('19:00'),
      flexibleArrival: true,
      windowClosesMs: AT('20:00'),
    });
    expect(j.arriveAtMs).toBe(AT('20:32'));
    expect(j.arrivesAfterClose).toBe(true);
  });

  // §D4 again: an ordinary destination is untouched, which is most of the app.
  //
  // **And the hole has to be roomy, which is the point rather than fixture hygiene.** The first
  // version of this spec reused `WINDOW_CASE` and failed — its leave-by (16:33) is behind its own
  // origin (16:40), so §AI2 withholds it on an exact arrival too. That is correct behaviour and
  // the spec was asserting against it: the two halves of the rule are independent, and a tight
  // hole triggers the second whatever the destination's edge means.
  // **AMENDED by ADR-0206 §AR1** — this asserted `arriveAtMs === null` on an exact arrival, which
  // was §AJ2's gate ("the arrival is said only where the app cannot promise the buffer"). Every row
  // that has an arrival states it now, so what this holds is the half that did not change: an exact
  // destination still gets a departure, and nothing here can be `after the close` because a
  // destination with a deadline has no window to shut.
  it('leaves an exact arrival exactly as it was', () => {
    const j = leg({
      departAfterMs: AT('12:00'),
      arriveByMs: AT('14:40'),
      travelSeconds: 40 * 60,
      nowMs: AT('12:10'),
    });
    expect(j.leaveByMs).not.toBeNull();
    expect(j.arrivesAfterClose).toBe(false);
  });
});

describe('dayJourney — a leave-by inside the row it leaves from (ADR-0206 §AI2)', () => {
  const AT = (hhmm: string) => Date.parse(`2026-07-12T${hhmm}:00Z`);

  // The tolerance is what uncovered this: a 20-minute window with a 22-minute drive is a
  // 2-minute shortfall, inside `TRAVEL_FIT_TOLERANCE_SECONDS`, so the leg reads as fitting — and
  // the leave-by it hands back is behind its own origin.
  // **AMENDED 2026-08-26 — it offers the origin's own end instead of saying nothing.** Withholding
  // ⁦16:33⁩ was right; withholding every departure was not, and the owner read the resulting silence
  // as an inconsistency with the rows that do state one. The clamp is a departure you could make.
  it('pulls the departure forward to the earliest one that exists', () => {
    const j = dayJourney({
      departAfterMs: AT('16:40'),
      arriveByMs: AT('17:00'),
      travelSeconds: 22 * 60,
      nowMs: AT('16:00'),
    })!;
    expect(j.leaveByMs).toBe(AT('16:40'));
    // …and says the arrival beside it, because the buffer is what it could not promise.
    expect(j.arriveAtMs).toBe(AT('17:02'));
    expect(j.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
  });

  // The whole reason the clock may be printed at all: the mark it licenses is measured against the
  // CLAMPED instant. Off the buffered ⁦16:33⁩ this row would read `זמן היציאה עבר` from ⁦16:34⁩ — the
  // `באיחור`-for-nothing §AI2 was written to remove.
  it('is not late before the clamped departure, and is late after it', () => {
    const at = (hhmm: string) =>
      dayJourney({
        departAfterMs: AT('16:40'),
        arriveByMs: AT('17:00'),
        travelSeconds: 22 * 60,
        nowMs: AT(hhmm),
      })!.arm;
    expect(at('16:35')).toBe(DAY_JOURNEY_ARM.AHEAD);
    expect(at('16:45')).toBe(DAY_JOURNEY_ARM.PASSED);
  });

  // **AMENDED by ADR-0206 §AR1.** The unclamped case: the buffer fits, so the departure is the
  // buffered one and NOT the origin's end. It used to say nothing about arriving; it now says the
  // arrival that departure implies — `13:55 + 40 min`, which is §D5's buffer before the `14:40`
  // deadline, and the whole point is that a reader can see that arithmetic.
  it('keeps a departure that sits after the origin ends, and says where it lands', () => {
    const j = dayJourney({
      departAfterMs: AT('12:00'),
      arriveByMs: AT('14:40'),
      travelSeconds: 40 * 60,
      nowMs: AT('12:10'),
    })!;
    expect(j.leaveByMs).toBe(AT('13:55'));
    expect(j.arriveAtMs).toBe(AT('14:35'));
  });
});

// **AN OPEN FLOOR IS A DEADLINE THE APP DOES NOT HAVE** (ADR-0206 §AJ1).
//
// Reported off the §AI deploy, on the day BEFORE the one §AI1 was written for: the last flight of
// day 1 lands at 23:20 and the hotel checked into that night opens `מ-15:00`, so the fit measured a
// 1:42 drive against a deadline **eight hours behind its own origin** and said `אין זמן לדרך` about
// the one leg of the day nobody can be late for.
//
// §AI1 got the leave-by right and left the FIT keyed on the opening whenever there was no close.
// Written down at the time as _"a floor with no close keeps the opening, which is all the app knows
// about it"_ — and the opening is precisely what a floor says you may arrive AFTER.
describe('dayJourney — a leg into an open floor has no fit to fail (ADR-0206 §AJ1)', () => {
  const AT = (hhmm: string) => Date.parse(`2026-09-11T${hhmm}:00Z`);
  /** The reported shape: land 23:20, hotel open from 15:00, a 1:42 drive to it. */
  const landingIntoTheHotel = {
    departAfterMs: AT('23:20'),
    arriveByMs: AT('15:00'),
    travelSeconds: 102 * 60,
    nowMs: AT('09:00'),
    flexibleArrival: true,
  };

  it('does not call the drive to tonight’s hotel impossible', () => {
    const j = dayJourney(landingIntoTheHotel)!;
    expect(j.arm).not.toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(j.overrunSeconds).toBeNull();
    // No window to be free inside, so there is no free-time half either — the same structural
    // absence the day's first leg out of a bed reports (§AF3).
    expect(j.free).toBeNull();
  });

  it('says when you will get there instead', () => {
    const j = dayJourney(landingIntoTheHotel)!;
    expect(j.leaveByMs).toBeNull();
    expect(j.arriveAtMs).toBe(AT('23:20') + 102 * 60 * 1000);
    expect(j.arrivesAfterClose).toBe(false);
  });

  // The floor's own hour must not retire the row either: at 20:00 you are in the air, and a block
  // that has gone quiet is a block that has stopped saying when you land.
  it('is not a record just because the floor’s hour has passed', () => {
    const j = dayJourney({ ...landingIntoTheHotel, nowMs: AT('20:00') })!;
    expect(j.arm).toBe(DAY_JOURNEY_ARM.AHEAD);
    expect(j.arriveAtMs).not.toBeNull();
  });

  it('is a record once the predicted arrival has gone by', () => {
    const j = dayJourney({ ...landingIntoTheHotel, nowMs: AT('23:20') + 110 * 60 * 1000 })!;
    expect(j.arm).toBe(DAY_JOURNEY_ARM.PAST);
  });

  // A CLOSED window is untouched: it has a real deadline, and §AI1 measures the fit to it.
  it('still measures the fit on a window that shuts', () => {
    const j = dayJourney({
      departAfterMs: AT('16:00'),
      arriveByMs: AT('17:00'),
      windowClosesMs: AT('17:30'),
      travelSeconds: 4 * 60 * 60,
      nowMs: AT('09:00'),
      flexibleArrival: true,
    })!;
    expect(j.arm).toBe(DAY_JOURNEY_ARM.OVERRUNS);
    expect(j.arrivesAfterClose).toBe(true);
  });
});

// ── THE DAY'S OWN VERDICT (ADR-0206 §V1.7 / §AN) ─────────────────────────────────────────
//
// `dayFeasibility` rolls up the ARMS the rows render rather than re-measuring the day's stops,
// which is the decision §AN records: every rule about whether a leg can be infeasible lives in
// `dayJourney` and nowhere else, so a verdict built from raw stops calls a day impossible over
// legs its own rows say are fine. These specs are that guarantee, stated as behaviour.
describe('dayFeasibility — a day says no only on evidence', () => {
  /** ⁦08:00⁩ + n minutes, so the fixtures read as a morning rather than as epoch arithmetic. */
  const AT = (min: number) => Date.parse('2026-07-12T08:00:00Z') + min * MIN;
  /** A leg with a real window, so it has a `fit` to report. */
  const leg = (holeMin: number, travelMin: number) =>
    dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(holeMin),
      travelSeconds: travelMin * 60,
      nowMs: AT(-60),
    });

  it('overruns, and reports how many legs and their whole shortfall', () => {
    const v = dayFeasibility([leg(30, 60), leg(120, 40), leg(60, 100)]);
    expect(v.fit).toBe('overruns');
    expect(v.legs).toBe(2);
    // ⁦30⁩ short and ⁦40⁩ short. The tolerance decides whether to speak, never what is said.
    expect(v.overrunSeconds).toBe((30 + 40) * 60);
  });

  it('fits when every measured leg fits', () => {
    const v = dayFeasibility([leg(120, 40), leg(90, 20)]);
    expect(v.fit).toBe('fits');
    expect(v.legs).toBe(0);
    expect(v.overrunSeconds).toBe(0);
  });

  // §D4's own case, and the reason the answer is a discriminant rather than a boolean: a day
  // nothing could be measured on is NOT a day that fits, even though both render nothing.
  it('is UNKNOWN, not FITS, when nothing was measurable', () => {
    expect(dayFeasibility([null, null]).fit).toBe('unknown');
    expect(dayFeasibility([]).fit).toBe('unknown');
  });

  // A leg with a duration but no WINDOW — the day's first leg out of a bed (§AF3) — was never
  // asked the question, so it cannot answer it either way.
  it('does not read a leg with no window as a leg that fits', () => {
    const noWindow = dayJourney({ arriveByMs: AT(120), travelSeconds: 40 * 60, nowMs: AT(-60) });
    expect(noWindow).not.toBeNull();
    expect(noWindow!.free).toBeNull();
    expect(dayFeasibility([noWindow]).fit).toBe('unknown');
  });

  // **The gate that would have been re-committed by measuring raw stops** (§AJ1): an open
  // check-in floor is an hour you may arrive AFTER, so nothing can fail to fit inside it. The row
  // already knows this; the day inherits it by reading the row.
  it('does not flag a leg into an open floor, however long the drive', () => {
    const intoAFloor = dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(30),
      travelSeconds: 6 * 60 * 60,
      nowMs: AT(-60),
      flexibleArrival: true,
    });
    expect(dayFeasibility([intoAFloor]).fit).not.toBe('overruns');
  });

  // And the same for a hole that is behind you: `dayJourney` checks PAST first, so a finished
  // day is quiet however badly its legs ran — advice nobody can act on is what §D7 exists to
  // avoid, and the day-level row would be the loudest possible form of it.
  it('is quiet about a day that has already happened', () => {
    const behindYou = dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(30),
      travelSeconds: 90 * 60,
      nowMs: AT(600),
    });
    expect(behindYou!.arm).toBe(DAY_JOURNEY_ARM.PAST);
    expect(dayFeasibility([behindYou]).fit).not.toBe('overruns');
  });
});

// ── HOW FAR THE DAY GOES (ADR-0206 §V1.9 / §AP) ──────────────────────────────────────────
//
// The asymmetry is the whole derivation and a naive build gets it wrong in both directions, so
// every spec here is about which legs each half counts. `dayTravelTotal` rolls up the SAME
// journeys the rows drew, for `dayFeasibility`'s reason above.
describe('dayTravelTotal — the kilometres cover every leg, the minutes only the timed ones', () => {
  const AT = (min: number) => Date.parse('2026-07-12T08:00:00Z') + min * MIN;
  /** An ordinary routed leg: a real estimate, so it has both halves. */
  const routed = (travelMin: number, meters: number | null) =>
    dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(travelMin + 60),
      travelSeconds: travelMin * 60,
      distanceMeters: meters,
      nowMs: AT(-60),
    });
  /** A leg somebody declared תחב״צ: distance, no duration (§AA4 / §AM6). */
  const declared = (meters: number) =>
    dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(90),
      travelSeconds: null,
      distanceMeters: meters,
      declared: true,
      nowMs: AT(-60),
    });

  it('adds every leg up when the whole day is routed', () => {
    const total = dayTravelTotal([routed(18, 1_400), routed(30, 1_800)], 0);
    expect(total.distanceMeters).toBe(3_200);
    expect(total.travelSeconds).toBe(48 * 60);
  });

  // **The crux.** A mixed-mode day is the ordinary one since M8b: the declared leg's kilometres
  // are counted and its minutes are not — dropping it from both understates a day somebody is
  // genuinely crossing, and inventing minutes prints the walking number the declaration exists
  // to suppress.
  it('counts a declared leg in the distance and not in the duration', () => {
    const total = dayTravelTotal([routed(18, 1_400), declared(9_000), routed(30, 1_800)], 0);
    expect(total.distanceMeters).toBe(12_200);
    expect(total.travelSeconds).toBe(48 * 60);
  });

  // A day of declared legs travels a real distance for no duration this app may state.
  it('answers a distance with no duration when every leg is declared', () => {
    const total = dayTravelTotal([declared(2_700), declared(9_000)], 0);
    expect(total.distanceMeters).toBe(11_700);
    expect(total.travelSeconds).toBeNull();
  });

  // §D4: absence is silence, never a zero — the reader must not be able to tell "not computed"
  // from "not computable", and `0 ק״מ` is exactly that tell.
  it('is null on both halves rather than zero when nothing was measured', () => {
    expect(dayTravelTotal([null, null], 0)).toEqual({
      distanceMeters: null,
      travelSeconds: null,
      partial: false,
    });
    expect(dayTravelTotal([], 0)).toEqual({
      distanceMeters: null,
      travelSeconds: null,
      partial: false,
    });
  });

  // A hole that renders no block contributes nothing, which is what makes the header and the
  // list describe one day: an estimate the provider refused is a leg neither of them counts.
  it('ignores a hole that drew no journey', () => {
    const unrouted = dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(90),
      travelSeconds: null,
      nowMs: AT(-60),
    });
    expect(unrouted).toBeNull();
    expect(dayTravelTotal([unrouted, routed(18, 1_400)], 0).distanceMeters).toBe(1_400);
  });

  // An estimate that carries no distance still carries a duration, and the halves are counted
  // independently rather than gated on each other.
  it('counts a duration whose leg reported no distance', () => {
    const total = dayTravelTotal([routed(18, 1_400), routed(12, null)], 0);
    expect(total.distanceMeters).toBe(1_400);
    expect(total.travelSeconds).toBe(30 * 60);
  });

  // ── AND WHAT THE ROLL-UP CANNOT SEE (ADR-0206 §AT2) ────────────────────────────────────
  //
  // Reading the journeys is what keeps the header and the list describing one day (§AP2), and
  // its cost is that a hole with an unplaced end is invisible here — so a day of five hops where
  // two run through an event nobody gave a place prints the three it could measure AS IF they
  // were the day. That is not §D4's silence: the line is present and reads complete.
  it('is a FLOOR when a hole had an end nobody placed', () => {
    const total = dayTravelTotal([routed(18, 1_400), routed(30, 1_800)], 2);
    expect(total.partial).toBe(true);
    // The numbers are unchanged — what a floor changes is the claim, not the arithmetic. An
    // unmeasurable leg has no distance to add, so inventing one here would be §D4's own failure.
    expect(total.distanceMeters).toBe(3_200);
    expect(total.travelSeconds).toBe(48 * 60);
  });

  // The distinction the flag turns on: a leg still WARMING will gain its number and says nothing
  // (§D4), while a leg with an unplaced end never will. Both draw no block; only one is a
  // permanent hole in what the total covers, and `unplacedLegs` counts that one alone.
  it('is not a floor merely because a hole drew no journey', () => {
    const pending = dayJourney({
      departAfterMs: AT(0),
      arriveByMs: AT(90),
      travelSeconds: null,
      nowMs: AT(-60),
    });
    expect(dayTravelTotal([pending, routed(18, 1_400)], 0).partial).toBe(false);
  });

  // A day nothing could be measured on stays silent whether or not the holes were placeable —
  // the component renders nothing without a distance, so the flag has nothing to qualify.
  it('reports the floor even where there is nothing to state', () => {
    expect(dayTravelTotal([], 3)).toEqual({
      distanceMeters: null,
      travelSeconds: null,
      partial: true,
    });
  });
});

// **A STATED DEPARTURE IS NEVER LATER THAN THE ARRIVAL IT IS COUNTED BACK FROM** (ADR-0206 §AQ1).
//
// The invariant nothing asserted, written after a field report where the day row advised
// `יציאה 20:31` into an event that starts at 20:00. It was NOT this derivation — the cause was the
// ZONE the clock was printed in (§AQ1, and `DayJoinRow.zones.test.tsx` is the spec that would have
// caught it) — and the guard belongs here anyway, at the level where the number is made: it is
// cheap, it is the property every arm of this function is supposed to have, and the only reason
// nobody had written it down is that it had always happened to be true.
//
// Swept over the arms rather than asserted once, because the two that state a clock reach it by
// different routes: the ordinary one counts back from the deadline, and the clamped one is pulled
// forward to the origin's own end (§AJ2) — which is exactly the arm an off-by-one would land in.
describe('dayJourney — the departure it states can never be after the arrival (ADR-0206 §AQ1)', () => {
  const AT = (hhmm: string) => Date.parse(`2026-08-27T${hhmm}:00Z`);
  /** Every shape in this file that produces a leave-by, plus the reported one. `travelSeconds`
   *  spans "comfortably fits" to "does not fit at all" so the clamp and the shortfall are both in. */
  const cases = [
    {
      name: 'the reported leg — a 60-minute hole, a 23-minute drive',
      departAfterMs: AT('19:00'),
      arriveByMs: AT('20:00'),
      travelSeconds: 1403,
    },
    {
      name: 'a leg with hours to spare',
      departAfterMs: AT('12:00'),
      arriveByMs: AT('16:00'),
      travelSeconds: 20 * 60,
    },
    {
      name: 'a leg whose buffer does not fit, so the departure is clamped',
      departAfterMs: AT('16:40'),
      arriveByMs: AT('17:00'),
      travelSeconds: 22 * 60,
    },
    {
      name: 'a leg with no origin to clamp against',
      arriveByMs: AT('20:00'),
      travelSeconds: 40 * 60,
    },
    {
      name: 'a leg that does not fit its hole',
      departAfterMs: AT('19:45'),
      arriveByMs: AT('20:00'),
      travelSeconds: 23 * 60,
    },
  ];
  for (const { name, ...input } of cases) {
    it(`holds for ${name}`, () => {
      // Read across the day rather than at one instant: the arms are keyed on the clock, so a
      // single `nowMs` would exercise one of them and call the invariant proven.
      for (const hhmm of ['06:00', '18:00', '19:30', '19:50', '20:30', '23:00']) {
        const j = dayJourney({ ...input, nowMs: AT(hhmm) });
        if (!j || j.leaveByMs === null) continue;
        expect(j.leaveByMs).toBeLessThanOrEqual(input.arriveByMs);
      }
    });
  }
});

// **THE ARRIVAL IS THE ONE THE STATED DEPARTURE IMPLIES** (ADR-0206 §AR1).
//
// Reported off the deploy: _"the transit rows should also display the arrival time (if you take off
// at the suggested time) so then we immediately know why they tell us to take off at that time."_
//
// **The parenthesis is the whole spec.** There are two arrivals a leg can name and they are not the
// same number: `departAfterMs + travel` is the earliest you could be there, and
// `leaveByMs + travel` is where the departure the row is advising actually lands. Only the second
// explains the clock beside it, and the first is what this used to compute — so a spec that merely
// asserted "an arrival is present" would have passed on the wrong one.
describe('dayJourney — the arrival explains the departure beside it (ADR-0206 §AR1)', () => {
  const AT = (hhmm: string) => Date.parse(`2026-08-27T${hhmm}:00Z`);

  it('lands the buffer before the deadline, not the moment the previous row ends', () => {
    const j = dayJourney({
      departAfterMs: AT('12:00'),
      arriveByMs: AT('14:40'),
      travelSeconds: 40 * 60,
      nowMs: AT('12:10'),
    })!;
    expect(j.leaveByMs).toBe(AT('13:55'));
    // `13:55 + 40` — the departure it states, carried forward.
    expect(j.arriveAtMs).toBe(AT('14:35'));
    // NOT `12:00 + 40`, which is the earliest you could be there and explains nothing.
    expect(j.arriveAtMs).not.toBe(AT('12:40'));
  });

  // A flexible destination states no departure, so the earliest you could be there IS the answer —
  // the behaviour §AI1 shipped, unchanged, and the one case where the old formula was right.
  it('falls back to the origin’s own end where the app advises no departure', () => {
    const j = dayJourney({
      departAfterMs: AT('12:00'),
      arriveByMs: AT('14:40'),
      travelSeconds: 40 * 60,
      nowMs: AT('12:10'),
      flexibleArrival: true,
    })!;
    expect(j.leaveByMs).toBeNull();
    expect(j.arriveAtMs).toBe(AT('12:40'));
  });

  // **The one arm that must stay silent** (ADR-0208 §2). The instant is derived from the end of a
  // stop the group said they did not go to, so stating it would be exactly the claim this arm
  // withholds — in the confident voice of a prediction.
  it('says nothing at all where the plan’s claim about where you are has been denied', () => {
    const j = dayJourney({
      departAfterMs: AT('12:00'),
      arriveByMs: AT('14:40'),
      travelSeconds: 40 * 60,
      nowMs: AT('12:10'),
      claimDenied: true,
    })!;
    expect(j.leaveByMs).toBeNull();
    expect(j.arriveAtMs).toBeNull();
  });
});
