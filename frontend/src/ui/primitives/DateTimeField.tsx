// One date/time control (U-05). Unifies the two paradigms the forms used to
// mix — native `datetime-local` for spans vs a native date input + the custom
// TimePicker for single-day. Every date/time now flows through here:
//
//  - mode="date"      → a native date input. Value "YYYY-MM-DD".
//  - mode="time"      → the TimePicker start+end range (single-day times).
//  - mode="datetime"  → a grouped date│time control (native date + native time,
//                       side by side as one bordered field). Value
//                       "YYYY-MM-DDTHH:MM". A span endpoint is a single instant
//                       that may fall on any trip day, so it needs its own date
//                       (unlike the same-day TimePicker range) — the time wears
//                       the app's amber "time & commitment" accent to match.
//
// The value formats and the min/max day bounding are exactly what the callers
// (buildSpanSeed / buildEventSeed / dateOutOfTripRange) already expect.
import { useEffect, useRef, useState } from 'react';
import { DEVICE_LOCALE } from '../../constants';
import { TimePicker } from '../TimePicker';
import './date-time-field.css';

type DateProps = {
  mode: 'date';
  value: string;
  onChange: (value: string) => void;
  /** Day bounds "YYYY-MM-DD". */
  min?: string;
  max?: string;
  id?: string;
};

type DateTimeProps = {
  mode: 'datetime';
  value: string;
  onChange: (value: string) => void;
  /** Day-or-datetime bounds; only the date part bounds the date input. */
  min?: string;
  max?: string;
  id?: string;
  /** Fallback day (YYYY-MM-DD) applied when a time is entered before a date, so
   *  either entry order yields a usable instant (e.g. the trip's first day, or
   *  an arrival endpoint defaulting to the departure day). */
  defaultDate?: string;
};

type TimeProps = {
  mode: 'time';
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
};

export type DateTimeFieldProps = DateProps | DateTimeProps | TimeProps;

const dayPart = (v?: string) => v?.split('T')[0];

export function DateTimeField(props: DateTimeFieldProps) {
  if (props.mode === 'time') {
    return <TimePicker start={props.start} end={props.end} onChange={props.onChange} />;
  }

  if (props.mode === 'date') {
    return (
      <input
        type="date"
        id={props.id}
        lang={DEVICE_LOCALE}
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  }

  return <DateTimeInput {...props} />;
}

// datetime — the combined "YYYY-MM-DDTHH:MM" value can only be formed once BOTH
// a date and a time exist, but the user enters them one at a time. Deriving the
// parts from the parent value each render (the old approach) meant a half-entered
// endpoint emitted '' and immediately wiped the part just picked — so the field
// could never be filled. Hold the two parts locally instead: emit the combined
// value only when both are present, but never lose a partial mid-entry.
function DateTimeInput({ value, onChange, min, max, id, defaultDate }: DateTimeProps) {
  const [date, setDate] = useState(() => value.split('T')[0] ?? '');
  const [time, setTime] = useState(() => value.split('T')[1] ?? '');
  // The last value we emitted, so the effect below can tell an external value
  // replacement (edit-load / reset) apart from the echo of our own emit.
  const lastEmit = useRef(value);

  useEffect(() => {
    if (value === lastEmit.current) return;
    setDate(value.split('T')[0] ?? '');
    setTime(value.split('T')[1] ?? '');
    lastEmit.current = value;
  }, [value]);

  const commit = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    const combined = nextDate && nextTime ? `${nextDate}T${nextTime}` : '';
    lastEmit.current = combined;
    onChange(combined);
  };

  return (
    <div className="dtf-datetime">
      <input
        type="date"
        id={id}
        className="dtf-date"
        lang={DEVICE_LOCALE}
        min={dayPart(min)}
        max={dayPart(max)}
        value={date}
        onChange={(e) => commit(e.target.value, time)}
      />
      <span className="dtf-sep" aria-hidden="true" />
      <input
        type="time"
        step={60}
        lang="he"
        dir="ltr"
        className="dtf-time"
        value={time}
        // A time entered before a date falls back to defaultDate so the endpoint
        // is usable in either order (the date input stays editable).
        onChange={(e) => commit(date || defaultDate || '', e.target.value)}
      />
    </div>
  );
}
