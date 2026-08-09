// ValueToken — "a value you can change", inline (ADR-0177 §2).
//
// **Generalised from `button.bld-time`** (ADR-0161 §7), which was this app's first
// inline editable value and had already written the grammar down: a hairline chip
// wearing the same type and column as the text it replaces, spending no hue of its
// own. Two things that one-off got right, which every host now inherits by using
// this instead of drawing its own:
//
//  - **The target grows, the line does not.** A real `min-height: 44px` took the Plan
//    row from 58px to 75px — a 29% taller list to make one control meet ADR-0017's
//    floor. So the floor is met by an `::after` overlay reaching into the line's own
//    vertical padding, which nothing else occupies.
//  - **A tappable thing inside a line has to look tappable** (`PlaceBadge`'s idiom,
//    ADR-0121 §8). Hence a resting hairline rather than bold text that happens to
//    open a panel — which is the variant ADR-0177 drew and rejected.
//
// `kind` picks the TONE and nothing else; the geometry belongs to the primitive, so
// a new host cannot quietly become a different control. Amber is the clock's alone
// (ADR-0028's budget): a calendar date is a fact, not a commitment, so it stays ink.
// That was already the booking leg's call — it deliberately overrode the amber it
// inherited from `.tp-val` — and ADR-0177 §3 promotes that exception to the rule.
//
// **A date does not come through here.** Its real control is the native
// `<input type="date">` that `DateField` owns (ADR-0176), and that component's
// wrapper is already the box — so a date token is `<DateField className="vt vt-date">`
// and wearing a second wrapper would draw a second chip around the first.
import { type ReactNode, type Ref } from 'react';
import './value-token.css';

/** The tone, which is the only thing a host may vary. `date` exists for the class
 *  `DateField` wears rather than for anything rendered here. */
export type ValueTokenKind = 'time' | 'date' | 'word';

export interface ValueTokenProps {
  kind: Exclude<ValueTokenKind, 'date'>;
  children: ReactNode;
  /** No value yet — dashed and muted, with the child saying what to add. A placeholder
   *  the app writes, never a browser hint: an empty when has to invite, not sit blank. */
  empty?: boolean;
  /** The panel this token opens is showing, so the token wears the open mark. */
  open?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** The caption this value answers to ("התחלה", "משך", "תאריך"). Rendered INSIDE the
   *  button as visually-hidden text, not as `aria-label` — and the difference is a real
   *  regression this caught: `aria-label` REPLACES the content, so the accessible name
   *  became the caption alone and a screen reader stopped hearing the time the button
   *  currently holds. As hidden text the name is "התחלה 08:00" again, exactly what the
   *  captioned box read before ADR-0177 removed its visible caption. */
  label?: string;
  title?: string;
  /** ADR-0150's refusal mark, spread from `errors.field(name)` — the token IS the box
   *  now, so the mark lands on the value that is wrong rather than on a cell holding a
   *  wrong value and a fine one. */
  ref?: Ref<HTMLButtonElement>;
  'data-invalid'?: string;
}

export function ValueToken({
  kind,
  children,
  empty,
  open,
  onClick,
  disabled,
  className,
  label,
  title,
  ref,
  'data-invalid': invalid,
}: ValueTokenProps) {
  return (
    <button
      type="button"
      ref={ref}
      className={tokenClass(kind, { empty, open, className })}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-invalid={invalid}
    >
      {label && <span className="vt-cap">{label}</span>}
      {children}
    </button>
  );
}

/** The token's class list, exported because `DateField` wears it directly (see the
 *  header) and `PlanDay`'s row time composes it with its own Plan-mode modifier —
 *  two call sites that cannot render the component but must not hand-build the string. */
export function tokenClass(
  kind: ValueTokenKind,
  opts: { empty?: boolean; open?: boolean; className?: string } = {},
): string {
  return [
    'vt',
    `vt-${kind}`,
    opts.empty ? 'vt-empty' : '',
    opts.open ? 'open' : '',
    opts.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
