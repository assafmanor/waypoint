// Compact, familiar time setter for the event editor (T-054, ADR-0036).
// Two small fields — start + duration — each opening a Google-Calendar-style
// scroll list of 15-minute times, with a native <input type="time"> at the top
// as the exact-entry fallback (ADR-0036 §2c). Time is amber (design-language:
// "amber = the clock & the commitment"); the end is entered as a duration off
// the start but stored as an absolute HH:MM end, so the EventForm save path
// (zonedIso) is unchanged.
//
// The exact field is the platform-native time control: the ":" is always on
// screen, invalid values (76) are impossible, and the numeric keypad drives it.
// Its `.value` is always canonical 24h "HH:MM" per the HTML spec regardless of
// how it's displayed; `lang="he"` renders it 24h (no AM/PM) for our RTL app.
//
// Multi-day events are out of scope (ADR-0036 §Scope): every option keeps the
// end on the same calendar day as the start, and an exact end at/or before the
// start is rejected rather than rolled into tomorrow.
import { useMemo, useState } from 'react';
import { t } from '../i18n/he';

const MINUTES_IN_DAY = 1440;
const LAST_MINUTE = MINUTES_IN_DAY - 1; // 23:59 — latest same-day end
const STEP = 15;
// Duration presets, coarsening as they grow; filtered per-start to same-day.
const DUR_PRESETS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Minutes from start to a chosen end within the same day, or null when the end
 *  isn't a valid same-day end (at/before the start). Multi-day events are out of
 *  scope (ADR-0036), so a "tomorrow" end is rejected here, never rolled over. */
export function endToDuration(startMin: number, endMin: number): number | null {
  return endMin > startMin ? endMin - startMin : null;
}

/** Clamp minutes-of-day so a span never spills past 23:59 into the next day. */
export function clampSameDay(min: number): number {
  return Math.min(min, LAST_MINUTE);
}

/** The nearest round (15-min) slot to a minute-of-day, capped at the last slot
 *  (23:45) so the suggestion is always a real list row. Used to suggest — never
 *  to mutate — a round time when reopening the picker on an off-grid value. */
export function nearestRoundSlot(min: number): number {
  return Math.min(Math.round(min / STEP) * STEP, MINUTES_IN_DAY - STEP);
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

const ALL_TIMES = Array.from({ length: MINUTES_IN_DAY / STEP }, (_, i) => i * STEP);

/** Scroll the selected row — or, for an off-grid value, the suggested nearest
 *  round row — to the vertical centre of its list on open. */
function centreSelected(list: HTMLDivElement | null) {
  const on = list?.querySelector<HTMLElement>('.tp-list-on, .tp-list-suggest');
  if (on && list) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.clientHeight / 2;
}

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
  const duration = startMin != null && endMin != null ? endMin - startMin : null;

  const durPresets = useMemo(() => {
    if (startMin == null) return [];
    return DUR_PRESETS.filter((d) => startMin + d <= LAST_MINUTE);
  }, [startMin]);

  // "Suggest rounds when reselecting" — when the current value is off-grid, the
  // list scrolls to and highlights the nearest round slot / preset as a
  // *suggestion*. It never mutates the value: 11:47 stays 11:47 until you tap
  // 11:45. (Fixes the reopen-lands-on-00:00 case for an off-grid time.)
  const suggestStart =
    startMin != null && startMin % STEP !== 0 ? nearestRoundSlot(startMin) : null;
  const suggestDur =
    duration != null && durPresets.length > 0 && !durPresets.includes(duration)
      ? durPresets.reduce((a, b) => (Math.abs(b - duration) < Math.abs(a - duration) ? b : a))
      : null;

  const openPanel = (which: 'start' | 'dur') => {
    setNote(null);
    setOpen(which);
  };
  const close = () => {
    setOpen(null);
    setNote(null);
  };

  // Pick a start; preserve the existing duration, clamped to the same day.
  // `min` from the list, or from the native exact input (always valid HH:MM).
  const applyStart = (min: number, opts?: { close?: boolean }) => {
    let nextEnd = end;
    if (duration != null) nextEnd = toHHMM(clampSameDay(min + duration));
    onChange({ start: toHHMM(min), end: nextEnd });
    if (opts?.close) close();
  };

  const commitDuration = (d: number) => {
    if (startMin == null) return;
    onChange({ start, end: toHHMM(clampSameDay(startMin + d)) });
    close();
  };

  // Exact end → derived duration. Same-day only: reject end ≤ start.
  const applyExactEnd = (v: string) => {
    if (startMin == null) return;
    const min = toMin(v);
    if (endToDuration(startMin, min) == null) {
      setNote(t.eventForm.sameDayOnly);
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
          <button
            type="button"
            className={'tp-field' + (open === 'start' ? ' open' : '')}
            onClick={() => openPanel('start')}
          >
            <span className="tp-cap">{t.eventForm.startCap}</span>
            <span className="tp-val" dir="ltr">
              {start || <span className="tp-placeholder">{t.eventForm.addTime}</span>}
            </span>
          </button>

          <button
            type="button"
            className={'tp-field tp-dur' + (open === 'dur' ? ' open' : '')}
            onClick={() => start && openPanel('dur')}
            disabled={!start}
          >
            <span className="tp-cap">{t.eventForm.durationCap}</span>
            <span className="tp-val">
              {duration != null ? (
                <>
                  <span>{durationPhrase(duration)}</span>
                  <span className="tp-endhm" dir="ltr">
                    {t.eventForm.endsAtPrefix} {end}
                  </span>
                </>
              ) : (
                <span className="tp-placeholder">{start ? t.eventForm.addEnd : '—'}</span>
              )}
            </span>
          </button>
        </div>

        {open && <div className="tp-backdrop" onClick={close} />}

        {open === 'start' && (
          <div className="tp-panel">
            <div className="tp-exact">
              <span className="tp-exact-lbl">{t.eventForm.exactStart}</span>
              <input
                type="time"
                step={60}
                lang="he"
                dir="ltr"
                className="tp-time-input"
                value={start}
                onChange={(e) => e.target.value && applyStart(toMin(e.target.value))}
              />
            </div>
            <div className="tp-list" ref={centreSelected}>
              {ALL_TIMES.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={
                    min === startMin
                      ? 'tp-list-on'
                      : min === suggestStart
                        ? 'tp-list-suggest'
                        : undefined
                  }
                  onClick={() => applyStart(min, { close: true })}
                >
                  <span dir="ltr">{toHHMM(min)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {open === 'dur' && startMin != null && (
          <div className="tp-panel">
            <div className="tp-exact">
              <span className="tp-exact-lbl">{t.eventForm.exactEnd}</span>
              <input
                type="time"
                step={60}
                lang="he"
                dir="ltr"
                className="tp-time-input"
                value={end}
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
                    d === duration ? 'tp-list-on' : d === suggestDur ? 'tp-list-suggest' : undefined
                  }
                  onClick={() => commitDuration(d)}
                >
                  <span>{durationPhrase(d)}</span>
                  <span className="tp-end" dir="ltr">
                    {t.eventForm.endsAtPrefix} {toHHMM(startMin + d)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {start && (
        <button type="button" className="tp-clear" onClick={() => onChange({ start: '', end: '' })}>
          {t.eventForm.noTime}
        </button>
      )}
    </div>
  );
}
