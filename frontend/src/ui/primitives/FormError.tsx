// **The form-level half of ADR-0150.** `useFormErrors` names two kinds of refusal: one that
// points at a field (`data-invalid` + the `Field`'s own slot) and one that points at nothing —
// a failed save, an unexpected shape, or a rule that no single field owns. The second kind had
// no component: three forms each wrote the same `<p className="field-error" role="alert">` by
// hand, which is the shape ADR-0079/0094/0096 keep collecting after the fact.
//
// It renders directly above the actions, never at the bottom of a scroll container — the
// distance between the refusal and the button that caused it is the whole complaint ADR-0150
// was written to answer, and a form-level message is the one case where nothing gets focused
// or brought into view to close that distance for you.
import { type ReactNode } from 'react';
import './form-errors.css';

/** Renders nothing when there is nothing wrong, so a call site is
 *  `<FormError>{errors.formError}</FormError>` with no guard of its own. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="field-error" role="alert">
      {children}
    </p>
  );
}
