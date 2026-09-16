// **A position, said in words** — the `DaySlotOption` a `DayPosition` becomes on every surface
// that lists one (ADR-0161 §4; ADR-0231 §1 made the Trip card its second host).
//
// Written once inside `PlanDay` while the builder's row time was the only host of the picker.
// The Trip card's time button opens the same picker over the same `dayPositions`, so the words
// moved here rather than being written a second time: the two ways to reach a position must
// not name it differently, which is the rule `PlanDay`'s own comment stated about the drag's
// seams and this file states about the two modes.
//
// `ui/domain/`: presentational, no `state`/screen imports. The host hands in the position and
// the free time it has already corrected for the journey into it (`narrowGapForTravel`), so
// the sentence and the fill cannot disagree about one hole (ADR-0206 §V1.1).
import { EVENT_KIND } from '@waypoint/shared';
import { DOT_SEPARATOR, MINUTES_PER_HOUR } from '../../constants';
import { earnsChipAt, type Gap } from '../../lib/gaps';
import { POSITION_AT, type DayPosition } from '../../lib/day-positions';
import { TitleLabel } from '../TitleLabel';
import { t } from '../../i18n/he';
import type { DaySlotOption } from './DaySlotPicker';

/** The three-rung ladder a hole's length reads on: minutes, then whole hours. */
export function gapLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return t.planDay.gapMinutes(minutes);
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours === 1
    ? t.planDay.gapHour
    : hours === 2
      ? t.planDay.gapTwoHours
      : t.planDay.gapHours(hours);
}

/**
 * The option for a position. `slot` is the position's free time once the host has corrected it
 * for the journey into it — what is FREE here, not how long the hole is — and it is both the
 * sentence's number and the fill a pick lands on, so one object answers both (ADR-0206 §AN).
 *
 * `earnsChipAt` on that corrected number, not `earnsChip` on the hole: a 45-minute hole a
 * 40-minute walk eats is not an offer, and the sheet must not list one the day refuses to draw.
 */
export function positionOption(p: DayPosition, slot: Gap): DaySlotOption {
  return {
    key: p.key,
    label:
      p.at === POSITION_AT.AFTER && p.afterEvent ? (
        // The row above, and the one below when it is a HARD anchor: "before the flight" is
        // the more useful half of that pair, and the anchor is what the day is built around.
        <>
          {t.planDay.seamAfter('')}
          <TitleLabel title={p.afterEvent.title} />
          {p.beforeEvent?.kind === EVENT_KIND.HARD && (
            <span className="slotpick-before">
              {DOT_SEPARATOR} {t.planDay.seamBefore('')}
              <TitleLabel title={p.beforeEvent.title} />
            </span>
          )}
        </>
      ) : p.at === POSITION_AT.DAY_END ? (
        t.planDay.seamDayEnd
      ) : p.at === POSITION_AT.WHOLE_DAY ? (
        t.planDay.slotWholeDay
      ) : (
        t.planDay.seamDayStart
      ),
    time: slot.fill.start,
    free: earnsChipAt(slot.minutes) ? t.planDay.slotFree(gapLabel(slot.minutes)) : undefined,
    fill: slot.fill,
  };
}

/** `עכשיו`, as the picker's first row on today (ADR-0231 §1) — ADR-0027 §1's Do-it-now, said
 *  as a position rather than a verb. `slot` is the hole the moment is inside, already opened at
 *  now (`positionsFromNow`). */
export function nowOption(slot: Gap): DaySlotOption {
  return {
    key: 'now',
    label: t.planDay.slotNow,
    time: slot.fill.start,
    free: earnsChipAt(slot.minutes) ? t.planDay.slotFree(gapLabel(slot.minutes)) : undefined,
    fill: slot.fill,
  };
}
