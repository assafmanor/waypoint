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
import './day-strip.css';

export interface DayStripDay {
  /** ISO date (YYYY-MM-DD) — the pill's identity + onSelect argument. */
  date: string;
  /** Day-of-month, shown in mono (dir=ltr). */
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
}

/** Pill state classes, faithful to App.tsx's pillClass (ADR-0043/0028). */
function pillClass(
  date: string,
  {
    selected,
    today,
    mode,
    hasEvents,
  }: { selected: string; today: string; mode: DayStripMode; hasEvents?: boolean },
): string {
  const c = ['wp-daypill'];
  const isSelected = date === selected;
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

export function DayStrip({ days, selected, today, mode, onSelect }: DayStripProps) {
  return (
    <div className="wp-daystrip" data-mode={mode}>
      {days.map((d) => (
        <div key={d.date} className="wp-daypill-wrap">
          {d.monthLabel && <span className="wp-month-label">{d.monthLabel}</span>}
          <button
            type="button"
            className={pillClass(d.date, { selected, today, mode, hasEvents: d.hasEvents })}
            onClick={() => onSelect(d.date)}
            aria-pressed={d.date === selected}
          >
            {d.letter}
            <span className="n" dir="ltr">
              {d.dayOfMonth}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
