// Type-aware timing labels for a booking's linked event (ADR-0053 refinement):
// a flight reads המראה/נחיתה, a hotel צ׳ק-אין/צ׳ק-אאוט, other transport
// יציאה/הגעה, an activity התחלה/סיום. Shared by the detail view, the merged edit
// sheet, and the Index row so the wording never drifts between them.
import { BOOKING_TYPE, type BookingType } from '@waypoint/shared';
import { t } from '../i18n/he';

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
