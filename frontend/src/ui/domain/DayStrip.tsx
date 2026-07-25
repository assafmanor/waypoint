// DayStrip — the header day-strip (design-language: DayStrip). Horizontal day
// pills currently inline in App.tsx's Header. Today keeps an amber anchor
// wherever you browse (Trip mode); a selected past day is a neutral highlight, a
// future day violet (plan-ahead); Plan mode has no "now", so selection is violet
// and empty days show the dashed red-number gap marker. The pill-state logic
// (ADR-0043/0028) is reproduced faithfully; a per-day `letter`/`monthLabel` are
// pre-derived by the caller (locale-aware). Touch targets ≥44px wide.
//
// Presentational only: days + selection + callback via props; no trip-state. The
// day-scope ribbon under the strip stays in the header (it's not a pill).
//
// Auto-scroll: the selected pill is centered in the strip on mount and on every
// selection change, mirroring DayView's now-line centering (ADR-0027/0043) so a
// trip with many days-before never leaves the active pill clipped at the edge.
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';
import './day-strip.css';

export interface DayStripDay {
  /** ISO date (YYYY-MM-DD) — the pill's identity + onSelect argument. */
  date: string;
  /** Day-of-month, shown in mono (dir=auto). */
  dayOfMonth: string;
  /** Narrow weekday letter (locale-derived by the caller). */
  letter: string;
  /** Month name shown above the first pill of a new month; omit otherwise. */
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
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Don't force-scroll to a day that isn't visually selected (all-days scope).
    if (allScope) return;
    const el = selectedRef.current;
    if (!el) return;
    el.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selected, allScope]);

  return (
    <div className="wp-daystrip" data-mode={mode}>
      {days.map((d) => (
        <div key={d.date} className="wp-daypill-wrap">
          {d.monthLabel && <span className="wp-month-label">{d.monthLabel}</span>}
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
            {d.letter}
            <span className="n" dir="auto">
              {d.dayOfMonth}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
