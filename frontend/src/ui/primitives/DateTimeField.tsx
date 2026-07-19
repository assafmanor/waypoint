// One date/time control (U-05). Unifies the two paradigms the forms used to
// mix — native `datetime-local` for spans vs a native date input + the custom
// TimePicker for single-day. Every date/time now flows through here:
//
//  - mode="date"      → a native date input. Value "YYYY-MM-DD".
//  - mode="time"      → the TimePicker start+end range (single-day times).
//  - mode="datetime"  → a native date input + a single native time input,
//                       replacing the `datetime-local` widget. Value
//                       "YYYY-MM-DDTHH:MM". A span endpoint is a single instant
//                       that may fall on any trip day, so it needs its own date
//                       (unlike the same-day TimePicker range) — the time wears
//                       the app's amber "time & commitment" accent to match.
//
// The value formats and the min/max day bounding are exactly what the callers
// (buildSpanSeed / buildEventSeed / dateOutOfTripRange) already expect.
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

  // datetime — split the combined value into its date + time parts, edit each
  // with its own native control, and recombine. Both parts are needed to form a
  // value (an incomplete endpoint reads as empty, matching datetime-local).
  const [date = '', time = ''] = props.value.split('T');
  const emit = (nextDate: string, nextTime: string) =>
    props.onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');

  return (
    <div className="dtf-datetime">
      <input
        type="date"
        id={props.id}
        className="dtf-date"
        lang={DEVICE_LOCALE}
        min={dayPart(props.min)}
        max={dayPart(props.max)}
        value={date}
        onChange={(e) => emit(e.target.value, time)}
      />
      <input
        type="time"
        step={60}
        lang="he"
        dir="ltr"
        className="dtf-time"
        value={time}
        onChange={(e) => emit(date, e.target.value)}
      />
    </div>
  );
}
