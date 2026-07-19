// Type-aware timing labels for a booking's linked event (ADR-0053 refinement):
// a flight reads המראה/נחיתה, a hotel צ׳ק-אין/צ׳ק-אאוט, other transport
// יציאה/הגעה, an activity התחלה/סיום. Shared by the detail view, the merged edit
// sheet, and the Index row so the wording never drifts between them.
import {
  BOOKING_TYPE,
  eventDurationUnit,
  type BookingType,
  type TripEvent,
} from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';
import { todayInTz } from './time';
import { dayPhrase, nightPhrase } from './hebrew';
import { t } from '../i18n/he';

/** Hours+minutes as a phrase, reusing the event picker's duration wording so the
 *  words never drift ("5:45 שע׳" / "שעתיים" / "45 דק׳"). */
function hoursPhrase(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return t.eventForm.durHoursMinutes(h, m);
  if (h)
    return h === 1
      ? t.eventForm.durHour
      : h === 2
        ? t.eventForm.durTwoHours
        : t.eventForm.durHours(h);
  return t.eventForm.durMinutes(m);
}

/** Calendar-day difference between two YYYY-MM-DD strings (UTC-anchored so DST
 *  never shifts a day count). */
const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/** A booking's duration, phrased per its category's unit (ADR-0063 extension) —
 *  the ONE formatter every preview surface (detail view, Index row) reads, so a
 *  new bracketed/ordinary type gets a correct read-out for free:
 *
 *   - transport → hours (a flight reads in hours, even a red-eye that crosses days)
 *   - lodging   → nights (check-in → check-out)
 *   - everything else → auto: hours on one calendar day, days when it spans days
 *
 *  Returns null when there's nothing to measure (no schedule, or a same-day
 *  point with no end). */
export function formatBookingDuration(
  event: Pick<TripEvent, 'category' | 'date' | 'endDate' | 'startsAt' | 'endsAt'>,
  timeZone: string,
): string | null {
  const unit = eventDurationUnit(event);
  const startDay = event.startsAt ? todayInTz(timeZone, new Date(event.startsAt)) : event.date;
  const endDay =
    event.endDate ?? (event.endsAt ? todayInTz(timeZone, new Date(event.endsAt)) : undefined);
  const spanDays = startDay && endDay ? dayDiff(startDay, endDay) : 0;

  if (unit === 'nights') return spanDays > 0 ? nightPhrase(spanDays) : null;
  // Auto: a multi-day span reads in (inclusive) days; a same-day one falls through
  // to the hours branch below.
  if (unit === 'auto' && spanDays >= 1) return dayPhrase(spanDays + 1);

  if (!event.startsAt || !event.endsAt) return null;
  const minutes = Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000);
  return minutes > 0 ? hoursPhrase(minutes) : null;
}

export function timingLabels(type: BookingType): { start: string; end: string } {
  if (type === BOOKING_TYPE.HOTEL) {
    return { start: t.index.form.checkinLabel, end: t.index.form.checkoutLabel };
  }
  if (type === BOOKING_TYPE.FLIGHT) {
    return { start: t.index.form.flightDepartLabel, end: t.index.form.flightArriveLabel };
  }
  if (type === BOOKING_TYPE.TRAIN) {
    return { start: t.index.form.departLabel, end: t.index.form.arriveLabel };
  }
  return { start: t.index.form.startLabel, end: t.index.form.endLabel };
}

/** The label without its trailing emoji — the compact Index row shows the badge
 *  icon already, so the row wants the word alone ("המראה"), not "המראה 🛫". */
export function plainTimingLabel(label: string): string {
  return label.replace(/[\s\u200d\ufe0f\p{Extended_Pictographic}]+$/u, '');
}
