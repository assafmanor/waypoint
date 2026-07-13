// Generic header-invoked bottom sheet (ADR-0024: switcher + account are sheets,
// not routes). Indigo/neutral chrome only — see .sheet-* in screens.css.
import type { ReactNode } from 'react';

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
