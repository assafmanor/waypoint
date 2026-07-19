// Event time-setter (T-054, ADR-0036): a start + a duration. The START is the
// shared TimeField atom (also used by the booking span, so both pickers behave
// identically); the DURATION is event-specific — a Google-Calendar-style list of
// preset gaps, entered as a duration off the start but stored as an absolute
// HH:MM end so the save path (zonedIso) is unchanged. Time is amber (design-
// language: "amber = the clock & the commitment").
//
// Multi-day events are out of scope (ADR-0036 §Scope): every option keeps the end
// on the same calendar day as the start — or, for an afternoon/evening start,
// into the small hours up to the 07:00 overnight cutoff (ADR-0037). An exact end
// at/before the start outside that window is rejected rather than rolled over.
// (Multi-DAY spans are the booking span's job — same TimeField, plus a date per
// endpoint; see WhenField.)
import { useMemo, useState } from 'react';
import { OVERNIGHT } from '../constants';
import { t } from '../i18n/he';
import { TimeField, toMin, toHHMM, centreSelected } from './primitives/TimeField';

export { nearestRoundSlot } from './primitives/TimeField';

const MINUTES_IN_DAY = 1440;
const LAST_MINUTE = MINUTES_IN_DAY - 1; // 23:59 — latest same-day end
const OVERNIGHT_END = OVERNIGHT.END_HOUR * 60; // latest next-day end (07:00)
const OVERNIGHT_MIN_START = OVERNIGHT.MIN_START_HOUR * 60; // earliest overnight start (12:00)
// Latest end a start may reach: same day (23:59), or into the next day up to the
// overnight cutoff (07:00 → 31:00) when the start is afternoon/evening.
const latestEnd = (startMin: number) =>
  startMin >= OVERNIGHT_MIN_START ? MINUTES_IN_DAY + OVERNIGHT_END : LAST_MINUTE;
// Duration presets, coarsening as they grow; filtered per-start to same-day.
const DUR_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

/** Minutes from start to a chosen end, or null when the end isn't valid.
 *  A later same-day end is the gap. An end at/before the start reads as the next
 *  day (overnight, ADR-0037) only when the start is afternoon/evening and the
 *  end lands by the 07:00 cutoff — so 23:00→02:00 is a 3h overnight, while a
 *  05:00→04:00 typo (morning start) is still rejected rather than stretched. */
export function endToDuration(startMin: number, endMin: number): number | null {
  if (endMin > startMin) return endMin - startMin;
  if (startMin >= OVERNIGHT_MIN_START && endMin <= OVERNIGHT_END && endMin < startMin)
    return endMin + MINUTES_IN_DAY - startMin;
  return null;
}

/** Clamp a start+duration end so it never runs past the latest end the start
 *  allows (same day, or the overnight cutoff for an afternoon/evening start). */
export function clampToLatestEnd(startMin: number, endMin: number): number {
  return Math.min(endMin, latestEnd(startMin));
}

function durationPhrase(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return t.eventForm.durHoursMinutes(h, m);
  if (h)
    return h === 1
      ? t.eventForm.durHour
      : h === 2
        ? t.eventForm.durTwoHours
        : t.eventForm.durHours(h);
  return t.eventForm.durMinutes(m);
}

/** Wall-clock HH:MM for an end that may run into the next day (min ≥ 1440). */
const toEndWall = (min: number) => toHHMM(min % MINUTES_IN_DAY);
const isNextDay = (min: number) => min >= MINUTES_IN_DAY;

export function TimePicker({
  start,
  end,
  onChange,
}: {
  start: string; // HH:MM or ''
  end: string; // HH:MM or ''
  onChange: (next: { start: string; end: string }) => void;
}) {
  const [open, setOpen] = useState<null | 'start' | 'dur'>(null);
  const [note, setNote] = useState<string | null>(null);

  const startMin = start ? toMin(start) : null;
  const endMin = end ? toMin(end) : null;
  const duration = startMin != null && endMin != null ? endToDuration(startMin, endMin) : null;
  // The end wraps past midnight when it reads earlier than the start (overnight).
  const endIsNextDay = startMin != null && endMin != null && endMin < startMin && duration != null;

  const durPresets = useMemo(() => {
    if (startMin == null) return [];
    return DUR_PRESETS.filter((d) => startMin + d <= latestEnd(startMin));
  }, [startMin]);

  // Suggest (never mutate) the nearest preset when the current duration is off-grid.
  const suggestDur =
    duration != null && durPresets.length > 0 && !durPresets.includes(duration)
      ? durPresets.reduce((a, b) => (Math.abs(b - duration) < Math.abs(a - duration) ? b : a))
      : null;

  const close = () => {
    setOpen(null);
    setNote(null);
  };

  // Pick a start; preserve the existing duration, clamped to the latest end the
  // new start allows. The TimeField owns closing its own panel.
  const applyStart = (min: number) => {
    let nextEnd = end;
    if (duration != null) nextEnd = toEndWall(clampToLatestEnd(min, min + duration));
    onChange({ start: toHHMM(min), end: nextEnd });
  };

  const commitDuration = (d: number) => {
    if (startMin == null) return;
    onChange({ start, end: toEndWall(clampToLatestEnd(startMin, startMin + d)) });
    close();
  };

  // Exact end → derived duration. Overnight ends (past midnight, ≤ 07:00 from an
  // evening start) are accepted; an otherwise-invalid end is rejected inline.
  const applyExactEnd = (v: string) => {
    if (startMin == null) return;
    const min = toMin(v);
    if (endToDuration(startMin, min) == null) {
      setNote(t.eventForm.invalidEnd);
      return;
    }
    setNote(null);
    onChange({ start, end: toHHMM(min) });
  };

  return (
    <div className="form-field">
      {t.eventForm.timeLabel}
      <div className="tp-wrap">
        <div className="tp-fields">
          <TimeField
            value={start}
            onChange={(hhmm) => applyStart(toMin(hhmm))}
            label={t.eventForm.startCap}
            placeholder={t.eventForm.addTime}
            open={open === 'start'}
            onOpenChange={(o) => {
              setNote(null);
              setOpen(o ? 'start' : null);
            }}
          />

          <button
            type="button"
            className={'tp-field tp-dur' + (open === 'dur' ? ' open' : '')}
            onClick={() => {
              if (!start) return;
              setNote(null);
              setOpen(open === 'dur' ? null : 'dur');
            }}
            disabled={!start}
          >
            <span className="tp-cap">{t.eventForm.durationCap}</span>
            <span className="tp-val">
              {duration != null ? (
                <>
                  <span>{durationPhrase(duration)}</span>
                  <span className="tp-endhm" dir="ltr">
                    {t.eventForm.endsAtPrefix} {end}
                    {endIsNextDay && (
                      <sup className="tp-nextday" title={t.eventForm.nextDay}>
                        +1
                      </sup>
                    )}
                  </span>
                </>
              ) : (
                <span className="tp-placeholder">{start ? t.eventForm.addEnd : '-'}</span>
              )}
            </span>
          </button>

          {open === 'dur' && startMin != null && (
            <>
              <div className="tp-backdrop" onClick={close} />
              <div className="tp-panel">
                <div className="tp-exact">
                  <span className="tp-exact-lbl">{t.eventForm.exactEnd}</span>
                  {/* Uncontrolled (defaultValue), not value={end}: the OS time wheel
                      fires onChange on every tick, and rejecting an invalid one on a
                      controlled input snaps the wheel back — trapping you in the
                      daytime range you must scroll *through* to reach a post-midnight
                      end (ADR-0037). Uncontrolled lets the wheel move freely; only a
                      valid end commits. Remounts on each panel open, re-syncing. */}
                  <input
                    type="time"
                    step={60}
                    lang="he"
                    dir="ltr"
                    className="tp-time-input"
                    defaultValue={end}
                    onChange={(e) => e.target.value && applyExactEnd(e.target.value)}
                  />
                </div>
                {note && <div className="tp-note">{note}</div>}
                <div className="tp-list tp-list-dur" ref={centreSelected}>
                  {durPresets.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={
                        d === duration
                          ? 'tp-list-on'
                          : d === suggestDur
                            ? 'tp-list-suggest'
                            : undefined
                      }
                      onClick={() => commitDuration(d)}
                    >
                      <span>{durationPhrase(d)}</span>
                      <span className="tp-end" dir="ltr">
                        {t.eventForm.endsAtPrefix} {toEndWall(startMin + d)}
                        {isNextDay(startMin + d) && (
                          <sup className="tp-nextday" title={t.eventForm.nextDay}>
                            +1
                          </sup>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {start && (
        <button type="button" className="tp-clear" onClick={() => onChange({ start: '', end: '' })}>
          {t.eventForm.noTime}
        </button>
      )}
    </div>
  );
}
