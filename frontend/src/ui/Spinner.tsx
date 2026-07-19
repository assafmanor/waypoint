// The one shared spinner (ADR-0052 §4). Used by the document viewer, the list
// load, and the upload busy state — so every async surface has a motion cue,
// not a static word. Size + colour ride on the CSS class (screens.css .spinner).
import { t } from '../i18n/he';

export function Spinner({ className = '', label }: { className?: string; label?: string }) {
  return (
    <span
      className={`spinner ${className}`.trim()}
      role="status"
      aria-label={label ?? t.common.loading}
      aria-live="polite"
    />
  );
}
