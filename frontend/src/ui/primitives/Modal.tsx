// The single overlay primitive (ADR-0079). Every sheet/dialog in the app is a
// Modal: one place carries the overlay-stack registration (so system-back / the
// return gesture closes it first, ADR-0035) and the focus contract (focus-in +
// Escape + focus-restore, optional Tab-trap, F-08). Two variants — a bottom
// `sheet` and a centered `dialog` — share all that machinery; only shape and
// position differ (modal.css). `Sheet` is a thin wrapper over `variant="sheet"`;
// the `.confirm-*`/`.event-form-*` families fold on in Wave 2.
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../../state/nav-state';
import { useDialogFocus } from '../../lib/useDialogFocus';
import './modal.css';

export type ModalVariant = 'sheet' | 'dialog';

export function Modal({
  variant,
  title,
  ariaLabel,
  labelledBy,
  onClose,
  trap,
  children,
}: {
  variant: ModalVariant;
  /** Optional visible heading; when set it also labels the dialog (aria-labelledby). */
  title?: string;
  /** Accessible name when there is no visible title (e.g. a grip-only sheet). */
  ariaLabel?: string;
  /** Point the dialog at an existing element's id instead of rendering a title. */
  labelledBy?: string;
  onClose: () => void;
  /** Tab-trap override. Defaults to variant-driven (see below). */
  trap?: boolean;
  children: ReactNode;
}) {
  // Register as the topmost overlay so back / the return gesture closes this
  // before touching structural navigation (ADR-0035 §4).
  useOverlay(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  // Trap default is variant-driven, and deliberately opposite per variant:
  //  - `dialog` traps: a centered dialog is a focus dead-end by design (a
  //    confirm/alert owning its own buttons — nothing legitimately sits behind
  //    it), so Tab should wrap inside it.
  //  - `sheet` does NOT trap: some sheets open a nested body-portalled prompt
  //    (e.g. the booking delete/unlink alertdialog), which a trap on this card
  //    would lock out — this preserved the pre-primitive Sheet behavior.
  const trapEnabled = trap ?? variant === 'dialog';
  useDialogFocus(cardRef, onClose, { trap: trapEnabled });

  const titleId = useId();
  const hasTitle = title != null && title !== '';
  const labelId = labelledBy ?? (hasTitle ? titleId : undefined);

  // Portal to document.body so the fixed overlay escapes any ancestor stacking
  // context — a caller carrying `opacity < 1` (e.g. a done/passed day-view row)
  // would otherwise trap the overlay inside the card and let later siblings
  // paint over it.
  return createPortal(
    <div className="modal-overlay" data-variant={variant} onClick={onClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={labelId ? undefined : ariaLabel}
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        {hasTitle && (
          <div className="modal-title" id={titleId}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
