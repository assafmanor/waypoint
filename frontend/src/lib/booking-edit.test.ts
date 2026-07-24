import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type Booking, type Place } from '@waypoint/shared';
import {
  buildEventSeed,
  buildSpanSeed,
  dateOutOfTripRange,
  deleteFlags,
  eventFromBookingSeed,
  findPlaceByName,
  mergeBookingDetails,
} from './booking-edit';

const TZ = 'Asia/Tokyo';
const place = (id: string, name: string): Place => ({
  id,
  tripId: 't1',
  name,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  updatedBy: 'u1',
});

describe('mergeBookingDetails', () => {
  it('writes room/notes/wifi and preserves unrelated detail keys', () => {
    const next = mergeBookingDetails(
      { seatMap: 'x' },
      { room: '512', notes: 'high floor', wifiNetwork: 'Net', wifiPassword: 'pw' },
    );
    expect(next).toEqual({
      seatMap: 'x',
      room: '512',
      notes: 'high floor',
      wifi: { network: 'Net', password: 'pw' },
    });
  });

  it('prunes emptied fields (whitespace counts as empty)', () => {
    const next = mergeBookingDetails(
      { room: '512', notes: 'old', wifi: { network: 'Net' } },
      { room: '  ', notes: '', wifiNetwork: '', wifiPassword: '' },
    );
    expect(next).toBeUndefined();
  });

  it('keeps a partial wifi (network only)', () => {
    expect(mergeBookingDetails(undefined, { wifiNetwork: 'Net' })).toEqual({
      wifi: { network: 'Net', password: undefined },
    });
  });
});

describe('deleteFlags', () => {
  it('delete-both deletes the event with confirm', () => {
    expect(deleteFlags('both')).toEqual({ deleteEvents: true, confirm: true });
  });
  it('unlink keeps the event but still confirms (a hard event is guarded on unlink too)', () => {
    expect(deleteFlags('unlink')).toEqual({ deleteEvents: false, confirm: true });
  });
});

describe('findPlaceByName', () => {
  const places = [place('pl-1', 'Kyoto Station'), place('pl-2', 'Tokyo')];
  it('reuses an existing place by trimmed, case-insensitive name', () => {
    expect(findPlaceByName(places, '  kyoto station ')?.id).toBe('pl-1');
  });
  it('returns undefined for a blank name or no match', () => {
    expect(findPlaceByName(places, '   ')).toBeUndefined();
    expect(findPlaceByName(places, 'Osaka')).toBeUndefined();
  });
});

describe('buildEventSeed', () => {
  it('returns undefined with no date (an index-only booking)', () => {
    expect(buildEventSeed({ date: '', start: '09:00', end: '', kind: 'soft' }, TZ)).toBeUndefined();
  });

  it('builds start/end instants from the trip-timezone date + times', () => {
    const seed = buildEventSeed(
      {
        date: '2026-07-20',
        start: '09:00',
        end: '10:30',
        kind: 'hard',
        icon: '🍜',
        category: 'food',
      },
      TZ,
    );
    expect(seed).toEqual({
      date: '2026-07-20',
      startsAt: '2026-07-20T00:00:00.000Z', // 09:00 +09:00
      endsAt: '2026-07-20T01:30:00.000Z',
      kind: 'hard',
      icon: '🍜',
      category: 'food',
    });
  });

  it('a date with no times is a date-only linked event', () => {
    const seed = buildEventSeed({ date: '2026-07-20', start: '', end: '', kind: 'soft' }, TZ);
    expect(seed).toMatchObject({ date: '2026-07-20', startsAt: undefined, endsAt: undefined });
  });
});

describe('dateOutOfTripRange', () => {
  const START = '2026-07-15';
  const END = '2026-07-20';

  it('blank is in-range (an index-only booking has no schedule to bound)', () => {
    expect(dateOutOfTripRange('', START, END)).toBe(false);
  });

  it('a date or datetime-local inside the trip range is in-range', () => {
    expect(dateOutOfTripRange('2026-07-15', START, END)).toBe(false);
    expect(dateOutOfTripRange('2026-07-20T23:40', START, END)).toBe(false);
  });

  it('a day before the trip start or after the trip end is out of range', () => {
    expect(dateOutOfTripRange('2026-07-14T09:00', START, END)).toBe(true);
    expect(dateOutOfTripRange('2026-07-21T09:00', START, END)).toBe(true);
  });
});

describe('buildSpanSeed', () => {
  it('returns undefined with no start', () => {
    expect(buildSpanSeed({ startAt: '', endAt: '', kind: 'hard' }, TZ)).toBeUndefined();
  });

  it('builds start + end instants and an endDate when the end is a later day', () => {
    const seed = buildSpanSeed(
      { startAt: '2026-07-20T23:40', endAt: '2026-07-21T17:55', kind: 'hard', icon: '✈️' },
      TZ,
    );
    expect(seed).toEqual({
      date: '2026-07-20',
      startsAt: '2026-07-20T14:40:00.000Z', // 23:40 +09:00
      endsAt: '2026-07-21T08:55:00.000Z', // 17:55 +09:00
      endDate: '2026-07-21',
      kind: 'hard',
      icon: '✈️',
      category: undefined,
    });
  });

  it('spans multiple days for a hotel check-in → check-out', () => {
    const seed = buildSpanSeed(
      { startAt: '2026-07-15T15:00', endAt: '2026-07-20T11:00', kind: 'hard' },
      TZ,
    );
    expect(seed?.date).toBe('2026-07-15');
    expect(seed?.endDate).toBe('2026-07-20');
  });

  it('omits endDate for a same-day span', () => {
    const seed = buildSpanSeed(
      { startAt: '2026-07-20T09:00', endAt: '2026-07-20T11:30', kind: 'hard' },
      TZ,
    );
    expect(seed?.endDate).toBeUndefined();
    expect(seed?.date).toBe('2026-07-20');
  });

  it('resolves each leg in its own zone when endTimeZone differs (ADR-0107)', () => {
    // Depart 07:15 Tel Aviv (IDT, +3) → land 11:00 Reykjavik (GMT+0), same date.
    const seed = buildSpanSeed(
      { startAt: '2026-07-24T07:15', endAt: '2026-07-24T11:00', kind: 'hard' },
      'Asia/Jerusalem',
      'Atlantic/Reykjavik',
    )!;
    expect(seed.startsAt).toBe('2026-07-24T04:15:00.000Z'); // 07:15 +03:00
    expect(seed.endsAt).toBe('2026-07-24T11:00:00.000Z'); // 11:00 +00:00
    // True elapsed time is 6h45 — the zone shift is real, not the 3h45 the raw
    // wall-clocks suggest.
    expect((Date.parse(seed.endsAt!) - Date.parse(seed.startsAt!)) / 60000).toBe(6 * 60 + 45);
  });
});

describe('eventFromBookingSeed', () => {
  const booking = (extra: Partial<Booking> = {}): Booking =>
    ({
      id: 'bk-1',
      tripId: 't1',
      type: 'restaurant',
      title: 'מסעדה יקרה',
      source: 'manual',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
      updatedBy: 'u1',
      ...extra,
    }) as Booking;
  const meta = { updatedBy: 'u1', nowIso: '2026-07-02T00:00:00Z' };

  it('mirrors the server derivation: title from booking, category from type, bookingId set', () => {
    const ev = eventFromBookingSeed(
      booking(),
      { id: 'ev-1', date: '2026-07-05', startsAt: '2026-07-05T11:00:00Z' },
      meta,
    );
    expect(ev.id).toBe('ev-1');
    expect(ev.title).toBe('מסעדה יקרה'); // linked event mirrors the booking (ADR-0053)
    expect(ev.bookingId).toBe('bk-1');
    expect(ev.category).toBe('food'); // BOOKING_TYPE_TO_CATEGORY[restaurant]
    expect(ev.kind).toBe(EVENT_KIND.HARD); // seed carried no kind → default
    expect(ev.status).toBe(EVENT_STATUS.PLANNED);
    expect(ev.placeId).toBeUndefined(); // a linked event's place comes from the booking
    expect(ev.startsAt).toBe('2026-07-05T11:00:00Z');
  });

  it('honors an explicit kind/category on the seed', () => {
    const ev = eventFromBookingSeed(
      booking({ type: 'flight' }),
      { id: 'ev-2', date: '2026-07-05', kind: EVENT_KIND.SOFT, category: 'transport' },
      meta,
    );
    expect(ev.kind).toBe(EVENT_KIND.SOFT);
    expect(ev.category).toBe('transport');
  });
});
