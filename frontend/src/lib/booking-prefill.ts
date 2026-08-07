// **What a booking's schedule OFFERS before you type it** (field reports #4 and #11).
//
// Two rules, both fired from the booking sheet as the schedule is edited, and both
// producing values that are ordinary form state the moment they land — nothing here is
// stored, derived at read time, or able to refuse a save:
//
//  1. **A start's clock is offered when its DAY is first set.** Keyed on the day changing
//     rather than on any edit, which is why this takes the previous leg as well as the
//     next one: firing on every change would make clearing a time impossible, since the
//     clear would empty the field and the offer would put it straight back.
//
//  2. **The end follows the start until the end is touched.** `endTouched` is the same
//     latch `useDerivedField` puts on the icon and the kind — an offer that stops offering
//     the moment a human answers — and the reason it can be ONE flag rather than one per
//     leg is that every type with an offer to make has exactly one leg. A journey, which
//     is the only thing with more, offers nothing (`kind: 'none'`).
//
// **The values are not decided here.** `bookingTimeOffer` carries them, and the three
// kinds it distinguishes are the whole product decision: a convention the world fixed
// (a room from 15:00), a length that makes sense for the type (a meal is 90 minutes), or
// nothing at all — because a flight departs when the airline says, and a guessed
// departure would put a false instant on a hard commitment (ADR-0171 §1).
import {
  bookingSpanDayOffset,
  bookingTimeOffer,
  bookingTypicalMinutes,
  type BookingType,
} from '@waypoint/shared';
import { addDays, toHHMM, toMin } from './time';
import { MINUTES_PER_DAY } from '../constants';
import type { LegTimes } from './booking-draft';

const dayOf = (v: string) => v.split('T')[0] ?? '';
const timeOf = (v: string) => v.split('T')[1] ?? '';
/** The form's own `YYYY-MM-DDTHH:mm`, in which a day alone is a valid partial (`WhenField`). */
const join = (day: string, time: string) => (day ? (time ? `${day}T${time}` : day) : '');

/** A wall-clock day+time moved forward by N minutes, rolling into the following days as
 *  it needs to. Deliberately zone-free: these are the wall-clock strings the form holds,
 *  and the save is what resolves each end in its own endpoint's zone (ADR-0107). */
function plusMinutes(day: string, time: string, minutes: number): { day: string; time: string } {
  const total = toMin(time) + minutes;
  return {
    day: addDays(day, Math.floor(total / MINUTES_PER_DAY)),
    time: toHHMM(total % MINUTES_PER_DAY),
  };
}

/** The end this type offers for a given start, or `null` when it offers none. A start
 *  with no day answers nothing — there is no anchor to hang an end on. */
export function offeredEnd(type: BookingType, start: string): string | null {
  const day = dayOf(start);
  if (!day) return null;
  const offer = bookingTimeOffer(type);
  if (offer.kind === 'convention') return join(addDays(day, bookingSpanDayOffset(type)), offer.end);
  if (offer.kind === 'none') {
    // No clock may be guessed, but the DAY still may (field report #4): an end opens on
    // the day its own type's span lands on — the same day for every journey.
    return join(addDays(day, bookingSpanDayOffset(type)), '');
  }
  const time = timeOf(start);
  if (!time) return join(day, '');
  const moved = plusMinutes(day, time, bookingTypicalMinutes(type));
  return join(moved.day, moved.time);
}

/** **The leg the user just produced, with this type's offers filled in around it.**
 *
 *  `endTouched` is the caller's latch: once the traveller has said what the end is, this
 *  never moves it again — so a check-out set to the 14th survives the check-in moving to
 *  the 12th, and the stay is theirs to shorten. */
export function offerLegTimes(
  type: BookingType,
  previous: LegTimes,
  next: LegTimes,
  endTouched: boolean,
): LegTimes {
  const startDay = dayOf(next.start);
  const offer = bookingTimeOffer(type);
  // The start's clock, offered once — on the edit that first gives this leg a day.
  const start =
    startDay && startDay !== dayOf(previous.start) && !timeOf(next.start) && offer.kind !== 'none'
      ? join(startDay, offer.start)
      : next.start;

  if (endTouched || start === previous.start) return { start, end: next.end };
  return { start, end: offeredEnd(type, start) ?? next.end };
}

/** The same two rules over the DAY variant's three fields (`date` + two clock times), for
 *  the types whose schedule is a point on a day rather than a span. The end can roll past
 *  midnight here exactly as it always could: on a single day an end BEFORE its start is
 *  the overnight tail (ADR-0037), which is why this needs no second date. */
export function offerDayTimes(
  type: BookingType,
  previous: { date: string; start: string; end: string },
  next: { date: string; start: string; end: string },
  endTouched: boolean,
): { date: string; start: string; end: string } {
  const offer = bookingTimeOffer(type);
  if (offer.kind === 'none') return next;
  const start = next.date && next.date !== previous.date && !next.start ? offer.start : next.start;

  if (endTouched || !start || start === previous.start) return { ...next, start };
  const end =
    offer.kind === 'duration'
      ? toHHMM((toMin(start) + bookingTypicalMinutes(type)) % MINUTES_PER_DAY)
      : offer.end;
  return { ...next, start, end };
}
