// Generic header-invoked bottom sheet (ADR-0024: account is a sheet, not a
// route). Indigo/neutral chrome only — see .sheet-* in screens.css. `title`
// is optional: the account sheet (app-shell.md §6) has no title bar, just a
// grip handle — pass `ariaLabel` for that case instead.
import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../state/nav-state';
import { useDialogFocus } from '../lib/useDialogFocus';

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
  const cardRef = useRef<HTMLDivElement>(null);
  // Move focus into the sheet + close on Escape + restore focus on close (F-08).
  // No Tab-trap here: some sheets open a nested body-portalled prompt (e.g. the
  // booking delete/unlink alertdialog), which a trap on this card would lock out.
  useDialogFocus(cardRef, onClose);
  // Portal to the document body so the fixed overlay escapes any ancestor
  // stacking context. A caller like a done/passed day-view row carries
  // `opacity < 1`, which would otherwise trap this overlay inside the card and
  // let later sibling rows paint over it.
  return createPortal(
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="sheet-card"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
