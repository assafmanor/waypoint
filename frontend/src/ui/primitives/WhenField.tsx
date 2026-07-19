// WhenField — the one sanctioned way any form collects a date/time (U-05, the
// "when" standard). Two variants cover every case, present and future:
//
//  - variant="day"  → a single day + a same-day start→end time range. The date is
//    the native full-width date field (a real OS calendar, can't be clipped); the
//    time is the amber TimePicker (quantized quick-pick + exact fallback, overnight
//    aware, ADR-0036/0037). Value: { date, start, end }.
//
//  - variant="span" → two endpoints (departure→arrival, check-in→check-out,
//    start→end) that may fall on any two trip days — NOT capped to one calendar
//    day. Each endpoint is the SAME event grammar: a full-width native date field
//    plus a tap-to-open amber time picker. A derived "+N days" badge and a duration
//    read-out sit between the legs. Value per endpoint: "YYYY-MM-DDTHH:MM"
//    (exactly what buildSpanSeed already consumes).
//
// The rule the standard enforces: a date/time input is NEVER a raw native control
// squeezed into a horizontal row (the cropped-date / AM-PM bug). Every part is
// either a full-width native field or a tap-to-open field that owns its own panel,
// and every panel auto-closes the moment a value is picked (like the TimePicker).
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEVICE_LOCALE, MINUTES_PER_DAY, MS_PER_DAY } from '../../constants';
import { formatCountdown, zonedIso } from '../../lib/time';
import { nearestRoundSlot } from '../TimePicker';
import { TimePicker } from '../TimePicker';
import { Field } from './Field';
import { t } from '../../i18n/he';
import './when-field.css';

const STEP = 15;
const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const ALL_TIMES = Array.from({ length: MINUTES_PER_DAY / STEP }, (_, i) => i * STEP);

const dayOf = (v: string) => v.split('T')[0] ?? '';
const timeOf = (v: string) => v.split('T')[1] ?? '';

/** Whole-day difference between two YYYY-MM-DD strings (UTC-anchored so DST never
 *  shifts a calendar-day count). */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Scroll the selected row — or the nearest-round suggestion for an off-grid
 *  value — to the vertical centre of its list on open (mirrors the TimePicker). */
function centreSelected(list: HTMLDivElement | null) {
  const on = list?.querySelector<HTMLElement>('.tp-list-on, .tp-list-suggest');
  if (on && list) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.clientHeight / 2;
}

type DayProps = {
  variant: 'day';
  date: string;
  start: string;
  end: string;
  onChange: (next: { date: string; start: string; end: string }) => void;
  /** Day bounds "YYYY-MM-DD". */
  minDate?: string;
  maxDate?: string;
  dateId?: string;
  /** Date-field label (defaults to the plain "תאריך"; bookings pass their own). */
  dateLabel?: string;
};

type SpanProps = {
  variant: 'span';
  /** Each endpoint "YYYY-MM-DDTHH:MM" (or '' / date-only while half-entered). */
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  minDate?: string;
  maxDate?: string;
  labels: { start: string; end: string };
  /** Fallback day for the start leg when only a time is picked first. */
  defaultDate?: string;
  timeZone: string;
};

export type WhenFieldProps = DayProps | SpanProps;

export function WhenField(props: WhenFieldProps) {
  return props.variant === 'day' ? <WhenDay {...props} /> : <WhenSpan {...props} />;
}

// ── variant="day": native date + the amber range TimePicker ──────────────────
function WhenDay({ date, start, end, onChange, minDate, maxDate, dateId, dateLabel }: DayProps) {
  return (
    <div className="wf">
      <Field label={dateLabel ?? t.eventForm.dateLabel} htmlFor={dateId}>
        <input
          type="date"
          id={dateId}
          className="wf-date"
          lang={DEVICE_LOCALE}
          min={minDate}
          max={maxDate}
          value={date}
          onChange={(e) => onChange({ date: e.target.value, start, end })}
        />
      </Field>
      <TimePicker start={start} end={end} onChange={(next) => onChange({ date, ...next })} />
    </div>
  );
}

// ── variant="span": two [native date + tap-to-open time] legs, uncapped ───────
function WhenSpan({
  start,
  end,
  onChange,
  minDate,
  maxDate,
  labels,
  defaultDate,
  timeZone,
}: SpanProps) {
  const setStart = (v: string) => onChange({ start: v, end });
  const setEnd = (v: string) => onChange({ start, end: v });

  const startDay = dayOf(start);
  const endDay = dayOf(end);
  // Only a *later* end day is a forward span (ISO dates sort lexically). An end
  // before the start is a user error the save-time range check catches — never a
  // "+-1" badge here.
  const daysApart = startDay && endDay && endDay > startDay ? dayDiff(startDay, endDay) : 0;
  const crossesDays = daysApart > 0;

  // Duration read-out, once both endpoints are complete. Computed via the trip
  // timezone so a DST edge never mis-states the span.
  const duration = useMemo(() => {
    if (!start || !end || !timeOf(start) || !timeOf(end)) return null;
    const startMs = Date.parse(zonedIso(startDay, timeOf(start), timeZone));
    const endMs = Date.parse(zonedIso(endDay, timeOf(end), timeZone));
    const mins = Math.round((endMs - startMs) / 60000);
    return mins > 0 ? mins : null;
  }, [start, end, startDay, endDay, timeZone]);

  return (
    <div className="wf wf-span">
      <SpanLeg
        label={labels.start}
        value={start}
        onChange={setStart}
        minDate={minDate}
        maxDate={maxDate}
        defaultDate={defaultDate}
      />
      <SpanLeg
        label={labels.end}
        value={end}
        onChange={setEnd}
        minDate={minDate}
        maxDate={maxDate}
        // The arrival day defaults to the departure day, so a same-day trip needs
        // only its time picked; a later day is still freely selectable.
        defaultDate={startDay || defaultDate}
        badge={crossesDays ? `+${daysApart}` : undefined}
      />
      {duration != null && (
        <div className="wf-dur">
          {t.whenField.durationPrefix} <b>{durationPhrase(duration)}</b>
          {crossesDays && <span className="wf-dur-note"> · {t.whenField.crossesDay}</span>}
        </div>
      )}
    </div>
  );
}

function durationPhrase(mins: number): string {
  const { value, unit } = formatCountdown(mins);
  return `${value} ${unit}`;
}

// One span endpoint: a full-width native date + a tap-to-open amber time field
// whose panel opens full width below the row and auto-closes on pick. Local
// parts (date/time) are held so a half-entered endpoint never wipes the part
// just picked — the combined "YYYY-MM-DDTHH:MM" is emitted only when a date
// exists (a bare time falls back to defaultDate, either entry order works).
function SpanLeg({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  defaultDate,
  badge,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
  defaultDate?: string;
  badge?: string;
}) {
  const [date, setDate] = useState(() => dayOf(value));
  const [time, setTime] = useState(() => timeOf(value));
  const [open, setOpen] = useState(false);
  const lastEmit = useRef(value);

  useEffect(() => {
    if (value === lastEmit.current) return;
    setDate(dayOf(value));
    setTime(timeOf(value));
    lastEmit.current = value;
  }, [value]);

  const commit = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    // A date alone is a valid partial (kept, not lost); a time alone borrows the
    // fallback day so it becomes a usable instant.
    const day = nextDate || (nextTime ? (defaultDate ?? '') : '');
    const combined = day ? (nextTime ? `${day}T${nextTime}` : day) : '';
    lastEmit.current = combined;
    onChange(combined);
  };

  const timeMin = time ? toMin(time) : null;
  const suggest = timeMin != null && timeMin % STEP !== 0 ? nearestRoundSlot(timeMin) : null;

  const pick = (min: number) => {
    commit(date || defaultDate || '', toHHMM(min));
    setOpen(false);
  };

  return (
    <div className="wf-leg">
      <div className="wf-leg-cap">
        <span className="wf-leg-dot" aria-hidden="true" />
        {label}
        {badge && (
          <sup className="wf-leg-badge" title={t.whenField.crossesDay}>
            {badge}
          </sup>
        )}
      </div>
      <div className="wf-leg-row">
        <input
          type="date"
          className="wf-date"
          lang={DEVICE_LOCALE}
          min={minDate}
          max={maxDate}
          value={date}
          onChange={(e) => commit(e.target.value, time)}
        />
        <button
          type="button"
          className={'wf-time' + (open ? ' open' : '')}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="wf-time-cap">{t.whenField.timeCap}</span>
          <span className="wf-time-val" dir="ltr">
            {time || <span className="wf-time-ph">{t.whenField.addTime}</span>}
          </span>
        </button>
      </div>

      {open && <div className="tp-backdrop" onClick={() => setOpen(false)} />}
      {open && (
        <div className="tp-panel wf-panel">
          <div className="tp-exact">
            <span className="tp-exact-lbl">{t.whenField.exactTime}</span>
            <input
              type="time"
              step={60}
              lang="he"
              dir="ltr"
              className="tp-time-input"
              value={time}
              onChange={(e) => e.target.value && pick(toMin(e.target.value))}
            />
          </div>
          <div className="tp-list" ref={centreSelected}>
            {ALL_TIMES.map((min) => (
              <button
                key={min}
                type="button"
                className={
                  min === timeMin ? 'tp-list-on' : min === suggest ? 'tp-list-suggest' : undefined
                }
                onClick={() => pick(min)}
              >
                <span dir="ltr">{toHHMM(min)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {time && (
        <button type="button" className="tp-clear" onClick={() => commit(date, '')}>
          {t.eventForm.noTime}
        </button>
      )}
    </div>
  );
}
