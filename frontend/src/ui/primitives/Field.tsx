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
} from 'react';
import './field.css';

export function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  /** Field caption. Renders as a real <label> when `htmlFor` is set. */
  label?: ReactNode;
  /** When present, the message is shown in the error slot and announced. */
  error?: string | null;
  /** Ties the label to a control by id (explicit association). */
  htmlFor?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  const showError = error != null && error !== '';

  // Wire aria-describedby onto a single control child while an error is shown,
  // so a screen reader announces the message with the field. Multi-control
  // bodies (e.g. an icon + input row) keep their own labelling.
  const body =
    showError && Children.count(children) === 1 && isValidElement(children)
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': errorId,
        })
      : children;

  return (
    <div className="field">
      {label != null &&
        (htmlFor ? (
          <label className="field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        ))}
      {body}
      {showError && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
