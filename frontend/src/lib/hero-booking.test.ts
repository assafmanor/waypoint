import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_SOURCE, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import {
  ARRIVAL_EMPHASIS_MIN,
  CHECKIN_GRACE_MIN,
  CHECKOUT_LEAD_MIN,
  DEPARTURE_LEAD_MIN,
  deriveHeroBooking,
} from './hero-booking';

const OFF = '+09:00';
const DATE = '2026-07-07';
const at = (time: string, date = DATE) => `${date}T${time}:00${OFF}`;
const ms = (time: string, date = DATE) => Date.parse(at(time, date));
const MIN = 60_000;

let seq = 0;
function ev(partial: Partial<TripEvent>): TripEvent {
  return {
    id: partial.id ?? `ev-${++seq}`,
    tripId: 't',
    date: DATE,
    title: partial.title ?? 'x',
    kind: EVENT_KIND.HARD,
    status: EVENT_STATUS.PLANNED,
    source: EVENT_SOURCE.MANUAL,
    sortOrder: 1,
    createdAt: at('00:00'),
    updatedAt: at('00:00'),
    updatedBy: 'u',
    ...partial,
  };
}

const hotel = (over: Partial<TripEvent> = {}) =>
  ev({
    id: 'hotel',
    category: 'lodging',
    startsAt: at('15:00'),
    endsAt: at('11:00', '2026-07-10'),
    endDate: '2026-07-10',
    ...over,
  });

const flight = (over: Partial<TripEvent> = {}) =>
  ev({ id: 'flight', category: 'transport', startsAt: at('09:00'), endsAt: at('11:00'), ...over });

describe('deriveHeroBooking — hotel check-in (grace after)', () => {
  const h = hotel();
  it('surfaces before check-in on the check-in day', () => {
    expect(deriveHeroBooking([h], ms('08:00'), DATE).kind).toBe('transition-checkin');
  });
  it('still surfaces exactly at the end of the grace window', () => {
    const r = deriveHeroBooking([h], ms('15:00') + CHECKIN_GRACE_MIN * MIN, DATE);
    expect(r.kind).toBe('transition-checkin');
    expect(r.labelKey).toBe('checkIn');
  });
  it('stops just after the grace window (recedes to the strip)', () => {
    expect(deriveHeroBooking([h], ms('15:00') + CHECKIN_GRACE_MIN * MIN + MIN, DATE).kind).toBe(
      'none',
    );
  });
  it('does not surface as check-in on a different day', () => {
    expect(deriveHeroBooking([h], ms('08:00'), '2026-07-08').kind).toBe('none');
  });
});

describe('deriveHeroBooking — hotel check-out (lead before)', () => {
  const checkoutDay = '2026-07-10';
  const h = hotel();
  const today = checkoutDay;
  const checkout = ms('11:00', checkoutDay);
  it('surfaces exactly at the lead edge', () => {
    const r = deriveHeroBooking([h], checkout - CHECKOUT_LEAD_MIN * MIN, today);
    expect(r.kind).toBe('transition-checkout');
    expect(r.labelKey).toBe('checkOut');
  });
  it('does not surface just before the lead edge', () => {
    expect(deriveHeroBooking([h], checkout - CHECKOUT_LEAD_MIN * MIN - MIN, today).kind).toBe(
      'none',
    );
  });
  it('does not surface after check-out has passed', () => {
    expect(deriveHeroBooking([h], checkout + MIN, today).kind).toBe('none');
  });
});

describe('deriveHeroBooking — flight departure / in-transit / arrival', () => {
  const f = flight(); // 09:00 → 11:00
  const dep = ms('09:00');
  const arr = ms('11:00');

  it('surfaces departure exactly at the lead edge', () => {
    const r = deriveHeroBooking([f], dep - DEPARTURE_LEAD_MIN * MIN, DATE);
    expect(r.kind).toBe('transition-departure');
    expect(r.labelKey).toBe('departure');
  });
  it('does not surface departure before the lead edge', () => {
    expect(deriveHeroBooking([f], dep - DEPARTURE_LEAD_MIN * MIN - MIN, DATE).kind).toBe('none');
  });
  it('is in-transit mid-flight (outside the arrival window)', () => {
    expect(deriveHeroBooking([f], arr - ARRIVAL_EMPHASIS_MIN * MIN - MIN, DATE).kind).toBe(
      'in-transit',
    );
  });
  it('emphasizes arrival inside the arrival window', () => {
    const r = deriveHeroBooking([f], arr - ARRIVAL_EMPHASIS_MIN * MIN + MIN, DATE);
    expect(r.kind).toBe('transition-arrival');
    expect(r.labelKey).toBe('arrival');
  });
  it('is none after the flight has landed', () => {
    expect(deriveHeroBooking([f], arr + MIN, DATE).kind).toBe('none');
  });
});

describe('deriveHeroBooking — misc', () => {
  it('is none when no bracketed event is near a transition', () => {
    const dinner = ev({ id: 'd', category: 'food', kind: EVENT_KIND.SOFT, startsAt: at('19:00') });
    expect(deriveHeroBooking([dinner], ms('12:00'), DATE).kind).toBe('none');
  });

  it('prefers the more urgent transition when several qualify (arrival over check-in)', () => {
    const f = flight({ startsAt: at('10:30'), endsAt: at('11:00') }); // arriving 11:00
    const h = hotel({ startsAt: at('11:30') }); // check-in soon after
    const r = deriveHeroBooking([f, h], ms('10:50'), DATE); // in the arrival window
    expect(r.kind).toBe('transition-arrival');
    expect(r.event?.id).toBe('flight');
  });
});
