// Generic header-invoked bottom sheet (ADR-0024: account is a sheet, not a
// route). Indigo/neutral chrome only — see .sheet-* in screens.css. `title`
// is optional: the account sheet (app-shell.md §6) has no title bar, just a
// grip handle — pass `ariaLabel` for that case instead.
import type { ReactNode } from 'react';
import { useOverlay } from '../state/nav-state';

export function Sheet({
  title,
  ariaLabel,
  onClose,
  children,
}: {
  title?: string;
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Register as the topmost overlay so the return gesture / back closes this
  // sheet before touching structural navigation (ADR-0035 §4).
  useOverlay(onClose);
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-card"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}
