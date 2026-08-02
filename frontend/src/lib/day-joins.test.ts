import { describe, expect, it } from 'vitest';
import {
  BOOKING_TYPE,
  EVENT_KIND,
  EVENT_STATUS,
  type Booking,
  type TripEvent,
} from '@waypoint/shared';
import { connectionStops, dayBlocks, joinBetween } from './day-joins';
import { bookingWhen } from './booking-journey';
import { mergeDayEntries } from './day-entries';
import { buildTimeTree } from './time';

const TZ = 'Asia/Tokyo';
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
    expect(joinBetween(lunch, show, ctxFor([lunch, show]))).toEqual({ kind: 'gap', minutes: 160 });
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
    expect(blocks[1].entries[0].join).toEqual({ kind: 'gap', minutes: 160 });
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

  it('is empty when nothing chains', () => {
    const lunch = ev({ id: 'lunch', startsAt: '2026-07-12T12:30:00+09:00' });
    expect(connectionStops([bLeg1], [lunch], bookingWhen([lunch]))).toEqual([]);
  });
});
