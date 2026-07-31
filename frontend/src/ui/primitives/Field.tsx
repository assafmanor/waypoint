// One field shell (U-05). Owns the label, the control slot, and an optional
// error slot with its `aria-describedby` wiring — so every form field gets the
// same structure, spacing (Wave-0 tokens), and a11y error association instead of
// the divergent `.form-field`/`.bs-field` shells. Neutral chrome only; semantic
// hues (amber/teal) stay on the controls, never the shell.
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import './field.css';

interface AriaErrorProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Field({
  label,
  error,
  hint,
  htmlFor,
  ref,
  children,
}: {
  /** Field caption. Renders as a real <label> when `htmlFor` is set. */
  label?: ReactNode;
  /** When present, the message is shown in the error slot and announced. */
  error?: string | null;
  /** A quiet note under the control — what this value is for, or what leaving it
   *  empty costs. The error slot's peer, and deliberately not a variant of it: a
   *  hint never blocks a save and never announces itself as an alert. It exists so
   *  a form that has something to say about an empty field says it inline, instead
   *  of a confirm dialog on a legitimate mid-planning path (ADR-0109 §6's anti-nag
   *  rule). Both slots can show at once; the error reads last. */
  hint?: ReactNode;
  /** Ties the label to a control by id (explicit association). */
  htmlFor?: string;
  /** The registration half of `useFormErrors` (ADR-0150): it is the field's own box
   *  that gets nudged and scrolled to, so the hook needs to hold it. Spread it with
   *  the message via `errors.field(name)` — never wired by hand. */
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const errorId = useId();
  const showError = error != null && error !== '';

  // Wire aria-describedby + aria-invalid onto a single control child while an error
  // is shown, so a screen reader announces the message with the field and knows the
  // field is what was refused. Multi-control bodies (e.g. an icon + input row) keep
  // their own labelling, and so does a composed component — the props would land on
  // something that never renders them.
  const body =
    showError &&
    Children.count(children) === 1 &&
    isValidElement(children) &&
    typeof children.type === 'string'
      ? cloneElement(children as ReactElement<AriaErrorProps>, {
          'aria-describedby': errorId,
          'aria-invalid': true,
        })
      : children;

  // The mark every refusal is drawn from (ADR-0150 / `form-errors.css`): the outline
  // on the control, the label's hue, and what the nudge animates are all this one
  // attribute — so nothing has to be styled per form.
  return (
    <div className="field" ref={ref} data-invalid={showError ? '' : undefined}>
      {label != null &&
        (htmlFor ? (
          <label className="field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        ))}
      {body}
      {hint != null && <p className="field-hint">{hint}</p>}
      {showError && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
