// DateField — the one native date control in the app, wearing the app's own date
// format (ADR-0176). The sibling of `TimeField`: same job, opposite half of a when.
//
// The problem it exists for: `<input type="date">` renders its value by the
// PLATFORM's convention, not the page's. `lang` moves that on Chromium and is
// ignored by WebKit, which follows the OS region — so on an iPhone set to the US
// the Hebrew form read `08/09/2026` while every other date on the same screen read
// `09.08`. A date the reader has to guess the order of is worse than no date.
//
// So the value on screen is OURS: the wrapper wears the host's chrome, the face
// paints `formatDayMonthYear`, and the native input lies over the whole box —
// transparent at rest, opaque while focused, where it is the real editable control
// again (segments, keyboard, calendar affordance) and the platform's format is the
// picker's own business. The input is never replaced: `min`/`max`, the calendar,
// and `input[type="date"]` as the thing tests and forms address all stay.
import { formatDayMonthYear } from '../../lib/time';
import { APP_LOCALE } from '../../constants';
import { t } from '../../i18n/he';
import './date-field.css';

export interface DateFieldProps {
  /** `YYYY-MM-DD`, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** The host's chrome class — it lands on the wrapper, which is the box now. */
  className?: string;
  /** Day bounds, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** The refusal mark (ADR-0150), carried by the wrapper like every other control. */
  'data-invalid'?: string;
  /** What an empty field says; defaults to the shared "add a date". */
  placeholder?: string;
}

export function DateField({
  value,
  onChange,
  id,
  className,
  min,
  max,
  'data-invalid': invalid,
  placeholder,
}: DateFieldProps) {
  return (
    <span className={className ? `df ${className}` : 'df'} data-invalid={invalid}>
      {/* `dir="auto"` and nothing else (ADR-0118): a numeric date is a neutral run that
          reads left-to-right, a Hebrew placeholder reads right-to-left, and each aligns
          the way the TimeField beside it aligns its own value. */}
      <span className="df-face" dir="auto" aria-hidden="true">
        {value ? (
          formatDayMonthYear(value)
        ) : (
          <span className="df-empty">{placeholder ?? t.whenField.addDate}</span>
        )}
      </span>
      <input
        type="date"
        id={id}
        className="df-input"
        lang={APP_LOCALE}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
