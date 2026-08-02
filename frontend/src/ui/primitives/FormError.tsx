// **A refusal, in words** (ADR-0150) — the one `<p className="field-error" role="alert">` in
// the app that a form renders itself. `Field` has its own copy because it also owns the
// `aria-describedby` wiring; everywhere else was hand-written markup, six times over two
// screens plus three forms, which is the shape ADR-0079/0094/0096 keep collecting after the
// fact.
//
// Two hosts, one component:
//   • **the form's own refusal** (`errors.formError`, `field: null`) — a failed save, or a
//     rule no single field owns. It renders directly above the actions, never at the bottom
//     of a scroll container: the distance between the refusal and the button that caused it
//     is the whole complaint ADR-0150 was written to answer, and this is the one case where
//     nothing gets focused or scrolled to in order to close that distance for you.
//   • **a screen's own field shell** — `TripSettings`'s `.set-fld`, which ADR-0150 allows
//     ("whatever shell owns the field") and which therefore has a message to print too.
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
