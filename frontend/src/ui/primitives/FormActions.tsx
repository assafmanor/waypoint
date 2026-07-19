// One form action bar (U-02). Canonical order, labels, and destructive
// placement for every editing surface — folding the divergent EventForm and
// BookingSheet action rows (and the confirm buttons) into one grammar.
//
// CANONICAL ORDER (documented per ADR-0079 U-02): primary first, then the
// secondary (cancel). This matches the app's dominant existing pattern — the
// BookingSheet, TripSettings details form, and the document upload sheet all
// render Save before Cancel with the primary as a full-width neutral CTA and the
// cancel as a ghost pill. A destructive action (delete) sits on its own row
// BELOW the primary/secondary pair, de-emphasized, so it never reads as the
// expected next tap. RTL-correct via logical properties (flex + gap only).
import { Spinner } from '../Spinner';
import './form-actions.css';

interface Action {
  label: string;
  onClick?: () => void;
  /** Submit buttons omit onClick and let the surrounding <form> handle submit. */
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Awaiting a result: show the shared Spinner in place of the label and block
   *  re-taps (ADR-0052 §4). Applies to the primary action. */
  busy?: boolean;
}

export function FormActions({
  primary,
  secondary,
  destructive,
}: {
  primary: Action;
  secondary?: Action;
  destructive?: Action;
}) {
  return (
    <>
      <div className="form-actions">
        <button
          type={primary.type ?? 'button'}
          className="fa-primary"
          onClick={primary.onClick}
          disabled={primary.disabled || primary.busy}
        >
          {primary.busy ? <Spinner /> : primary.label}
        </button>
        {secondary && (
          <button
            type={secondary.type ?? 'button'}
            className="fa-secondary"
            onClick={secondary.onClick}
            disabled={secondary.disabled}
          >
            {secondary.label}
          </button>
        )}
      </div>
      {destructive && (
        <button
          type={destructive.type ?? 'button'}
          className="fa-destructive"
          onClick={destructive.onClick}
          disabled={destructive.disabled}
        >
          {destructive.label}
        </button>
      )}
    </>
  );
}
