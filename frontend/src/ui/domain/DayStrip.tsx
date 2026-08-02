// DayStrip — the header day-strip (design-language: DayStrip). Today keeps an amber anchor
// wherever you browse (Trip mode); a selected past day is a neutral highlight, a
// future day violet (plan-ahead); Plan mode has no "now", so selection is violet
// and empty days show the dashed red-number gap marker. The pill-state logic
// (ADR-0043/0028) is reproduced faithfully; a per-day `letter`/`monthLabel` are
// pre-derived by the caller (locale-aware). Touch targets ≥44px wide.
//
// Presentational only: days + selection + callback via props; no trip-state. The
// anchor slot at the strip's leading edge stays in the header (it's not a pill).
//
// **The month is a divider between pills, not a row above them** (ADR-0149 §6).
// It was a row of its own — ~22px, empty across most of its width — which is a
// row of chrome bought for a caption; inline it also chunks a long trip visually.
// The pill itself is exactly 44×44, weekday letter over the number, so the touch
// floor is met by GEOMETRY rather than by padding around a smaller box.
//
// Auto-scroll: the selected pill is centered in the strip on mount and on every
// selection change, mirroring DayView's now-line centering (ADR-0027/0043) so a
// trip with many days-before never leaves the active pill clipped at the edge.
// This strip's own copy of that effect became `lib/useCenterSelected` once the
// category rows needed the same thing (root rule 8) — it is the shared one now.
import { Fragment } from 'react';
import { useCenterSelected } from '../../lib/useCenterSelected';
import './day-strip.css';

export interface DayStripDay {
  /** ISO date (YYYY-MM-DD) — the pill's identity + onSelect argument. */
  date: string;
  /** Day-of-month, shown in mono (dir=auto). */
  dayOfMonth: string;
  /** Narrow weekday letter (locale-derived by the caller). */
  letter: string;
  /** Month name — drawn as a divider BEFORE the first pill of a new month; omit
   *  otherwise. */
  monthLabel?: string;
  /** Plan-mode empty-day marker (dashed + red number). Ignored in Trip mode. */
  hasEvents?: boolean;
}

export type DayStripMode = 'trip' | 'plan';

export interface DayStripProps {
  days: DayStripDay[];
  /** The active (selected) date. */
  selected: string;
  /** The live day — carries the amber anchor in Trip mode. */
  today: string;
  mode: DayStripMode;
  onSelect: (date: string) => void;
  /** The Map's "all days" scope is active (ADR-0110 §4): no day is singled out,
   *  so the filled selection is suppressed (today keeps its anchor, empty-day
   *  markers stay). Tapping any pill exits all-days at the caller. */
  allScope?: boolean;
  /** A drag is in flight somewhere in the app (`state/drag-state`). The pills then
   *  announce themselves as drop targets with `data-day-pill`, which is what the
   *  drag's hit-test looks for — resting on one switches to that day, so a card or a
   *  row can be carried to a day that isn't on screen (ADR-0116 session-119). Off, they
   *  are ordinary buttons. (Distinct from the builder's own `data-day-drop`, which
   *  marks an EMPTY DAY's drop zone: overloading one attribute for both read as a bug
   *  waiting to happen.) */
  dragging?: boolean;
  /** Which pill the drag is over, so it can show where the drop would land. Comes from
   *  the drag's hit-test, not from the pill: a touch pointer is implicitly captured by
   *  the element the touch started on, so `pointerenter` never fires here mid-drag. */
  overDate?: string | null;
}

/** Pill state classes, faithful to App.tsx's pillClass (ADR-0043/0028). */
function pillClass(
  date: string,
  {
    selected,
    today,
    mode,
    hasEvents,
    allScope,
  }: {
    selected: string;
    today: string;
    mode: DayStripMode;
    hasEvents?: boolean;
    allScope?: boolean;
  },
): string {
  const c = ['wp-daypill'];
  // Under all-days scope no pill is "the selected one", so the filled-selection
  // classes are withheld — the today-anchor (Trip) and empty markers (Plan) stay.
  const isSelected = date === selected && !allScope;
  if (mode === 'trip') {
    if (isSelected) c.push(date === today ? 'on' : date < today ? 'sel-history' : 'sel-future');
    else if (date === today) c.push('today-anchor');
    else c.push(date < today ? 'past' : 'future');
  } else {
    if (isSelected) c.push('on');
    else if (date < selected) c.push('past');
    if (!hasEvents) c.push('empty');
  }
  return c.join(' ');
}

export function DayStrip({
  days,
  selected,
  today,
  mode,
  onSelect,
  allScope,
  dragging,
  overDate,
}: DayStripProps) {
  // Don't force-scroll to a day that isn't visually selected (all-days scope).
  const selectedRef = useCenterSelected<HTMLButtonElement>(selected, { active: !allScope });

  return (
    <div className="wp-daystrip" data-mode={mode}>
      {days.map((d) => (
        <Fragment key={d.date}>
          {d.monthLabel && (
            <div className="wp-monthdiv" aria-hidden="true">
              <i />
              <span>{d.monthLabel}</span>
            </div>
          )}
          <button
            ref={d.date === selected ? selectedRef : undefined}
            type="button"
            className={
              pillClass(d.date, { selected, today, mode, hasEvents: d.hasEvents, allScope }) +
              (dragging && overDate === d.date ? ' drop-over' : '')
            }
            onClick={() => onSelect(d.date)}
            aria-pressed={d.date === selected && !allScope}
            data-day-pill={dragging ? d.date : undefined}
          >
            <span className="l">{d.letter}</span>
            <span className="n" dir="auto">
              {d.dayOfMonth}
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
