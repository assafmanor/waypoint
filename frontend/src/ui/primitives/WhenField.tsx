// WhenField — the one sanctioned way any form collects a date/time (U-05, the
// "when" standard). Both variants build on the SAME shared time atom (TimeField),
// so the event and booking pickers behave identically — they differ only in what
// they compose around it:
//
//  - variant="day"  → a single day + the event TimePicker (start + duration,
//    single calendar day, overnight-aware — ADR-0036/0037). Value: { date, start, end }.
//
//  - variant="span" → two endpoints (departure→arrival, check-in→check-out,
//    start→end) that may fall on any two trip days (NOT capped to one day). Each
//    endpoint is a native date field + a TimeField; a derived "+N days" badge and
//    a duration read-out sit below. Value per endpoint: "YYYY-MM-DDTHH:MM"
//    (exactly what buildSpanSeed already consumes).
//
// The rule the standard enforces: a date/time input is NEVER a raw native control
// squeezed into a horizontal row (the cropped-date / AM-PM bug). Every part is a
// full-width native date or a tap-to-open TimeField that owns its own panel, and
// every time panel auto-closes the moment a value is picked.
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DurationUnit } from '@waypoint/shared';
import { DEVICE_LOCALE, MS_PER_DAY } from '../../constants';
import { zonedIso } from '../../lib/time';
import { formatDuration } from '../../lib/duration';
import { nightPhrase } from '../../lib/hebrew';
import { TimePicker } from '../TimePicker';
import { TimeField } from './TimeField';
import { Field } from './Field';
import { t } from '../../i18n/he';
import './when-field.css';

const dayOf = (v: string) => v.split('T')[0] ?? '';
const timeOf = (v: string) => v.split('T')[1] ?? '';

/** Whole-day difference between two YYYY-MM-DD strings (UTC-anchored so DST never
 *  shifts a calendar-day count). */
function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
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
  /** The end leg's zone, when it differs from the start's (a zone-crossing
   *  flight: departure in origin, arrival in destination — ADR-0107). Defaults to
   *  `timeZone`, so a single-zone span (hotel, same-zone hop) is unaffected and
   *  the elapsed-duration read-out stays correct across the crossing. */
  endTimeZone?: string;
  /** How the span's duration reads (ADR-0063). `nights` phrases it in לילות from
   *  the two calendar days (a hotel is nights, not "יום"); anything else keeps the
   *  elapsed-time read-out. Omitted → elapsed time. */
  durationUnit?: DurationUnit;
};

export type WhenFieldProps = DayProps | SpanProps;

export function WhenField(props: WhenFieldProps) {
  return props.variant === 'day' ? <WhenDay {...props} /> : <WhenSpan {...props} />;
}

// ── variant="day": native date + the event TimePicker (start + duration) ──────
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

// ── variant="span": two [native date + TimeField] endpoints, uncapped ─────────
function WhenSpan({
  start,
  end,
  onChange,
  minDate,
  maxDate,
  labels,
  defaultDate,
  timeZone,
  endTimeZone = timeZone,
  durationUnit,
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
    const endMs = Date.parse(zonedIso(endDay, timeOf(end), endTimeZone));
    const mins = Math.round((endMs - startMs) / 60000);
    return mins > 0 ? mins : null;
  }, [start, end, startDay, endDay, timeZone, endTimeZone]);

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
        // The end can't fall before the start: its earliest selectable day is the
        // start's day (falling back to the trip start until a start is picked).
        // Latest stays the trip end, so the end is bounded to [start, tripEnd].
        minDate={startDay || minDate}
        maxDate={maxDate}
        // The arrival day defaults to the departure day, so a same-day trip needs
        // only its time picked; a later day is still freely selectable.
        defaultDate={startDay || defaultDate}
        badge={crossesDays ? `+${daysApart}` : undefined}
      />
      {/* A lodging span reads in nights, derived from the two calendar days (no
          "crosses a day" note — a stay always does). Everything else keeps the
          elapsed-time read-out, once both times are in. */}
      {durationUnit === 'nights' && daysApart > 0 ? (
        <div className="wf-dur">
          {t.whenField.durationPrefix} <b>{nightPhrase(daysApart)}</b>
        </div>
      ) : (
        duration != null && (
          <div className="wf-dur">
            {t.whenField.durationPrefix} <b>{formatDuration(duration, durationUnit)}</b>
            {crossesDays && <span className="wf-dur-note"> · {t.whenField.crossesDay}</span>}
          </div>
        )
      )}
    </div>
  );
}

// One span endpoint: a native date cell + the shared TimeField, in a flex-wrap
// row so the TimeField's panel wraps full-width below both. Local date/time parts
// are held so a half-entered endpoint never wipes the part just picked — the
// combined "YYYY-MM-DDTHH:MM" is emitted only when a date exists (a bare time
// borrows defaultDate, so either entry order works).
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

  return (
    <div className="wf-leg">
      <div className="wf-leg-cap">
        {label}
        {badge && (
          <span className="wf-leg-badge" title={t.whenField.crossesDay}>
            {badge}
          </span>
        )}
      </div>
      <div className="wf-leg-row">
        <label className="tp-field wf-date-cell">
          <span className="tp-cap">{t.whenField.dateCap}</span>
          <input
            type="date"
            className="tp-val wf-date-val"
            lang={DEVICE_LOCALE}
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => commit(e.target.value, time)}
          />
        </label>
        <TimeField
          value={time}
          onChange={(hhmm) => commit(date || defaultDate || '', hhmm)}
          onClear={() => commit(date, '')}
          label={t.whenField.timeCap}
          placeholder={t.whenField.addTime}
        />
      </div>
    </div>
  );
}
