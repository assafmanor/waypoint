// Generic header-invoked bottom sheet (ADR-0024: account is a sheet, not a
// route). Now a thin wrapper over the single Modal primitive (ADR-0079) with
// variant="sheet" — it keeps its exact public API so no consumer changes, while
// the overlay-stack + focus machinery lives once in Modal. `title` is optional:
// the account sheet (app-shell.md §6) has no title bar, just a grip handle —
// pass `ariaLabel` for that case instead. No Tab-trap (the sheet default), so a
// nested body-portalled prompt stays reachable.
import { type ReactNode } from 'react';
import { Modal } from './primitives/Modal';

export function Sheet({
  title,
  ariaLabel,
  onClose,
  children,
}: {
  title?: ReactNode;
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal variant="sheet" title={title} ariaLabel={ariaLabel} onClose={onClose}>
      {children}
    </Modal>
  );
}
