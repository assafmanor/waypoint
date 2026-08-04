// Type-aware timing labels for a booking's linked event (ADR-0053 refinement):
// a flight reads המראה/נחיתה, a hotel צ׳ק-אין/צ׳ק-אאוט, a hire איסוף/החזרה, other
// transport יציאה/הגעה, an activity התחלה/סיום. Shared by the detail view, the merged
// edit sheet, and the Index row so the wording never drifts between them.
import {
  bookingTypeDurationUnit,
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
 *  which already keys the check-in/out wording on `booking.type`.
 *
 *  A one-line re-export now: the resolution moved into `@waypoint/shared` with ADR-0162,
 *  because a type can disagree with its category's unit (a car hire reads in the days you
 *  hold it, not `transport`'s hours) and that answer belongs beside the profile that
 *  states it. Kept as a name here so the call sites read the same. */
export const bookingDurationUnit = (type: BookingType): DurationUnit =>
  bookingTypeDurationUnit(type);

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

/** The `t.index.form` keys that hold a timing label — narrowed so a typo in the table
 *  below is a compile error rather than an `undefined` label at render. */
type FormLabelKey = {
  [K in keyof typeof t.index.form]: (typeof t.index.form)[K] extends string ? K : never;
}[keyof typeof t.index.form];

/** **The two span-endpoint labels per booking type.** A `Record` rather than the
 *  if-chain this was, because the chain's fall-through was a silent default and one type
 *  was already wrong in it: `transit` reached the generic התחלה/סיום, where a bus or a
 *  ferry departs and arrives exactly like the train one line above (an ADR-0156 miss,
 *  fixed here). Exhaustive by `satisfies`, so the next type has to answer.
 *
 *  Values are read lazily through `timingLabels` — `t` is a module-level object, so a
 *  table built at import time is fine, but keep it in this module: these are the FORM's
 *  labels (glyph included), distinct from the profile's bare i18n keys that the hero and
 *  the day rail read via `eventTransitionKeys`. */
const TIMING_LABELS = {
  hotel: { start: 'checkinLabel', end: 'checkoutLabel' },
  flight: { start: 'flightDepartLabel', end: 'flightArriveLabel' },
  train: { start: 'departLabel', end: 'arriveLabel' },
  transit: { start: 'departLabel', end: 'arriveLabel' },
  // A hire is handed over and handed back — and both ends are a counter, not a platform.
  car: { start: 'pickupLabel', end: 'dropoffLabel' },
  activity: { start: 'startLabel', end: 'endLabel' },
  restaurant: { start: 'startLabel', end: 'endLabel' },
  other: { start: 'startLabel', end: 'endLabel' },
} as const satisfies Record<BookingType, { start: FormLabelKey; end: FormLabelKey }>;

export function timingLabels(type: BookingType): { start: string; end: string } {
  const keys = TIMING_LABELS[type];
  return { start: t.index.form[keys.start], end: t.index.form[keys.end] };
}

/** The label without its trailing emoji — the compact Index row shows the badge
 *  icon already, so the row wants the word alone ("המראה"), not "המראה 🛫". */
export function plainTimingLabel(label: string): string {
  return label.replace(/[\s\u200d\ufe0f\p{Extended_Pictographic}]+$/u, '');
}
