// **The day takes a delay** (ADR-0231 §5) — the sheet `מאחרים` opens. What moves and what stays,
// said BEFORE the tap; then a `ChoiceGrid` of delays, and a chip commits on tap the way a
// `DaySlotPicker` row does: two taps, one toast, one undo. The set that moves is
// `lib/late-shift.ts`'s, which is the server ripple's own rule (planned, soft, ahead of now,
// up to the first anchor); this component draws what it was handed and decides nothing.
//
// `+15 … +90`, the stepper's own sign, with the unit in the sentence above: as `15 דק׳ … 90 דק׳`
// the fifth chip scrolled off the sheet at 360 (the mockup's render). The pills are lifted to
// ADR-0017's floor in their own consumer rule (`.late-steps`), as `.category-pills` lifts its
// own — `.choice-pill` ships at ⁦36px⁩ (ADR-0052 §6) and a control whose whole job is one tap has
// nothing else to spend the height on.
import type { TripEvent } from '@waypoint/shared';
import { Sheet } from './Sheet';
import { ChoiceGrid } from './primitives/ChoiceGrid';
import { HardLock } from './HardLock';
import { TitleLabel } from './TitleLabel';
import { DAY_DELAY_STEPS, DOT_SEPARATOR } from '../constants';
import { ltrIsolate } from '../lib/bidi';
import { formatTime } from '../lib/time';
import { t } from '../i18n/he';

export function DelaySheet({
  moved,
  anchor,
  nowLabel,
  tz,
  onPick,
  onClose,
}: {
  /** The rows that will move, in start order (`lateShift().moved`). Never empty: the host does
   *  not offer the control when nothing ahead can move. */
  moved: TripEvent[];
  /** The first commitment ahead, which stays and stops the shift — or none. */
  anchor: TripEvent | null;
  /** The clock, already formatted by the host — this sheet has none of its own. */
  nowLabel: string;
  tz: string;
  onPick: (minutes: number) => void;
  onClose: () => void;
}) {
  const first = moved[0];
  return (
    <Sheet
      title={
        <>
          {t.day.late.title}
          <span className="wp-row-subject" dir="auto">
            {t.common.today} {DOT_SEPARATOR} {nowLabel}
          </span>
        </>
      }
      onClose={onClose}
    >
      <p className="late-what">
        {t.day.late.what(moved.length, first.startsAt ? formatTime(first.startsAt, tz) : '')}
      </p>
      <ChoiceGrid
        layout="pills"
        className="late-steps"
        ariaLabel={t.day.late.title}
        options={DAY_DELAY_STEPS.map((m) => ({
          value: String(m),
          icon: '',
          label: ltrIsolate(`+${m}`),
          ariaLabel: t.day.late.minutes(m),
        }))}
        onChange={(v) => onPick(Number(v))}
      />
      {anchor && (
        <p className="late-anchor">
          <HardLock />
          <span>
            <TitleLabel title={anchor.title} />
            {anchor.startsAt ? ` ${DOT_SEPARATOR} ${formatTime(anchor.startsAt, tz)} ` : ' '}
            {t.day.late.anchorStays}
          </span>
        </p>
      )}
    </Sheet>
  );
}
