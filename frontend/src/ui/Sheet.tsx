// Generic header-invoked bottom sheet (ADR-0024: account is a sheet, not a
// route). Indigo/neutral chrome only — see .sheet-* in screens.css. `title`
// is optional: the account sheet (app-shell.md §6) has no title bar, just a
// grip handle — pass `ariaLabel` for that case instead.
import type { ReactNode } from 'react';

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
