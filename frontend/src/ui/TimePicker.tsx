// Compact, familiar time setter for the event editor (T-054, ADR-0036).
// Two small fields — start + duration — each opening a Google-Calendar-style
// scroll list of 15-minute times, with a typeable exact-time field at the top
// as the fallback for off-grid times (a flight at 09:07). Time is amber
// (design-language: "amber = the clock & the commitment"); the end is entered
// as a duration off the start but stored as an absolute HH:MM end, so the
// EventForm save path (zonedIso) is unchanged.
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

/** Parse a loose exact-time entry into minutes-of-day, or null.
 *  Accepts "9:07", "907", "0907", "9". Digits-only: last two are minutes. */
export function parseLoose(raw: string): number | null {
  const s = raw.trim();
  let h: number, m: number;
  if (s.includes(':')) {
    const [a, b] = s.split(':');
    h = parseInt(a, 10);
    m = parseInt(b || '0', 10);
  } else {
    const d = s.replace(/\D/g, '');
    if (!d) return null;
    if (d.length <= 2) {
      h = parseInt(d, 10);
      m = 0;
    } else {
      m = parseInt(d.slice(-2), 10);
      h = parseInt(d.slice(0, -2), 10);
    }
  }
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

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

/** Scroll the selected row to the vertical centre of its list on open. */
function centreSelected(list: HTMLDivElement | null) {
  const on = list?.querySelector<HTMLElement>('.tp-list-on');
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
  // Mirror value for the exact-time inputs — seeded on open, free-typed after.
  const [exact, setExact] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const startMin = start ? toMin(start) : null;
  const endMin = end ? toMin(end) : null;
  const duration = startMin != null && endMin != null ? endMin - startMin : null;

  const durPresets = useMemo(() => {
    if (startMin == null) return [];
    return DUR_PRESETS.filter((d) => startMin + d <= LAST_MINUTE);
  }, [startMin]);

  const openPanel = (which: 'start' | 'dur') => {
    setNote(null);
    if (which === 'start') setExact(start || '');
    else setExact(end || (startMin != null ? toHHMM(Math.min(startMin + 60, LAST_MINUTE)) : ''));
    setOpen(which);
  };
  const close = () => {
    setOpen(null);
    setNote(null);
  };

  // Pick a start; preserve the existing duration, clamped to the same day.
  const commitStart = (min: number) => {
    let nextEnd = end;
    if (duration != null) nextEnd = toHHMM(clampSameDay(min + duration));
    onChange({ start: toHHMM(min), end: nextEnd });
    close();
  };

  const commitDuration = (d: number) => {
    if (startMin == null) return;
    onChange({ start, end: toHHMM(clampSameDay(startMin + d)) });
    close();
  };

  // Exact end → derived duration. Same-day only: reject end ≤ start.
  const commitExactEnd = (min: number) => {
    if (startMin == null) return;
    if (endToDuration(startMin, min) == null) {
      setNote(t.eventForm.sameDayOnly);
      return;
    }
    onChange({ start, end: toHHMM(min) });
    close();
  };

  const onExactInput = (raw: string) => {
    setExact(raw);
    setNote(null);
    const min = parseLoose(raw);
    if (min == null) return;
    if (open === 'start')
      onChange({ start: toHHMM(min), end }); // live, keep panel open
    else if (startMin != null && endToDuration(startMin, min) != null)
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
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={5}
                value={exact}
                autoComplete="off"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => onExactInput(e.target.value)}
                onBlur={() => setExact(start || '')}
              />
            </div>
            <div className="tp-list" ref={centreSelected}>
              {ALL_TIMES.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={min === startMin ? 'tp-list-on' : undefined}
                  onClick={() => commitStart(min)}
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
                type="text"
                inputMode="numeric"
                dir="ltr"
                maxLength={5}
                value={exact}
                autoComplete="off"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setExact(e.target.value)}
                onBlur={() => {
                  const min = parseLoose(exact);
                  if (min != null) commitExactEnd(min);
                  else setExact(end || '');
                }}
              />
            </div>
            {note && <div className="tp-note">{note}</div>}
            <div className="tp-list tp-list-dur">
              {durPresets.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={d === duration ? 'tp-list-on' : undefined}
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
