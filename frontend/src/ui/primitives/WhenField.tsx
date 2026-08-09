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
import { MS_PER_DAY } from '../../constants';
import { zonedIso } from '../../lib/time';
import { formatDuration } from '../../lib/duration';
import { nightPhrase } from '../../lib/hebrew';
import { TimePicker } from '../TimePicker';
import { DateField } from './DateField';
import { tokenClass } from './ValueToken';
import { TimeField } from './TimeField';
import { ZoneChip, type ZoneChipProps } from './ZoneChip';
import { Field } from './Field';
import { type FieldMark } from './useFormErrors';
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
  /** The zone the typed times are interpreted in, as a chip under them
   *  (ADR-0107 §6): shown when passed, editable when it carries an `onChange`.
   *  Omitted → no chip, and the caller's own zone handling is unchanged. */
  zone?: ZoneChipProps;
  /** Where a refusal about the when lands (ADR-0150). The day and the time are
   *  separate boxes and refuse for separate reasons ("no date" vs "the end is
   *  before the start"), so the form marks whichever it means — from
   *  `useFormErrors().field(name)`, never assembled by hand. */
  marks?: { date?: FieldMark; time?: FieldMark };
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
  /** A zone chip per leg (ADR-0107 §6) — each states the zone that leg's time is
   *  interpreted in, and is editable when it carries an `onChange`. A crossing
   *  needs one per end: pinning both to one zone would erase the crossing. */
  zones?: { start?: ZoneChipProps; end?: ZoneChipProps };
  /** A refusal per leg (ADR-0150) — the same reason the zones are per leg: a span
   *  can be wrong at either end, and marking both would name a field that is fine. */
  marks?: { start?: FieldMark; end?: FieldMark };
};

export type WhenFieldProps = DayProps | SpanProps;

export function WhenField(props: WhenFieldProps) {
  return props.variant === 'day' ? <WhenDay {...props} /> : <WhenSpan {...props} />;
}

// ── variant="day": native date + the event TimePicker (start + duration) ──────
function WhenDay({
  date,
  start,
  end,
  onChange,
  minDate,
  maxDate,
  dateId,
  dateLabel,
  zone,
  marks,
}: DayProps) {
  return (
    <div className="wf">
      {/* ONE label for the whole when (ADR-0177 §1) — "מתי", not a caption per atom.
          The day and the clock are two sentences under it, and each still refuses on
          its own (ADR-0150 §7: a two-ended field can be wrong at one end). */}
      <Field label={dateLabel ?? t.whenField.label} htmlFor={dateId} {...marks?.date}>
        <div className="wf-line">
          <DateField
            id={dateId}
            className={tokenClass('date', { empty: !date })}
            // Inside a trip the year is the trip's, so the date reads by name — which
            // also cannot be read in the wrong order at all (ADR-0177 §4 over ADR-0176).
            format="named"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(next) => onChange({ date: next, start, end })}
          />
        </div>
      </Field>
      <Field {...marks?.time}>
        <TimePicker start={start} end={end} onChange={(next) => onChange({ date, ...next })} />
      </Field>
      {/* The zone the times above mean (ADR-0107 §6) — inference is never silently
          authoritative, so the chip states it and one tap corrects it. */}
      {zone && <ZoneChip {...zone} />}
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
  zones,
  marks,
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
  // **The end builds on the start** (field report #4). While the two sit on the SAME day,
  // the only times that can be an end are the ones after the start, so those are the only
  // ones offered. A later day offers the full 24 hours, which is what leaves an overnight
  // flight and a multi-day stay exactly as they were — and is why this reads the end's own
  // day rather than assuming the span is same-day until told otherwise.
  const endFloor = endDay && endDay === startDay ? timeOf(start) || undefined : undefined;

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
      <Field {...marks?.start}>
        <SpanLeg
          label={labels.start}
          value={start}
          onChange={setStart}
          minDate={minDate}
          maxDate={maxDate}
          defaultDate={defaultDate}
        />
      </Field>
      {zones?.start && <ZoneChip {...zones.start} />}
      <Field {...marks?.end}>
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
          minTime={endFloor}
          badge={crossesDays ? `+${daysApart}` : undefined}
        />
      </Field>
      {zones?.end && <ZoneChip {...zones.end} />}
      {/* A lodging span reads in nights, derived from the two calendar days (no
          "crosses a day" note — a stay always does). Everything else keeps the
          elapsed-time read-out, once both times are in. */}
      {durationUnit === 'nights' && daysApart > 0 ? (
        <div className="wf-note">
          {t.whenField.durationPrefix} <b>{nightPhrase(daysApart)}</b>
        </div>
      ) : (
        duration != null && (
          <div className="wf-note">
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
  minTime,
  badge,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  maxDate?: string;
  defaultDate?: string;
  /** Passed straight through to the `TimeField` that owns the rule (field report #4). */
  minTime?: string;
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

  // ONE SUBJECT PER ROW (ADR-0177 §2) — `route-field.css`'s rule ("the two pickers,
  // stacked — phone-first, never a cramped inline row"), one level down. The legs were
  // already stacked; what was wrong is that each leg then split into two captioned
  // cells again.
  //
  // The leg's name sits ABOVE its sentence rather than beside it, which the mockup drew
  // as a label column. Beside would have meant one grid spanning both legs — the only
  // way their sentences line up — and that grid can only reach across the per-leg
  // `Field` shells via `display: contents`, which erases the very box ADR-0150's nudge
  // animates and scrolls to. Above costs ~16px a leg and makes the alignment exact by
  // construction instead of by a shared track, so the refusal machinery stays whole.
  return (
    <div className="wf-leg">
      <span className="wf-leg-lbl">
        {label}
        {badge && (
          <span className="wf-badge" title={t.whenField.crossesDay}>
            {badge}
          </span>
        )}
      </span>
      <div className="wf-line">
        <DateField
          className={tokenClass('date', { empty: !date })}
          format="named"
          min={minDate}
          max={maxDate}
          value={date}
          onChange={(next) => commit(next, time)}
        />
        <TimeField
          value={time}
          onChange={(hhmm) => commit(date || defaultDate || '', hhmm)}
          onClear={() => commit(date, '')}
          label={t.whenField.timeCap}
          placeholder={t.whenField.addTime}
          minTime={minTime}
        />
      </div>
    </div>
  );
}
