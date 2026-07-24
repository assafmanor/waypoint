// Type-aware timing labels for a booking's linked event (ADR-0053 refinement):
// a flight reads המראה/נחיתה, a hotel צ׳ק-אין/צ׳ק-אאוט, other transport
// יציאה/הגעה, an activity התחלה/סיום. Shared by the detail view, the merged edit
// sheet, and the Index row so the wording never drifts between them.
import {
  BOOKING_TYPE,
  categoryForBookingType,
  eventDurationUnit,
  type BookingType,
  type DurationUnit,
  type TripEvent,
} from '@waypoint/shared';
import { MS_PER_DAY } from '../constants';
import { todayInTz } from './time';
import { formatDuration } from './duration';
import { dayPhrase, nightPhrase } from './hebrew';
import { t } from '../i18n/he';

/** Calendar-day difference between two YYYY-MM-DD strings (UTC-anchored so DST
 *  never shifts a day count). */
const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);

/** The duration unit for a *booking*, keyed on its type rather than the linked
 *  event's category. A booked event's category is icon-overridable (a hotel given
 *  a ⭐ badge lands a non-lodging category on its event, ADR-0038), which would
 *  read the stay in days; the type is the authority. Mirrors `timingLabels`,
 *  which already keys the check-in/out wording on `booking.type`. */
export const bookingDurationUnit = (type: BookingType): DurationUnit =>
  eventDurationUnit({ category: categoryForBookingType(type) });

/** A booking's duration, phrased per its category's unit (ADR-0063 extension,
 *  standardized on the elapsed-time ladder in ADR-0114) — the ONE formatter every
 *  preview surface (detail view, Index row) reads, so a new bracketed/ordinary
 *  type gets a correct read-out for free:
 *
 *   - lodging   → nights (check-in → check-out calendar days)
 *   - transport → hours (a flight reads in hours, even a red-eye that crosses days)
 *   - everything else → auto: the elapsed length on the shared ladder
 *     (minutes → hours → days → weeks → months → years), NOT a calendar-date count
 *     — a 23:00→00:00 booking is an hour, not "יומיים".
 *
 *  Returns null when there's nothing to measure (no schedule, or a same-day
 *  point with no end). */
export function formatBookingDuration(
  event: Pick<TripEvent, 'category' | 'date' | 'endDate' | 'startsAt' | 'endsAt'>,
  timeZone: string,
  unit: DurationUnit = eventDurationUnit(event),
): string | null {
  const startDay = event.startsAt ? todayInTz(timeZone, new Date(event.startsAt)) : event.date;
  const endDay =
    event.endDate ?? (event.endsAt ? todayInTz(timeZone, new Date(event.endsAt)) : undefined);
  const spanDays = startDay && endDay ? dayDiff(startDay, endDay) : 0;

  // Lodging is measured in calendar nights (a stay always crosses days; nights is
  // the traveller's unit), never elapsed hours.
  if (unit === 'nights') return spanDays > 0 ? nightPhrase(spanDays) : null;

  // With both instants, read the true ELAPSED length through the shared ladder
  // (hours pins to hours per ADR-0084; auto ladders up by elapsed time).
  if (event.startsAt && event.endsAt) {
    const minutes = Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000);
    return formatDuration(minutes, unit);
  }

  // A date-only multi-day span has no clock times to measure — an all-day event
  // across N calendar dates reads in those (inclusive) days ("3 ימים").
  if (unit === 'auto' && spanDays >= 1) return dayPhrase(spanDays + 1);
  return null;
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
