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
  ev({
    id: 'flight',
    category: 'transport',
    icon: '✈️',
    startsAt: at('09:00'),
    endsAt: at('11:00'),
    ...over,
  });

const train = (over: Partial<TripEvent> = {}) =>
  ev({
    id: 'train',
    category: 'transport',
    icon: '🚄',
    startsAt: at('09:00'),
    endsAt: at('11:00'),
    ...over,
  });

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
    expect(r.labelKey).toBe('flightDeparture');
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
    expect(r.labelKey).toBe('flightArrival');
  });
  it('is none after the flight has landed', () => {
    expect(deriveHeroBooking([f], arr + MIN, DATE).kind).toBe('none');
  });
});

// **A red-eye, and the report it came from:** _"when the flight (or anything really) crossed
// the day boundary, the hero doesn't recognize it as currently happening and just has the
// landing as the next event."_
//
// The chain that produced it: the booking form sets `endDate` whenever the end lands on a
// later calendar day (`buildSpanSeed`), which makes the flight `isMultiDay`, which — because
// `transport` is `ambientWhenMultiDay` for the sake of the multi-day car hire — makes it
// **ambient**. `classify` then took the ambient branch, which knows only check-in/check-out
// windows, so a flight in the air could at best surface as a check-out-shaped transition
// near its end: the landing, as something upcoming.
//
// The distinction the fix rests on is the one `midSpan` already draws: **ambient is about
// how a span RENDERS across days; a journey is what its middle IS.** An overnight flight is
// both — a backdrop on the day it lands, and a journey you are sitting inside.
describe('deriveHeroBooking — a journey that crosses the day boundary', () => {
  /** 22:00 → 01:15 the next day, `endDate` set exactly as the form would set it. */
  const redEye = (over: Partial<TripEvent> = {}) =>
    flight({
      id: 'red-eye',
      startsAt: at('22:00'),
      endsAt: at('01:15', '2026-07-08'),
      endDate: '2026-07-08',
      ...over,
    });

  it('is in-transit before midnight, on its own day', () => {
    expect(deriveHeroBooking([redEye()], ms('23:00'), DATE).kind).toBe('in-transit');
  });

  // The heart of the report: past midnight the calendar day has rolled, and the flight is
  // still in the air. Nothing about the clock being on the "next" day makes it upcoming.
  it('is still in-transit after midnight, when today is the LANDING day', () => {
    const r = deriveHeroBooking([redEye()], ms('00:10', '2026-07-08'), '2026-07-08');
    expect(r.kind).toBe('in-transit');
    expect(r.event?.id).toBe('red-eye');
  });

  it('emphasizes the arrival inside the landing window, not as a check-out', () => {
    const r = deriveHeroBooking([redEye()], ms('01:00', '2026-07-08'), '2026-07-08');
    expect(r.kind).toBe('transition-arrival');
    expect(r.labelKey).toBe('flightArrival');
  });

  it('is none once it has landed', () => {
    expect(deriveHeroBooking([redEye()], ms('01:20', '2026-07-08'), '2026-07-08').kind).toBe(
      'none',
    );
  });

  it('offers its departure on the lead-up, as any journey does', () => {
    expect(deriveHeroBooking([redEye()], ms('20:00'), DATE).kind).toBe('transition-departure');
  });

  // Any mode, per the owner's "or anything really" — a night train crosses midnight too, and
  // it has no flight glyph to fall back on.
  it('holds for an overnight train as well', () => {
    const nightTrain = train({
      id: 'night-train',
      startsAt: at('23:30'),
      endsAt: at('06:00', '2026-07-08'),
      endDate: '2026-07-08',
    });
    const r = deriveHeroBooking([nightTrain], ms('02:00', '2026-07-08'), '2026-07-08');
    expect(r.kind).toBe('in-transit');
    expect(r.labelKey).toBe('arrival');
  });

  // The other half of the distinction, asserted so the fix cannot be "ignore ambient": a
  // multi-day CAR HIRE is ambient AND held, so its middle stays off the hero exactly as
  // before — it belongs to the mid-stay strip (ADR-0059 §2 / ADR-0163 §4).
  it('leaves a multi-day car hire where it was: not a journey, not on the hero', () => {
    const hire = ev({
      id: 'hire',
      category: 'transport',
      icon: '🚗',
      startsAt: at('09:00'),
      endsAt: at('18:00', '2026-07-10'),
      endDate: '2026-07-10',
    });
    // Mid-hire, two days in, and nothing about it is in transit.
    expect(deriveHeroBooking([hire], ms('12:00', '2026-07-09'), '2026-07-09').kind).toBe('none');
  });

  // And a multi-day STAY is the case the ambient branch was written for.
  it('leaves a multi-day stay on its check-out window', () => {
    const r = deriveHeroBooking([hotel()], ms('09:00', '2026-07-10'), '2026-07-10');
    expect(r.kind).toBe('transition-checkout');
  });
});

describe('deriveHeroBooking — a train reads generic departure / arrival', () => {
  const tr = train(); // 09:00 → 11:00
  it('labels departure by mode, not with flight wording', () => {
    const r = deriveHeroBooking([tr], ms('09:00') - DEPARTURE_LEAD_MIN * MIN, DATE);
    expect(r.kind).toBe('transition-departure');
    expect(r.labelKey).toBe('departure');
  });
  it('labels arrival by mode, not with flight wording', () => {
    const r = deriveHeroBooking([tr], ms('11:00') - ARRIVAL_EMPHASIS_MIN * MIN + MIN, DATE);
    expect(r.kind).toBe('transition-arrival');
    expect(r.labelKey).toBe('arrival');
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

describe('a check-in window on the hero (ADR-0184 §6)', () => {
  const windowed = (extra: Partial<TripEvent> = {}) =>
    ev({
      id: 'stay',
      category: 'lodging',
      date: DATE,
      endDate: '2026-07-10',
      startsAt: at('17:00'),
      endsAt: at('11:00', '2026-07-10'),
      startWindowEnd: at('21:00'),
      ...extra,
    });

  it('holds the hero for the WHOLE window, where the grace would have dropped it', () => {
    // 19:30 is floor + 150min: past CHECKIN_GRACE_MIN, still inside the window.
    expect(CHECKIN_GRACE_MIN).toBeLessThan(150);
    const hero = deriveHeroBooking([windowed()], ms('19:30'), DATE);
    expect(hero.kind).toBe('transition-checkin');
    expect(hero.closesAt).toBe(at('21:00'));
    expect(hero.missed).toBeUndefined();
  });

  it('marks the last hour as closing, and NOT before the window opens', () => {
    expect(deriveHeroBooking([windowed()], ms('20:30'), DATE).closing).toBe(true);
    // 16:00 is before the floor: there is nothing to hurry yet.
    expect(deriveHeroBooking([windowed()], ms('16:00'), DATE).closing).toBe(false);
  });

  it('a closing window outranks a departure three hours out', () => {
    const flight = ev({
      id: 'flight',
      category: 'transport',
      icon: '✈️',
      startsAt: at('22:00'),
      endsAt: at('23:30'),
    });
    const hero = deriveHeroBooking([windowed(), flight], ms('20:30'), DATE);
    expect(hero.event?.id).toBe('stay');
    expect(hero.kind).toBe('transition-checkin');
  });

  it('says the window was MISSED once it shuts — the state the app could not express', () => {
    const hero = deriveHeroBooking([windowed()], ms('21:30'), DATE);
    expect(hero.kind).toBe('transition-checkin');
    expect(hero.missed).toBe(true);
  });

  it('a check-in you actually did is done, not missed', () => {
    const hero = deriveHeroBooking([windowed({ status: EVENT_STATUS.DONE })], ms('21:30'), DATE);
    expect(hero.kind).toBe('none');
  });

  it('leaves a windowless check-in on the grace exactly as it was', () => {
    const plain = windowed({ startWindowEnd: undefined });
    expect(deriveHeroBooking([plain], ms('18:30'), DATE).kind).toBe('transition-checkin');
    // floor + 120min + a minute: gone, and no miss — a bare floor cannot fail.
    const after = deriveHeroBooking([plain], ms('17:00') + (CHECKIN_GRACE_MIN + 1) * MIN, DATE);
    expect(after.kind).toBe('none');
  });
});
