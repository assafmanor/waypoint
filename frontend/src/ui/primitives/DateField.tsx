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
// transparent at rest, opaque while its SEGMENTS ARE BEING TYPED INTO, where it is the
// real editable control again (segments, keyboard, calendar affordance) and the
// platform's format is the picker's own business. The input is never replaced:
// `min`/`max`, the calendar, and `input[type="date"]` as the thing tests and forms
// address all stay.
//
// Two things the platform does that never become app values (field reports #36, #38):
// a CLEAR is a cancellation, not an empty date, and a FOCUS is not an edit. Both are
// handled here rather than at five hosts — see `rollBack` and `typing` below.
import { useRef, useState } from 'react';
import { formatDayDate, formatDayMonthYear } from '../../lib/time';
import { APP_LOCALE } from '../../constants';
import { t } from '../../i18n/he';
import './date-field.css';

/** How the face reads. **Both satisfy ADR-0176** — the point there was that a reader
 *  must never have to guess whether `08/09` is August or September:
 *
 *  - `numeric` — `11.09.2026`. Day-first with the year, for a form that runs where
 *    nothing else supplies it (trip creation, trip settings).
 *  - `named` — `יום ו׳, 11 בספט׳`. A named month cannot be read in the wrong order at
 *    all, so this holds ADR-0176's goal harder, not looser; and inside a trip the year
 *    is already implied by the trip. It is also what lets a date be a word in a
 *    sentence rather than a figure in a box (ADR-0177 §4).
 */
export type DateFieldFormat = 'numeric' | 'named';

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
  /** How the face reads (see {@link DateFieldFormat}). Defaults to `numeric`, so a
   *  caller that says nothing keeps exactly ADR-0176's shipped face. */
  format?: DateFieldFormat;
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
  format = 'numeric',
}: DateFieldProps) {
  // **The control's own value is held here**, mirroring the prop — `SpanLeg`'s shape
  // one level down, and for the same reason: a half-entered value must survive on the
  // control without being emitted. It is not a second copy of the truth (the prop wins
  // the moment it moves, and the face always paints the prop); it is what stops React
  // from restoring a controlled input whose event changed nothing, which would reset
  // every segment under a typist mid-date.
  const [shown, setShown] = useState(value);
  const lastValue = useRef(value);
  if (lastValue.current !== value) {
    lastValue.current = value;
    setShown(value);
  }

  // The date that was showing when this interaction started — what a Clear rolls back
  // to. Latched on the two events that precede a picker opening (a press, and focus),
  // so reopening the picker on a date just picked rolls back to THAT one.
  const preEdit = useRef(value);
  const latch = () => {
    preEdit.current = value;
  };

  // Typing into a date is segment-by-segment and the control reports `''` between the
  // first keystroke and a complete date — so a keyboard edit must not be read as a
  // clear, and the segments must be visible while it happens. Focus alone is NOT that
  // moment: after the platform's picker closes the input keeps focus, which is how the
  // native control's own format (`12.9.2026`) and its single-line clipping became what
  // the field read at rest (field report #36).
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  const setTypingTo = (next: boolean) => {
    typingRef.current = next;
    setTyping(next);
  };

  return (
    <span
      className={className ? `df ${className}` : 'df'}
      data-invalid={invalid}
      data-typing={typing ? '' : undefined}
    >
      {/* `dir="auto"` and nothing else (ADR-0118): a numeric date is a neutral run that
          reads left-to-right, a Hebrew placeholder reads right-to-left, and each aligns
          the way the TimeField beside it aligns its own value. */}
      <span className="df-face" dir="auto" aria-hidden="true">
        {value ? (
          format === 'named' ? (
            formatDayDate(value)
          ) : (
            formatDayMonthYear(value)
          )
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
        value={shown}
        onPointerDown={latch}
        onFocus={latch}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') setTypingTo(true);
        }}
        onBlur={() => {
          setTypingTo(false);
          // A keyboard edit left half-typed is not a new value either — the control and
          // the form agree again the moment the field is left.
          setShown(value);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setShown(next);
          if (next) {
            onChange(next);
            return;
          }
          // **A CLEAR IS A SIGNAL, NOT A VALUE** — `TimeField`'s `onClear` shape, at the
          // one boundary a date's clear can arrive through: the platform's own control
          // (field report #38). Android's picker has a Clear button, and forwarding its
          // `''` put an unparseable date into the form, which `EventForm` handed to
          // `authoringZone` → `zonedIso('')` → an Invalid Date whose `Intl` read throws
          // in RENDER. With no error boundary anywhere in the app, the tree unmounted
          // and the screen went blank.
          //
          // Every host of this field requires a date, so there is one app answer rather
          // than a prop per host: Clear cancels, restoring the pre-picker value on the
          // control and — when a tentative pick already committed one — upward too. A
          // host that ever wants a different answer takes `onClear` the way `TimeField`
          // does; none does today.
          //
          // Mid-typing, though, the control is merely INCOMPLETE rather than cleared:
          // the segments keep the keys they have been given, and the empty still never
          // reaches the form.
          if (typingRef.current) return;
          setShown(preEdit.current);
          if (preEdit.current !== value) onChange(preEdit.current);
        }}
      />
    </span>
  );
}
