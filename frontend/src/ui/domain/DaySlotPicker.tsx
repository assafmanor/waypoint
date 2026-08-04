// **The day is the time picker** (ADR-0161 §4).
//
// Every surface that needed a time asked for a clock: `TimeField` is a 96-row 15-minute
// list you scroll, and the duration is a second panel after it. Four taps and a scroll for
// one event — and the wrong question, because nobody plans in absolute clock. They plan
// relative: after breakfast, before the flight, two hours.
//
// So the rows here are the day's own entries, and each one **shows the clock it computes**.
// You read the time instead of picking it, and `שעה מדויקת…` is the way to ADR-0036's
// setter for when the position is not the point.
//
// **This is a generalisation, not an addition.** Two one-offs did half of it each and are
// gone: `ResolveSheet`'s `אחרי`/`לפני <title> · <time>` pair, and `BuilderRow`'s `הזז` step,
// which listed the soft peers with their times and then handed an id to a slot permutation.
// Its geometry is `.resolve-opt`'s, verbatim, because that is one of the two it replaces.
//
// `ui/domain/`: presentational, every value via props, no `state`/screen imports. It renders
// the OPTIONS it is given rather than deriving them — `lib/day-positions.ts` is where a day
// becomes a list of positions, so the sheet cannot disagree with the drag about a slot.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import type { GapDefaults } from '../../lib/gaps';
import './day-slot-picker.css';

export interface DaySlotOption {
  /** Stable per position — `DayPosition.key`. */
  key: string;
  /** What this position is, already in words: `אחרי מוזיאון`, `בתחילת היום`. A node rather
   *  than a string so a row's title can render through `TitleLabel` (a flight reads as its
   *  route, ADR-0059 §3). */
  label: ReactNode;
  /** The clock this position resolves to, e.g. `12:30`. Shown, never asked for. */
  time: string;
  /** How much free time is here, when it is worth saying. Absent on a position with none —
   *  which is most of them, and saying "free 0 min" would be noise. */
  free?: string;
  /** The slot a pick lands on, handed straight back to the caller. */
  fill: GapDefaults;
}

export function DaySlotPicker({
  sub,
  options,
  now,
  onPick,
  onExact,
  onOtherDay,
}: {
  /** The question, in the host's words — "לאיזה מקום ביום?" for a move. */
  sub: string;
  options: DaySlotOption[];
  /** `עכשיו`, offered only while the day on screen IS today (the host decides that; this
   *  component has no clock). Same shape as any other option, drawn first and marked. */
  now?: DaySlotOption;
  /** The option that was picked, not just its slot: a host that needs more about the position
   *  than the slot — how much room is there, to cap a category's length against — joins back
   *  to its own `DayPosition` by `key`. Keeps this component's model presentational. */
  onPick: (option: DaySlotOption) => void;
  /** The way out to ADR-0036's start+duration setter. */
  onExact: () => void;
  /** …and to another day, which is what made a cross-day move drag-only before ADR-0161. */
  onOtherDay?: () => void;
}) {
  const row = (option: DaySlotOption, isNow = false) => (
    <button
      key={option.key}
      type="button"
      className={'slotpick-opt' + (isNow ? ' now' : '')}
      onClick={() => onPick(option)}
    >
      <span className="ttl">
        {option.label}
        {option.free && <span className="free">{option.free}</span>}
      </span>
      <span className="tm" dir="auto">
        {option.time}
      </span>
    </button>
  );

  return (
    <div className="slotpick">
      <div className="slotpick-sub">{sub}</div>
      {now && row(now, true)}
      {options.map((option) => row(option))}
      {onOtherDay && (
        <button type="button" className="slotpick-opt escape" onClick={onOtherDay}>
          <Icon name="calendar" /> {t.planDay.slotOtherDay}
        </button>
      )}
      <button type="button" className="slotpick-opt escape" onClick={onExact}>
        <Icon name="clock" /> {t.planDay.slotExactTime}
      </button>
    </div>
  );
}
