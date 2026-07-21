// The single overlay primitive (ADR-0079). Every sheet/dialog in the app is a
// Modal: one place carries the overlay-stack registration (so back — system-
// back, a shell back button — closes it first, ADR-0035/0090) and the focus
// contract (focus-in + Escape + focus-restore, optional Tab-trap, F-08). Three
// variants — a bottom `sheet`, a centered `dialog`, and a full-viewport `full`
// (ADR-0101) — share all that machinery; only shape and position differ
// (modal.css). `Sheet` is a thin wrapper over `variant="sheet"`; the
// `.confirm-*`/`.event-form-*` families fold on in Wave 2.
import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../../state/nav-state';
import { useDialogFocus } from '../../lib/useDialogFocus';
import './modal.css';

export type ModalVariant = 'sheet' | 'dialog' | 'full';

export function Modal({
  variant,
  title,
  ariaLabel,
  labelledBy,
  onClose,
  trap,
  initialFocusRef,
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
  /** Focus this element on mount instead of the dialog container — the one
   *  case being a `'full'` search mode, where popping the keyboard immediately
   *  is the point (see `useDialogFocus`). Omit for the default container focus. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  // Register as the topmost overlay so a back trigger closes this before
  // touching structural navigation (ADR-0035 §4).
  useOverlay(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  // Trap default is variant-driven, and deliberately opposite per variant:
  //  - `dialog` traps: a centered dialog is a focus dead-end by design (a
  //    confirm/alert owning its own buttons — nothing legitimately sits behind
  //    it), so Tab should wrap inside it.
  //  - `sheet` does NOT trap: some sheets open a nested body-portalled prompt
  //    (e.g. the booking delete/unlink alertdialog), which a trap on this card
  //    would lock out — this preserved the pre-primitive Sheet behavior.
  //  - `full` does NOT trap either: it's a self-contained screen, not a modal
  //    dead-end, so Tab behaves like ordinary page content.
  const trapEnabled = trap ?? variant === 'dialog';
  useDialogFocus(cardRef, onClose, { trap: trapEnabled, initialFocusRef });

  const titleId = useId();
  const hasTitle = title != null && title !== '';
  const labelId = labelledBy ?? (hasTitle ? titleId : undefined);

  // Portal to document.body so the fixed overlay escapes any ancestor stacking
  // context — a caller carrying `opacity < 1` (e.g. a done/passed day-view row)
  // would otherwise trap the overlay inside the card and let later siblings
  // paint over it.
  // `full` has nothing "outside" it to tap-dismiss to — it exits only via its
  // own explicit back control, so the backdrop click is disabled for it.
  return createPortal(
    <div
      className="modal-overlay"
      data-variant={variant}
      onClick={variant === 'full' ? undefined : onClose}
    >
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
