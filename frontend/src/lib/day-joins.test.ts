import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  TRAVEL_BUFFER_SECONDS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import {
  DAY_JOURNEY_ARM,
  connectionStops,
  dayBlocks,
  dayJourney,
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
    expect(narrowGapForTravel(gap, journeyFreeing(120 * 60), TZ)).toBe(gap);
  });

  // …and the margin, which is where the control was handing out a slot the walk eats.
  it('caps the slot at what is actually free', () => {
    const narrowed = narrowGapForTravel(gapAt('14:00', '15:00'), journeyFreeing(30 * 60), TZ);
    expect(narrowed.fill.end).toBe('14:30');
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
